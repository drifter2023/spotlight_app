import type { SessionListItem } from '../../core/agent/types.ts';
import { ConversationRow } from './ConversationRow.tsx';

/** 对话: every book's conversations, newest first, no grouping (Z-11). */
export function Conversations({ items, swiped, onSwipe, onOpen, onDelete, now }: {
  items: SessionListItem[]; swiped: string | null;
  onSwipe: (id: string | null) => void;
  onOpen: (item: SessionListItem, el: HTMLElement) => void;
  onDelete: (item: SessionListItem) => void;
  now?: number;
}) {
  if (!items.length) return <p className="notes-copy">还没有对话。读书时向左滑，问旁注一个问题。</p>;
  return (
    <ul className="conv-list" aria-label="对话">
      {items.map((s) => (
        <ConversationRow
          key={s.id}
          item={s}
          open={swiped === s.id}
          onSwipe={(o) => onSwipe(o ? s.id : null)}
          onOpen={(el) => onOpen(s, el)}
          onDelete={() => onDelete(s)}
          {...(now !== undefined ? { now } : {})}
        />
      ))}
    </ul>
  );
}
