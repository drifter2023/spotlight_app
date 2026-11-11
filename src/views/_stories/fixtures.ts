// Story fixtures (Storybook only; never imported by the app). Real text from the bundled Gatsby.
import { createSession, saveExchange } from '../../core/agent/store.ts';
import { migrate } from '../../core/db/migrations.ts';
import { dayKey } from '../../core/notes/day.ts';
import { listExchanges, markRead, saveEntry } from '../../core/notes/store.ts';
import { colorIndex, markOpened, saveParsedBook, type ShelfBook } from '../../core/library/library.ts';
import { loadSqlJs } from '../../core/db/sqljs.ts';
import type { Db, SqlValue } from '../../core/db/types.ts';
import { PrefsStore, type Prefs } from '../../core/prefs/prefs.ts';
import type { ChapterData } from '../../core/types.ts';

/** Chapter I's opening, broken into the lines the reader shows on a 402 px phone at size M. */
export const LINES = [
  ' In my younger and more vulnerable years',
  'my father gave me some advice that I’ve',
  'been turning over in my mind ever since.',
  '',
  ' “Whenever you feel like criticizing',
  'anyone,” he told me, “just remember that',
  'all the people in this world haven’t had the',
  'advantages that you’ve had.”',
  '',
  ' He didn’t say any more, but we’ve always',
  'been unusually communicative in a',
  'reserved way, and I understood that he',
  'meant a great deal more than that. In',
  'consequence, I’m inclined to reserve all',
  'judgements, a habit that has opened up',
  'many curious natures to me and also made',
];

export const PARAS: string[][] = [
  ['In my younger and more vulnerable years my father gave me some advice that I’ve been turning over in my mind ever since.'],
  ['“Whenever you feel like criticizing anyone,” he told me, “just remember that all the people in this world haven’t had the advantages that you’ve had.”'],
  ['He didn’t say any more, but we’ve always been unusually communicative in a reserved way, and I understood that he meant a great deal more than that.', 'In consequence, I’m inclined to reserve all judgements, a habit that has opened up many curious natures to me and also made me the victim of not a few veteran bores.'],
];

export const CHAPTERS: ChapterData[] = ['Chapter I', 'Chapter II', 'Chapter III', 'Chapter IV', 'Chapter V', 'Chapter VI', 'Chapter VII', 'Chapter VIII', 'Chapter IX']
  .map((title, idx) => ({ idx, title, paras: idx === 0 ? PARAS : [['…']], wordStart: idx * 5000 }));

export const BOOK = { id: 'gatsby', title: 'The Great Gatsby', wordCount: 47094, chapters: CHAPTERS };

/** An in-memory user.db (sql.js, never saved), migrated like the app's. */
export async function memDb(): Promise<Db> {
  const SQL = await loadSqlJs();
  const d = new SQL.Database();
  d.run('PRAGMA foreign_keys = ON');
  const db: Db = {
    async exec(sql) { d.exec(sql); },
    async run(sql, params: SqlValue[] = []) { d.run(sql, params); },
    async all<T>(sql: string, params: SqlValue[] = []) {
      const st = d.prepare(sql);
      try { st.bind(params); const rows: T[] = []; while (st.step()) rows.push(st.getAsObject() as T); return rows; } finally { st.free(); }
    },
    async tx(fn) { d.exec('BEGIN'); try { await fn(); d.exec('COMMIT'); } catch (e) { d.exec('ROLLBACK'); throw e; } },
  };
  await migrate(db);
  return db;
}

/** A settings store over a fresh in-memory db, with some values changed from the defaults. */
export async function prefsWith(patch: Partial<Prefs> = {}): Promise<PrefsStore> {
  const store = await PrefsStore.load(await memDb());
  for (const [k, v] of Object.entries(patch)) await store.set(k as keyof Prefs, v as never);
  return store;
}

/** An in-memory user.db that holds the Gatsby fixture as a book (conversations and lookups refer to it). */
export async function bookDb(): Promise<Db> {
  const db = await memDb();
  await saveParsedBook(db, {
    id: BOOK.id, title: BOOK.title, author: 'F. Scott Fitzgerald', wordCount: BOOK.wordCount,
    chapters: CHAPTERS.map((c) => ({ title: c.title, paras: c.paras, wordCount: 5000 })),
  }, 'epub', Date.now());
  return db;
}

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 15, 1, 0); // fixed, so finished dates read the same in every story

/** Shelf rows as Home lists them. Covers are the bundled ones (Storybook serves public/, like the app). */
export const SHELF: Record<'reading' | 'fresh' | 'done' | 'web', ShelfBook> = {
  reading: {
    id: 'gatsby', title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', cover: 'covers/gatsby.jpg', color: colorIndex('The Great Gatsby'),
    format: 'epub', wordCount: 47094, status: 'reading', pct: 23, addedAt: NOW - 9 * DAY, openedAt: NOW - DAY, finishedAt: null,
    chapter: 2, chapterTitle: 'Chapter III', chapters: 9,
  },
  fresh: {
    id: 'farewell', title: 'A Farewell to Arms', author: 'Ernest Hemingway', cover: 'covers/farewell.jpg', color: colorIndex('A Farewell to Arms'),
    format: 'epub', wordCount: 88792, status: 'reading', pct: 0, addedAt: NOW - 9 * DAY, openedAt: null, finishedAt: null,
    chapter: 0, chapterTitle: 'Chapter I', chapters: 41,
  },
  done: {
    id: 'falcon', title: 'The Maltese Falcon', author: 'Dashiell Hammett', cover: 'covers/falcon.jpg', color: colorIndex('The Maltese Falcon'),
    format: 'epub', wordCount: 65062, status: 'done', pct: 100, addedAt: NOW - 30 * DAY, openedAt: NOW - 20 * DAY, finishedAt: NOW - 20 * DAY,
    chapter: 19, chapterTitle: 'XX', chapters: 20,
  },
  web: {
    id: 'web-1', title: 'How to Read a Book Slowly', author: 'aeon.co', cover: null, color: colorIndex('How to Read a Book Slowly'),
    format: 'web', wordCount: 3200, status: 'reading', pct: 0, addedAt: NOW - 2 * DAY, openedAt: null, finishedAt: null,
    chapter: 0, chapterTitle: '', chapters: 1,
  },
};

