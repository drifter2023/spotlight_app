import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/reader.css';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { ReaderChrome } from '../../src/views/reader/ReaderChrome.tsx';
import { Sheet } from '../../src/views/reader/Sheet.tsx';

let root: Root | null = null;
afterEach(() => { root?.unmount(); root = null; document.body.innerHTML = ''; });

function render(visible: boolean, onBack: () => void, scrim = false) {
  const page = document.createElement('div');
  page.className = 'rd-page';
  document.body.append(page);
  root = createRoot(page);
  flushSync(() => {
    root!.render(createElement(ReaderChrome, {
      visible,
      title: 'The Great Gatsby',
      onBack,
      onToc: () => {},
      onSettings: () => {},
    }));
  });
  if (scrim) {
    const el = document.createElement('div');
    el.className = 'sheet-scrim';
    page.append(el);
  }
  return page;
}

describe('ReaderChrome back control', () => {
  it('hides ‹ 书架 with the title and capsule; nothing on the page takes a tap (owner decision 2026-11-11)', () => {
    const page = render(false, () => {}, true);
    const back = page.querySelector<HTMLButtonElement>('.rd-back')!;
    const bar = page.querySelector<HTMLElement>('.rd-top')!;
    const capsule = page.querySelector<HTMLElement>('.rd-capsule')!;
    for (const el of [back, bar, capsule]) {
      expect(el.getAttribute('aria-hidden')).toBe('true');
      expect(el.classList.contains('rd-chrome-on')).toBe(false);
      expect(getComputedStyle(el).pointerEvents).toBe('none');
      expect(Number(getComputedStyle(el).opacity)).toBe(0);
    }
    expect(back.tabIndex).toBe(-1);
    expect([...capsule.querySelectorAll('button')].map((b) => b.tabIndex)).toEqual([-1, -1]);
    expect(bar.querySelector('.rd-title')?.textContent).toBe('The Great Gatsby');
    // A tap where ‹ 书架 sits goes through to the page (here the scrim), which shows the chrome.
    expect(document.elementFromPoint(24, 16)?.closest('.rd-back')).toBeNull();
    expect(document.elementFromPoint(24, 16)?.closest('.sheet-scrim')).not.toBeNull();
  });

  it('shows ‹ 书架 with the title and capsule when the chrome is on, and ‹ 书架 goes back', () => {
    let backed = 0;
    const page = render(true, () => { backed += 1; });
    const back = page.querySelector<HTMLButtonElement>('.rd-back')!;
    const bar = page.querySelector<HTMLElement>('.rd-top')!;
    const capsule = page.querySelector<HTMLElement>('.rd-capsule')!;
    for (const el of [back, bar, capsule]) {
      expect(el.getAttribute('aria-hidden')).toBe('false');
      expect(el.classList.contains('rd-chrome-on')).toBe(true);
      expect(getComputedStyle(el).pointerEvents).toBe('auto');
      expect(Number(getComputedStyle(el).opacity)).toBe(1);
    }
    expect(back.textContent).toBe('‹ 书架');
    expect(back.tabIndex).toBe(0);
    expect([...capsule.querySelectorAll('button')].map((b) => b.tabIndex)).toEqual([0, 0]);
    expect(document.elementFromPoint(24, 16)?.closest('.rd-back')).toBe(back);
    back.click();
    expect(backed).toBe(1);
  });
});

describe('Sheet grip', () => {
  it('is a 44 px tall target (review S8)', () => {
    const page = document.createElement('div');
    page.className = 'rd-page';
    page.style.cssText = 'position:relative;width:402px;height:874px';
    document.body.append(page);
    root = createRoot(page);
    flushSync(() => { root!.render(createElement(Sheet, { open: true, label: '设置', onClose: () => {}, children: 'body' })); });
    const grip = page.querySelector<HTMLElement>('.sheet-grip')!;
    expect(grip.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  });
});
