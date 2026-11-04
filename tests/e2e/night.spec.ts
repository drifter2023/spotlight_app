import { expect, test, type Page } from '@playwright/test';
import { fullTier, ready, tapTitle, wordInBand } from './helpers.ts';

test.use({ serviceWorkers: 'block' });

const bar = (page: Page) => page.getByRole('group', { name: '带读' });
const play = (page: Page) => page.getByRole('button', { name: '开始带读' });
const guide = (page: Page) => page.evaluate(() => { const g = window.__spotlight!.guide!; return { playing: g.playing, current: g.current }; });

/** Opens Gatsby in 夜读 with the dev handle. The play button is hidden until the capsule is up. */
async function night(page: Page, speed: 0.6 | 1 | 1.6 = 1) {
  await fullTier(page);
  await page.goto('/?book=gatsby&dev=1');
  await ready(page);
  await page.evaluate(async (speed) => {
    await window.__spotlight!.prefs.set('theme', 'night');
    await window.__spotlight!.prefs.set('guideSpeed', speed);
  }, speed);
  await expect(bar(page)).toHaveCount(0);
}

/** Shows the capsule, which is where 夜读 keeps Play. */
async function showPlay(page: Page) {
  await tapTitle(page);
  await expect(play(page)).toBeVisible();
}

test('N1/N5: 纸白 keeps the 带读 bar, which steps aside while chrome is up; 夜读 has a play button beside the capsule', async ({ page }) => {
  await fullTier(page);
  await page.goto('/?book=gatsby&dev=1');
  await ready(page);
  await expect(bar(page)).toBeVisible();
  await tapTitle(page);
  await expect(page.locator('.rd-capsule')).toHaveClass(/rd-chrome-on/);
  await expect(bar(page)).toHaveCount(0);
  await tapTitle(page);
  await expect(bar(page)).toBeVisible();

  await page.evaluate(() => window.__spotlight!.prefs.set('theme', 'night'));
  await expect(page.locator('.rd-vignette')).toBeVisible();
  await expect(bar(page)).toHaveCount(0);
  await expect(play(page)).toHaveCount(0);
  await showPlay(page);
  const capsule = (await page.locator('.rd-capsule').boundingBox())!;
  const button = (await page.locator('.rd-guide').boundingBox())!;
  expect(Math.abs(button.y - capsule.y)).toBeLessThan(1);
  expect(button.x + button.width).toBeLessThanOrEqual(capsule.x);
  expect(capsule.x - (button.x + button.width)).toBeLessThanOrEqual(16);
  await tapTitle(page);
  await expect(play(page)).toHaveCount(0);
  await expect(bar(page)).toHaveCount(0);
});

test('N4/NM-05: Play lights the sentence at the centre; a touch on the page pauses at once, and nothing resumes without Play', async ({ page }) => {
  await night(page);
  await showPlay(page);
  const atCentre = await page.evaluate(() => window.__spotlight!.engine.sentenceAtCentre());
  await play(page).click();
  expect(await guide(page)).toEqual({ playing: true, current: atCentre });
  await expect(page.getByRole('button', { name: '暂停带读' })).toHaveAttribute('aria-pressed', 'true');
  // A touch on the page pauses within the same frame. The play button's own pointer does not.
  await page.locator('.rd-page').dispatchEvent('pointerdown', { bubbles: true, clientX: 8, clientY: 240 });
  expect((await guide(page)).playing).toBe(false);
  await expect(play(page)).toBeVisible();
  await page.waitForTimeout(7000);
  expect((await guide(page)).playing).toBe(false);
});

test('NM-05: hiding the app, opening settings and switching to 纸白 each pause 带读', async ({ page }) => {
  await night(page);
  await showPlay(page);
  const hide = () => page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });
  await play(page).click();
  await hide();
  expect((await guide(page)).playing).toBe(false);

  await play(page).click();
  await page.evaluate(() => window.__spotlight!.prefs.set('theme', 'paper'));
  expect((await guide(page)).playing).toBe(false);
  await expect(bar(page)).toHaveCount(0); // the capsule is still up, so the paper bar steps aside
  await tapTitle(page);
  await expect(bar(page)).toBeVisible();

  await page.evaluate(() => window.__spotlight!.prefs.set('theme', 'night'));
  await showPlay(page);
  await play(page).click();
  await page.locator('.rd-page').dispatchEvent('pointerdown', { bubbles: true, clientX: 8, clientY: 240 });
  expect((await guide(page)).playing).toBe(false);
  await page.getByRole('button', { name: '阅读设置' }).click();
  await expect(page.getByRole('dialog', { name: '阅读设置' })).toBeVisible();
  expect((await guide(page)).playing).toBe(false);
});

