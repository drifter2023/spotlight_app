/**
 * Reading days (docs/plans/2026-11-11-zhaji.md §3.1): 04:00 to 04:00 local time, so a late-night
 * sitting belongs to the evening it started in. Keys are the local date 'YYYY-MM-DD'.
 */
export const DAY_START_HOUR = 4;

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (y: number, m: number, d: number) => {
  const t = new Date(y, m, d, 12);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
};
const parts = (key: string): [number, number, number] => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return [y, m - 1, d];
};

/** The reading day `at` belongs to. Local wall-clock time, so a DST change moves no question to another day. */
export function dayKey(at: number): string {
  const t = new Date(at);
  return keyOf(t.getFullYear(), t.getMonth(), t.getDate() - (t.getHours() < DAY_START_HOUR ? 1 : 0));
}

/** [start, end) in ms: from this day's 04:00 to the next day's 04:00. */
export function dayRange(key: string): { start: number; end: number } {
  const [y, m, d] = parts(key);
  return { start: new Date(y, m, d, DAY_START_HOUR).getTime(), end: new Date(y, m, d + 1, DAY_START_HOUR).getTime() };
}

/** The day `n` days before `key` (negative: after). */
export function addDays(key: string, n: number): string {
  const [y, m, d] = parts(key);
  return keyOf(y, m, d - n);
}

/** A day has ended once the next 04:00 has passed. */
export function isClosed(key: string, now: number): boolean {
  return now >= dayRange(key).end;
}

/** 11月9日: the date as the prompt and the older entries name it. */
export function monthDay(key: string): string {
  const [, m, d] = parts(key);
  return `${m + 1}月${d}日`;
}

/** 今天 / 昨天 / 11月9日. */
export function dayLabel(key: string, now: number): string {
  const today = dayKey(now);
  if (key === today) return '今天';
  if (key === addDays(today, 1)) return '昨天';
  return monthDay(key);
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** The journal's day header, as Home's date eyebrow: "TUE · 11月10日". */
export function dayEyebrow(key: string): string {
  const [y, m, d] = parts(key);
  return `${WEEKDAYS[new Date(y, m, d, 12).getDay()]} · ${monthDay(key)}`;
}
