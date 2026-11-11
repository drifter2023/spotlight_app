import { describe, expect, it } from 'vitest';
import { openWebDb } from '../../src/core/db/web.ts';

// R-07: a reading position written as the page unloads must reach IndexedDB. The reader flushes its
// position in its own pagehide listener, which runs after the database's; that write used to wait on
// the 300 ms debounce, which never fires on an unloading page.
describe('web user.db', () => {
  it('saves a write made after pagehide at once, not after the debounce', async () => {
    const name = `race-${Math.random().toString(36).slice(2)}`;
    const db = await openWebDb(name);
    await db.exec('CREATE TABLE pos (para INTEGER)');
    window.dispatchEvent(new Event('pagehide'));
    await db.run('INSERT INTO pos VALUES (?)', [12]); // the reader's flush, after the db's listener ran
    await new Promise((r) => setTimeout(r, 50)); // well under the 300 ms debounce
    const again = await openWebDb(name);
    expect(await again.all<{ para: number }>('SELECT para FROM pos')).toEqual([{ para: 12 }]);
    window.dispatchEvent(new Event('pageshow'));
  });
});
