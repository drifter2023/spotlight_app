import { AiError, streamChat, type AiErrorKind, type ChatResult, type Fetch } from '../ai/deepseek.ts';
import { getKey } from '../ai/key.ts';
import type { Db } from '../db/types.ts';
import { isClosed, monthDay } from './day.ts';
import { parseNotes } from './parse.ts';
import { MAX_TOKENS, PROMPT_VERSION, SYSTEM_PROMPT, TEMPERATURE, sentExchanges, userMessage } from './prompt.ts';
import { autoFailedAt, getAuto, pending, saveEntry, setAuto, setAutoFailedAt } from './store.ts';
import type { Pending, RunState } from './types.ts';

/** Requests per pass, manual or automatic (§4.5). */
export const MAX_REQUESTS = 3;
/** After an automatic run fails, Home does not try again for this long. */
export const AUTO_BACKOFF_MS = 6 * 3_600_000;

interface Options { fetch?: Fetch; firstTokenMs?: number; idleMs?: number; now?: () => number }

/**
 * Turns a day's 旁注 conversations into 札记 (docs/plans/2026-11-11-zhaji.md §4.1). One per app session.
 * Runs only when asked: `run()` on a tap of 整理, `runAuto()` when Home comes on screen. No timers,
 * no background work; a run that has started finishes even if the reader opens a book meanwhile.
 * Never rejects.
 */
export class NotesService {
  #db: Db;
  #fetch: Fetch | undefined;
  #firstTokenMs: number;
  #idleMs: number;
  #now: () => number;
  #state: RunState = { status: 'idle' };
  #subs = new Set<(s: RunState) => void>();
  #running: Promise<RunState> | null = null;
  #optedIn = false;

  constructor(db: Db, opts: Options = {}) {
    this.#db = db;
    this.#fetch = opts.fetch;
    this.#firstTokenMs = opts.firstTokenMs ?? 15_000;
    this.#idleMs = opts.idleMs ?? 20_000;
    this.#now = opts.now ?? Date.now;
  }

  /** Tests only: swap the network. */
  setFetch(f: Fetch): void {
    this.#fetch = f;
  }

  get state(): RunState {
    return this.#state;
  }

  subscribe(fn: (s: RunState) => void): () => void {
    this.#subs.add(fn);
    return () => { this.#subs.delete(fn); };
  }

  /** True once after the first tap turned 自动整理 on: the page says so above the newest entry (Z-13). */
  takeOptedIn(): boolean {
    const v = this.#optedIn;
    this.#optedIn = false;
    return v;
  }

  /** A tap on 整理: closed days and today. The first tap ever also turns 自动整理 on. */
  run(): Promise<RunState> {
    return this.#guard(() => this.#pass(false));
  }

  /** Home on screen: closed days only, and only with 自动整理 on, a key and no failure in the last 6 h (Z-07). */
  runAuto(): Promise<RunState> {
    return this.#guard(() => this.#pass(true));
  }

  #guard(job: () => Promise<RunState>): Promise<RunState> {
    if (this.#running) return this.#running;
    const p = job().catch((): RunState => this.#emit({ status: 'idle' })).finally(() => { this.#running = null; });
    this.#running = p;
    return p;
  }

  #emit(s: RunState): RunState {
    this.#state = s;
    for (const fn of this.#subs) fn(s);
    return s;
  }

  async #pass(auto: boolean): Promise<RunState> {
    const db = this.#db;
    const now = this.#now();
    const setting = await getAuto(db);
    const key = await getKey(db);
    if (auto) {
      if (setting !== 'on' || !key) return this.#state;
      const failed = await autoFailedAt(db);
      if (failed !== null && now - failed < AUTO_BACKOFF_MS) return this.#state;
    }
    const todo = (await pending(db, now)).filter((p) => !auto || isClosed(p.day, now));
    if (!todo.length) return this.#emit({ status: 'idle' });
    if (!key) return this.#emit({ status: 'error', reason: 'no-key', auto });
    if (!auto && setting === null) { await setAuto(db, 'on'); this.#optedIn = true; }

    for (const p of todo.slice(0, MAX_REQUESTS)) {
      this.#emit({ status: 'running', day: p.day, bookId: p.bookId, auto });
      const failure = await this.#one(key, p);
      if (failure === 'gone') break;
      if (failure) {
        if (auto) await setAutoFailedAt(db, this.#now());
        return this.#emit({ status: 'error', reason: failure, auto, day: p.day, bookId: p.bookId });
      }
    }
    if (auto) await setAutoFailedAt(db, null);
    return this.#emit({ status: 'idle' });
  }

  /** One request for one (book, day). Resolves with the failure, `gone` when the book or conversation was deleted meanwhile. */
  async #one(key: string, p: Pending): Promise<AiErrorKind | 'gone' | null> {
    const sent = sentExchanges(p.exchanges);
    const lastMsgId = p.exchanges[p.exchanges.length - 1]!.messageId;
    const ac = new AbortController();
    const expire = () => ac.abort(new AiError('timeout'));
    let timer = setTimeout(expire, this.#firstTokenMs);
    let acc = '';
    let result: ChatResult;
    try {
      result = await streamChat({
        key, system: SYSTEM_PROMPT, user: userMessage(p.bookTitle, monthDay(p.day), sent),
        maxTokens: MAX_TOKENS, temperature: TEMPERATURE, signal: ac.signal,
      }, (piece) => {
        clearTimeout(timer);
        timer = setTimeout(expire, this.#idleMs);
        acc += piece;
      }, this.#fetch);
    } catch (e) {
      return e instanceof AiError ? e.kind : 'network';
    } finally {
      clearTimeout(timer);
    }
    const parsed = parseNotes(acc, sent.length, result.finish);
    if (parsed.status === 'bad') return 'bad-answer';
    const notes = parsed.status === 'ok'
      ? parsed.items.map((i) => ({ kind: i.kind, point: i.point, detail: i.detail, exchange: sent[i.n - 1]! }))
      : [];
    try {
      await saveEntry(this.#db, { bookId: p.bookId, day: p.day, lastMsgId, promptVersion: PROMPT_VERSION, notes }, this.#now());
    } catch {
      return 'gone';
    }
    return null;
  }
}
