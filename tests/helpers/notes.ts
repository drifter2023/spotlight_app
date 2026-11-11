import { createSession, saveExchange } from '../../src/core/agent/store.ts';
import { migrate } from '../../src/core/db/migrations.ts';
import type { Db } from '../../src/core/db/types.ts';
import { saveParsedBook } from '../../src/core/library/library.ts';
import { nodeDb } from './nodeDb.ts';

export const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime();
/** "Now" in the 札记 tests: Wednesday 11 November 2026, 10:00 local. */
export const NOW = at(2026, 11, 11, 10);
export const YESTERDAY = at(2026, 11, 10, 21);
export const TODAY = at(2026, 11, 11, 9);

/** A db with two books (a: Gatsby-like, b), each with one conversation (sa, sb). */
export async function notesDb(): Promise<Db> {
  const db = nodeDb();
  await migrate(db);
  for (const id of ['a', 'b']) {
    await saveParsedBook(db, {
      id, title: id === 'a' ? 'The Great Gatsby' : 'Pride and Prejudice', author: 'X', wordCount: 20,
      chapters: [
        { title: 'Chapter I', wordCount: 10, paras: [['One one.', 'Two two.'], ['Three three.']] },
        { title: '', wordCount: 10, paras: [['Four four.']] },
      ],
    }, 'epub', 1);
    await createSession(db, { id: `s${id}`, bookId: id, chapter: 0, chapterLabel: 'Chapter I', title: '', anchorPara: 1, anchorSentence: 0, updatedAt: 1 });
  }
  return db;
}

let n = 0;
/** One exchange in session `s<book>` at `when`. */
export async function ask(db: Db, book: 'a' | 'b', when: number, extra: { quote?: string; loc?: { chapter: number; para: number; sentence: number } } = {}) {
  n++;
  await saveExchange(db, `s${book}`, {
    question: `问题 ${n}`, quote: extra.quote ?? `Quote ${n}.`, answer: `回答 ${n}`,
    ...(extra.loc ? { loc: extra.loc } : { loc: { chapter: 0, para: 0, sentence: 1 } }),
  }, when);
}
