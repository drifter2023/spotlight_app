import { useRef } from 'react';
import { finishedLabel, minutesLeft } from '../../core/library/format.ts';
import type { ShelfBook } from '../../core/library/library.ts';
import { Cover } from './Cover.tsx';
import { useSwipeReveal } from './useSwipeReveal.ts';

/** One shelf row (README → Home → Shelf row). Swipe left to reveal 删除 (H-05). */
export function ShelfRow({ book, open, onOpen, onDelete, onSwipe }: {
  book: ShelfBook; open: boolean;
  onOpen: (coverEl: HTMLElement) => void; onDelete: () => void; onSwipe: (open: boolean) => void;
}) {
  const coverRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeReveal(open, onSwipe, () => onOpen(coverRef.current!));
  const done = book.status === 'done';
  const pct = Math.round(book.pct);

  return (
    <li className="row-wrap" data-book-id={book.id}>
      <button type="button" className="row-del" tabIndex={open ? 0 : -1} aria-hidden={!open} onClick={onDelete}>删除</button>
      <div
        className={`row ${swipe.className}`}
        style={swipe.style}
        role="button"
        tabIndex={0}
        aria-label={`${book.title}，${done ? '已读完' : `已读 ${pct}%`}`}
        {...swipe.handlers}
        onKeyDown={(e) => { if (e.key === 'Enter') onOpen(coverRef.current!); }}
      >
        <div ref={coverRef}><Cover src={book.cover} color={book.color} className="cover-row" /></div>
        <div className="row-text">
          <div className="row-title">{book.title}</div>
          <div className="row-author">{book.author}</div>
          <div className="row-meta">
            <div className="bar"><i style={{ width: `${done ? 100 : Math.max(2, pct)}%`, background: done ? 'rgba(var(--ink-rgb), .3)' : undefined }} /></div>
            <span className="row-note">
              {done && book.finishedAt ? finishedLabel(book.finishedAt) : `第 ${book.chapter + 1} 章 · 还剩 ${minutesLeft(book.wordCount, book.pct)} 分`}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
