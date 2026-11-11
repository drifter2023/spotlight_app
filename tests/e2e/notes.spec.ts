import { expect, test, type Page, type Route } from '@playwright/test';
import { sseText } from '../helpers/sse.ts';
import { fullTier, ready, saveDeepSeekKey, showChrome } from './helpers.ts';

// 札记 (M13, docs/plans/2026-11-11-zhaji.md §5): DeepSeek is faked; a request is a 札记 request when its
// system prompt is the summariser's.
test.use({ serviceWorkers: 'block' });

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type,accept', 'access-control-allow-methods': 'GET,POST' };
const NOTES_ANSWER = '1｜语气｜叙述克制，没有形容情绪的词｜平静本身就是语气，读者自己去体会分量。\n2｜句子｜回望式的开头｜叙述者从多年以后回头看，带一点自嘲。';

interface Fake { agent: number; notes: number; down: boolean }

/** 旁注 questions are answered; 札记 requests get NOTES_ANSWER, or a dropped connection while `down`. */
async function fakeDeepSeek(page: Page): Promise<Fake> {
  const fake: Fake = { agent: 0, notes: 0, down: false };
  await page.route('https://api.deepseek.com/**', async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (new URL(req.url()).pathname === '/models') return route.fulfill({ status: 200, headers: CORS, body: '{"data":[]}' });
    const body = JSON.parse(req.postData()!) as { messages: { content: string }[] };
    const summary = body.messages[0]!.content.startsWith('你是读书札记的整理员');
    if (summary) {
      fake.notes++;
      if (fake.down) return route.abort('internetdisconnected');
    } else fake.agent++;
    const text = summary ? [NOTES_ANSWER] : ['很克制，', '没有形容情绪的词。\n出处：', 'a few words'];
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sseText(text) });
  });
  return fake;
}

async function swipe(page: Page, from: number, to: number, y = 420) {
  await page.mouse.move(from, y);
  await page.mouse.down();
  await page.mouse.move((from + to) / 2, y + 4, { steps: 6 });
  await page.mouse.move(to, y + 4, { steps: 6 });
  await page.mouse.up();
}

/** Opens the Agent drawer in the open book and asks `questions`, each answered before the next. */
async function ask(page: Page, questions: string[]) {
  const panel = page.locator('.ag-panel');
  await swipe(page, 330, 40);
  await expect(panel).toHaveAttribute('aria-hidden', 'false');
  await page.waitForTimeout(500); // the drawer has loaded the conversation it continues
  const before = await panel.locator('.ag-answer').count();
  for (const [i, q] of questions.entries()) {
    await panel.getByLabel('问题').fill(q);
    await panel.getByLabel('问题').press('Enter');
    await expect(panel.locator('.ag-answer')).toHaveCount(before + i + 1);
    await expect(panel.locator('.ag-caret')).toHaveCount(0);
  }
  await swipe(page, 40, 330);
  await expect(panel).toHaveAttribute('aria-hidden', 'true');
  await page.waitForTimeout(600); // user.db persists after a 300 ms debounce
}

