import type { AgentLoc } from '../agent/types.ts';
import type { Db } from '../db/types.ts';
import { addDays, dayKey, dayRange } from './day.ts';
import { NOTE_KINDS, type Exchange, type NewNote, type NoteEntry, type NoteItem, type NoteKind, type Pending } from './types.ts';

/** Days offered for 整理, today included (D12). */
export const PENDING_DAYS = 7;
/** Notes kept per entry, over all its runs. */
export const MAX_ITEMS_PER_ENTRY = 8;

interface ExchangeRow {
  id: number; session_id: string; book_id: string; book_title: string; at: number; question: string; quote: string | null;
  loc: string | null; s_chapter: number; s_para: number; s_sentence: number; s_label: string;
  answer: string | null; cite: string | null;
}

const chapterName = (title: string | undefined, idx: number) => (title?.trim() ? title.trim() : `第 ${idx + 1} 章`);

function parseLoc(raw: string | null): AgentLoc | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<AgentLoc>;
    return typeof v.chapter === 'number' && typeof v.para === 'number' && typeof v.sentence === 'number'
      ? { chapter: v.chapter, para: v.para, sentence: v.sentence } : null;
  } catch {
    return null;
  }
}

/**
 * Every stored exchange asked at or after `fromAt`, oldest first. The place is the question's `loc`
 * (v8), else the session anchor for older rows (Z-12).
 */
export async function listExchanges(db: Db, fromAt: number): Promise<Exchange[]> {
  const rows = await db.all<ExchangeRow>(
    `SELECT u.id, u.session_id, s.book_id, b.title AS book_title, u.at, u.text AS question, u.quote, u.loc,
            s.chapter AS s_chapter, s.anchor_para AS s_para, s.anchor_sentence AS s_sentence, s.chapter_label AS s_label,
            a.text AS answer, a.cite
       FROM agent_message u
       JOIN agent_session s ON s.id = u.session_id
       JOIN book b ON b.id = s.book_id
       LEFT JOIN agent_message a ON a.id = (SELECT MIN(x.id) FROM agent_message x WHERE x.session_id = u.session_id AND x.id > u.id AND x.role = 'agent')
      WHERE u.role = 'user' AND u.at >= ?
      ORDER BY u.id`, [fromAt]);
  const titles = new Map<string, Map<number, string>>();
  const out: Exchange[] = [];
  for (const r of rows) {
    if (r.answer === null) continue;
    const loc = parseLoc(r.loc) ?? { chapter: r.s_chapter, para: r.s_para, sentence: r.s_sentence };
    let label = loc.chapter === r.s_chapter && r.s_label.trim() ? r.s_label.trim() : '';
    if (!label) {
      let t = titles.get(r.book_id);
      if (!t) {
        t = new Map((await db.all<{ idx: number; title: string }>('SELECT idx, title FROM chapter WHERE book_id = ?', [r.book_id])).map((c) => [c.idx, c.title]));
        titles.set(r.book_id, t);
      }
      label = chapterName(t.get(loc.chapter), loc.chapter);
    }
    out.push({
      messageId: r.id, sessionId: r.session_id, bookId: r.book_id, bookTitle: r.book_title, at: r.at,
      question: r.question, answer: r.answer, ...(r.cite ? { cite: r.cite } : {}), quote: r.quote ?? '',
      chapter: loc.chapter, para: loc.para, sentence: loc.sentence, chapterLabel: label,
    });
  }
  return out;
}

/**
 * The (book, day) pairs of the last `days` reading days (today included) that have a question newer
 * than their entry covers, newest day first (Z-03). Coverage is by message id, not by time.
 */
export async function pending(db: Db, now: number, { days = PENDING_DAYS } = {}): Promise<Pending[]> {
  const from = dayRange(addDays(dayKey(now), days - 1)).start;
  const exchanges = await listExchanges(db, from);
  if (!exchanges.length) return [];
  const covered = new Map((await db.all<{ book_id: string; day: string; last_msg_id: number }>(
    'SELECT book_id, day, last_msg_id FROM note_entry WHERE day >= ?', [dayKey(from)])).map((e) => [`${e.book_id} ${e.day}`, e.last_msg_id]));
  const groups = new Map<string, Pending>();
  for (const ex of exchanges) {
    const day = dayKey(ex.at);
    const k = `${ex.bookId} ${day}`;
    const last = covered.get(k);
    if (last !== undefined && ex.messageId <= last) continue;
    let g = groups.get(k);
    if (!g) { g = { bookId: ex.bookId, bookTitle: ex.bookTitle, day, exchanges: [], hasEntry: last !== undefined }; groups.set(k, g); }
    g.exchanges.push(ex);
  }
  const newest = (p: Pending) => p.exchanges[p.exchanges.length - 1]!.messageId;
  return [...groups.values()].sort((a, b) => (a.day === b.day ? newest(b) - newest(a) : a.day < b.day ? 1 : -1));
}

