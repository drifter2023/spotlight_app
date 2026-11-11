// TEMPORARY CI diagnostic (ci/webkit-e2e): records font loading and line geometry on the runner. Always passes.
import { test } from '@playwright/test';
import { fullTier, ready } from './helpers.ts';

test('diag: fonts and first-line geometry', async ({ page }, info) => {
  await fullTier(page);
  await page.goto('/?book=gatsby');
  await ready(page);
  const out = await page.evaluate(async () => {
    await document.fonts.ready;
    const line = document.querySelector<HTMLElement>('.rd-line[data-p]')!;
    const cs = getComputedStyle(line);
    const probe = document.createElement('span');
    probe.style.cssText = `font:${cs.font};white-space:nowrap;position:absolute;visibility:hidden`;
    probe.textContent = ' In my younger and more vulnerable years';
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    const scroller = document.querySelector<HTMLElement>('[data-testid="reader-scroll"]')!;
    return {
      ua: navigator.userAgent,
      dpr: devicePixelRatio,
      viewport: [innerWidth, innerHeight],
      font: cs.font,
      fontsCheck: document.fonts.check(`${cs.fontSize} "Newsreader Variable"`),
      faces: [...document.fonts].filter((f) => /Newsreader|Plex/.test(f.family)).map((f) => `${f.family} ${f.weight} ${f.status}`),
      lineBox: line.getBoundingClientRect().width,
      columnContent: scroller.clientWidth - parseFloat(getComputedStyle(scroller).paddingLeft) - parseFloat(getComputedStyle(scroller).paddingRight),
      probeWidth: width,
      firstLines: [...document.querySelectorAll<HTMLElement>('.rd-line[data-p]')].slice(0, 4).map((l) => l.textContent),
    };
  });
  await info.attach('diag.json', { body: JSON.stringify(out, null, 2), contentType: 'application/json' });
  console.log('DIAG', JSON.stringify(out));
});