test('N4: after its dwell the next sentence is lit and scrolled to the centre', async ({ page }) => {
  await night(page, 1.6);
  await showPlay(page);
  await play(page).click();
  const first = (await guide(page)).current!;
  const { dwell, next } = await page.evaluate((id) => {
    const e = window.__spotlight!.engine;
    return { dwell: Math.max(1200, (e.sentenceWords(id) * 60000) / (200 * 1.6)), next: e.nextSentence(id) };
  }, first);
  await page.waitForTimeout(dwell - 300);
  expect((await guide(page)).current).toEqual(first); // still dwelling
  await page.waitForTimeout(300 + 600 + 250);
  expect((await guide(page)).current).toEqual(next);
  // Its lines are lit and centred.
  const off = await page.evaluate(() => {
    const lit = [...document.querySelectorAll<HTMLElement>('.rd-line[data-p]')].filter((l) => l.style.color === 'var(--reader-accent)');
    const s = document.querySelector<HTMLElement>('.rd-scroll')!.getBoundingClientRect();
    const top = lit[0]!.getBoundingClientRect().top;
    const bottom = lit.at(-1)!.getBoundingClientRect().bottom;
    return Math.abs((top + bottom) / 2 - (s.top + s.height / 2));
  });
  expect(off).toBeLessThan(2);
});

test('NM-06: at the chapter’s last sentence 带读 stops, paused, in the same chapter', async ({ page }) => {
  await night(page, 1.6);
  await page.evaluate(async () => {
    const e = window.__spotlight!.engine;
    const book = await (await fetch('/books/gatsby.json')).json() as { chapters: { paras: string[][] }[] };
    const paras = book.chapters[0]!.paras;
    const last = paras.length - 1;
    e.scrollToAnchor({ chapter: 0, para: last, sentence: paras[last]!.length - 1 });
    e.paintNow();
  });
  await page.waitForTimeout(400);
  const start = await page.evaluate(() => window.__spotlight!.engine.sentenceAtCentre()!);
  expect(start.chapter).toBe(0);
  // Play from the chapter's last sentence (or the one before it). Scrolling hides the capsule.
  await showPlay(page);
  await play(page).click();
  await expect.poll(async () => (await guide(page)).playing, { timeout: 30_000, intervals: [500] }).toBe(false);
  const anchor = await page.evaluate(() => window.__spotlight!.engine.currentAnchor());
  expect(anchor.chapter).toBe(0);
  if (!(await page.locator('.rd-capsule').evaluate((el) => el.classList.contains('rd-chrome-on')))) await tapTitle(page);
  await expect(play(page)).toBeVisible();
});

test('NM-08: the night play button is a 44 px target and its glyph reaches 4.5:1 on the night page', async ({ page }) => {
  await night(page);
  await showPlay(page);
  const box = (await page.locator('.rd-guide').boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  const ratio = await page.evaluate(() => {
    const rgb = (s: string) => s.match(/[\d.]+/g)!.map(Number);
    const over = (fg: number[], bg: number[]) => { const a = fg[3] ?? 1; return [0, 1, 2].map((i) => fg[i]! * a + bg[i]! * (1 - a)); };
    const lum = (c: number[]) => { const [r, g, b] = c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
    const contrast = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
    const btn = document.querySelector<HTMLElement>('.rd-guide')!;
    const bg = over(rgb(getComputedStyle(btn).backgroundColor), [14, 14, 16]);
    return contrast(over(rgb(getComputedStyle(btn).color), bg), bg);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test('NM-09: the word drawer at night uses the 1c material with the headword in the accent, and opens like 4a', async ({ page }) => {
  await night(page);
  const p = await wordInBand(page, 'advice');
  await page.mouse.click(p.x, p.y);
  const drawer = page.getByTestId('drawer');
  await expect(drawer).toHaveAttribute('data-state', 'ready');
  await expect(drawer.locator('.wd-body')).toHaveCSS('background-color', 'rgb(42, 38, 48)');
  await expect(drawer.locator('.wd-body')).toHaveCSS('animation-duration', '0.33s');
  await expect(drawer.locator('.wd-word')).toHaveCSS('color', 'rgb(255, 180, 180)');
  await expect(page.locator('.rd-hl')).toHaveCSS('color', 'rgb(255, 180, 180)');
});

test('NM-10: 夜读 and the 带读 speed survive a reload', async ({ page }) => {
  await fullTier(page);
  await page.goto('/?book=gatsby&dev=1');
  await ready(page);
  await bar(page).getByRole('radio', { name: '1.6×' }).click();
  await expect(bar(page).getByRole('radio', { name: '1.6×' })).toHaveAttribute('aria-checked', 'true');
  await page.evaluate(() => window.__spotlight!.prefs.set('theme', 'night'));
  await page.waitForTimeout(800); // the web db is written to IndexedDB 300 ms after the last change
  await page.reload();
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('night');
  expect(await page.evaluate(() => window.__spotlight!.prefs.get().guideSpeed)).toBe(1.6);
  await expect(bar(page)).toHaveCount(0);
});
