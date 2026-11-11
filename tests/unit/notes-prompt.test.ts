import { describe, expect, it } from 'vitest';
import { parseNotes } from '../../src/core/notes/parse.ts';
import { CLIP, MAX_EXCHANGES, SYSTEM_PROMPT, clip, sentExchanges, userMessage } from '../../src/core/notes/prompt.ts';
import type { Exchange } from '../../src/core/notes/types.ts';

const ex = (i: number, over: Partial<Exchange> = {}): Exchange => ({
  messageId: i, sessionId: 's', bookId: 'a', bookTitle: 'The Great Gatsby', at: 0,
  question: `问题 ${i}`, answer: `回答 ${i}`, quote: `Quote ${i}.`, chapter: 0, para: 0, sentence: 0, chapterLabel: 'Chapter I', ...over,
});

describe('札记 prompt (Z-04)', () => {
  it('Z-04: the system prompt and the message layout are verbatim', () => {
    expect({
      SYSTEM_PROMPT,
      user: userMessage('The Great Gatsby', '11月10日', [
        ex(1, { quote: 'In my younger and more vulnerable years my father gave me some advice.', question: '这里的 vulnerable 是什么意思', answer: '这里不是「脆弱」，而是年轻、涉世未深。' }),
        ex(2, { quote: '', chapterLabel: 'Chapter II' }),
      ]),
    }).toMatchSnapshot();
  });

  it('Z-04: 原文 / 问 / 答 are clipped to 300 / 200 / 400 characters', () => {
    const m = userMessage('B', '11月10日', [ex(1, { quote: 'q'.repeat(400), question: '问'.repeat(300), answer: '答'.repeat(500) })]);
    expect(m).toContain(`原文：${'q'.repeat(CLIP.quote - 1)}…\n`);
    expect(m).toContain(`问：${'问'.repeat(CLIP.question - 1)}…\n`);
    expect(m).toContain(`答：${'答'.repeat(CLIP.answer - 1)}…`);
    expect(clip('short', 10)).toBe('short');
  });

  it('Z-04: at most the newest 20 exchanges go in one request', () => {
    const sent = sentExchanges(Array.from({ length: 25 }, (_, i) => ex(i + 1)));
    expect(sent).toHaveLength(MAX_EXCHANGES);
    expect(sent[0]!.messageId).toBe(6);
    expect(userMessage('B', 'D', sent)).toContain('[20] Chapter I');
  });
});

describe('parseNotes (Z-05)', () => {
  it('Z-05: valid lines bind to their exchange number; ｜ and | both work', () => {
    expect(parseNotes('1｜词义｜vulnerable 是「涉世未深」｜说的是年轻时容易受影响。\n2|指代|that 指那句话|话里有话。', 2)).toEqual({
      status: 'ok', items: [
        { n: 1, kind: '词义', point: 'vulnerable 是「涉世未深」', detail: '说的是年轻时容易受影响。' },
        { n: 2, kind: '指代', point: 'that 指那句话', detail: '话里有话。' },
      ],
    });
  });

  it('Z-05: an out-of-range number, a missing field or an empty field drops the line; an unknown kind becomes empty', () => {
    const r = parseNotes('3｜词义｜a｜b\n0｜词义｜a｜b\n1｜词义｜｜b\n1｜词义｜a\n2｜比喻｜要点｜说明\nx｜词义｜a｜b', 2);
    expect(r).toEqual({ status: 'ok', items: [{ n: 2, kind: '', point: '要点', detail: '说明' }] });
  });

  it('Z-05: more than 5 lines are cut; long fields are clipped', () => {
    const r = parseNotes(Array.from({ length: 7 }, () => `1｜句子｜${'要'.repeat(60)}｜${'说'.repeat(200)}`).join('\n'), 1);
    expect(r.status === 'ok' && r.items.length).toBe(5);
    expect(r.status === 'ok' && [Array.from(r.items[0]!.point).length, Array.from(r.items[0]!.detail).length]).toEqual([40, 110]);
  });

  it('Z-05: 无 is empty; no usable line is bad; a cut-off last line is dropped', () => {
    expect(parseNotes(' 无 ', 3)).toEqual({ status: 'empty' });
    expect(parseNotes('无。', 3)).toEqual({ status: 'empty' });
    expect(parseNotes('这些问答没有什么值得记的。', 3)).toEqual({ status: 'bad' });
    expect(parseNotes('', 3)).toEqual({ status: 'bad' });
    expect(parseNotes('1｜词义｜a｜b\n2｜指代｜c｜d 说到一半', 2, 'length')).toEqual({ status: 'ok', items: [{ n: 1, kind: '词义', point: 'a', detail: 'b' }] });
  });
});
