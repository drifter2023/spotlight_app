import { normaliseWord, ruleCandidates, stripClitic } from '../dict/lemma.ts';
import type { DictService } from '../dict/service.ts';
import type { Footnote } from '../reader/decorate.ts';
import type { Annotator } from '../reader/engine.ts';
import { wordContext, words } from '../reader/words.ts';

/**
 * Lemmas this frequent (BNC / frq rank, ECDICT) are the reader's everyday words: I, you, be, to, so,
 * time, house… A tap on one still opens its drawer, but adds no footnote (owner decision 2026-11-11).
 */
export const COMMON_RANK = 200;

/** True for one of the ~200 most frequent lemmas: looking it up does not footnote it. */
export function isCommonLemma(dict: DictService, lemma: string): boolean {
  const level = dict.level(lemma);
  return !!level && level.rank > 0 && level.rank <= COMMON_RANK;
}

/**
 * Every word whose lemma is in `saved` or `predicted` gets its first sense as a footnote.
 * `saved` is the reader's own footnotes: lemmas they looked up (except common ones) or pressed 保存 for
 * (owner decision 2026-11-11; a footnote used to wait for 保存). A lemma only
 * in `predicted` is `kind: 'predicted'` so the gloss can recede; one that is saved (even if it
 * is also predicted) stays the ordinary footnote. A Set of those lemmas' surface forms filters
 * words cheaply; only candidates go through the full lookup.
 */
export function footnoteAnnotator(
  dict: DictService,
  saved: ReadonlySet<string>,
  predicted: ReadonlySet<string> = new Set(),
): Annotator {
  if (!saved.size && !predicted.size) return () => [];
  const forms = dict.formsOf(new Set([...saved, ...predicted]));
  const lowerLemmas = new Set([...saved, ...predicted].map((l) => l.toLowerCase()));
  const candidate = (w: string): boolean => {
    const core = stripClitic(normaliseWord(w)).toLowerCase();
    if (forms.has(core)) return true;
    for (const c of ruleCandidates(core)) if (lowerLemmas.has(c.lemma)) return true;
    return false;
  };
  return (_chapter, _para, p, text) => {
    const out: Footnote[] = [];
    for (const w of words(text)) {
      if (!candidate(w.word)) continue;
      const r = dict.lookup(w.word, wordContext(p, w.start));
      if (!r || (!saved.has(r.lemma) && !predicted.has(r.lemma))) continue;
      const note: Footnote = { start: w.start, end: w.end, text: r.footnote };
      if (predicted.has(r.lemma) && !saved.has(r.lemma)) note.kind = 'predicted';
      out.push(note);
    }
    return out;
  };
}