/** user.db with the shelf above: Gatsby being read (the continue block), the others as listed. */
export async function shelfDb(): Promise<Db> {
  const db = await memDb();
  for (const b of Object.values(SHELF)) {
    await saveParsedBook(db, {
      id: b.id, title: b.title, author: b.author, cover: b.cover, wordCount: b.wordCount,
      chapters: Array.from({ length: b.chapters }, (_, i) => ({ title: i === b.chapter ? b.chapterTitle : `Chapter ${i + 1}`, paras: [['…']], wordCount: Math.round(b.wordCount / b.chapters) })),
    }, b.format, b.addedAt);
    await db.run('UPDATE book SET status = ?, pct = ?, finished_at = ? WHERE id = ?', [b.status, b.pct, b.finishedAt, b.id]);
    if (b.openedAt) await markOpened(db, b.id, b.openedAt);
    if (b.chapter) await db.run('INSERT INTO position (book_id, chapter, para, sentence, updated_at) VALUES (?, ?, 0, 0, ?)', [b.id, b.chapter, NOW]);
  }
  return db;
}

// --- 札记 (M13): conversations and their notes, written into the db as the app stores them (no DeepSeek) ---

/** Questions with 旁注's answers, as stored conversations. `daysAgo` counts reading days back from now. */
export const EXCHANGES = [
  {
    book: 'gatsby', session: 'g1', chapter: 0, label: 'Chapter I', daysAgo: 1, quote: PARAS[0]![0]!,
    question: '这里的 vulnerable 是什么意思', answer: '这里不是「脆弱」，而是年轻、涉世未深、容易受影响。叙述者回望自己年轻时的样子，为下文父亲的忠告作铺垫。', cite: 'younger and more vulnerable years',
  },
  {
    book: 'gatsby', session: 'g1', chapter: 0, label: 'Chapter I', daysAgo: 1, quote: PARAS[2]![0]!,
    question: '这里的指代是谁', answer: 'that 指父亲嘴上说的那句话。叙述者是说父亲话里有话，没说出口的比说出口的多。', cite: 'a great deal more than that',
  },
  {
    book: 'farewell', session: 'f1', chapter: 0, label: 'Chapter I', daysAgo: 2, quote: 'In the late summer of that year we lived in a house in a village that looked across the river and the plain to the mountains.',
    question: '这段的语气', answer: '平静、克制，几乎只写看见的东西，不写感受。句子很长却没有形容情绪的词，这是海明威常用的写法。', cite: '',
  },
] as const;

/** The notes DeepSeek would have made from EXCHANGES, by index. */
export const NOTES = [
  { ex: 0, kind: '词义', point: 'vulnerable 在这里是「涉世未深」，不是脆弱', detail: '说的是年轻时容易受影响、没有防备，和下文父亲的告诫呼应。' },
  { ex: 1, kind: '指代', point: 'that 指父亲嘴上说的那句话', detail: '叙述者是说父亲话里有话，没说出口的比说出的多。' },
  { ex: 2, kind: '语气', point: '只写看见的，不写感受', detail: '长句里没有一个形容情绪的词，平静本身就是语气。' },
] as const;

/**
 * Stores EXCHANGES in `db` (which must hold the shelf books) and, with `notes`, their 札记 entries.
 * `unread`: leave the newest entry unread, as the Home line's state 2 shows it.
 */
export async function seedNotes(db: Db, { notes = true, unread = false, now = Date.now() } = {}): Promise<void> {
  const made = new Set<string>();
  for (const [i, x] of EXCHANGES.entries()) {
    const at = now - x.daysAgo * DAY + i * 60_000;
    if (!made.has(x.session)) {
      made.add(x.session);
      await createSession(db, { id: x.session, bookId: x.book, chapter: x.chapter, chapterLabel: x.label, title: '', anchorPara: 0, anchorSentence: 0, updatedAt: at });
    }
    await saveExchange(db, x.session, { question: x.question, quote: x.quote, answer: x.answer, ...(x.cite ? { cite: x.cite } : {}), loc: { chapter: x.chapter, para: 0, sentence: 0 } }, at);
  }
  if (!notes) return;
  const all = await listExchanges(db, 0);
  const byDay = new Map<string, typeof all>();
  for (const x of all) { const k = `${x.bookId} ${dayKey(x.at)}`; byDay.set(k, [...(byDay.get(k) ?? []), x]); }
  for (const list of byDay.values()) {
    const first = list[0]!;
    await saveEntry(db, {
      bookId: first.bookId, day: dayKey(first.at), lastMsgId: list.at(-1)!.messageId, promptVersion: 1,
      notes: NOTES.filter((n) => list.includes(all[n.ex]!)).map((n) => ({ kind: n.kind, point: n.point, detail: n.detail, exchange: all[n.ex]! })),
    }, now);
  }
  if (!unread) await markRead(db, now);
  else await db.run('UPDATE note_entry SET read_at = ? WHERE day < (SELECT MAX(day) FROM note_entry)', [now]);
}
