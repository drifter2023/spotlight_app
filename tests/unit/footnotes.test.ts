import { describe, expect, it } from 'vitest';
import { footnoteAnnotator } from '../../src/core/annot/footnotes.ts';
import { DictService } from '../../src/core/dict/service.ts';
import { paragraphText } from '../../src/core/ingest/text.ts';
import { fixtureDict } from '../helpers/nodeDict.ts';

const dict = new DictService(fixtureDict());
const para = ['The boat ran past bright eyes.'];
const text = paragraphText(para);

function notes(seen: readonly string[], predicted?: readonly string[]) {
  const annotate = footnoteAnnotator(dict, new Set(seen), predicted ? new Set(predicted) : undefined);
  return annotate(0, 0, para, text);
}
const at = (list: ReturnType<typeof notes>, word: string) => list.find((n) => n.start === text.indexOf(word));

describe('footnoteAnnotator', () => {
  it('marks a lemma that is only predicted, including a suffix the forms table does not list', () => {
    const list = notes(['run'], ['boat', 'eye']);
    expect(at(list, 'boat')).toMatchObject({ text: '船', kind: 'predicted' });
    expect(at(list, 'eyes')).toMatchObject({ text: '眼睛', kind: 'predicted' });
    expect(at(list, 'ran')).toEqual({ start: text.indexOf('ran'), end: text.indexOf('ran') + 3, text: '跑' });
    expect(at(list, 'bright')).toBeUndefined();
  });

  it('keeps the ordinary footnote when the lemma was looked up and also predicted', () => {
    const boat = at(notes(['boat'], ['boat']), 'boat');
    expect(boat).toEqual({ start: text.indexOf('boat'), end: text.indexOf('boat') + 4, text: '船' });
    expect(boat?.kind).toBeUndefined();
  });

  it('defaults the predicted set to empty, so a lookup is still a plain footnote', () => {
    const list = notes(['run']);
    expect(list).toEqual([{ start: text.indexOf('ran'), end: text.indexOf('ran') + 3, text: '跑' }]);
  });
});
