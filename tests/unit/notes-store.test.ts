import { beforeEach, describe, expect, it } from 'vitest';
import { createSession, deleteSession, saveExchange } from '../../src/core/agent/store.ts';
import type { Db } from '../../src/core/db/types.ts';
import { deleteBook } from '../../src/core/library/library.ts';
import {
  deleteItem, getAuto, hasNotesOrConversations, latestUnread, listEntries, listExchanges, loadExchange, markRead, pending, saveEntry, setAuto,
} from '../../src/core/notes/store.ts';
import type { Pending } from '../../src/core/notes/types.ts';
import { NOW, TODAY, YESTERDAY, ask, at, notesDb } from '../helpers/notes.ts';

let db: Db;
beforeEach(async () => { db = await notesDb(); });

/** Stores a done entry for a pending pair with one note per exchange. */
async function cover(p: Pending, now = NOW) {
  await saveEntry(db, {
    bookId: p.bookId, day: p.day, lastMsgId: p.exchanges.at(-1)!.messageId, promptVersion: 1,
    notes: p.exchanges.map((x) => ({ kind: '词义' as const, point: `要点 ${x.question}`, detail: '说明', exchange: x })),
  }, now);
}

describe('pending (Z-03)', () => {
  it('Z-03: lists the (book, day) pairs of the last 7 days with a question newer than their entry, newest day first', async () => {
    await ask(db, 'a', at(2026, 11, 3, 12)); // 8 days ago: outside
    await ask(db, 'a', at(2026, 11, 5, 12)); // 6 days ago: inside
    await ask(db, 'a', YESTERDAY);
    await ask(db, 'b', YESTERDAY);
    await ask(db, 'a', TODAY);
    const p = await pending(db, NOW);
    expect(p.map((x) => [x.bookId, x.day, x.exchanges.length])).toEqual([
      ['a', '2026-11-11', 1], ['b', '2026-11-10', 1], ['a', '2026-11-10', 1], ['a', '2026-11-05', 1],
    ]);
  });

  it('Z-03: empty after every pair is covered; one new exchange makes only its pair pending again', async () => {
    await ask(db, 'a', YESTERDAY);
    await ask(db, 'b', YESTERDAY);
    for (const p of await pending(db, NOW)) await cover(p);
    expect(await pending(db, NOW)).toEqual([]);
    await ask(db, 'b', at(2026, 11, 11, 2)); // 02:00 belongs to yesterday
    const p = await pending(db, NOW);
    expect(p.map((x) => [x.bookId, x.day, x.hasEntry, x.exchanges.map((e) => e.question)])).toEqual([['b', '2026-11-10', true, [expect.any(String)]]]);
  });

  it('Z-12: the place is the question\'s loc, else the session anchor; the label names the chapter', async () => {
    await ask(db, 'a', TODAY, { loc: { chapter: 1, para: 0, sentence: 0 } });
    await saveExchange(db, 'sa', { question: 'old', quote: 'Three three.', answer: 'x' }, TODAY); // a pre-v8 row: no loc
    const [x1, x2] = await listExchanges(db, 0);
    expect(x1).toMatchObject({ chapter: 1, para: 0, sentence: 0, chapterLabel: '第 2 章' });
    expect(x2).toMatchObject({ chapter: 0, para: 1, sentence: 0, chapterLabel: 'Chapter I', quote: 'Three three.', answer: 'x' });
  });
});

