import { expect, test } from '@playwright/test';
import { fullTier, openFromHome, ready, tapTitle, wordInBand } from './helpers.ts';

test('makes no network requests outside the app origin, through home, reading and lookup', async ({ page, baseURL }) => {
  test.slow(!!process.env.CI, 'runs the first-launch probe, which is slow on a CI runner');
  const origin = new URL(baseURL!).origin;
  const foreign: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) foreign.push(u);
  });
  await page.goto('/');
  await openFromHome(page, 'The Great Gatsby');
  const p = await wordInBand(page, 'advice');
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('drawer')).toHaveAttribute('data-state', 'ready');
  expect(foreign).toEqual([]);
});

test('a wide window keeps the reading column to a book measure; a phone stays full width', async ({ page }) => {
  await fullTier(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?book=gatsby');
  await ready(page);
  const wide = await page.evaluate(() => {
    const column = document.querySelector('.rd-column')!.getBoundingClientRect();
    const scroll = document.querySelector('.rd-scroll')!.getBoundingClientRect();
    const pageBox = document.querySelector('.rd-page')!.getBoundingClientRect();
    const line = document.querySelector<HTMLElement>('.rd-line[data-p]')!;
    return {
      column: Math.round(column.width),
      scroll: Math.round(scroll.width),
      page: Math.round(pageBox.width),
      centered: Math.round(column.left) === Math.round(pageBox.width - column.right),
      line: Math.round(line.getBoundingClientRect().width),
    };
  });
  expect(wide.column).toBe(720);
  expect(wide.scroll).toBe(720);
  expect(wide.page).toBe(1600);
  expect(wide.centered).toBe(true);
  expect(wide.line).toBeLessThan(720 - 60); // inside the 34 px side padding

  await page.setViewportSize({ width: 402, height: 874 });
  await page.waitForTimeout(200);
  const phone = await page.evaluate(() => Math.round(document.querySelector('.rd-column')!.getBoundingClientRect().width));
  expect(phone).toBe(402);
});

test('opens The Great Gatsby with the chapter eyebrow and 1%', async ({ page }) => {
  await page.goto('/?book=gatsby');
  await ready(page);
  await expect(page.locator('.rd-eyebrow-chapter')).toHaveText('Chapter I');
  await expect(page.locator('.rd-eyebrow-pct')).toHaveText('1%');
  // Where the first line breaks depends on the platform's font rendering (Linux WebKit wraps "years"),
  // so check the opening words and the paragraph, not the break.
  await expect(page.locator('.rd-line[data-p="0"]').first()).toContainText('In my younger and more vulnerable');
  const para0 = await page.locator('.rd-chapter[data-ch="0"] .rd-line[data-p="0"]').allTextContents();
  expect(para0.join(' ').replace(/\s+/g, ' ')).toContain('In my younger and more vulnerable years my father gave me some advice');
});

test('R-07: a reload restores the same paragraph into the band', async ({ page }) => {
  await fullTier(page);
  await page.goto('/?book=gatsby&dev=1');
  await ready(page);
  await page.evaluate(() => { document.querySelector('.rd-scroll')!.scrollTop += 6000; });
  await page.waitForTimeout(1800); // idle 180ms + save debounce 1000ms
  const before = await page.evaluate(() => window.__spotlight!.engine.currentAnchor());
  await page.reload();
  await ready(page);
  const after = await page.evaluate(() => window.__spotlight!.engine.currentAnchor());
  expect([after.chapter, after.para]).toEqual([before.chapter, before.para]);
});

test('chrome: a tap in the title area shows the top bar and capsule; they hide after 5 s idle (review O3) and on scroll', async ({ page }) => {
  await fullTier(page);
  await page.goto('/?book=gatsby');
  await ready(page);
  const bar = page.locator('.rd-top');
  await tapTitle(page);
  await expect(bar).toHaveClass(/rd-chrome-on/);
  await expect(page.locator('.rd-title')).toHaveText('The Great Gatsby');
  await page.waitForTimeout(3300);
  await expect(bar).toHaveClass(/rd-chrome-on/); // still up past the old 3 s
  await page.waitForTimeout(2000);
  await expect(bar).not.toHaveClass(/rd-chrome-on/);
  await tapTitle(page);
  await expect(bar).toHaveClass(/rd-chrome-on/);
  await page.evaluate(() => { document.querySelector('.rd-scroll')!.scrollTop += 200; });
  await expect(bar).not.toHaveClass(/rd-chrome-on/);
});

test('S-01: settings apply live, keep the paragraph in the band, and persist', async ({ page }) => {
  await fullTier(page);
  await page.goto('/?book=gatsby&dev=1');
  await ready(page);
  await page.evaluate(() => { document.querySelector('.rd-scroll')!.scrollTop += 3000; });
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => window.__spotlight!.engine.currentAnchor());
  await tapTitle(page);
  await page.getByRole('button', { name: '阅读设置' }).click();
  await expect(page.getByRole('dialog', { name: '阅读设置' })).toBeVisible();
  await page.getByRole('radio', { name: '大' }).click();
  await expect(page.locator('.rd-scroll')).toHaveCSS('--fs', '22px');
  const after = await page.evaluate(() => window.__spotlight!.engine.currentAnchor());
  expect([after.chapter, after.para]).toEqual([before.chapter, before.para]);
  await page.getByRole('slider', { name: '清晰带' }).fill('50');
  await page.getByRole('switch', { name: '整句模式' }).check();
  await page.waitForTimeout(1000); // the web db is written to IndexedDB 300 ms after the last change
  await page.reload();
  await ready(page);
  await expect(page.locator('.rd-scroll')).toHaveCSS('--fs', '22px');
  expect(await page.evaluate(() => window.__spotlight!.prefs.get())).toMatchObject({ fontSize: 'L', focusPct: 50, sentenceMode: true });
});

