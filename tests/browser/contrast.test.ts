import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/reader.css';
import { afterEach, describe, expect, it } from 'vitest';

// Review O4 (owner decision 2026-11-11): the eyebrow and both footnote kinds meet 4.5 : 1 in both themes,
// and predicted glosses stay lighter than saved ones.
afterEach(() => { document.body.innerHTML = ''; delete document.documentElement.dataset.theme; });

type RGBA = [number, number, number, number];
function rgba(css: string): RGBA {
  const c = css.trim();
  if (c.startsWith('#')) return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 1];
  const n = c.match(/[\d.]+/g)!.map(Number);
  return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1];
}
function lum(c: number[]): number {
  const [r = 0, g = 0, b = 0] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(el: Element): number {
  const fg = rgba(getComputedStyle(el).color);
  const bg = rgba(getComputedStyle(document.documentElement).getPropertyValue('--paper'));
  const mix = [0, 1, 2].map((i) => fg[i]! * fg[3] + bg[i]! * (1 - fg[3]));
  const a = lum(mix), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('small text contrast (review O4)', () => {
  for (const theme of ['paper', 'night'] as const) {
    it(`${theme}: eyebrow, saved and predicted footnotes reach 4.5 : 1; predicted is lighter`, () => {
      document.documentElement.dataset.theme = theme;
      document.body.innerHTML = '<div class="rd-page"><div class="rd-eyebrow"><span>CHAPTER I</span></div>'
        + '<span class="rd-fn">保存的</span><span class="rd-fn rd-fn-predicted">预测的</span></div>';
      const [eyebrow, saved, predicted] = ['.rd-eyebrow', '.rd-fn:not(.rd-fn-predicted)', '.rd-fn-predicted'].map((s) => document.querySelector(s)!);
      expect(ratio(eyebrow!)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(saved!)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(predicted!)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(predicted!)).toBeLessThan(ratio(saved!));
      expect(getComputedStyle(predicted!).fontWeight).toBe('400');
      expect(getComputedStyle(saved!).fontWeight).toBe('500');
    });
  }
});
