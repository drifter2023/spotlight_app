import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/core/db/migrations.ts';
import type { Db } from '../../src/core/db/types.ts';
import { ease } from '../../src/core/motion.ts';
import { blurMaxFor, DEFAULT_PREFS, NIGHT_BLUR_MAX, PrefsStore, sanitise } from '../../src/core/prefs/prefs.ts';
import { opacityFor } from '../../src/core/reader/focus.ts';
import { nodeDb } from '../helpers/nodeDb.ts';

describe('夜读 focus band (N3)', () => {
  it('NM-02: night opacity reaches .08 at t = 1 (paper stays at .45); the night blur defaults to 9 px until the reader sets one', () => {
    expect(opacityFor(1, true)).toBeCloseTo(0.08, 3);
    expect(opacityFor(0, true)).toBe(1);
    expect(opacityFor(0.5, true)).toBe(0.54);
    expect(opacityFor(1)).toBe(0.45);
    const night = { ...DEFAULT_PREFS, theme: 'night' as const };
    expect(blurMaxFor(night)).toBe(NIGHT_BLUR_MAX);
    expect(NIGHT_BLUR_MAX).toBe(9);
    expect(blurMaxFor({ ...night, blurMax: 5, blurMaxSet: true })).toBe(5);
    expect(blurMaxFor({ ...night, blurMax: 7, blurMaxSet: true })).toBe(7); // set to the old default on purpose
    expect(blurMaxFor(DEFAULT_PREFS)).toBe(7);
  });

  it('the easing function is the app curve: symmetric, 0 → 1', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5, 3);
    expect(ease(0.25) + ease(0.75)).toBeCloseTo(1, 3);
    expect(ease(0.1)).toBeLessThan(0.1); // eases in
  });
});

describe('settings for 夜读 (N6)', () => {
  let db: Db;
  beforeEach(async () => { db = nodeDb(); await migrate(db); });

  it('NM-10: the theme persists across reloads', async () => {
    const a = await PrefsStore.load(db);
    await a.set('theme', 'night');
    expect((await PrefsStore.load(db)).get()).toMatchObject({ theme: 'night' });
  });

  it('moving 模糊强度 makes it the reader’s own, even onto the value already shown', async () => {
    const a = await PrefsStore.load(db);
    await a.set('blurMax', 7);
    expect(a.get().blurMaxSet).toBe(true);
    expect((await PrefsStore.load(db)).get()).toMatchObject({ blurMax: 7, blurMaxSet: true });
  });

  it('a 带读 speed stored by an older version is dropped (带读 removed 2026-11-11)', () => {
    const old = { ...DEFAULT_PREFS, guideSpeed: 1.6 } as typeof DEFAULT_PREFS;
    expect(sanitise(old)).toEqual(DEFAULT_PREFS);
  });
});
