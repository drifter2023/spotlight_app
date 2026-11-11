import { FAILURE, NO_RETRY } from '../../core/ai/failure.ts';
import type { Db } from '../../core/db/types.ts';
import { dayEyebrow, dayKey } from '../../core/notes/day.ts';
import type { NoteEntry, NoteItem, Pending, RunState } from '../../core/notes/types.ts';
import { NoteCard } from './NoteCard.tsx';

/** FAILURE['bad-answer'] is the grammar drawer's wording; 札记 says it its own way (§4.7). */
export const notesFailure = (reason: keyof typeof FAILURE) => (reason === 'bad-answer' ? '没有得到有效的内容' : FAILURE[reason]);

interface Block { bookId: string; bookTitle: string; entry: NoteEntry | null; pending: Pending | null }

/** Days newest first; within a day, one block per book: its notes, then what is still to do. */
function blocks(entries: NoteEntry[], pending: Pending[]): [string, Block[]][] {
  const days = new Map<string, Map<string, Block>>();
  const at = (day: string, bookId: string, bookTitle: string) => {
    let d = days.get(day);
    if (!d) { d = new Map(); days.set(day, d); }
    let b = d.get(bookId);
    if (!b) { b = { bookId, bookTitle, entry: null, pending: null }; d.set(bookId, b); }
    return b;
  };
  for (const p of pending) at(p.day, p.bookId, p.bookTitle).pending = p;
  for (const e of entries) at(e.day, e.bookId, e.bookTitle).entry = e;
  return [...days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, m]) => [day, [...m.values()]]);
}

/**
 * The 札记 journal (Z-10): one continuous scroll, newest day first, no detail screen. A pending day
 * shows 整理; a run shows 正在整理…; a failed one its reason and 重试. No counts anywhere (Z-14).
 */
export function Journal({ db, entries, pending, run, now, swiped, onSwipe, onDelete, onRun, firstRun }: {
  db: Db; entries: NoteEntry[]; pending: Pending[]; run: RunState; now: number;
  swiped: number | null; onSwipe: (id: number | null) => void; onDelete: (item: NoteItem) => void;
  onRun: () => void;
  /** The first tap has just turned 自动整理 on: said once above the newest entry. */
  firstRun: boolean;
}) {
  const today = dayKey(now);
  const running = run.status === 'running';
  const state = (b: Block, day: string) => {
    if (run.status === 'running' && run.bookId === b.bookId && run.day === day) {
      return <div className="notes-state" role="status">正在整理…<span className="notes-dots" aria-hidden="true"><i /><i /><i /></span></div>;
    }
    if (run.status === 'error' && !run.auto && run.bookId === b.bookId && run.day === day && run.reason !== 'no-key' && run.reason !== 'invalid-key') {
      return (
        <div className="notes-state" data-tone="error" role="alert">
          <span>没有整理成：{notesFailure(run.reason)}</span>
          {!NO_RETRY.has(run.reason) && <button type="button" className="notes-action" onClick={onRun}>重试</button>}
        </div>
      );
    }
    if (!b.pending) return null;
    const text = b.entry ? (day === today ? '今天又问了新问题' : '这一天又问了新问题') : (day === today ? '今天的对话还没整理' : '这一天的对话还没整理');
    return (
      <div className="notes-state">
        <span>{text}</span>
        <button type="button" className="notes-action" disabled={running} onClick={onRun}>整理</button>
      </div>
    );
  };

  let first = true;
  return (
    <>
      {blocks(entries, pending).map(([day, list]) => (
        <section key={day} className="notes-day" data-day={day}>
          <div className="eyebrow notes-day-head">{dayEyebrow(day)}</div>
          {list.map((b) => {
            const once = firstRun && first && b.entry !== null;
            if (b.entry) first = false;
            return (
              <div key={b.bookId} className="notes-book" data-entry-id={b.entry?.id}>
                {once && <p className="notes-once">以后，前一天的对话会在你打开首页时自动整理。可以在页面底部关掉。</p>}
                <h2 className="notes-book-title">{b.bookTitle}</h2>
                {b.entry?.items.map((i) => (
                  <NoteCard key={i.id} db={db} item={i} open={swiped === i.id} onSwipe={(o) => onSwipe(o ? i.id : null)} onDelete={() => onDelete(i)} />
                ))}
                {state(b, day)}
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}
