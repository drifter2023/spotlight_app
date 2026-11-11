import type { AiErrorKind } from '../ai/deepseek.ts';

/** The fixed list a note's 类型 comes from (docs/plans/2026-11-11-zhaji.md §3.5); '' when the model gave another word. */
export const NOTE_KINDS = ['词义', '表达', '句子', '指代', '语气', '修辞', '人物', '情节', '背景'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number] | '';

/** One stored question with its answer, and where it was asked (the message's `loc`, else the session anchor). */
export interface Exchange {
  /** The user message's id. */
  messageId: number;
  sessionId: string; bookId: string; bookTitle: string; at: number;
  question: string; answer: string; cite?: string;
  /** The sentence or selection the question was about ('' when none was stored). */
  quote: string;
  chapter: number; para: number; sentence: number; chapterLabel: string;
}

/** A note before it is stored: what the model wrote, bound to the exchange it names. */
export interface NewNote {
  kind: NoteKind; point: string; detail: string;
  exchange: Exchange;
}

/** One note of a 札记 entry. The quote and the place are copied from the exchange, never written by the model. */
export interface NoteItem {
  id: number; entryId: number; sessionId: string; messageId: number; ord: number;
  kind: NoteKind; point: string; detail: string; quote: string;
  chapter: number; para: number; sentence: number; chapterLabel: string;
}

/** The notes for one book on one reading day. */
export interface NoteEntry {
  id: number; bookId: string; bookTitle: string; day: string; status: 'done' | 'empty';
  lastMsgId: number; createdAt: number; updatedAt: number; readAt: number | null;
  items: NoteItem[];
}

/** A (book, day) with questions newer than its entry covers (or no entry): `exchanges` are those questions. */
export interface Pending {
  bookId: string; bookTitle: string; day: string;
  /** Oldest first. */
  exchanges: Exchange[];
  /** True when an entry for this (book, day) already exists. */
  hasEntry: boolean;
}

/** What the Home line and the page show about a run. */
export type RunState =
  | { status: 'idle' }
  | { status: 'running'; day: string; bookId: string; auto: boolean }
  | { status: 'error'; reason: AiErrorKind; auto: boolean; day?: string; bookId?: string };
