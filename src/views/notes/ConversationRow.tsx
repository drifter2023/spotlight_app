import { useRef } from 'react';
import { formatWhen } from '../../core/agent/format.ts';
import type { SessionListItem } from '../../core/agent/types.ts';
import { useSwipeReveal } from '../home/useSwipeReveal.ts';

/** One conversation in 对话 (Z-11): the quoted sentence, the first question, book · chapter and when. Swipe left → 删除. */
export function ConversationRow({ item, open, onSwipe, onOpen, onDelete, now }: {
  item: SessionListItem; open: boolean; onSwipe: (open: boolean) => void;
  onOpen: (el: HTMLElement) => void; onDelete: () => void; now?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const swipe = useSwipeReveal(open, onSwipe, () => onOpen(ref.current!));
  return (
    <li className="conv-wrap" data-session-id={item.id}>
      <button type="button" className="conv-del" tabIndex={open ? 0 : -1} aria-hidden={!open} onClick={onDelete}>删除</button>
      <div
        ref={ref}
        className={`conv ${swipe.className}`}
        style={swipe.style}
        role="button"
        tabIndex={0}
        aria-label={`${item.title || '新对话'}，${item.bookTitle}`}
        {...swipe.handlers}
        onKeyDown={(e) => { if (e.key === 'Enter') onOpen(ref.current!); }}
      >
        {item.quote && <span className="conv-quote">“{item.quote}”</span>}
        <span className="conv-title">{item.title || '新对话'}</span>
        <span className="conv-meta">
          <span>{item.bookTitle}{item.chapterLabel ? ` · ${item.chapterLabel}` : ''}</span>
          <span>{formatWhen(item.updatedAt, now)}</span>
        </span>
      </div>
    </li>
  );
}
