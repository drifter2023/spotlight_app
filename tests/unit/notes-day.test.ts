import { describe, expect, it } from 'vitest';
import { addDays, dayEyebrow, dayKey, dayLabel, dayRange, isClosed, monthDay } from '../../src/core/notes/day.ts';

const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('reading days (Z-02)', () => {
  it('Z-02: a day runs from 04:00 to 04:00 local time', () => {
    expect(dayKey(at(2026, 11, 10, 4, 0))).toBe('2026-11-10');
    expect(dayKey(at(2026, 11, 10, 23, 59))).toBe('2026-11-10');
    expect(dayKey(at(2026, 11, 11, 3, 59))).toBe('2026-11-10');
    expect(dayKey(at(2026, 11, 11, 4, 0))).toBe('2026-11-11');
  });

  it('Z-02: month and year ends', () => {
    expect(dayKey(at(2026, 12, 1, 2, 0))).toBe('2026-11-30');
    expect(dayKey(at(2027, 1, 1, 1, 0))).toBe('2026-12-31');
    expect(dayKey(at(2028, 3, 1, 3, 0))).toBe('2028-02-29');
    expect(addDays('2026-12-01', 1)).toBe('2026-11-30');
    expect(addDays('2026-12-31', -1)).toBe('2027-01-01');
  });

  it('Z-02: a DST change keeps the 04:00 boundary on the wall clock', () => {
    // Whatever the test machine's zone, the day of a time is its local date with 04:00 as the start.
    for (const [m, d] of [[3, 8], [3, 29], [10, 25], [11, 1]] as const) {
      expect(dayKey(at(2026, m, d, 3, 30))).toBe(addDays(`2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, 1));
      expect(dayKey(at(2026, m, d, 5, 0))).toBe(`2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  });

  it('Z-02: isClosed only from the next 04:00', () => {
    const r = dayRange('2026-11-10');
    expect(r.start).toBe(at(2026, 11, 10, 4));
    expect(r.end).toBe(at(2026, 11, 11, 4));
    expect(isClosed('2026-11-10', at(2026, 11, 11, 3, 59))).toBe(false);
    expect(isClosed('2026-11-10', at(2026, 11, 11, 4, 0))).toBe(true);
  });

  it('Z-02: labels read 今天 / 昨天 / M月D日', () => {
    const now = at(2026, 11, 11, 10);
    expect(dayLabel('2026-11-11', now)).toBe('今天');
    expect(dayLabel('2026-11-10', now)).toBe('昨天');
    expect(dayLabel('2026-11-09', now)).toBe('11月9日');
    expect(dayLabel('2026-11-10', at(2026, 11, 11, 3))).toBe('今天'); // 03:00 still belongs to the 10th
    expect(monthDay('2026-01-05')).toBe('1月5日');
    expect(dayEyebrow('2026-11-10')).toBe('TUE · 11月10日');
  });
});
