import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/reader.css';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/core/db/types.ts';
import { PrefsStore } from '../../src/core/prefs/prefs.ts';
import { ReaderEngine } from '../../src/core/reader/engine.ts';
import { words } from '../../src/core/reader/words.ts';
import { ReaderView, type ReaderBook } from '../../src/views/ReaderView.tsx';
import { frames, host, lineAt, makeBook, sleep } from './helpers.ts';

let engine: ReaderEngine | null = null;
let root: Root | null = null;
afterEach(() => {
  root?.unmount();
  root = null;
  engine?.destroy();
  engine = null;
  document.body.innerHTML = '';
});

function stubDb(): Db {
  return {
    async exec() {},
    async run() {},
    async all<T>(sql: string): Promise<T[]> { return (sql.includes('last_insert_rowid') ? [{ id: 1 }] : []) as T[]; },
    async tx(fn) { await fn(); },
  };
}

/** Colour from `#rrggbb` or `rgb(a)(…)`, alpha-composited over the page colour by the caller's choice of page. */
function rgb(css: string): [number, number, number, number] {
  const c = css.trim();
  if (c.startsWith('#')) return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 1];
  const n = c.match(/[\d.]+/g)!.map(Number);
  return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1];
}
function contrast(fg: [number, number, number, number], bg: [number, number, number, number]): number {
  const mix = fg.slice(0, 3).map((v, i) => v * fg[3] + (bg[i] ?? 0) * (1 - fg[3]));
  const lum = (c: number[]) => {
    const [r = 0, g = 0, b = 0] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const l1 = lum(mix), l2 = lum(bg.slice(0, 3));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function wordPoint(line: HTMLElement, n: number): { x: number; y: number; word: string } | null {
  const w = [...words(line.textContent ?? '')][n];
  const node = line.firstChild;
  if (!w || !node) return null;
  const r = document.createRange();
  r.setStart(node, w.start);
  r.setEnd(node, w.end);
  const b = r.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, word: w.word };
}

function clickAt(x: number, y: number) {
  const page = document.querySelector('.rd-page') ?? document.body;
  page.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }));
}

async function waitFor<T extends Element>(sel: string): Promise<T> {
  const t0 = performance.now();
  while (performance.now() - t0 < 8000) {
    const el = document.querySelector<T>(sel);
    if (el) return el;
    await frames(2);
  }
  throw new Error(`missing ${sel}`);
}

const drawer = () => document.querySelector('[data-testid="drawer"]');

describe('scroll a soft line to the centre', () => {
  it('puts the line in the band without reading layout per frame', async () => {
    const el = host(402, Math.min(720, window.innerHeight - 8));
    const e = new ReaderEngine(el, makeBook(1, 24), { fontSize: 'M', focusPct: 30, blurMax: 7, sentenceMode: false, tier: 'full', theme: 'paper', predict: 'few', focusBlur: true, guideSpeed: 1, blurMaxSet: false });
    engine = e;
    await e.mount(null);
    el.scrollTop = 80;
    e.paintNow();
    await frames(2);
    const box = el.getBoundingClientRect();
    const mid = box.top + box.height / 2;
    let line: HTMLElement | null = null;
    let hit: ReturnType<ReaderEngine['hitTest']> = null;
    for (const l of el.querySelectorAll<HTMLElement>('.rd-line[data-p]')) {
      const b = l.getBoundingClientRect();
      if (b.top < mid + 80 || b.bottom > Math.min(box.bottom, window.innerHeight) - 4) continue;
      if (!l.style.filter.startsWith('blur')) continue;
      const p = wordPoint(l, 0);
      if (!p) continue;
      hit = e.hitTest(p.x, p.y);
      if (hit) { line = l; break; }
    }
    expect(line && hit, 'a soft on-screen word').toBeTruthy();
    expect(e.isTappable(hit!.lineIndex)).toBe(false);

    let reads = 0;
    const gbcr = Element.prototype.getBoundingClientRect;
    const gcr = Range.prototype.getClientRects;
    Element.prototype.getBoundingClientRect = function (this: Element) { reads++; return gbcr.call(this); };
    Range.prototype.getClientRects = function (this: Range) { reads++; return gcr.call(this); };
    try {
      await new Promise<void>((resolve) => e.scrollLineToCentre(hit!.lineIndex, 180, resolve));
    } finally {
      Element.prototype.getBoundingClientRect = gbcr;
      Range.prototype.getClientRects = gcr;
    }
    expect(reads).toBe(0);
    const b = line!.getBoundingClientRect();
    expect((b.top + b.bottom) / 2).toBeCloseTo(box.top + box.height / 2, -0.5);
    expect(e.isInBand(hit!.lineIndex)).toBe(true);
    expect(line!.style.filter).toBe('none');
  });

  it('a cancelled scroll does not finish', async () => {
    const el = host(402, Math.min(720, window.innerHeight - 8));
    const e = new ReaderEngine(el, makeBook(1, 16), { fontSize: 'M', focusPct: 30, blurMax: 7, sentenceMode: false, tier: 'full', theme: 'paper', predict: 'few', focusBlur: true, guideSpeed: 1, blurMaxSet: false });
    engine = e;
    await e.mount(null);
    await frames(2);
    const box = el.getBoundingClientRect();
    const line = lineAt(el, Math.min(box.bottom, window.innerHeight) - 40);
    const p = wordPoint(line, 0)!;
    const hit = e.hitTest(p.x, p.y);
    expect(hit, 'word on the lower line').toBeTruthy();
    let done = 0;
    const cancel = e.scrollLineToCentre(hit!.lineIndex, 400, () => done++);
    await sleep(40);
    cancel();
    const at = el.scrollTop;
    await sleep(200);
    expect(el.scrollTop).toBe(at);
    expect(done).toBe(0);
  });
});