test('S-03: 聚焦模糊 off makes the whole page sharp, any word below the title area opens its drawer, and it persists', async ({ page }) => {
  await fullTier(page);
  await page.goto('/?book=gatsby&dev=1');
  await ready(page);
  await tapTitle(page);
  await page.getByRole('button', { name: '阅读设置' }).click();
  await page.getByRole('switch', { name: '聚焦模糊' }).uncheck();
  await expect(page.getByRole('slider', { name: '模糊强度' })).toBeDisabled();
  await expect(page.getByRole('switch', { name: '整句模式' })).toBeDisabled();
  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByRole('dialog', { name: '阅读设置' })).toHaveCount(0);

  const vp = page.viewportSize()!;
  const shown = (h: number) => page.evaluate((h) => [...document.querySelectorAll<HTMLElement>('.rd-line[data-p]')]
    .filter((l) => { const b = l.getBoundingClientRect(); return b.top > 90 && b.bottom < h - 40; })
    .map((l) => [l.style.filter, l.style.opacity]), h);
  const lines = await shown(vp.height);
  expect(lines.length).toBeGreaterThan(10);
  expect(new Set(lines.map(String))).toEqual(new Set(['none,1']));

  // A word low on the page, far outside the band, opens its drawer.
  await page.evaluate(() => { document.querySelector('.rd-scroll')!.scrollTop += 2000; });
  await page.waitForTimeout(300);
  const lineIn = (lo: number, hi: number) => page.evaluate(({ lo, hi }) => {
    const line = [...document.querySelectorAll<HTMLElement>('.rd-line[data-p]')].find((l) => {
      const b = l.getBoundingClientRect();
      return b.top > lo && b.bottom < hi && (l.textContent ?? '').trim().length > 20;
    })!;
    const b = line.getBoundingClientRect();
    return { x: b.left + 40, y: b.top + b.height / 2 };
  }, { lo, hi });
  const low = await lineIn(vp.height - 260, vp.height - 80);
  await page.mouse.click(low.x, low.y);
  await expect(page.getByTestId('drawer')).toHaveAttribute('data-state', 'ready');
  await page.mouse.click(12, vp.height / 2); // closes the drawer
  await expect(page.getByTestId('drawer')).toHaveCount(0);

  // A word high on the page, just below the title area, opens its drawer too (owner decision 2026-10-15).
  const high = await lineIn(110, vp.height * 0.3 - 10);
  await page.mouse.click(high.x, high.y);
  await expect(page.getByTestId('drawer')).toHaveAttribute('data-state', 'ready');
  await page.mouse.click(12, vp.height / 2);
  await expect(page.getByTestId('drawer')).toHaveCount(0);
  // The title area itself shows ‹ 书架 / 目录 / Aa, never a drawer. Tap its middle: at the left, the
  // dev panel (&dev=1) reaches below y 64 on Linux WebKit, whose native select is taller.
  await tapTitle(page);
  await expect(page.locator('.rd-top')).toHaveClass(/rd-chrome-on/);
  await expect(page.getByTestId('drawer')).toHaveCount(0);
  await page.getByRole('button', { name: '阅读设置' }).click();
  await expect(page.getByRole('switch', { name: '聚焦模糊' })).not.toBeChecked();

  await page.waitForTimeout(1000); // the web db is written to IndexedDB 300 ms after the last change
  await page.reload();
  await ready(page);
  expect(await page.evaluate(() => window.__spotlight!.prefs.get().focusBlur)).toBe(false);
  expect(new Set((await shown(vp.height)).map(String))).toEqual(new Set(['none,1']));
});

