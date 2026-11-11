import { beforeEach, describe, expect, it } from 'vitest';
import type { AiErrorKind, Fetch } from '../../src/core/ai/deepseek.ts';
import { NO_RETRY } from '../../src/core/ai/failure.ts';
import { setKey } from '../../src/core/ai/key.ts';
import type { Db } from '../../src/core/db/types.ts';
import { deleteBook } from '../../src/core/library/library.ts';
import { AUTO_BACKOFF_MS, MAX_REQUESTS, NotesService } from '../../src/core/notes/service.ts';
import { autoFailedAt, deleteItem, getAuto, listEntries, pending, setAuto } from '../../src/core/notes/store.ts';
import type { RunState } from '../../src/core/notes/types.ts';
import { nodeDb } from '../helpers/nodeDb.ts';
import { migrate } from '../../src/core/db/migrations.ts';
import { NOW, TODAY, YESTERDAY, ask, at, notesDb } from '../helpers/notes.ts';
import { sse } from '../helpers/sse.ts';

let db: Db;
let bodies: { messages: { role: string; content: string }[]; max_tokens: number; temperature: number }[];
/** A counting fake DeepSeek: one note per request, about exchange 1. */
const answering = (text = '1｜词义｜要点｜说明。'): Fetch => async (_u, init) => {
  bodies.push(JSON.parse(init!.body as string));
  return new Response(sse([text]));
};
const service = (f: Fetch, now = NOW) => new NotesService(db, { fetch: f, now: () => now });

beforeEach(async () => {
  db = await notesDb();
  bodies = [];
});

describe('NotesService.run (Z-06)', () => {
  it('Z-06: two runs in a row make one request and one entry', async () => {
    await setKey(db, 'sk-test');
    await ask(db, 'a', TODAY);
    const s = service(answering());
    expect(await s.run()).toEqual({ status: 'idle' });
    expect(await s.run()).toEqual({ status: 'idle' });
    expect(bodies).toHaveLength(1);
    expect(await listEntries(db)).toHaveLength(1);
    expect(bodies[0]!.messages.map((m) => m.role)).toEqual(['system', 'user']); // no history turns
    expect(bodies[0]!).toMatchObject({ max_tokens: 500, temperature: 0.3 });
  });

  it('Z-06: a run after one new exchange sends only that exchange and appends; deleted notes stay deleted', async () => {
    await setKey(db, 'sk-test');
    await ask(db, 'a', TODAY, { quote: 'First.' });
    await ask(db, 'a', TODAY + 1000, { quote: 'Second.' });
    const s = service(answering('1｜词义｜一｜一。\n2｜句子｜二｜二。'));
    await s.run();
    let [e] = await listEntries(db);
    await deleteItem(db, e!.items[0]!.id);
    await ask(db, 'a', TODAY + 2000, { quote: 'Third.' });
    s.setFetch(answering('1｜指代｜三｜三。'));
    await s.run();
    expect(bodies).toHaveLength(2);
    expect(bodies[1]!.messages[1]!.content).toContain('原文：Third.');
    expect(bodies[1]!.messages[1]!.content).not.toContain('Second.');
    [e] = await listEntries(db);
    expect(e!.items.map((i) => [i.point, i.quote])).toEqual([['二', 'Second.'], ['三', 'Third.']]);
  });

  it('Z-06: two concurrent runs make one request', async () => {
    await setKey(db, 'sk-test');
    await ask(db, 'a', TODAY);
    const s = service(answering());
    await Promise.all([s.run(), s.run()]);
    expect(bodies).toHaveLength(1);
  });

  it('Z-06: at most 3 requests per pass, newest first, one book and one day each', async () => {
    await setKey(db, 'sk-test');
    for (const d of [5, 6, 7, 8, 9]) await ask(db, 'a', at(2026, 11, d, 12));
    const s = service(answering());
    await s.run();
    expect(bodies).toHaveLength(MAX_REQUESTS);
    expect(bodies.map((b) => /日期：(.*)/.exec(b.messages[1]!.content)![1])).toEqual(['11月9日', '11月8日', '11月7日']);
    expect(await pending(db, NOW)).toHaveLength(2);
  });

  it('Z-13: the first tap turns 自动整理 on once; a switched-off setting stays off', async () => {
    await setKey(db, 'sk-test');
    await ask(db, 'a', TODAY);
    const s = service(answering());
    await s.run();
    expect(await getAuto(db)).toBe('on');
    expect(s.takeOptedIn()).toBe(true);
    expect(s.takeOptedIn()).toBe(false);
    await setAuto(db, 'off');
    await ask(db, 'a', TODAY + 1000);
    await s.run();
    expect(await getAuto(db)).toBe('off');
  });

  it('an answer of 无 marks the day done with nothing to list', async () => {
    await setKey(db, 'sk-test');
    await ask(db, 'a', TODAY);
    const s = service(answering('无'));
    expect(await s.run()).toEqual({ status: 'idle' });
    expect(await listEntries(db)).toEqual([]);
    expect(await pending(db, NOW)).toEqual([]);
  });

  it('reports each state to subscribers', async () => {
    await setKey(db, 'sk-test');
    await ask(db, 'a', YESTERDAY);
    const s = service(answering());
    const seen: RunState[] = [];
    s.subscribe((x) => seen.push(x));
    await s.run();
    expect(seen).toEqual([{ status: 'running', day: '2026-11-10', bookId: 'a', auto: false }, { status: 'idle' }]);
  });
});

