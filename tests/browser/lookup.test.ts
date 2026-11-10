import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/reader.css';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../../src/core/prefs/prefs.ts';
import type { Footnote } from '../../src/core/reader/decorate.ts';
import { ReaderEngine } from '../../src/core/reader/engine.ts';
import { words } from '../../src/core/reader/words.ts';
import { frames, host, lineAt, makeBook } from './helpers.ts';

let engine: ReaderEngine | null = null;
afterEach(() => { engine?.destroy(); engine = null; document.body.innerHTML = ''; });

async function open() {
  const el = host(402, 874);
  const e = new ReaderEngine(el, makeBook(3), { ...DEFAULT_PREFS, tier: 'full' });
  engine = e;
  await e.mount(null);
  el.scrollTop = 1200;
  e.paintNow();
  await frames(2); // a tap always comes after the page has rendered (off-screen chapters render lazily)
  return { el, e };
}
const centreY = (el: HTMLElement) => { const b = el.getBoundingClientRect(); return b.top + b.height / 2; };
const tops = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('.rd-line, .rd-blank')).map((l) => [l.offsetTop, l.offsetHeight]);

/** Viewport point in the middle of the n-th word of a line. */
function wordPoint(line: HTMLElement, n: number): { x: number; y: number; word: string } {
  const text = line.textContent!;
  const w = [...words(text)][n]!;
  const r = document.createRange();
  r.setStart(line.firstChild!, w.start);
  r.setEnd(line.firstChild!, w.end);
  const b = r.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, word: w.word };
}

describe('hit test (R-04)', () => {
  it('finds the tapped word, its sentence and context', async () => {
    const { el, e } = await open();
    const line = lineAt(el, centreY(el));
    const p = wordPoint(line, 1);
    const hit = e.hitTest(p.x, p.y)!;
    expect(hit.word).toBe(p.word);
    expect(hit.sentenceText).toContain(p.word);
    expect(hit.rect.width).toBeGreaterThan(0);
    expect(hit.prevWord ?? hit.sentenceInitial).toBeTruthy();
  });

  it('returns null for blank space right of a short last line and for the gutter', async () => {
    const { el, e } = await open();
    const line = lineAt(el, centreY(el));
    const b = line.getBoundingClientRect();
    expect(e.hitTest(b.left - 20, b.top + b.height / 2)).toBeNull();
    const blank = el.querySelector<HTMLElement>('.rd-blank')!.getBoundingClientRect();
    expect(e.hitTest(blank.left + 100, blank.top + blank.height / 2)).toBeNull();
  });
});

