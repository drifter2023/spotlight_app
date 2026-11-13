import { useCallback, useEffect, useState } from 'react';
import type { Session } from '../../app/boot.ts';
import type { AiErrorKind } from '../../core/ai/deepseek.ts';
import { NO_RETRY } from '../../core/ai/failure.ts';
import { dayKey, dayLabel, isClosed } from '../../core/notes/day.ts';
import { hasNotesOrConversations, latestUnread, pending } from '../../core/notes/store.ts';
import type { NoteEntry, Pending, RunState } from '../../core/notes/types.ts';
import { notesFailure } from '../notes/Journal.tsx';

/** What the line says (§3.3). `act` is the right-hand side: › or an action word in the accent colour. */
export interface NotesLineProps {
  l1?: string; l2?: string; act: '›' | '整理' | '重试' | null;
  onTap: () => void;
}

/** The display part, for stories: one button, min height 64 px, no numbers but a date (Z-09). */
export function NotesLineView({ l1, l2, act, onTap }: NotesLineProps) {
  return (
    <>
      <button type="button" className="notes-line" onClick={(e) => { e.stopPropagation(); onTap(); }}>
        <span className="notes-line-body">
          <span className="eyebrow">札记</span>
          {l1 && <span className="notes-line-l1">{l1}</span>}
          {l2 && <span className="notes-line-l2">{l2}</span>}
        </span>
        {act && <span className="notes-line-act" data-chev={act === '›' || undefined} aria-hidden={act === '›' || undefined}>{act}</span>}
      </button>
      <hr className="rule rule-notes" />
    </>
  );
}

interface Loaded { has: boolean; unread: NoteEntry | null; pending: Pending[] }

/** Picks the line's state, first match wins (§3.3): running, a manual failure, unread, a closed day pending, only today, otherwise. */
export function lineState(l: Loaded, run: RunState, failed: AiErrorKind | null, afterReading: boolean, now: number): Omit<NotesLineProps, 'onTap'> & { tap: 'open' | 'run' } {
  const closed = l.pending.find((p) => isClosed(p.day, now));
  const today = l.pending.find((p) => p.day === dayKey(now));
  const offer = closed ? `${dayLabel(closed.day, now)}的对话还没整理` : '今天的对话';
  if (run.status === 'running') return { l1: `正在整理${dayLabel(run.day, now)}的对话…`, act: null, tap: 'open' };
  if (failed) {
    const toPage = failed === 'no-key' || failed === 'invalid-key';
    return { l1: offer, l2: notesFailure(failed), act: NO_RETRY.has(failed) ? null : '重试', tap: toPage ? 'open' : 'run' };
  }
  if (l.unread) return { l1: `${dayLabel(l.unread.day, now)} · ${l.unread.bookTitle}`, l2: l.unread.items[0]?.point ?? '', act: '›', tap: 'open' };
  if (closed) return { l1: offer, l2: '把问过的问题整理成几条札记', act: '整理', tap: 'run' };
  if (today && afterReading) return { l1: '今天的对话', l2: '读完了？整理成札记', act: '整理', tap: 'run' };
  return { act: '›', tap: 'open' };
}

/**
 * The Home line (Z-09): shown once the reader has talked to 旁注. It loads its own state; a tap on
 * 整理 runs in place, any other tap opens the 札记 page.
 */
export function NotesLine({ session, version, afterReading, onOpenPage }: {
  session: Session;
  /** Bumped by Home whenever it comes back on screen or the page closes. */
  version: number;
  /** Home appears after the reader was open in this app session (state 4 is an offer at the end of a sitting). */
  afterReading: boolean;
  onOpenPage: (entry?: number) => void;
}) {
  const { db, notes } = session;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [run, setRun] = useState<RunState>(notes.state);
  /** A manual run that failed, for this Home appearance. */
  const [failed, setFailed] = useState<AiErrorKind | null>(null);

  const load = useCallback(async () => {
    const [has, unread, pend] = await Promise.all([hasNotesOrConversations(db), latestUnread(db), pending(db, Date.now())]);
    setLoaded({ has, unread, pending: pend });
  }, [db]);
  useEffect(() => { setFailed(null); void load(); }, [load, version]);
  useEffect(() => {
    const on = (s: RunState) => { setRun(s); if (s.status !== 'running') void load(); };
    const off = notes.subscribe(on);
    // Home starts the automatic run before the shelf (and so this line) is mounted: a run that ended between
    // the first render and this subscription would otherwise leave the line on 正在整理.
    on(notes.state);
    return off;
  }, [notes, load]);

  if (!loaded?.has) return null;
  const now = Date.now();
  const s = lineState(loaded, run, failed, afterReading, now);
  const tap = async () => {
    if (s.tap === 'open') { onOpenPage(loaded.unread && !failed && run.status !== 'running' ? loaded.unread.id : undefined); return; }
    setFailed(null);
    const r = await notes.run();
    if (r.status === 'error' && !r.auto) {
      if (r.reason === 'no-key' || r.reason === 'invalid-key') onOpenPage();
      else setFailed(r.reason);
    }
  };
  return <NotesLineView {...(s.l1 ? { l1: s.l1 } : {})} {...(s.l2 ? { l2: s.l2 } : {})} act={s.act} onTap={() => void tap()} />;
}
