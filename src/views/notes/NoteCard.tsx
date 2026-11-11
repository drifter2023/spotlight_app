import { useState } from 'react';
import type { Db } from '../../core/db/types.ts';
import { loadExchange } from '../../core/notes/store.ts';
import type { NoteItem } from '../../core/notes/types.ts';
import { useSwipeReveal } from '../home/useSwipeReveal.ts';

type Ex = { question: string; answer: string; cite?: string };

/**
 * One note (Z-10): 类型 · 章节, the book's own sentence, 要点, 说明, then 「你问：…」, which expands the
 * original question and 旁注's answer in place, read-only. Swipe left → 删除 (the conversation stays).
 */
export function NoteCard({ db, item, open, onSwipe, onDelete, initialExchange }: {
  db: Db; item: NoteItem; open: boolean; onSwipe: (open: boolean) => void; onDelete: () => void;
  /** Stories only: show the exchange expanded without loading it. */
  initialExchange?: Ex;
}) {
  const [ex, setEx] = useState<Ex | null>(initialExchange ?? null);
  const [expanded, setExpanded] = useState(initialExchange !== undefined);
  const swipe = useSwipeReveal(open, onSwipe, () => {});
  const toggle = async () => {
    if (!expanded && !ex) setEx(await loadExchange(db, item.messageId));
    setExpanded((x) => !x);
  };
  const label = item.kind ? `${item.kind} · ${item.chapterLabel}` : item.chapterLabel;
  return (
    <div className="note-wrap" data-note-id={item.id}>
      <button type="button" className="note-del" tabIndex={open ? 0 : -1} aria-hidden={!open} onClick={onDelete}>删除</button>
      <article className={`note ${swipe.className}`} style={swipe.style} {...swipe.handlers}>
        <span className="note-label">{label}</span>
        {item.quote && <p className="note-quote">“{item.quote}”</p>}
        <p className="note-point">{item.point}</p>
        <p className="note-detail">{item.detail}</p>
        <button type="button" className="note-ask" aria-expanded={expanded} onClick={() => void toggle()}>
          <span>你问：{ex?.question ?? item.question}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {expanded && ex && (
          <div className="note-ex">
            <div className="note-ex-q"><div className="note-ex-bubble">{ex.question}</div></div>
            <div className="note-ex-tag"><i />旁注</div>
            <p className="note-ex-answer">{ex.answer}</p>
            {ex.cite && <span className="note-ex-cite">{ex.cite}</span>}
          </div>
        )}
      </article>
    </div>
  );
}
