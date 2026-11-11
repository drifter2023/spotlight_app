import { expect, test, type Page } from '@playwright/test';
import { fullTier, ready, tapTitle, wordInBand } from './helpers.ts';

test.use({ serviceWorkers: 'block' });

/** Opens Gatsby in 夜读 with the dev handle. */
async function night(page: Page) {
  await fullTier(page);
  await page.goto('/?book=gatsby&dev=1');
  await ready(page);
  await page.evaluate(() => window.__spotlight!.prefs.set('theme', 'night'));
}

test('带读 is gone (owner decision 2026-11-11): no bar in 纸白, no play button beside the capsule in 夜读', async ({ page }) => {
  await fullTier(page);
  await page.goto('/?book=gatsby&dev=1');
  await ready(page);
  await tapTitle(page);
  await expect(page.locator('.rd-capsule')).toHaveClass(/rd-chrome-on/);
  await expect(page.getByRole('button', { name: /带读/ })).toHaveCount(0);
  await expect(page.getByRole('group', { name: '带读' })).toHaveCount(0);
  await page.evaluate(() => window.__spotlight!.prefs.set('theme', 'night'));
  await expect(page.getByRole('button', { name: /带读/ })).toHaveCount(0);
  await expect(page.getByRole('group', { name: '带读' })).toHaveCount(0);
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

test('NM-10: 夜读 survives a reload', async ({ page }) => {
  await night(page);
  await page.waitForTimeout(800); // the web db is written to IndexedDB 300 ms after the last change
  await page.reload();
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('night');
});
