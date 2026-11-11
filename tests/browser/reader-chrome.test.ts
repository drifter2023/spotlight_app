import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/reader.css';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { ReaderChrome } from '../../src/views/reader/ReaderChrome.tsx';

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
  it('keeps ‹ 书架 tappable while the title and capsule are hidden, including over a sheet scrim', () => {
    let backed = 0;
    let bubbled = 0;
    const onBubble = () => { bubbled += 1; };
    document.body.addEventListener('click', onBubble);
    try {
      const page = render(false, () => { backed += 1; }, true);
      const back = page.querySelector<HTMLButtonElement>('.rd-back')!;
      const bar = page.querySelector<HTMLElement>('.rd-top')!;
      const capsule = page.querySelector<HTMLElement>('.rd-capsule')!;

      expect(back.textContent).toBe('‹ 书架');
      expect(back.tabIndex).toBe(0);
      expect(back.getAttribute('aria-hidden')).toBeNull();
      expect(back.closest('[aria-hidden="true"]')).toBeNull();
      expect(bar.contains(back)).toBe(false);
      expect(getComputedStyle(back).pointerEvents).toBe('auto');
      expect(Number(getComputedStyle(back).opacity)).toBe(1);

      expect(bar.getAttribute('aria-hidden')).toBe('true');
      expect(bar.classList.contains('rd-chrome-on')).toBe(false);
      expect(getComputedStyle(bar).pointerEvents).toBe('none');
      expect(Number(getComputedStyle(bar).opacity)).toBe(0);
      expect(bar.querySelector('.rd-title')?.textContent).toBe('The Great Gatsby');

      expect(capsule.getAttribute('aria-hidden')).toBe('true');
      expect(capsule.classList.contains('rd-chrome-on')).toBe(false);
      expect(getComputedStyle(capsule).pointerEvents).toBe('none');
      expect([...capsule.querySelectorAll('button')].map((b) => b.tabIndex)).toEqual([-1, -1]);

      expect(document.elementFromPoint(24, 16)?.closest('.rd-back')).toBe(back);
      const through = document.elementFromPoint(220, 16);
      expect(through?.closest('.rd-top')).toBeNull();
      expect(through?.closest('.sheet-scrim')).not.toBeNull();

      back.click();
      expect(backed).toBe(1);
      expect(bubbled).toBe(0);
    } finally {
      document.body.removeEventListener('click', onBubble);
    }
  });

  it('shows the title and capsule with ‹ 书架 when the chrome is on', () => {
    const page = render(true, () => {});
    const back = page.querySelector<HTMLButtonElement>('.rd-back')!;
    const bar = page.querySelector<HTMLElement>('.rd-top')!;
    const capsule = page.querySelector<HTMLElement>('.rd-capsule')!;
    expect(back.tabIndex).toBe(0);
    expect(back.getAttribute('aria-hidden')).toBeNull();
    expect(bar.getAttribute('aria-hidden')).not.toBe('true');
    expect(bar.classList.contains('rd-chrome-on')).toBe(true);
    expect(getComputedStyle(bar).pointerEvents).toBe('auto');
    expect(Number(getComputedStyle(bar).opacity)).toBe(1);
    expect(capsule.classList.contains('rd-chrome-on')).toBe(true);
    expect(capsule.getAttribute('aria-hidden')).not.toBe('true');
    expect([...capsule.querySelectorAll('button')].map((b) => b.tabIndex)).toEqual([0, 0]);
    expect(document.elementFromPoint(24, 16)?.closest('.rd-back')).toBe(back);
  });
});
