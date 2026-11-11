import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/home.css';
import '../../src/styles/notes.css';
import { createElement, Fragment } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SessionListItem } from '../../src/core/agent/types.ts';
import type { Db } from '../../src/core/db/types.ts';
import type { NoteItem } from '../../src/core/notes/types.ts';
import { NotesLineView } from '../../src/views/home/NotesLine.tsx';
import { Conversations } from '../../src/views/notes/Conversations.tsx';
import { NoteCard } from '../../src/views/notes/NoteCard.tsx';

// 札记 layout (Z-09, Z-10, Z-11): 44 px targets, the quote clamp, and a long journal scrolling without shifts.
let root: Root | null = null;
afterEach(() => { root?.unmount(); root = null; document.body.innerHTML = ''; });
beforeAll(async () => { await document.fonts.load('17px "Newsreader Variable"'); });

const noop = () => {};
const stubDb = {} as Db; // NoteCard reads the db only when 你问 is opened
const QUOTE = 'In my younger and more vulnerable years my father gave me some advice that I’ve been turning over in my mind ever since. '
  + '“Whenever you feel like criticizing anyone,” he told me, “just remember that all the people in this world haven’t had the advantages that you’ve had.”';
const item = (id: number): NoteItem => ({
  id, entryId: 1, sessionId: 's', messageId: id, ord: id, kind: '词义', point: 'vulnerable 在这里是「涉世未深」，不是脆弱',
  detail: '说的是年轻时容易受影响、没有防备，和下文父亲的告诫呼应。', quote: QUOTE, chapter: 0, para: 0, sentence: 0, chapterLabel: 'Chapter I',
  question: '这里的 vulnerable 是什么意思',
});
const conv: SessionListItem = {
  id: 'c1', bookId: 'gatsby', chapter: 0, chapterLabel: 'Chapter I', title: '这里的指代是谁', anchorPara: 0, anchorSentence: 0,
  updatedAt: Date.now(), bookTitle: 'The Great Gatsby', quote: QUOTE,
};

function mount(node: ReturnType<typeof createElement>, cls: string) {
  const host = document.createElement('div');
  host.className = cls;
  Object.assign(host.style, { position: 'relative', width: '402px', height: '874px', overflow: 'auto', padding: '0 24px', boxSizing: 'border-box' });
  document.body.append(host);
  root = createRoot(host);
  flushSync(() => root!.render(node));
  return host;
}
const h = (el: Element | null) => el!.getBoundingClientRect().height;

describe('札记 layout', () => {
  it('Z-09: the Home line is one button at least 64 px high (≥ 44 px), with no digits in its states', () => {
    const host = mount(createElement(NotesLineView, { l1: '昨天的对话还没整理', l2: '把问过的问题整理成几条札记', act: '整理', onTap: noop }), 'home');
    expect(h(host.querySelector('.notes-line'))).toBeGreaterThanOrEqual(64);
    expect(h(host.querySelector('.notes-line-act'))).toBeGreaterThanOrEqual(44);
    expect(host.textContent).not.toMatch(/\d/);
  });

  it('Z-10: 你问, 删除 and the quote: 44 px targets; the quote clamps at 3 lines', () => {
    const host = mount(createElement(NoteCard, { db: stubDb, item: item(1), open: true, onSwipe: noop, onDelete: noop }), 'notes');
    expect(h(host.querySelector('.note-ask'))).toBeGreaterThanOrEqual(44);
    expect(host.querySelector('.note-del')!.getBoundingClientRect().width).toBe(88);
    expect(h(host.querySelector('.note-del'))).toBeGreaterThanOrEqual(44);
    expect(h(host.querySelector('.note-quote'))).toBeLessThanOrEqual(26 * 3 + 1);
  });

  it('Z-11: a 对话 row is at least 76 px high; its 删除 is a 44 px target', () => {
    const host = mount(createElement(Conversations, { items: [conv], swiped: 'c1', onSwipe: noop, onOpen: noop, onDelete: noop }), 'notes');
    expect(h(host.querySelector('.conv'))).toBeGreaterThanOrEqual(76);
    expect(h(host.querySelector('.conv-del'))).toBeGreaterThanOrEqual(44);
  });

  it('Z-10: 60 notes scroll without layout shift', async () => {
    const host = mount(createElement(Fragment, null, Array.from({ length: 60 }, (_, i) => createElement(NoteCard, { key: i, db: stubDb, item: item(i + 1), open: false, onSwipe: noop, onDelete: noop }))), 'notes');
    const before = host.scrollHeight;
    const tops = [...host.querySelectorAll('.note-wrap')].map((n) => (n as HTMLElement).offsetTop);
    for (let y = 0; y < before; y += 600) { host.scrollTop = y; await new Promise((r) => requestAnimationFrame(r)); }
    expect(host.scrollHeight).toBe(before);
    expect([...host.querySelectorAll('.note-wrap')].map((n) => (n as HTMLElement).offsetTop)).toEqual(tops);
  });
});
