import { normaliseWord, ruleCandidates, stripClitic } from '../dict/lemma.ts';
import type { DictService } from '../dict/service.ts';
import type { Footnote } from '../reader/decorate.ts';
import type { Annotator } from '../reader/engine.ts';
import { wordContext, words } from '../reader/words.ts';

/**
 * Every word whose lemma is in `lemmas` gets its first sense as a footnote. The reader passes
 * saved lemmas (a lookup alone does not qualify) union predictions. A Set of those lemmas'
 * surface forms filters words cheaply; only candidates go through the full lookup.
 */
export function footnoteAnnotator(dict: DictService, lemmas: ReadonlySet<string>): Annotator {
  if (!lemmas.size) return () => [];
  const forms = dict.formsOf(lemmas);
  const lowerLemmas = new Set([...lemmas].map((l) => l.toLowerCase()));
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
      if (r && lemmas.has(r.lemma)) out.push({ start: w.start, end: w.end, text: r.footnote });
    }
    return out;
  };
}