describe('entries (Z-01, Z-06, Z-10)', () => {
  it('appends to an entry, keeps the order, clears read_at, and never redoes deleted notes', async () => {
    await ask(db, 'a', TODAY);
    await cover((await pending(db, NOW))[0]!);
    let [e] = await listEntries(db);
    expect(e!.items.map((i) => i.ord)).toEqual([0]);
    await markRead(db, NOW);
    expect(await latestUnread(db)).toBeNull();
    await deleteItem(db, e!.items[0]!.id);
    expect(await listEntries(db)).toEqual([]); // an entry with no notes is not listed…
    expect(await pending(db, NOW)).toEqual([]); // …and still marks its day as done
    await ask(db, 'a', TODAY + 60_000);
    await cover((await pending(db, NOW))[0]!);
    [e] = await listEntries(db);
    expect(e!.items.map((i) => i.point)).toEqual([expect.stringContaining('要点')]); // the deleted note does not come back
    expect(e!.readAt).toBeNull();
    expect((await latestUnread(db))!.id).toBe(e!.id);
  });

  it('an answer of 无 stores an empty entry that is not listed and is not asked about again', async () => {
    await ask(db, 'a', YESTERDAY);
    const [p] = await pending(db, NOW);
    await saveEntry(db, { bookId: 'a', day: p!.day, lastMsgId: p!.exchanges[0]!.messageId, promptVersion: 1, notes: [] });
    expect(await listEntries(db)).toEqual([]);
    expect(await pending(db, NOW)).toEqual([]);
    expect((await db.all<{ status: string }>('SELECT status FROM note_entry'))[0]!.status).toBe('empty');
  });

  it('Z-01: deleting a book removes its entries and notes; deleting a conversation removes the notes made from it only', async () => {
    await ask(db, 'a', YESTERDAY);
    await createSession(db, { id: 'sa2', bookId: 'a', chapter: 0, chapterLabel: 'Chapter I', title: '', anchorPara: 0, anchorSentence: 0, updatedAt: 1 });
    await saveExchange(db, 'sa2', { question: 'q2', quote: 'Q.', answer: 'a2' }, YESTERDAY + 1000);
    await ask(db, 'b', YESTERDAY);
    for (const p of await pending(db, NOW)) await cover(p);
    expect((await listEntries(db)).flatMap((e) => e.items).length).toBe(3);
    await deleteSession(db, 'sa2');
    const left = await listEntries(db);
    expect(left.flatMap((e) => e.items.map((i) => i.sessionId)).sort()).toEqual(['sa', 'sb']);
    await deleteBook(db, 'a');
    expect((await db.all<{ book_id: string }>('SELECT book_id FROM note_entry')).map((r) => r.book_id)).toEqual(['b']);
    expect((await db.all<{ session_id: string }>('SELECT session_id FROM note_item')).map((r) => r.session_id)).toEqual(['sb']);
  });

  it('a note copies its quote and place from the exchange; the exchange loads for 你问', async () => {
    await ask(db, 'a', TODAY, { quote: 'In my younger and more vulnerable years.', loc: { chapter: 0, para: 1, sentence: 0 } });
    await cover((await pending(db, NOW))[0]!);
    const item = (await listEntries(db))[0]!.items[0]!;
    expect(item).toMatchObject({ quote: 'In my younger and more vulnerable years.', chapter: 0, para: 1, sentence: 0, chapterLabel: 'Chapter I', kind: '词义' });
    expect(await loadExchange(db, item.messageId)).toMatchObject({ question: expect.stringContaining('问题'), answer: expect.stringContaining('回答') });
  });

  it('a book deleted meanwhile fails the save and stores nothing', async () => {
    await ask(db, 'a', TODAY);
    const [p] = await pending(db, NOW);
    await deleteBook(db, 'a');
    await expect(cover(p!)).rejects.toThrow();
    expect(await db.all('SELECT 1 FROM note_entry')).toEqual([]);
  });
});

describe('settings and presence', () => {
  it('Z-13: notes.auto persists; unset until set', async () => {
    expect(await getAuto(db)).toBeNull();
    await setAuto(db, 'on');
    expect(await getAuto(db)).toBe('on');
    await setAuto(db, 'off');
    expect(await getAuto(db)).toBe('off');
  });
  it('Z-09: the Home line is there only once a conversation or a note exists', async () => {
    expect(await hasNotesOrConversations(db)).toBe(false);
    await ask(db, 'a', TODAY);
    expect(await hasNotesOrConversations(db)).toBe(true);
  });
});
