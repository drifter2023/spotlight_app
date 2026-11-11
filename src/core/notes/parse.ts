import { NOTE_KINDS, type NoteKind } from './types.ts';

export const MAX_NOTES = 5;
export const POINT_CHARS = 40;
export const DETAIL_CHARS = 110;

export interface ParsedNote { n: number; kind: NoteKind; point: string; detail: string }
export type Parsed = { status: 'ok'; items: ParsedNote[] } | { status: 'empty' } | { status: 'bad' };

const cut = (s: string, n: number) => Array.from(s).slice(0, n).join('');

/**
 * The model's lines `n｜类型｜要点｜说明` (Z-05). Only the number, the kind and two clipped strings are
 * taken from it; the quote and the place come from exchange `n` locally, so neither can be invented.
 * `count` is how many exchanges were sent; `finish = 'length'` drops a last line the token limit cut.
 */
export function parseNotes(raw: string, count: number, finish: 'stop' | 'length' | 'other' = 'stop'): Parsed {
  const text = raw.trim();
  if (/^无[。.！!]?$/.test(text)) return { status: 'empty' };
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (finish === 'length') lines.pop();
  const items: ParsedNote[] = [];
  for (const line of lines) {
    if (items.length >= MAX_NOTES) break;
    const parts = line.split(/[｜|]/).map((p) => p.trim());
    if (parts.length < 4) continue;
    const num = /^\[?(\d+)\]?$/.exec(parts[0]!);
    const n = num ? Number(num[1]) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > count) continue;
    const point = cut(parts[2]!, POINT_CHARS);
    const detail = cut(parts.slice(3).join(' ').trim(), DETAIL_CHARS);
    if (!point || !detail) continue;
    const kind = (NOTE_KINDS as readonly string[]).includes(parts[1]!) ? (parts[1] as NoteKind) : '';
    items.push({ n, kind, point, detail });
  }
  return items.length ? { status: 'ok', items } : { status: 'bad' };
}