describe('footnotes (R-06)', () => {
  it('every line keeps its y position and height when footnotes appear', async () => {
    const { el, e } = await open();
    const before = tops(el);
    const gloss = '一条很长的中文注释用来超出词宽';
    e.setAnnotator((_c, _p, _para, text) => {
      const out: Footnote[] = [];
      for (const w of words(text)) {
        if (w.word === 'of' || w.word === 'the' || w.word === 'river' || w.word === 'soldiers' || w.word === 'mountains') {
          out.push({ start: w.start, end: w.end, text: gloss });
        }
      }
      return out;
    });
    // setAnnotator decorates the paragraphs nearest the band in a 5 ms slice now and the rest in
    // background slices (R-01), so a slow machine may not reach 50 notes before the first await.
    await expect.poll(() => el.querySelectorAll('.rd-fn').length).toBeGreaterThan(50);
    const notes = [...el.querySelectorAll<HTMLElement>('.rd-fn')];
    expect(tops(el)).toEqual(before);
    // The gloss may extend past a short word (about six em) and still clips to a long word.
    // Either way it sits under the word, and the line's y and height stay put (above).
    const em6 = parseFloat(getComputedStyle(notes[0]!).fontSize) * 6;
    let sawShort = false;
    let sawLong = false;
    for (const fn of notes) {
      const word = fn.parentElement!.getBoundingClientRect();
      const box = fn.getBoundingClientRect();
      const cap = Math.max(word.width, em6);
      expect(box.top).toBeGreaterThan(word.top);
      expect(box.width).toBeLessThanOrEqual(cap + 1);
      expect(box.width).toBeGreaterThan(cap - 2);
      if (word.width + 1 < em6) {
        sawShort = true;
        expect(box.width).toBeGreaterThan(word.width + 1);
      }
      if (word.width > em6 + 1) {
        sawLong = true;
        expect(box.width).toBeLessThanOrEqual(word.width + 0.5);
      }
    }
    expect(sawShort).toBe(true);
    expect(sawLong).toBe(true);
  });

  it('marks a predicted gloss and leaves a looked-up gloss plain', async () => {
    const { el, e } = await open();
    e.setAnnotator((_c, _p, _para, text) => {
      const out: Footnote[] = [];
      for (const w of words(text)) {
        if (w.word === 'river') out.push({ start: w.start, end: w.end, text: '河', kind: 'predicted' });
        else if (w.word === 'the') out.push({ start: w.start, end: w.end, text: '这' });
      }
      return out;
    });
    const predicted = el.querySelector<HTMLElement>('.rd-fn-predicted');
    const plain = [...el.querySelectorAll<HTMLElement>('.rd-fn')].find((n) => !n.classList.contains('rd-fn-predicted'));
    expect(predicted?.textContent).toBe('河');
    expect(predicted?.classList.contains('rd-fn')).toBe(true);
    expect(plain?.textContent).toBe('这');
    const predictedStyle = getComputedStyle(predicted!);
    const plainStyle = getComputedStyle(plain!);
    expect(predictedStyle.fontSize).toBe(plainStyle.fontSize);
    expect(predictedStyle.position).toBe('absolute');
    expect(predictedStyle.pointerEvents).toBe('none');
    expect(predictedStyle.color).not.toBe(plainStyle.color);
  });

  it('keeps hit testing correct on decorated lines', async () => {
    const { el, e } = await open();
    e.setAnnotator((_c, _p, _para, text) => [...words(text)].slice(0, 3).map((w) => ({ start: w.start, end: w.end, text: '注' })));
    const line = lineAt(el, centreY(el));
    const spans = line.querySelectorAll('.rd-w');
    if (!spans.length) return; // centre line may not start a paragraph
    const r = spans[0]!.firstChild!;
    const range = document.createRange();
    range.selectNodeContents(r);
    const b = range.getBoundingClientRect();
    expect(e.hitTest(b.left + b.width / 2, b.top + b.height / 2)?.word).toBe(r.textContent);
  });

  it('removing all footnotes restores plain lines', async () => {
    const { el, e } = await open();
    e.setAnnotator((_c, _p, _para, text) => [...words(text)].map((w) => ({ start: w.start, end: w.end, text: '注' })));
    expect(el.querySelectorAll('.rd-w').length).toBeGreaterThan(0); // the first slice runs at once
    e.setAnnotator(null);
    // Undecorating is sliced too (5 ms now, the rest in the background), so wait for it to finish.
    await expect.poll(() => el.querySelectorAll('.rd-w').length).toBe(0);
  });
});

describe('highlight and drawer gap (R-05)', () => {
  it('highlights exactly the tapped word and clears it', async () => {
    const { el, e } = await open();
    const line = lineAt(el, centreY(el));
    const p = wordPoint(line, 2);
    const hit = e.hitTest(p.x, p.y)!;
    e.setHighlight(hit);
    expect(el.querySelector('.rd-hl')?.textContent).toBe(p.word);
    e.setHighlight(null);
    expect(el.querySelector('.rd-hl')).toBeNull();
  });

  it('paints lines below the gap at their shifted position', async () => {
    const { el, e } = await open();
    const line = lineAt(el, centreY(el) - 120);
    const p = wordPoint(line, 0);
    const hit = e.hitTest(p.x, p.y)!;
    const hostEl = e.openGap(hit.lineIndex);
    hostEl.style.height = '240px';
    e.setGap(240);
    // The line now at the viewport centre must be the sharp one.
    const sharp = lineAt(el, centreY(el));
    expect(sharp.style.filter).toBe('none');
    e.closeGap();
    expect(el.querySelector('.rd-gap')).toBeNull();
  });
});