test('N-01: a tap in the title area, on blank space or the page edge shows and hides ‹ 书架 / 目录 / Aa; a tap on text only hides them; Aa opens settings, outside closes it; an open drawer only closes; no scroll indicator', async ({ page }) => {
  await fullTier(page);
  await page.goto('/?book=gatsby');
  await ready(page);
  const vp = page.viewportSize()!;
  const bar = page.locator('.rd-top');
  const sheet = page.getByRole('dialog', { name: '阅读设置' });
  expect(await page.locator('.rd-scroll').evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe('none');

  // The title area: the three buttons, no sheet; a second tap there hides them.
  await tapTitle(page);
  await expect(bar).toHaveClass(/rd-chrome-on/);
  await expect(page.locator('.rd-capsule')).toHaveClass(/rd-chrome-on/);
  await expect(sheet).toHaveCount(0);
  await tapTitle(page);
  await expect(bar).not.toHaveClass(/rd-chrome-on/);

  // The side margin, anywhere down the page, and the bottom edge: a tap shows them, the next hides them (owner request 2026-10-20).
  // The bottom centre can be a soft word now: that tap scrolls it into the band and opens.
  // The corner is still the page edge (and the side margin), so it shows and hides the menu.
  for (const [x, y] of [[12, 130], [12, vp.height / 2], [vp.width - 12, vp.height * 0.75], [vp.width - 12, vp.height - 12]] as const) {
    await page.mouse.click(x, y);
    await expect(bar).toHaveClass(/rd-chrome-on/);
    await expect(page.locator('.rd-capsule')).toHaveClass(/rd-chrome-on/);
    await page.mouse.click(x, y);
    await expect(bar).not.toHaveClass(/rd-chrome-on/);
  }
  // A blurred word does not show the menu. It scrolls into the band and opens; shown chrome only hides.
  const blurredWord = () => page.evaluate(() => {
    const h = window.innerHeight;
    const line = [...document.querySelectorAll<HTMLElement>('.rd-line[data-p]')].find((l) => {
      const b = l.getBoundingClientRect();
      return b.top > h * 0.62 && b.bottom < h - 160 && l.style.filter.startsWith('blur') && (l.textContent ?? '').trim().length > 20;
    })!;
    const b = line.getBoundingClientRect();
    return { x: b.left + 40, y: b.top + b.height / 2 };
  });
  await page.mouse.click((await blurredWord()).x, (await blurredWord()).y);
  await expect(bar).not.toHaveClass(/rd-chrome-on/);
  await expect(page.getByTestId('drawer')).toBeVisible({ timeout: 4000 });
  await page.mouse.click(12, vp.height / 2); // an open drawer only closes
  await expect(page.getByTestId('drawer')).toHaveCount(0);
  await expect(bar).not.toHaveClass(/rd-chrome-on/);
  await page.mouse.click(12, vp.height / 2);
  await expect(bar).toHaveClass(/rd-chrome-on/);
  const blurredAgain = await blurredWord();
  await page.mouse.click(blurredAgain.x, blurredAgain.y);
  await expect(bar).not.toHaveClass(/rd-chrome-on/);
  await expect(page.getByTestId('drawer')).toBeVisible({ timeout: 4000 });
  await page.mouse.click(12, vp.height / 2);
  await expect(page.getByTestId('drawer')).toHaveCount(0);
  // A word in the band opens its drawer and hides them.
  await page.mouse.click(12, vp.height / 2);
  await expect(bar).toHaveClass(/rd-chrome-on/);
  const w = await wordInBand(page, 'advice');
  await page.mouse.click(w.x, w.y);
  await expect(page.getByTestId('drawer')).toHaveAttribute('data-state', 'ready');
  await expect(bar).not.toHaveClass(/rd-chrome-on/);
  await page.mouse.click(12, vp.height / 2); // an open drawer only closes
  await expect(page.getByTestId('drawer')).toHaveCount(0);
  await expect(bar).not.toHaveClass(/rd-chrome-on/);

  // Aa opens the settings sheet.
  await tapTitle(page);
  await page.getByRole('button', { name: '阅读设置' }).click();
  await expect(sheet).toBeVisible();
  // While the sheet is open the page takes no swipe: the Agent drawer stays shut.
  await page.mouse.move(330, 200); await page.mouse.down(); await page.mouse.move(40, 204, { steps: 8 }); await page.mouse.up();
  await expect(page.locator('.ag-panel')).toHaveAttribute('aria-hidden', 'true');
  await page.mouse.click(vp.width / 2, vp.height * 0.15); // outside the sheet: the scrim closes it
  await expect(sheet).toHaveCount(0);

  // A word drawer is open: a tap in the title area closes it and opens nothing else.
  const p = await wordInBand(page, 'advice');
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('drawer')).toHaveAttribute('data-state', 'ready');
  await tapTitle(page);
  await expect(page.getByTestId('drawer')).toHaveCount(0);
  await expect(sheet).toHaveCount(0);
  await expect(bar).not.toHaveClass(/rd-chrome-on/);
});

test('R-10: the contents list marks the current chapter and jumps to a chapter start in the band', async ({ page }) => {
  await fullTier(page);
  await page.goto('/?book=gatsby');
  await ready(page);
  await tapTitle(page);
  await page.getByRole('button', { name: '目录' }).click();
  const toc = page.getByRole('dialog', { name: '目录' });
  await expect(toc.locator('[aria-current="true"]')).toHaveText('Chapter I');
  await toc.getByRole('button', { name: 'Chapter V', exact: true }).click();
  await page.waitForTimeout(400);
  const d = await page.evaluate(() => {
    const head = [...document.querySelectorAll<HTMLElement>('.rd-head')].find((h) => h.textContent === 'Chapter V')!;
    const s = document.querySelector('.rd-scroll')!.getBoundingClientRect();
    const b = head.getBoundingClientRect();
    return { off: Math.abs(b.top + b.height / 2 - (s.top + s.height / 2)), band: s.height * 0.3 / 2 };
  });
  expect(d.off).toBeLessThanOrEqual(d.band);
  await expect(page.locator('.rd-eyebrow-chapter')).toHaveText('Chapter V');
});
