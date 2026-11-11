import { beforeEach, describe, expect, it } from 'vitest';
import type { Fetch } from '../../src/core/ai/deepseek.ts';
import { setKey } from '../../src/core/ai/key.ts';
import { flatten, pageAround, readingContext } from '../../src/core/agent/context.ts';
import { formatWhen } from '../../src/core/agent/format.ts';
import { SYSTEM_PROMPT, splitAnswer, userMessage } from '../../src/core/agent/prompt.ts';
import { AgentService, type AskState } from '../../src/core/agent/service.ts';
import { createSession, deleteSession, listAllSessions, listSessions, loadMessages, saveExchange } from '../../src/core/agent/store.ts';
import { migrate } from '../../src/core/db/migrations.ts';
import type { Db } from '../../src/core/db/types.ts';
import { deleteBook, saveParsedBook } from '../../src/core/library/library.ts';
import { nodeDb } from '../helpers/nodeDb.ts';
import { sse } from '../helpers/sse.ts';

let db: Db;
const book = {
  id: 'a', title: 'A Book', author: 'A', wordCount: 20,
  chapters: [{ title: 'The Treeline', wordCount: 20, paras: [['One one.', 'Two two.'], ['Three three.', 'Four four.'], ['Five five.'], ['Six six.']] }],
};
const session = { id: 's1', bookId: 'a', chapter: 0, chapterLabel: 'The Treeline', title: '', anchorPara: 1, anchorSentence: 0, updatedAt: 1 };
const input = { sessionId: 's1', question: '这段的语气', sentence: 'Three three.', title: 'A Book', chapter: 'The Treeline', reading: 'One one. Two two.' };

beforeEach(async () => {
  db = nodeDb();
  await migrate(db);
  await saveParsedBook(db, book, 'epub', 1);
  await createSession(db, session);
});

describe('agent store (A-02)', () => {
  it('stores an exchange together and titles the session after the first question', async () => {
    await saveExchange(db, 's1', { question: '这段的语气', quote: 'Three three.', answer: '很克制。', cite: '第 2 段' }, 5);
    await saveExchange(db, 's1', { question: '再问一个', answer: '好的。' }, 6);
    expect(await loadMessages(db, 's1')).toEqual([
      { role: 'user', text: '这段的语气', quote: 'Three three.', at: 5 },
      { role: 'agent', text: '很克制。', cite: '第 2 段', at: 5 },
      { role: 'user', text: '再问一个', at: 6 },
      { role: 'agent', text: '好的。', at: 6 },
    ]);
    const [s] = await listSessions(db, 'a');
    expect(s).toMatchObject({ title: '这段的语气', updatedAt: 6 });
  });

  it('lists a book\'s sessions newest first', async () => {
    await createSession(db, { ...session, id: 's2', updatedAt: 9 });
    expect((await listSessions(db, 'a')).map((s) => s.id)).toEqual(['s2', 's1']);
    expect(await listSessions(db, 'other')).toEqual([]);
  });

  it('is deleted with the book', async () => {
    await saveExchange(db, 's1', { question: 'q', answer: 'a' });
    await deleteBook(db, 'a');
    expect(await db.all('SELECT 1 FROM agent_session')).toEqual([]);
    expect(await db.all('SELECT 1 FROM agent_message')).toEqual([]);
  });
});

describe('agent store for 札记 (Z-11, Z-12)', () => {
  it('Z-12: stores each question with its place in the book; old rows have none', async () => {
    await saveExchange(db, 's1', { question: 'q1', quote: 'Three three.', answer: 'a1', loc: { chapter: 0, para: 1, sentence: 0 } }, 5);
    await saveExchange(db, 's1', { question: 'q2', answer: 'a2' }, 6);
    expect(await db.all("SELECT text, loc FROM agent_message WHERE role = 'user' ORDER BY id")).toEqual([
      { text: 'q1', loc: '{"chapter":0,"para":1,"sentence":0}' }, { text: 'q2', loc: null },
    ]);
  });

  it('Z-11: lists every book\'s conversations with an exchange, newest first, with title and first quote', async () => {
    await saveParsedBook(db, { ...book, id: 'b', title: 'B Book' }, 'epub', 2);
    await createSession(db, { ...session, id: 's2', bookId: 'b', updatedAt: 2 });
    await createSession(db, { ...session, id: 'empty', updatedAt: 99 }); // first answer failed: nothing to list
    await saveExchange(db, 's1', { question: '这里的指代是谁', quote: 'Three three.', answer: 'a' }, 5);
    await saveExchange(db, 's1', { question: '再问', quote: 'Four four.', answer: 'b' }, 6);
    await saveExchange(db, 's2', { question: '这段的语气', quote: 'One one.', answer: 'c' }, 9);
    const all = await listAllSessions(db);
    expect(all.map((s) => [s.id, s.bookTitle, s.title, s.quote])).toEqual([
      ['s2', 'B Book', '这段的语气', 'One one.'],
      ['s1', 'A Book', '这里的指代是谁', 'Three three.'],
    ]);
  });

  it('Z-01 Z-11: deleting a conversation removes its messages and nothing else', async () => {
    await createSession(db, { ...session, id: 's2' });
    await saveExchange(db, 's1', { question: 'q', answer: 'a' });
    await saveExchange(db, 's2', { question: 'q', answer: 'a' });
    await deleteSession(db, 's1');
    expect((await listSessions(db, 'a')).map((s) => s.id)).toEqual(['s2']);
    expect(await loadMessages(db, 's1')).toEqual([]);
    expect(await loadMessages(db, 's2')).toHaveLength(2);
  });

  it('Z-12: AgentService stores the loc it was given', async () => {
    await setKey(db, 'sk-test');
    await new AgentService(db, { fetch: async () => new Response(sse(['好'])) }).ask({ ...input, loc: { chapter: 0, para: 1, sentence: 0 } }, () => {});
    expect(await db.all("SELECT loc FROM agent_message WHERE role = 'user'")).toEqual([{ loc: '{"chapter":0,"para":1,"sentence":0}' }]);
  });
});

