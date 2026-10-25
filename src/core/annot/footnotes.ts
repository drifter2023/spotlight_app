import { normaliseWord, ruleCandidates, stripClitic } from '../dict/lemma.ts';
import type { DictService } from '../dict/service.ts';
import type { Footnote } from '../reader/decorate.ts';
import type { Annotator } from '../reader/engine.ts';
import { wordContext, words } from '../reader/words.ts';

/**
 * R-06: every word whose lemma is in `seen` or `predicted` gets its first sense as a footnote.
 * A lemma only in `predicted` is `kind: 'predicted'` so the gloss can recede; one the reader has
 * looked up (even if it is also predicted) stays the ordinary footnote. A Set of those lemmas'
 * surface forms filters words cheaply; only candidates go through the full lookup.
 */
export function footnoteAnnotator(
  dict: DictService,
  seen: ReadonlySet<string>,
  predicted: ReadonlySet<string> = new Set(),
): Annotator {
  if (!seen.size && !predicted.size) return () => [];
  const forms = dict.formsOf(new Set([...seen, ...predicted]));
  const lowerLemmas = new Set([...seen, ...predicted].map((l) => l.toLowerCase()));
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
      if (!r || (!seen.has(r.lemma) && !predicted.has(r.lemma))) continue;
      const note: Footnote = { start: w.start, end: w.end, text: r.footnote };
      if (predicted.has(r.lemma) && !seen.has(r.lemma)) note.kind = 'predicted';
      out.push(note);
    }
    return out;
  };
}