describe('NotesService.runAuto (Z-07)', () => {
  beforeEach(async () => {
    await setKey(db, 'sk-test');
    await ask(db, 'a', YESTERDAY);
  });

  it('Z-07: no request when 自动整理 is unset or off', async () => {
    await service(answering()).runAuto();
    await setAuto(db, 'off');
    await service(answering()).runAuto();
    expect(bodies).toEqual([]);
  });

  it('Z-07: no request without a key', async () => {
    await setAuto(db, 'on');
    await db.run("DELETE FROM settings WHERE key = 'deepseek.key'");
    expect(await service(answering()).runAuto()).toEqual({ status: 'idle' });
    expect(bodies).toEqual([]);
  });

  it('Z-07: no request when only today is pending', async () => {
    await setAuto(db, 'on');
    await service(answering()).run(); // covers yesterday
    bodies = [];
    await ask(db, 'a', TODAY);
    await service(answering()).runAuto();
    expect(bodies).toEqual([]);
  });

  it('Z-07: no request within 6 h of a failure; one after', async () => {
    await setAuto(db, 'on');
    const down: Fetch = async () => { bodies.push({ messages: [], max_tokens: 0, temperature: 0 }); return new Response('', { status: 500 }); };
    expect(await service(down).runAuto()).toMatchObject({ status: 'error', reason: 'server', auto: true });
    expect(await autoFailedAt(db)).toBe(NOW);
    expect(bodies).toHaveLength(1);
    await service(answering(), NOW + AUTO_BACKOFF_MS - 1).runAuto();
    expect(bodies).toHaveLength(1);
    await service(answering(), NOW + AUTO_BACKOFF_MS).runAuto();
    expect(bodies).toHaveLength(2);
    expect(await autoFailedAt(db)).toBeNull();
  });

  it('Z-07: with 自动整理 on, a key and pending closed days, one request per pair (at most 3)', async () => {
    await setAuto(db, 'on');
    await ask(db, 'b', YESTERDAY);
    for (const d of [6, 7, 8]) await ask(db, 'a', at(2026, 11, d, 12));
    await ask(db, 'a', TODAY); // today is never done automatically
    await service(answering()).runAuto();
    expect(bodies).toHaveLength(3);
    expect(bodies.some((b) => b.messages[1]!.content.includes('日期：11月11日'))).toBe(false);
  });

  it('Z-07: a fresh install makes no request at all', async () => {
    db = nodeDb();
    await migrate(db);
    const s = service(answering());
    await s.runAuto();
    await s.run();
    expect(bodies).toEqual([]);
  });
});

describe('failures (Z-08)', () => {
  beforeEach(async () => { await ask(db, 'a', YESTERDAY); });

  it('Z-08: no key: no request, error no-key, nothing stored', async () => {
    expect(await service(answering()).run()).toEqual({ status: 'error', reason: 'no-key', auto: false });
    expect(bodies).toEqual([]);
    expect(await getAuto(db)).toBeNull();
  });

  const cases: [AiErrorKind, Fetch][] = [
    ['invalid-key', async () => new Response('', { status: 401 })],
    ['no-balance', async () => new Response('', { status: 402 })],
    ['rate-limit', async () => new Response('', { status: 429 })],
    ['server', async () => new Response('', { status: 503 })],
    ['network', async () => { throw new TypeError('Failed to fetch'); }],
    ['bad-answer', answering('我觉得都挺好的。')],
  ];
  for (const [kind, f] of cases) {
    it(`Z-08: ${kind} ends in error with nothing stored`, async () => {
      await setKey(db, 'sk-test');
      expect(await service(f).run()).toEqual({ status: 'error', reason: kind, auto: false, day: '2026-11-10', bookId: 'a' });
      expect(await db.all('SELECT 1 FROM note_entry')).toEqual([]);
      expect(NO_RETRY.has(kind)).toBe(kind === 'invalid-key' || kind === 'no-balance');
    });
  }

  it('Z-08: a timeout before the first token', async () => {
    await setKey(db, 'sk-test');
    const never: Fetch = (_u, init) => new Promise((_r, reject) => { init!.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))); });
    const s = new NotesService(db, { fetch: never, now: () => NOW, firstTokenMs: 20 });
    expect(await s.run()).toMatchObject({ status: 'error', reason: 'timeout' });
  });

  it('a book deleted mid-run stores nothing and ends idle', async () => {
    await setKey(db, 'sk-test');
    const s = service(async () => { await deleteBook(db, 'a'); return new Response(sse(['1｜词义｜a｜b'])); });
    expect(await s.run()).toEqual({ status: 'idle' });
    expect(await db.all('SELECT 1 FROM note_entry')).toEqual([]);
  });
});
