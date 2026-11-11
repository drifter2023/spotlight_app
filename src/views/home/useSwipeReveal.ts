import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';

/** How far a row slides to reveal 删除 (README → Home → Shelf row). */
export const REVEAL = 88;

/**
 * Swipe a row left to reveal 删除 (H-05). Used by the shelf row, a 札记 note and a 对话 row.
 * `open` is owned by the list (one row open at a time); the hook reports the outcome of a drag.
 */
export function useSwipeReveal(open: boolean, onSwipe: (open: boolean) => void, onTap: () => void) {
  const drag = useRef<{ x: number; y: number; dx: number; axis: 'x' | 'y' | null } | null>(null);
  const [dx, setDx] = useState<number | null>(null);
  /** The click that follows a swipe's pointerup must not count as a tap. */
  const swiped = useRef(false);

  const down = (e: PointerEvent) => { swiped.current = false; drag.current = { x: e.clientX, y: e.clientY, dx: 0, axis: null }; };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.axis && Math.abs(mx) + Math.abs(my) > 8) d.axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
    if (d.axis !== 'x') return;
    d.dx = mx;
    setDx(Math.min(0, Math.max(-REVEAL * 1.3, (open ? -REVEAL : 0) + mx)));
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== 'x') return;
    swiped.current = true;
    const x = (open ? -REVEAL : 0) + d.dx;
    setDx(null);
    onSwipe(x < -REVEAL / 2);
  };
  const click = (e: MouseEvent) => {
    // The list closes an open row on any tap; this row handles its own taps.
    e.stopPropagation();
    if (swiped.current) { swiped.current = false; return; }
    if (open) { onSwipe(false); return; }
    onTap();
  };

  const x = dx ?? (open ? -REVEAL : 0);
  return {
    /** The row's class: it snaps with the app's curve unless a finger is moving it. */
    className: dx === null ? 'row-snap' : '',
    style: { transform: x ? `translateX(${x}px)` : undefined },
    handlers: { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up, onClick: click },
  };
}