describe('reader reach and the guide bar', () => {
  let prefs: PrefsStore;

  async function mount() {
    const db = stubDb();
    prefs = await PrefsStore.load(db);
    await prefs.set('tier', 'full');
    const book: ReaderBook = { ...makeBook(1, 20), title: 'Reach' };
    const page = document.createElement('div');
    document.body.append(page);
    root = createRoot(page);
    flushSync(() => { root!.render(createElement(ReaderView, { session: { db, prefs }, book, initialAnchor: null, onBack: () => {} })); });
    await waitFor('.rd-line[data-p]');
    await frames(2);
  }

  it('mounts the guide bar in 纸白, and it steps aside while chrome is up', async () => {
    await mount();
    expect(prefs.get().theme).toBe('paper');
    expect(document.querySelector('.gd-bar')).toBeTruthy();
    expect(document.querySelector('.rd-guide')).toBeNull();
    // The bar is ink on paper (review S1): speed labels and the play glyph meet 4.5 : 1 on the page.
    const page = rgb(getComputedStyle(document.documentElement).getPropertyValue('--paper'));
    expect(contrast(rgb(getComputedStyle(document.querySelector('.gd-speeds button:not([aria-checked="true"]) span')!).color), page)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb(getComputedStyle(document.querySelector('.gd-play-disc')!).color), page)).toBeGreaterThanOrEqual(4.5);
    await prefs.set('theme', 'night');
    await frames(1);
    expect(document.querySelector('.gd-bar')).toBeNull();
    expect(document.querySelector('.rd-guide')?.classList.contains('rd-chrome-on')).toBe(false);
    clickAt(window.innerWidth / 2, 64);
    await frames(1);
    expect(document.querySelector('.rd-guide')?.classList.contains('rd-chrome-on')).toBe(true);
    expect(document.querySelector('.gd-bar')).toBeNull();
    clickAt(window.innerWidth / 2, 64);
    await frames(1);
    await prefs.set('theme', 'paper');
    await frames(1);
    expect(document.querySelector('.gd-bar')).toBeTruthy();
    expect(document.querySelector('.rd-guide')).toBeNull();

    const scroller = document.querySelector<HTMLElement>('[data-testid="reader-scroll"]')!;
    const held = scroller.scrollTop;
    clickAt(window.innerWidth / 2, 64);
    await frames(1);
    expect(document.querySelector('.gd-bar')).toBeNull();
    expect(document.querySelector('.rd-top')?.classList.contains('rd-chrome-on')).toBe(true);
    await sleep(800);
    expect(drawer()).toBeNull();
    expect(scroller.scrollTop).toBe(held);
    clickAt(window.innerWidth / 2, 64);
    await frames(1);
    expect(document.querySelector('.gd-bar')).toBeTruthy();
    expect(document.querySelector('.rd-top')?.classList.contains('rd-chrome-on')).toBe(false);
  });

  it('a tap on the capsule\'s place just after it fades brings it back instead of opening a word (review S3)', async () => {
    await mount();
    const top = () => document.querySelector('.rd-top')?.classList.contains('rd-chrome-on');
    clickAt(window.innerWidth / 2, 64);
    await frames(1);
    expect(top()).toBe(true);
    const dock = document.querySelector('.rd-dock')!.getBoundingClientRect();
    const x = dock.left + dock.width / 2, y = dock.top + dock.height / 2;
    await sleep(3000 + 100); // the 3 s idle fade, then 100 ms
    expect(top()).toBe(false);
    clickAt(x, y);
    await frames(1);
    expect(top()).toBe(true);
    await sleep(700); // no word drawer opened behind it
    expect(drawer()).toBeNull();
  }, 15_000);

  it('a drawer that pushed the page up lets it settle back as it closes (review M2)', async () => {
    await prefs.set('focusBlur', false); // any line opens, so a word low on the page can be tapped
    await mount();
    const scroller = document.querySelector<HTMLElement>('[data-testid="reader-scroll"]')!;
    const box = scroller.getBoundingClientRect();
    const line = lineAt(scroller, box.bottom - 130);
    const p = wordPoint(line, 0)!;
    const y0 = line.getBoundingClientRect().top;
    const top0 = scroller.scrollTop;
    clickAt(p.x, p.y);
    await sleep(900); // open (330 ms) and the smooth keep-on-screen scroll
    expect(drawer()).toBeTruthy();
    expect(scroller.scrollTop, 'the drawer pushed the page up').toBeGreaterThan(top0 + 8);
    clickAt(window.innerWidth / 2, 64); // a tap in the title area only closes it, never opens another word
    await sleep(600);
    expect(drawer()).toBeNull();
    expect(Math.abs(line.getBoundingClientRect().top - y0)).toBeLessThanOrEqual(1);
  });

  it('opens a sharp word at once, and scrolls a blurred word into the band before opening it', async () => {
    await mount();
    const scroller = document.querySelector<HTMLElement>('[data-testid="reader-scroll"]')!;
    const box = scroller.getBoundingClientRect();
    const mid = box.top + box.height / 2;
    const sharp = lineAt(scroller, mid);
    const sw = wordPoint(sharp, 1) ?? wordPoint(sharp, 0)!;
    const top = scroller.scrollTop;
    const t0 = performance.now();
    clickAt(sw.x, sw.y);
    await frames(1);
    expect(drawer()).toBeTruthy();
    expect(performance.now() - t0).toBeLessThan(100);
    expect(scroller.scrollTop).toBe(top);
    expect(document.querySelector('.rd-hl')?.textContent).toBe(sw.word);

    clickAt(8, window.innerHeight / 2);
    const closed = performance.now();
    while (drawer() && performance.now() - closed < 2000) await frames(2);
    expect(drawer()).toBeNull();

    const soft = [...scroller.querySelectorAll<HTMLElement>('.rd-line[data-p]')].find((l) => {
      const b = l.getBoundingClientRect();
      return b.top > mid + 170 && b.bottom < box.bottom - 140 && l.style.filter.startsWith('blur');
    })!;
    const bw = wordPoint(soft, 0)!;
    soft.dataset.reach = '1';
    expect(drawer()).toBeNull();
    clickAt(bw.x, bw.y);
    await frames(2);
    expect(drawer()).toBeNull();
    const opened = performance.now();
    while (!drawer() && performance.now() - opened < 2000) await frames(2);
    expect(drawer()).toBeTruthy();
    expect(document.querySelector('.rd-top')?.classList.contains('rd-chrome-on')).toBe(false);
    const moved = document.querySelector<HTMLElement>('[data-reach="1"]')!;
    const mb = moved.getBoundingClientRect();
    expect(Math.abs(mb.top + mb.height / 2 - (box.top + box.height / 2))).toBeLessThan(24);
    expect(moved.style.filter).toBe('none');
    expect(moved.querySelector('.rd-hl')?.textContent).toBe(bw.word);
  });

  it('with 聚焦模糊 off a word below the band opens at once', async () => {
    await mount();
    await prefs.set('focusBlur', false);
    await frames(2);
    const scroller = document.querySelector<HTMLElement>('[data-testid="reader-scroll"]')!;
    const box = scroller.getBoundingClientRect();
    const farLine = [...scroller.querySelectorAll<HTMLElement>('.rd-line[data-p]')].find((l) => {
      const b = l.getBoundingClientRect();
      return b.top > box.top + box.height * 0.62 && b.bottom < box.bottom - 140;
    })!;
    const fw = wordPoint(farLine, 0)!;
    const still = scroller.scrollTop;
    const t1 = performance.now();
    clickAt(fw.x, fw.y);
    await frames(1);
    expect(drawer()).toBeTruthy();
    expect(performance.now() - t1).toBeLessThan(100);
    expect(scroller.scrollTop).toBe(still);
    expect(document.querySelector('.rd-hl')?.textContent).toBe(fw.word);
  });
});