describe('page and reading context (A-03)', () => {
  it('shows the anchor paragraph with one on each side', () => {
    const page = pageAround(book.chapters.map((c, idx) => ({ ...c, idx, wordStart: 0 })), { chapter: 0, para: 1, sentence: 0 });
    expect(flatten(page).map((s) => s.text)).toEqual(['One one.', 'Two two.', 'Three three.', 'Four four.', 'Five five.']);
  });
  it('clips at the chapter start and never reads past the page', () => {
    const chapters = book.chapters.map((c, idx) => ({ ...c, idx, wordStart: 0 }));
    const page = pageAround(chapters, { chapter: 0, para: 0, sentence: 0 });
    expect(page.paras.map((p) => p.para)).toEqual([0, 1]);
    expect(readingContext(chapters, page)).toBe('One one. Two two.\nThree three. Four four.');
  });
});

describe('answer format (A-04)', () => {
  it('splits off the 出处 line', () => {
    expect(splitAnswer('很克制。\n出处：then said: very clean wind')).toEqual({ text: '很克制。', cite: 'then said: very clean wind' });
    expect(splitAnswer('只有正文')).toEqual({ text: '只有正文' });
  });
  it('hides a half-written 出处 line while streaming', () => {
    expect(splitAnswer('很克制。\n出处').text).toBe('很克制。');
    expect(splitAnswer('很克制。\n出').text).toBe('很克制。');
    expect(splitAnswer('很克制。\n出处：the').cite).toBe('the');
  });
  it('sends the system prompt and message layout verbatim', () => {
    expect({ SYSTEM_PROMPT, user: userMessage({ title: 'T', chapter: 'C', reading: 'R', sentence: 'S', question: 'Q' }) }).toMatchSnapshot();
  });

  it('N-06: text attached by 问旁注 is labelled 所选文字 instead of 所选句', () => {
    const m = userMessage({ title: 'T', chapter: 'C', reading: 'R', sentence: 'two lines\nof text', question: 'Q', selected: true });
    expect(m).toContain('所选文字：two lines\nof text\n问题：Q');
    expect(m).not.toContain('所选句');
  });
});

let bodies: { messages: { role: string; content: string }[]; max_tokens: number }[] = [];
const answer = (pieces: string[]): Fetch => async (_u, init) => {
  bodies.push(JSON.parse(init!.body as string));
  return new Response(sse(pieces));
};
async function run(service: AgentService): Promise<AskState[]> {
  const seen: AskState[] = [];
  await service.ask(input, (s) => seen.push(s));
  return seen;
}

describe('AgentService (A-01, A-05)', () => {
  beforeEach(() => { bodies = []; });

  it('says so without a key, and makes no request', async () => {
    const service = new AgentService(db, { fetch: answer(['x']) });
    expect((await run(service)).at(-1)).toEqual({ status: 'error', reason: 'no-key', partial: '' });
    expect(bodies).toEqual([]);
  });

  it('streams the answer, then stores the exchange with its 出处', async () => {
    await setKey(db, 'sk-test');
    const service = new AgentService(db, { fetch: answer(['很克制，', '没有形容情绪的词。\n出处：', 'very clean wind']) });
    const seen = await run(service);
    expect(seen[0]).toEqual({ status: 'waiting' });
    expect(seen.some((s) => s.status === 'streaming')).toBe(true);
    expect(seen.at(-1)).toEqual({ status: 'done', text: '很克制，没有形容情绪的词。', cite: 'very clean wind' });
    expect((await loadMessages(db, 's1')).map((m) => m.role)).toEqual(['user', 'agent']);
    expect(bodies[0]!.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(bodies[0]!.messages[1]!.content).toContain('所选句：Three three.');
  });

  it('sends the earlier turns of the conversation', async () => {
    await setKey(db, 'sk-test');
    await saveExchange(db, 's1', { question: '第一问', answer: '第一答' });
    await run(new AgentService(db, { fetch: answer(['好']) }));
    expect(bodies[0]!.messages.map((m) => [m.role, m.content]).slice(1, 3)).toEqual([['user', '第一问'], ['assistant', '第一答']]);
  });

  it('stores nothing for a failed or empty answer', async () => {
    await setKey(db, 'sk-test');
    const down: Fetch = async () => new Response('', { status: 500 });
    expect((await run(new AgentService(db, { fetch: down }))).at(-1)).toMatchObject({ status: 'error', reason: 'server' });
    expect((await run(new AgentService(db, { fetch: answer(['']) }))).at(-1)).toMatchObject({ status: 'error', reason: 'bad-answer' });
    expect(await loadMessages(db, 's1')).toEqual([]);
  });
});

describe('formatWhen', () => {
  const now = new Date(2026, 9, 3, 12, 0).getTime();
  it('reads naturally', () => {
    expect(formatWhen(now - 10_000, now)).toBe('刚刚');
    expect(formatWhen(now - 5 * 60_000, now)).toBe('5 分钟前');
    expect(formatWhen(now - 3 * 3_600_000, now)).toBe('3 小时前');
    expect(formatWhen(new Date(2026, 9, 2, 23, 0).getTime(), now)).toBe('昨天');
    expect(formatWhen(new Date(2026, 9, 3 - 9, 9, 0).getTime(), now)).toBe('9 月 24 日');
  });
});
