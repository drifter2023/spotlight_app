import { describe, expect, it } from 'vitest';
import { migrate, MIGRATIONS } from '../../src/core/db/migrations.ts';
import { nodeDb } from '../helpers/nodeDb.ts';

describe('migrate', () => {
  it('creates schema v1 and records user_version', async () => {
    const db = nodeDb();
    expect(await migrate(db)).toBe(MIGRATIONS.length);
    const tables = (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['book', 'chapter', 'position', 'settings']));
  });

  it('is idempotent', async () => {
    const db = nodeDb();
    await migrate(db);
    expect(await migrate(db)).toBe(MIGRATIONS.length);
  });

  it('rolls back a failing migration and keeps the old version', async () => {
    const db = nodeDb();
    await expect(migrate(db, ['CREATE TABLE a (x INTEGER);', 'CREATE TABLE broken ('])).rejects.toThrow();
    const [row] = await db.all<{ user_version: number }>('PRAGMA user_version');
    expect(row!.user_version).toBe(1);
    expect(await db.all("SELECT name FROM sqlite_master WHERE name='broken'")).toEqual([]);
  });

  it('Z-01: v8 applies on a v7 database with conversations; old messages have no loc and still load', async () => {
    const db = nodeDb();
    expect(await migrate(db, MIGRATIONS.slice(0, 7))).toBe(7);
    await db.run("INSERT INTO book (id, title, author, color, format, word_count, added_at) VALUES ('b', 'B', 'A', 0, 'epub', 1, 1)");
    await db.run("INSERT INTO agent_session (id, book_id, chapter, chapter_label, title, anchor_para, anchor_sentence, updated_at) VALUES ('s', 'b', 0, 'I', 'q', 0, 0, 1)");
    await db.run("INSERT INTO agent_message (session_id, role, text, quote, cite, at) VALUES ('s', 'user', 'q', 'Quote.', NULL, 1)");
    expect(await migrate(db)).toBe(8);
    const [v] = await db.all<{ user_version: number }>('PRAGMA user_version');
    expect(v!.user_version).toBe(8);
    expect(await db.all('SELECT text, quote, loc FROM agent_message')).toEqual([{ text: 'q', quote: 'Quote.', loc: null }]);
    const tables = (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'")).map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['note_entry', 'note_item']));
  });
});