async function backToShelf(page: Page) {
  await expect(async () => {
    await showChrome(page);
    await page.getByRole('button', { name: '‹ 书架' }).click({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.locator('.reader-layer')).toHaveCount(0);
  await expect(page.getByTestId('flight')).toHaveCount(0);
}

const line = (page: Page) => page.locator('.notes-line');

test('Z-09 Z-10 Z-13 Z-14: two questions → 今天的对话 → 整理 → 今天 · title → the journal → back to 札记', async ({ page }) => {
  await fullTier(page);
  const fake = await fakeDeepSeek(page);
  await saveDeepSeekKey(page);
  await page.goto('/');
  await expect(line(page)).toHaveCount(0); // Z-09: no line before any conversation

  await page.goto('/?book=gatsby');
  await ready(page);
  await ask(page, ['这段的语气', '为什么这样写']);
  await backToShelf(page);

  // Z-09: state 4, then a tap runs 整理 in place.
  await expect(line(page)).toContainText('今天的对话');
  await expect(line(page)).toContainText('读完了？整理成札记');
  expect((await line(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(fake.notes).toBe(0); // today is never done automatically
  await line(page).click();
  await expect(line(page)).toContainText('今天 · The Great Gatsby');
  await expect(line(page)).toContainText('叙述克制，没有形容情绪的词');
  expect(fake.notes).toBe(1);
  expect(await line(page).innerText()).not.toMatch(/\d/); // no numbers on the line apart from a date

  // Z-10: the journal, the one-time sentence, 你问 expands and collapses the stored exchange.
  await line(page).click();
  const notes = page.locator('.notes');
  await expect(notes).toBeVisible();
  await expect(notes.locator('.note')).toHaveCount(2);
  await expect(notes.locator('.note-point').first()).toHaveText('叙述克制，没有形容情绪的词');
  await expect(notes.locator('.note-quote').first()).toContainText('“');
  await expect(notes.locator('.notes-once')).toBeVisible(); // Z-13: the first tap turned 自动整理 on
  await expect(notes.getByRole('switch', { name: '自动整理' })).toBeChecked();
  const ask1 = notes.locator('.note-ask').first();
  await expect(ask1).toContainText('你问：这段的语气');
  await ask1.click();
  await expect(notes.locator('.note-ex-answer')).toHaveText('很克制，没有形容情绪的词。');
  await ask1.click();
  await expect(notes.locator('.note-ex-answer')).toHaveCount(0);
  // Z-14: nothing to count, score or test.
  expect(await notes.innerText()).not.toMatch(/连续|掌握|记得|打卡|复习/);

  // Swipe → 删除 → confirm removes one note and not its conversation.
  const first = notes.locator('.note').first();
  const box = (await first.boundingBox())!;
  await swipe(page, box.x + box.width - 20, box.x + box.width - 160, box.y + 40);
  await notes.locator('.note-del').first().click();
  await expect(page.getByRole('alertdialog')).toContainText('对话不会被删除。');
  await page.getByRole('alertdialog').getByRole('button', { name: '删除' }).click();
  await expect(notes.locator('.note')).toHaveCount(1);
  await notes.getByRole('tab', { name: '对话' }).click();
  await expect(notes.locator('.conv')).toHaveCount(1);

  // Z-13: the switch persists.
  await notes.getByRole('tab', { name: '札记' }).click();
  await notes.getByRole('switch', { name: '自动整理' }).uncheck();
  await page.getByRole('button', { name: '‹ 书架' }).click();
  await expect(notes).toHaveCount(0);
  await expect(line(page)).toHaveText(/^札记/); // seen: the line returns to 札记
  await expect(line(page)).not.toContainText('今天 ·');
  await page.waitForTimeout(600); // user.db persists after a 300 ms debounce
  await page.goto('/'); // not reload(): the URL still opens the book
  await line(page).click();
  await expect(page.getByRole('switch', { name: '自动整理' })).not.toBeChecked();
});

test('Z-07: Home runs yesterday\'s 札记 only when 自动整理 is on; a fresh opt-in makes one request', async ({ page }) => {
  await fullTier(page);
  const fake = await fakeDeepSeek(page);
  const today = new Date();
  today.setHours(10, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 86_400_000);
  yesterday.setHours(20, 0, 0, 0);
  await page.clock.setFixedTime(yesterday);
  await saveDeepSeekKey(page);
  await page.goto('/?book=gatsby');
  await ready(page);
  await ask(page, ['这段的语气']);

  // Auto unset: Home on the next day makes no request and offers 整理.
  await page.clock.setFixedTime(today);
  await page.goto('/');
  await expect(line(page)).toContainText('昨天的对话还没整理');
  await page.waitForTimeout(800);
  expect(fake.notes).toBe(0);

  // The tap is the consent: it runs and turns 自动整理 on.
  await line(page).click();
  await expect(line(page)).toContainText('昨天 · The Great Gatsby');
  expect(fake.notes).toBe(1);
  await page.waitForTimeout(600); // user.db persists 自动整理 and the entry after a 300 ms debounce

  // A new question "yesterday" (a late sitting), then Home the next day: one automatic request.
  await page.clock.setFixedTime(new Date(yesterday.getTime() + 3_600_000));
  await page.goto('/?book=gatsby');
  await ready(page);
  await ask(page, ['为什么这样写']);
  await page.clock.setFixedTime(today);
  await page.goto('/');
  await expect.poll(() => fake.notes).toBe(2);
  await expect(line(page)).toContainText('昨天 · The Great Gatsby', { timeout: 10_000 });
  await page.waitForTimeout(800);
  expect(fake.notes).toBe(2);
});

test('Z-08: a dropped connection says 网络连接失败 with 重试; 重试 succeeds once the network is back', async ({ page }) => {
  await fullTier(page);
  const fake = await fakeDeepSeek(page);
  await saveDeepSeekKey(page);
  await page.goto('/?book=gatsby');
  await ready(page);
  await ask(page, ['这段的语气']);
  await backToShelf(page);

  fake.down = true;
  await line(page).click();
  await expect(line(page)).toContainText('网络连接失败');
  await expect(line(page)).toContainText('重试');
  fake.down = false;
  await line(page).click();
  await expect(line(page)).toContainText('今天 · The Great Gatsby');
  expect(fake.notes).toBe(2);
});

test('Z-11: 对话 opens a conversation in its book at the saved place; deleting it removes it everywhere', async ({ page }) => {
  await fullTier(page);
  await fakeDeepSeek(page);
  await saveDeepSeekKey(page);
  await page.goto('/?book=gatsby');
  await ready(page);
  await ask(page, ['这里的指代是谁']);
  await backToShelf(page);
  const pct = await page.locator('.continue-pct').innerText();

  await line(page).click(); // 整理 (state 4)
  await expect(line(page)).toContainText('今天 · The Great Gatsby');
  await line(page).click();
  const notes = page.locator('.notes');
  await notes.getByRole('tab', { name: '对话' }).click();
  const row = notes.locator('.conv');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('这里的指代是谁');
  await expect(row).toContainText('The Great Gatsby · ');

  // A tap opens the book with the drawer on that conversation.
  await row.click();
  await ready(page);
  const panel = page.locator('.ag-panel');
  await expect(panel).toHaveAttribute('aria-hidden', 'false');
  await expect(panel.locator('.ag-title-text')).toHaveText('这里的指代是谁');
  await expect(panel.locator('.ag-answer')).toHaveText('很克制，没有形容情绪的词。');
  await swipe(page, 40, 330);
  await backToShelf(page);
  await expect(page.locator('.continue-pct')).toHaveText(pct); // the reading position is unchanged

  // Swipe → 删除 → confirm.
  await line(page).click();
  await notes.getByRole('tab', { name: '对话' }).click();
  const b = (await row.boundingBox())!;
  await swipe(page, b.x + b.width - 20, b.x + b.width - 160, b.y + b.height / 2);
  await notes.locator('.conv-del').click();
  await expect(page.getByRole('alertdialog')).toContainText('由它整理出的札记也会删除。');
  await page.getByRole('alertdialog').getByRole('button', { name: '删除' }).click();
  await expect(row).toHaveCount(0);
  await expect(notes).toContainText('还没有对话');
  await notes.getByRole('tab', { name: '札记' }).click();
  await expect(notes.locator('.note')).toHaveCount(0); // its notes went with it

  // Gone from the drawer's history too.
  await page.getByRole('button', { name: '‹ 书架' }).click();
  await page.waitForTimeout(600); // user.db persists after a 300 ms debounce
  await page.goto('/?book=gatsby');
  await ready(page);
  await swipe(page, 330, 40);
  await expect(panel.locator('.ag-meta')).toHaveText('新对话');
});