export interface SaveEntry {
  bookId: string; day: string; lastMsgId: number; promptVersion: number;
  /** Empty for an answer of 「无」: the day is then marked as done with nothing to show. */
  notes: NewNote[];
}

/**
 * Adds a run's notes to the (book, day) entry, creating it the first time; never redoes it (Z-06).
 * One transaction: a book or conversation deleted meanwhile fails the foreign key and stores nothing.
 */
export async function saveEntry(db: Db, e: SaveEntry, now = Date.now()): Promise<void> {
  await db.tx(async () => {
    const status = e.notes.length ? 'done' : 'empty';
    await db.run(
      `INSERT INTO note_entry (book_id, day, status, last_msg_id, prompt_version, created_at, updated_at, read_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT (book_id, day) DO UPDATE SET
         status = CASE WHEN note_entry.status = 'done' OR excluded.status = 'done' THEN 'done' ELSE 'empty' END,
         last_msg_id = MAX(note_entry.last_msg_id, excluded.last_msg_id),
         prompt_version = excluded.prompt_version, updated_at = excluded.updated_at,
         read_at = CASE WHEN excluded.status = 'done' THEN NULL ELSE note_entry.read_at END`,
      [e.bookId, e.day, status, e.lastMsgId, e.promptVersion, now, now]);
    if (!e.notes.length) return;
    const [row] = await db.all<{ id: number; ord: number | null; n: number }>(
      `SELECT ne.id, (SELECT MAX(ord) FROM note_item WHERE entry_id = ne.id) AS ord,
              (SELECT COUNT(*) FROM note_item WHERE entry_id = ne.id) AS n
         FROM note_entry ne WHERE ne.book_id = ? AND ne.day = ?`, [e.bookId, e.day]);
    let ord = (row!.ord ?? -1) + 1;
    for (const n of e.notes.slice(0, Math.max(0, MAX_ITEMS_PER_ENTRY - row!.n))) {
      const x = n.exchange;
      await db.run(
        `INSERT INTO note_item (entry_id, session_id, message_id, ord, kind, point, detail, quote, chapter, para, sentence, chapter_label)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row!.id, x.sessionId, x.messageId, ord++, n.kind, n.point, n.detail, x.quote, x.chapter, x.para, x.sentence, x.chapterLabel]);
    }
  });
}

interface EntryRow {
  id: number; book_id: string; book_title: string; day: string; status: string; last_msg_id: number;
  created_at: number; updated_at: number; read_at: number | null;
}
interface ItemRow {
  id: number; entry_id: number; session_id: string; message_id: number; ord: number; kind: string; point: string; detail: string;
  quote: string; chapter: number; para: number; sentence: number; chapter_label: string; question: string | null;
}

const kindOf = (k: string): NoteKind => ((NOTE_KINDS as readonly string[]).includes(k) ? (k as NoteKind) : '');

async function withItems(db: Db, rows: EntryRow[]): Promise<NoteEntry[]> {
  if (!rows.length) return [];
  const items = await db.all<ItemRow>(
    `SELECT i.*, m.text AS question FROM note_item i LEFT JOIN agent_message m ON m.id = i.message_id
      WHERE i.entry_id IN (${rows.map(() => '?').join(',')}) ORDER BY i.entry_id, i.ord`, rows.map((r) => r.id));
  const by = new Map<number, NoteItem[]>();
  for (const i of items) {
    const list = by.get(i.entry_id) ?? [];
    list.push({
      id: i.id, entryId: i.entry_id, sessionId: i.session_id, messageId: i.message_id, ord: i.ord, kind: kindOf(i.kind),
      point: i.point, detail: i.detail, quote: i.quote, chapter: i.chapter, para: i.para, sentence: i.sentence, chapterLabel: i.chapter_label, question: i.question ?? '',
    });
    by.set(i.entry_id, list);
  }
  return rows.map((r) => ({
    id: r.id, bookId: r.book_id, bookTitle: r.book_title, day: r.day, status: r.status === 'empty' ? 'empty' : 'done',
    lastMsgId: r.last_msg_id, createdAt: r.created_at, updatedAt: r.updated_at, readAt: r.read_at, items: by.get(r.id) ?? [],
  }));
}

const ENTRY_SQL = `SELECT e.id, e.book_id, b.title AS book_title, e.day, e.status, e.last_msg_id, e.created_at, e.updated_at, e.read_at
                     FROM note_entry e JOIN book b ON b.id = e.book_id`;

/** The journal: entries that still hold a note, newest day first. */
export async function listEntries(db: Db): Promise<NoteEntry[]> {
  const rows = await db.all<EntryRow>(
    `${ENTRY_SQL} WHERE EXISTS (SELECT 1 FROM note_item i WHERE i.entry_id = e.id) ORDER BY e.day DESC, e.updated_at DESC, e.id DESC`);
  return withItems(db, rows);
}

/** The newest entry not seen yet, for the Home line (state 2). */
export async function latestUnread(db: Db): Promise<NoteEntry | null> {
  const rows = await db.all<EntryRow>(
    `${ENTRY_SQL} WHERE e.read_at IS NULL AND EXISTS (SELECT 1 FROM note_item i WHERE i.entry_id = e.id)
      ORDER BY e.day DESC, e.updated_at DESC, e.id DESC LIMIT 1`);
  return (await withItems(db, rows))[0] ?? null;
}

/** The journal has been seen: every entry it showed is read. */
export async function markRead(db: Db, now = Date.now()): Promise<void> {
  await db.run('UPDATE note_entry SET read_at = ? WHERE read_at IS NULL', [now]);
}

/** Removes one note; its conversation stays (Z-10). A deleted note never comes back: coverage stays. */
export async function deleteItem(db: Db, id: number): Promise<void> {
  await db.run('DELETE FROM note_item WHERE id = ?', [id]);
}

/** The exchange a note was made from, for 「你问」 (read-only). */
export async function loadExchange(db: Db, messageId: number): Promise<{ question: string; answer: string; cite?: string } | null> {
  const [r] = await db.all<{ question: string; answer: string | null; cite: string | null }>(
    `SELECT u.text AS question, a.text AS answer, a.cite FROM agent_message u
       LEFT JOIN agent_message a ON a.id = (SELECT MIN(x.id) FROM agent_message x WHERE x.session_id = u.session_id AND x.id > u.id AND x.role = 'agent')
      WHERE u.id = ?`, [messageId]);
  if (!r) return null;
  return { question: r.question, answer: r.answer ?? '', ...(r.cite ? { cite: r.cite } : {}) };
}

/** Whether the reader has ever kept a conversation or a 札记: the Home line shows only then (Z-09). */
export async function hasNotesOrConversations(db: Db): Promise<boolean> {
  const rows = await db.all('SELECT 1 FROM agent_message LIMIT 1');
  if (rows.length) return true;
  return (await db.all('SELECT 1 FROM note_item LIMIT 1')).length > 0;
}

// --- settings (D1) ---

const AUTO = 'notes.auto';
const FAILED = 'notes.autoFailedAt';
export type Auto = 'on' | 'off' | null;

async function getSetting(db: Db, key: string): Promise<string | null> {
  const [row] = await db.all<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}
async function setSetting(db: Db, key: string, value: string | null): Promise<void> {
  if (value === null) await db.run('DELETE FROM settings WHERE key = ?', [key]);
  else await db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}

/** unset: never tapped, nothing is automatic; `on` after the first 整理; `off` from the page's switch. */
export async function getAuto(db: Db): Promise<Auto> {
  const v = await getSetting(db, AUTO);
  return v === 'on' || v === 'off' ? v : null;
}
export async function setAuto(db: Db, v: 'on' | 'off'): Promise<void> {
  await setSetting(db, AUTO, v);
}

/** When the last automatic run failed (ms), for the 6 h back-off. */
export async function autoFailedAt(db: Db): Promise<number | null> {
  const v = await getSetting(db, FAILED);
  return v ? Number(v) : null;
}
export async function setAutoFailedAt(db: Db, at: number | null): Promise<void> {
  await setSetting(db, FAILED, at === null ? null : String(at));
}
