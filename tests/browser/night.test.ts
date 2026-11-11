import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/reader.css';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, type Prefs } from '../../src/core/prefs/prefs.ts';
import { ReaderEngine } from '../../src/core/reader/engine.ts';
import { bandFor, blurPx, opacityFor, tFor } from '../../src/core/reader/focus.ts';
import { frames, host, makeBook, sleep } from './helpers.ts';

const book = makeBook(3);
let engine: ReaderEngine | null = null;
afterEach(() => { engine?.destroy(); engine = null; document.body.innerHTML = ''; delete document.documentElement.dataset.theme; });

async function open(prefs: Partial<Prefs> = {}) {
  if (prefs.theme === 'night') document.documentElement.dataset.theme = 'night';
  const el = host(402, 874);
  const e = new ReaderEngine(el, book, { ...DEFAULT_PREFS, tier: 'full', ...prefs });
  engine = e;
  await e.mount(null);
  el.scrollTop = 1500;
  e.paintNow();
  await frames(2);
  return { el, e };
}
const ACCENT = 'rgb(255, 180, 180)';
/** The accent the engine wrote (the computed colour is mid-transition for 240 ms). */
const accented = (l: HTMLElement) => l.style.color === 'var(--reader-accent)';
const visible = (el: HTMLElement) => {
  const box = el.getBoundingClientRect();
  return [...el.querySelectorAll<HTMLElement>('.rd-line[data-p]')].filter((l) => {
    const r = l.getBoundingClientRect();
    return r.bottom > box.top && r.top < box.bottom && Number(l.dataset.p) >= 0;
  });
};
const tOf = (el: HTMLElement, l: HTMLElement) => {
  const box = el.getBoundingClientRect();
  const r = l.getBoundingClientRect();
  return tFor(Math.abs(r.top + r.height / 2 - (box.top + box.height / 2)), bandFor(el.clientHeight, 30));
};

describe('夜读 in the reader engine (N1–N3)', () => {
  it('NM-01: switching 纸白 → 夜读 → 纸白 moves no line', async () => {
    const { el, e } = await open();
    const tops = () => [...el.querySelectorAll<HTMLElement>('.rd-line')].map((l) => l.getBoundingClientRect().top);
    const before = tops();
    document.documentElement.dataset.theme = 'night';
    e.setPrefs({ ...DEFAULT_PREFS, tier: 'full', theme: 'night' });
    await frames(2);
    expect(tops()).toEqual(before);
    delete document.documentElement.dataset.theme;
    e.setPrefs({ ...DEFAULT_PREFS, tier: 'full', theme: 'paper' });
    expect(tops()).toEqual(before);
    expect(el.querySelectorAll<HTMLElement>('.rd-line[style*="color"]').length).toBe(0); // no accent left in 纸白
  });

  it('NM-02: at night the far lines fade to .08 and blur to 9 px by default', async () => {
    const { el } = await open({ theme: 'night' });
    let far = 0;
    for (const l of visible(el)) {
      const t = tOf(el, l);
      expect(Number(l.style.opacity)).toBeCloseTo(opacityFor(t, true), 2);
      const b = blurPx(t, 9);
      expect(l.style.filter).toBe(b > 0 ? `blur(${b}px)` : 'none');
      if (t === 1) { far++; expect(Number(l.style.opacity)).toBeCloseTo(0.08, 2); }
    }
    expect(far).toBeGreaterThan(0);
  });

  it('NM-03: exactly the sharp (t = 0) lines carry the accent, and only at night', async () => {
    const { el } = await open({ theme: 'night' });
    let lit = 0;
    for (const l of visible(el)) {
      const sharp = tOf(el, l) === 0;
      expect(accented(l), `t=${tOf(el, l)}`).toBe(sharp);
      if (sharp) lit++;
    }
    expect(lit).toBeGreaterThan(2);
    await sleep(300); // after the 240 ms colour transition, the accent is #ffb4b4
    for (const l of visible(el)) expect(getComputedStyle(l).color === ACCENT).toBe(tOf(el, l) === 0);
  });

  it('NM-03: 聚焦模糊 off at night: no accent', async () => {
    const { el } = await open({ theme: 'night', focusBlur: false });
    for (const l of visible(el)) expect(accented(l)).toBe(false);
  });
});
