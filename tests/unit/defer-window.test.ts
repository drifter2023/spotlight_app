import { describe, expect, it } from 'vitest';
import { outsideWindow } from '../../src/core/reader/decorate.ts';

// Review M1: re-predicted footnotes wait on paragraphs within one viewport of the screen.
describe('outsideWindow', () => {
  const H = 800;
  const scrollTop = 4000; // screen [4000, 4800); window [3200, 5600]

  it('keeps a paragraph on screen, or within a viewport of it, inside the window', () => {
    expect(outsideWindow(4100, 4300, scrollTop, H)).toBe(false); // on screen
    expect(outsideWindow(3300, 3400, scrollTop, H)).toBe(false); // one viewport above
    expect(outsideWindow(5400, 5500, scrollTop, H)).toBe(false); // one viewport below
    expect(outsideWindow(3100, 3300, scrollTop, H)).toBe(false); // straddles the top edge
    expect(outsideWindow(5500, 5700, scrollTop, H)).toBe(false); // straddles the bottom edge
  });

  it('lets a paragraph entirely past the window take the new footnotes', () => {
    expect(outsideWindow(2000, 3200, scrollTop, H)).toBe(true);
    expect(outsideWindow(5600, 5800, scrollTop, H)).toBe(true);
    expect(outsideWindow(0, 100, 0, H)).toBe(false);
    expect(outsideWindow(1600, 1700, 0, H)).toBe(true);
  });
});
