# Spotlight (聚焦阅读) — experience review and redesign proposals · 2026-11-10

Reviewed against: `CLAUDE.md`, `README.md` (with the 10-14 / 10-20 / 10-26 handoffs that override it), `TASKS.md`, `MVP 设计与范围` Part B3/B4/B6, `docs/plans/*`, and `docs/handoff/2026-10-26/prototype.html`. Walked in the running web build at `http://localhost:5180` (in-app browser, 375 × 812 mobile emulation, both themes). Branch `review/reading-experience` at `49ab12c`.

Precedence used: README > design doc; the 2026-10-26 `CHANGES.md` and the owner decisions in `docs/plans/` win over older paragraphs; `CLAUDE.md` scope line wins over README's out-of-scope list.

Notes on the evidence: the browser pane was hidden for most of the walk, so animations ran throttled and screenshots sometimes lagged one step behind the DOM; every "saw" below is backed by a DOM/computed-style read where the screenshot was ambiguous. Nothing was typed into the key fields, no link was submitted, and the dev server was left running. 60 fps could not be measured in this environment (see §2, R-01).

---

## 1. The experience in one page

### What the app should feel like (from the docs)

> 产品定义：一个把注意力当作第一资源的英文阅读器。屏幕中央是一条固定的清晰带，其余文本按距离衰减；点任意单词从纸面裂开一条抽屉给出释义，查过的词在词下留一枚 9px 汉字脚注。

Everything in the spec serves one feeling: **quiet paper, one spot of attention, nothing standing on the page.** Newsreader at 19.5/34 on `#faf8f3`; a sharp band that the eye settles into while the rest recedes; chrome that only appears when asked for and leaves after 3 s; one accent; the dictionary tears out of the page instead of popping over it; glosses whisper at 9 px under the word; a reading companion (旁注) that sits in the margin and only speaks when asked. At night the same page becomes a spotlight: the lit sentence turns `#ffb4b4` and the room goes dark around it. Home is "editorial" — rules, not cards; a big serif title; one vermilion accent.

### What it feels like now

The core of that promise is built and feels right. The band, the ramp, the tear-paper drawer, the notches, the leather, the footnote that never moves a line, the night accent on the sharp lines, the 带读 lit sentence — these are the hard parts and they work (tap-to-drawer measured at **44 ms**; the drawer pushes only the lines below it; 撤回 removes footnotes cleanly; position restore put the same paragraph back in the band). Reading Gatsby in the band is genuinely calm.

The gaps are around the edges of that core, and they are mostly the newest additions (10-20 / 10-26) that have not yet been fitted to the paper theme or to the "nothing on the page" rule:

1. **A glass widget from the night theme sits on the paper page.** In 纸白 the 带读 bar is always mounted, in night colours: white glass, cream glyphs, cream speed labels on paper. Contrast measures **1.06 : 1** and **1.11 : 1** — effectively invisible — and it is the one persistent control the design forbids. The 10-26 prototype explicitly says 纸白这条用墨色，白玻璃落在纸上会看不见.
2. **The first minute is unguided.** A book opens on a blurred heading with no title, no capsule, no hint that the title area, 目录, Aa, the droplet or the left swipe exist. The chrome's 3 s idle also turns a deliberate tap on 目录/Aa into an accidental word lookup when the reader pauses to think.
3. **The app's own contrast bar is not met by its smallest text.** The 9 px predicted footnote (ink .38) is **2.3 : 1** on paper and 3.2 : 1 at night; the eyebrow (.38) the same; even the saved footnote at .6 is 4.28 : 1. `CLAUDE.md` says small text ≥ 4.5 : 1.
4. **The learning loop's signals are unstable and its verbs unclear.** One lookup or one 撤回 re-runs the predictor and footnotes appear/disappear on lines the reader is looking at. 保存 / 撤回 side by side read as "save" / "undo the save", but 撤回 actually means "I know this word — stop predicting it".
5. **Night is two different apps at the seams.** Home's night accent is amber (`#f0b429`) while the reader's is pink (`#ffb4b4`); 纸白 带读 is a bar with speeds, 夜读 带读 is a play button with no speed control anywhere.

Fix 1, 3 and 4 and the app matches its own description. 2 and 5 need the owner's taste.

---

## 2. Findings, ranked by impact on reading

Priorities: **P0** broken · **P1** hurts reading or learning · **P2** friction · **P3** polish.
Hard-requirement checks are summarised at the end of this section.

### P1

**F1 · The 纸白 带读 bar is invisible glass and the only persistent control on the page.**
- Saw: on every paper reader screen a 46 px capsule floats at `bottom: 52px` over the fading text, with a faint play triangle and "0.6× / 1.6×" labels that cannot be read; only the selected "1×" pill is visible (cream pill, dark text). Zoom of the bar region: play glyph `#f2ede4` on a `rgba(255,255,255,.12)` disc over paper.
- Measured: speed label `rgba(242,237,228,.55)` over the bar bg over paper = **1.06 : 1**; play glyph on its disc = **1.11 : 1**. Selected pill 16.7 : 1.
- Why it matters: the reader sees a ghost widget on the page at all times (the design's "no persistent buttons" principle, A2), cannot find 带读, and the labels fail the 4.5 : 1 bar by a factor of four.
- Code: `src/styles/reader.css:255-281` — `.gd-bar`, `.gd-play-disc`, `.gd-speeds span` hard-code the night glass (`rgba(255,255,255,.07)` bg, `#f2ede4` glyph, `rgba(242,237,228,.55)` labels) with no paper variant. Mounted in paper by `src/views/ReaderView.tsx:252-257` (`prefs.theme !== 'night' && !chrome`).
- Rule: `docs/handoff/2026-10-26/prototype.html:123-144` gives the paper values (`.screen.paper .gd { background: rgba(250,248,243,.94); border: 1px solid rgba(34,31,27,.12); color: #221f1b }`, play disc `rgba(34,31,27,.08)`, track `.12`, fill `.72`, labels `.45`, selected `#221f1b` on `#faf8f3`); caption 03a. NM-08 (4.5 : 1 labels). → **Proposal S1.**

**F2 · Predicted footnotes churn under the reader's eyes.**
- Saw: tapping "feel" made "易受伤害的" appear under "vulnerable" two lines above (already read); 撤回 on "advice" made it disappear again. Both lines were inside the sharp band at the time.
- Why it matters: the band is where attention lives; glosses that pop in and out there are a distraction at exactly the wrong moment, and they make the predictor look flaky rather than helpful. The plan's intent (P-03/P-05) is footnotes "in advance", not live edits of the page being read.
- Code: `src/views/useWordLookup.tsx:182` (`model.lookedUp(...).then(() => { if (repredict()) ...; refreshFootnotes(); })`), `:481` (same after 撤回); `applyFootnotes` → `engine.refreshAnnotations()` → `src/core/reader/engine.ts:309-311` re-decorates every mounted paragraph nearest-first.
- Rule: `docs/plans/2026-09-30-predicted-words.md` P-03/P-05 (live for 关/少/多 is required; nothing requires live after each lookup). → **Proposal M1.**

**F3 · In 夜读 there is no way to set the 带读 speed.**
- Saw: night chrome shows a play button beside the capsule; no 0.6× / 1× / 1.6× anywhere; the paper bar (which has them) is not mounted at night.
- Why it matters: 带读 at 1× is ~200 wpm, which is fast for the target reader; the handoff built the speeds precisely so a learner can slow it down. At night they are unreachable.
- Code: `src/views/ReaderView.tsx:252` (bar only when `prefs.theme !== 'night'`), `:264-268` (night `guide` prop has play/pause only), `src/views/reader/ReaderChrome.tsx:24-41` (no speed control).
- Rule: NM-08 (`NIGHT_MODE_1c.md` N5: speed selector on the bar); commit `2b62af8` moved night to a play button. → **Proposal O1 (owner: where the speed lives); fallback S9.**

### P2

**F4 · The reader opens cold: no title, no capsule, no hint.**
- Saw: first open lands on the blurred "CHAPTER I" heading, the eyebrow and ‹ 书架; the top bar and 目录 · Aa are hidden until a tap in the title area / blank space. Nothing on screen suggests the droplet opens grammar or that a left swipe opens 旁注.
- Why it matters: everything beyond "scroll and tap a word" is hidden behind gestures the reader has not been told about; the 10-15/10-20 decisions deliberately removed the only visible affordance (a persistent Aa). Discoverability now rests on luck.
- Code: `src/views/ReaderView.tsx:43` (`chrome` starts `false`), `:180-184` (`showChrome`). → **Proposal S2 (chrome visible on open, then the normal 3 s fade) + O2 (one-time hint, owner).**

**F5 · The 3 s chrome idle turns a late tap on 目录 / Aa into a word lookup.**
- Repro: tap the title area, read the capsule, think for three seconds, tap Aa → the capsule has gone and the tap lands on the (blurred) text under it; the page scrolls that word to the centre and opens its drawer (happened twice in this walk: "attach" opened instead of settings).
- Why it matters: the capsule sits on top of body text; a miss is not a no-op, it is a 600 ms scroll plus a drawer plus a Lookup row the reader did not want (which also trains the predictor).
- Code: `ReaderView.tsx:28` `CHROME_IDLE_MS = 3000`; `:215` falls through to `lookup.onTap` when the capsule is gone. Rule: README → Top bar "fade out after 3 s idle" (so changing it is an owner call). → **Proposal O3 (5 s, recommended) + S3 (a tap in the dock zone within 400 ms of the fade is swallowed).**

**F6 · Small text below the 4.5 : 1 bar.** (measured on the real tokens; WCAG formula)

| Text | Token | Paper | Night |
|---|---|---|---|
| 9 px predicted footnote | ink .38 (`reader.css:95`) | **2.30** | **3.21** |
| 11 px chapter eyebrow | ink .38 (`reader.css:60`) | **2.30** | **3.21** |
| 9 px saved footnote | ink .6 (`reader.css:91`) | **4.28** | 6.37 |
| 12 px POS in drawer | cream .45 (`reader.css:175`) | **3.73** (leather) | 3.78 |
| 11 px phonetic | cream .5 (`reader.css:174`) | **4.26** | — |
| 11 px sheet hint | cream .5 (`reader.css:356`) | **4.26** | — |

- Why it matters: the footnote is the learning surface of the app; at 9 px and 2.3 : 1 a predicted gloss is a smudge, which defeats "the gloss before you need it". The eyebrow is the only progress indicator.
- Rule: `CLAUDE.md` → Quality bar; README → Contrast ("10–13 px small text is at least 4.5 : 1 … 62 % … never less"). The .38 values come from the design doc (eyebrow) and C1026 (predicted "about 0.38"), so the spec contradicts itself. → **Proposal O4 (owner picks the exemption or the new values; numbers given).**

**F7 · The drawer shows four senses on one line.**
- Saw: "advice · 忠告，劝告，意见，报道", "attach · 附上，使依附，使附属，使喜爱", "feel · 感觉，觉得，触摸，以为".
- Why it matters: README/B3 say 单义一行，不堆词典义项 — the learner should get one answer and go back to the sentence. Four equal-weight senses re-open the choice the footnote has already made (the footnote shows only the first).
- Code: `src/core/dict/gloss.ts:21` `MAX_SENSES = 4`, `:54` joins them with "，"; `src/views/WordDrawer.tsx:107` renders the joined string. → **Proposal S4.**

**F8 · 撤回 is the wrong verb for what it does.**
- Saw: 保存 and 撤回 side by side on every word; aria-label "撤回生词标记". Tapping 撤回 on an unsaved word closes the drawer and silently marks the word known (never predicted again, Lookup row deleted).
- Why it matters: a first-time reader reads 撤回 as "undo the save" and will not use it on unsaved words, so the predictor loses its strongest signal (weight 2). The action is really "我认识这个词".
- Code: `src/views/WordDrawer.tsx:117-125`; semantics in `useWordLookup.tsx:468-483`. Owner-named (TASKS → 25). → **Proposal O5.**

**F9 · Home's shelf ends in an empty band between two rules.**
- Saw: after the last shelf row a .07 rule, 34 px of nothing, then a .10 rule, then 预测生词. Reads as a missing row (both themes).
- Code: `src/styles/home.css:51` (`.row-wrap` border-bottom) + `:117-121` (`.ai-card { margin-top: 34px; … border-top }`). Rule: README → Home "sections are separated by 1 px rules" (one rule, not two). → **Proposal S5.**

**F10 · The droplet and a footnote can occupy the same spot.**
- Saw: the droplet sits at `size × 1.18 + 2` below the line (`engine.ts:924`), the footnote at `size × 1.18` (`reader.css:89`) and may run 6 em past its word; when a sentence ends on a footnoted word the 6 px drop lands on the gloss. Also: `.42` ink on paper = 2.55 : 1 for a 6 px target that is the only grammar affordance.
- Code: `src/core/reader/engine.ts:1034-1067`, `src/styles/reader.css:125-129`. → **Proposal S6.**

### P3

**F11 · Agent attachment × is 36 × 36** (`src/styles/agent.css:100`); rule 44 px. → **S7.**
**F12 · Settings/TOC sheet grip is 28 px tall** (`reader.css:347`) — it is the labelled 关闭 control. → **S8.**
**F13 · "正在适配这台设备…" sits under the 带读 bar** on first open (`reader.css:70` bottom 48 px vs bar bottom 52 px). → **S10.**
**F14 · The key card inside the 旁注 drawer and the grammar drawer is titled "AI 语法分析"** (`src/views/home/AiKeyCard.tsx:58-60`) even when asked for by a chat question. → **S11.**
**F15 · Agent header "历史 0 · CHAPTER I / 新对话 ⌄"** on first open (`AgentDrawer.tsx:199`): "历史 0" is a counter talking to a user who has not had a conversation. → **S12.**
**F16 · Night Home accent `#f0b429` vs night reader accent `#ffb4b4`** (`src/styles/tokens.css:28,35`): amber progress bars on the shelf, pink lit lines in the book. Two accents in one theme. → **O6.**
**F17 · Import is a centred confirm dialog, not a sheet** (`src/views/home/ImportChooser.tsx` on `.confirm-scrim`, `home.css:88`); README calls it `ImportSheet`. Harmless; the copy ("网页由 Spotlight 的服务器代为抓取，只取正文，不保存链接。") is good. No change proposed.
**F18 · The settings sheet's last row (导出内测日志) is below the fold at 42 %** and needs a scroll inside the sheet; a desktop scrollbar shows in the pane. Fine on iOS; no change.

### Hard-requirement checks

| Requirement | Result |
|---|---|
| Hit targets ≥ 44 px | ‹ 书架 88 × 44 ✔ · capsule buttons 78/64 × 44 ✔ · 保存/撤回 46 × 25 visible, `::before` → 58 × 45 ✔ · theme capsule 28 px visible, `::before` → 44 ✔ · filter tabs 44 ✔ · switches inside 53 px `<label>` rows ✔ · speed pills 44 × 44 ✔ · droplet reach 44 ✔ · Agent chips/send 44 ✔ · **Agent × 36 ✘ (F11)** · **sheet grip 28 ✘ (F12)** |
| Small text ≥ 4.5 : 1 | Home .62 = 5.04 ✔ · drawer def .8 = 8.5 ✔ · TOC current `#ea7a62` 5.3 ✔ · Agent labels .62 = 5.1 ✔ · **paper 带读 bar 1.06/1.11 ✘ (F1)** · **predicted footnote 2.30 ✘, eyebrow 2.30 ✘, saved footnote 4.28 ✘, POS .45 3.73 ✘ (F6)** |
| Tap-to-drawer ≤ 100 ms (R-04) | **44 ms** on a sharp word (paper) and **43 ms** (night), via `window.__spotlightTapMs`. A blurred word adds the designed 600 ms scroll. ✔ |
| One easing curve | `--ease: cubic-bezier(.42,0,.58,1)` (`tokens.css:16`), `EASE` (`motion.ts:2`) used by the flight, drawer, sheet, chrome, Agent swipe (`useAgentSwipe.ts:48`), guide scroll (`motion.ts:14`). grep finds no other cubic-bezier in `src/`. ✔ |
| Footnote never changes line height (R-06) | `.rd-fn` is `position:absolute` in a `position:relative` word span (`reader.css:85-94`, `decorate.ts:34-42`); lines above the drawer did not move when 感觉 appeared; covered by `tests/e2e/lookup.spec.ts:131`. ✔ |
| 60 fps scroll (R-01) | Not measurable here (hidden pane throttles rAF; the first-launch probe itself took > 4 s). Architecture matches the rules: one line table, passive scroll → rAF, ±1 viewport window, 0.5 px blur steps, diff writes (`engine.ts:181-241`), 5 ms slices for layout and footnotes. Needs the real-device pass (TASKS 24, NM-07). ◻ |

---

## 3. Design proposals

Classification: **S** small / **M** medium (in scope, no owner decision, build spec given) · **OWNER** (needs a decision; not to be built yet).

### 3.1 Interaction logic

**S1 · 纸白 带读 bar in ink (F1).** The bar stays where it is; it stops being night glass on paper.
- Files: `src/styles/reader.css` (`.gd-bar` block, lines 255-281).
- Spec (paper = default, night overrides under `:root[data-theme='night']`):
  - `.gd-bar`: `background: rgba(var(--paper-rgb), .94); border: 1px solid rgba(var(--reader-ink-rgb), .12); color: var(--reader-ink); box-shadow: 0 6px 22px rgba(var(--shadow-rgb), .16)` (same shadow as the capsule, so the two read as one family). Keep `backdrop-filter: blur(18px)`.
  - `.gd-play-disc`: `background: rgba(var(--reader-ink-rgb), .08); color: var(--reader-ink)`. Playing: `background: var(--reader-ink); color: var(--paper)`.
  - `.gd-track`: `rgba(var(--reader-ink-rgb), .12)`; fill `rgba(var(--reader-ink-rgb), .72)` (4.97 : 1 against the track).
  - `.gd-speeds span`: `color: rgba(var(--reader-ink-rgb), .62)` — the prototype's `.45` is 2.77 : 1, `.62` is 4.55 : 1; checked: `rgba(242,237,228,.92)` → in paper `background: var(--reader-ink); color: var(--paper)`.
  - Night block: the current values verbatim (`rgba(255,255,255,.07)` bg, `.09` border, cream glyphs/labels, cream selected pill).
- Before/after: paper bar 1.06 : 1 → labels 4.55 : 1, glyph 13 : 1.
- Test: extend `tests/browser/night.test.ts` (or a new `guide-bar.test.ts`) with a computed-style assertion per theme on `.gd-speeds span` colour and the disc colour; keep NM-08's 44 px check. Storybook: add a 纸白 story next to the night one for `GuideBar`.

**S2 · Show the chrome when a book opens (F4).**
- File: `src/views/ReaderView.tsx`. After `engine.mount(initialAnchor)` resolves (line 134), call `showChrome(true)`; the existing 3 s idle (`:183`) and scroll-hide (`:185-191`) then run unchanged. Do not show it while `probing` (the probe scrolls and would hide it instantly) — call it after the probe branch resolves.
- Why: the reader sees the title and 目录 · Aa once, learns the capsule exists, and the page is clean three seconds later. No new UI, no doc contradiction (README only says the bar "appears with the capsule" and fades after 3 s idle).
- Test: `tests/browser/reader-chrome.test.ts` — after mount, `.rd-chrome-on` present; after 3 s (fake timers) absent; a scroll hides it.

**S3 · Swallow the first tap in the dock zone right after the capsule fades (F5).**
- File: `src/views/ReaderView.tsx`. Record `chromeHiddenAt = performance.now()` when the idle timer fires. In `onTap`, before `lookup.onTap` (line 215): if `performance.now() - chromeHiddenAt < 400` and the tap is inside the last dock rect (store `rd-dock`'s rect when hiding; 44 px tall band at `bottom: safe + 22px`), then `showChrome(true); return;` — the capsule comes back under the finger instead of a word opening.
- Test: `tests/browser/tap.test.ts` — tap at the capsule's centre 100 ms after the fade → chrome visible, no drawer; 600 ms after → normal rules.
- This is the in-spec half of F5; the idle length itself is O3.

**M1 · Predictions change only outside the viewport (F2).**
- Files: `src/views/useWordLookup.tsx`, `src/core/reader/engine.ts`.
- Spec: keep `repredict()` as is, but split `applyFootnotes()` into two paths:
  - `applyFootnotes('now')` — current behaviour. Used on load (`:121,128`), on the 预测生词 setting change (`:131`), and on 保存 / 撤回 **for that lemma only**.
  - `applyFootnotes('later')` — used after `model.lookedUp` (`:182`) and after `model.undone` (`:481`) for the *other* lemmas: the engine stores the new annotator as `#pendingAnnotate` and swaps it in on the next `#syncWindow()` (scroll pause, `engine.ts:863`) **only for paragraphs whose lines are entirely outside `[scrollTop − H, scrollTop + 2H]`**, plus any chapter attached later. Paragraphs on screen keep their current footnotes until they leave the ±1-viewport window and come back, or until the book is reopened.
  - The tapped word itself: a lookup never adds a predicted footnote to it (it already needs 保存); 撤回 removes its footnote at once (today's behaviour, `:472-474`).
- Engine: add `setAnnotator(fn, { deferVisible: true })` which records `fn` and queues only off-window paragraphs through `#queueDecorate`; `#setWindow` already decorates newly attached chapters with the current annotator (`:996`).
- Acceptance (P-03 extended): after a lookup, no `.rd-fn` is added or removed on a line whose box intersects the viewport; after scrolling two viewports away and back, the new set shows. Unit test on the pure part (which paragraphs are deferred) in `tests/browser/engine.test.ts`.

**S4 · One sense first; the others whisper (F7).**
- Files: `src/core/dict/gloss.ts`, `src/core/dict/service.ts` (expose `senses: string[]` next to `gloss`), `src/views/WordDrawer.tsx:107`, `src/styles/reader.css:176-179`.
- Spec: `.wd-def` renders `<b>{first}</b>{rest.length ? '，' + rest.join('，') : ''}` with `.wd-def b { font-weight: 500; color: #f2ead9 }` and the rest at the current `rgba(242,234,217,.62)` (5.7 : 1). Same line, same 13/20 type, no new row. The footnote already uses `first`, so the drawer and the footnote now agree visibly.
- Test: snapshot in `tests/browser/lookup.test.ts` that `.wd-def b` equals `r.footnote` for "advice".

**S6 · Droplet legibility and collision (F10).**
- File: `src/styles/reader.css:125-129`. Add `box-shadow: 0 0 0 2px var(--paper)` (a paper halo) and raise the layer: `.rd-drops { z-index: 2 }` is not possible (masks are 2) — instead keep z 1 and give the drop the halo so it reads over a gloss. Ink `.42` → `.55` (3.68 : 1, above the 3 : 1 non-text line; still a quiet mark).
- Test: visual story for the droplet over a footnoted last word in `src/views/_stories/`.

**S7 · Agent attachment × → 44 px** (F11). `src/styles/agent.css:100`: `width: 44px; height: 44px; margin: -10px -8px 0 0` (icon stays 12 px). Test: `tests/e2e/select.spec.ts` N-06 add a bounding-box assertion.

**S8 · Sheet grip → 44 px** (F12). `src/styles/reader.css:347`: `height: 44px`; the 36 × 4 bar stays centred; `.sheet-body` padding-top unchanged. Also set `aria-label="关闭"` (already there). Test: `tests/browser/reader-chrome.test.ts` box height.

**S9 · (fallback for F3 if O1 is not decided) Show the paper bar in 夜读 too while paused.** Remove the `prefs.theme !== 'night'` guard at `ReaderView.tsx:252` and drop the night play button from `ReaderChrome` — the 10-26 handoff ("带读 is mounted in both … steps aside while the title and capsule are up") already allows this; the night bar styling exists. Only build this if the owner chooses option A in O1.

### 3.2 Reading rhythm

The rhythm itself is right and should not be touched: continuous scroll, band = 30 % (7 lines at 812 px — the README's "about 3 lines" is a stale note from a 375-px artboard), ramp over ~8 lines, a drawer that opens in place and pushes the next lines out of the band, a 600 ms reach for a blurred word, 带读 dwell by word count. Two things interfere with it: footnote churn (M1) and the dock-zone mis-taps (S3/O3). One more:

**M2 · Keep the band on the sentence after a drawer closes near the bottom.** When the drawer was pushed up by keep-on-screen (`useWordLookup.tsx:158-163`), closing it leaves the tapped line above the band centre, so the sentence the reader was in is now sharp-but-high and the band holds text they have not read. Spec: in `close()` (`:290-318`), if `keepOnScreen` scrolled by `over > 0` for this drawer, scroll back by the same `over` over 250 ms with `EASE` as the gap collapses (one rAF loop, same as `scrollLineToCentre`). Skip when the reader scrolled themselves while it was open (the `touched` flag already exists for the grammar drawer, `:271`). Test: open a word on the lowest sharp line → close → the line's y is within 1 px of where it was before the tap.

### 3.3 Vibe and visual style

**S5 · One rule between the shelf and the vocabulary card (F9).** `src/styles/home.css:117-121`: `.ai-card { margin-top: 24px; padding-top: 14px; border-top: 0 }` — the shelf's last `.row-wrap` border is the rule. In the empty state (`.empty-list li` has `border-top`), keep `border-top` on the card by scoping: `.shelf + .vocab-card { border-top: 0 }`. Before: two rules 34 px apart; after: one rule, 24 px, the eyebrow 预测生词.

**S10 · Probe notice above the bar (F13).** `reader.css:70`: `bottom: calc(env(safe-area-inset-bottom) + 110px)`; or hide `.gd-bar` while `probing` (`ReaderView.tsx:252` add `&& !probing`). Prefer the second: nothing should sit on the page during the probe.

**O6 · One night accent (F16).** Options: (a) Home night accent → `#ffb4b4` to match the reader (progress bars, 开始测试, + 导入 go pink); (b) keep amber on Home as the 7b "editorial" accent and pink in the book as the "spotlight". Recommendation: **(a)** — the theme capsule promises one theme for the whole app (owner decision 2026-10-20); two accents read as two apps. Needs the 7b colour table confirmed, which this repo's design doc does not list numerically.

**O4 · Small-text contrast policy (F6).** The spec contradicts itself (62 % "never less" vs eyebrow 38 %, predicted 38 %). Options:
- (a) Declare the eyebrow and predicted footnotes *decorative* and exempt them in `CLAUDE.md` (document the exemption; no code).
- (b) Raise them: eyebrow `.62` paper / `.5` night (4.55 / 4.74); saved footnote `.66` paper (5.17) / `.6` night (6.37); predicted footnote `.62` paper (4.55) / `.5` night (4.74) — the "lighter than saved" relation survives (.62 vs .66 paper; .5 vs .6 night) but is subtle; add `font-weight: 400` for predicted vs `500` for saved so they still differ at a glance.
- (c) Middle: eyebrow as in (b); footnotes stay (.38/.6) because a gloss the reader has not asked for *should* recede, and a tap always gives the full drawer.
- Recommendation: **(b)** for the eyebrow and saved footnote, **(c)** for the predicted one only if the owner is attached to the 10-26 look — but then write the exemption down. All values are one-line CSS edits in `reader.css:60,91,95`.

**O2 · A first-run hint.** Not in any doc. Options: (a) nothing (today); (b) one 11 px line under the eyebrow for the first book only, 6 s, then gone forever: 「点清晰的词查义 · 句末的小滴看语法 · 向左滑问旁注」; (c) a one-screen card before the first book. Recommendation: **(b)**, keyed on a `Settings.hinted` flag, same type as the eyebrow at `.62`. Pairs with S2.

### 3.4 Motion

All timings match the README table (330/250 drawer, 250/138 content, 220/460/300/320 flight, 300 back, 220 chrome, 420 Agent, 600 reach/guide step) and one curve. Two notes, no change proposed:
- The open flight expands the EPUB cover with `object-fit: cover` to full screen (`home.css:109`), so for 300 ms the reader sees a crop of the artwork (Gatsby: the eyes and lips). It is per spec and short; if the owner ever finds it unsettling, `object-fit: contain` on a `color` background during `full` is a one-line alternative (OWNER taste, not queued).
- The settings sheet opens with the drawer's 330/250 on the app curve (`reader.css:332-346`), per the owner's "no new easing curves". ✔

### 3.5 Copy (中文文案)

Tone today is plain and well judged — 「在页边写下你的问题」, 「词典未收录这个词」, 「不确定就选「不认识」，不会扣分，结果更准。」 are exactly right. Three fixes:

**S11 · Context-aware key card title (F14).** `src/views/home/AiKeyCard.tsx:58-61`: add a `title` prop; GrammarDrawer passes 「语法分析需要 DeepSeek Key」, AgentDrawer passes 「旁注需要 DeepSeek Key」; default stays 「AI 语法分析」 for the card place. The fine print 「语法分析和旁注提问会把内容发给 DeepSeek。Key 只保存在这台设备上。」 stays — it is the privacy sentence and it is good. Snapshot tests in `tests/browser/grammar-drawer.test.ts` and `tests/e2e/agent.spec.ts` update.

**S12 · First-conversation header (F15).** `src/views/agent/AgentDrawer.tsx:199`: when `sessions.length === 0` render 「新对话」 alone in the meta line (no 「历史 0 ·」); keep 「历史 N · 章节」 from 1 up. Test: `tests/e2e/agent.spec.ts` A-02 text assertion.

**O5 · The second drawer button (F8).** Options for the label of the action that marks a word known and forgets the lookup: (a) 撤回 (today); (b) 「认识」; (c) 「我认识」; (d) 「误点」. Recommendation: **(b) 认识** — two characters like 保存, states the fact rather than an apology, and tells the reader what the predictor will do with it. Keep the aria-label 「标记为认识的词」. Owner named it 撤回 (TASKS 25), so this is theirs to change; a one-string edit in `WordDrawer.tsx:123` and `CLAUDE.md`/`TASKS.md` text.

### 3.6 Usability

**O1 · Where 带读 lives (F3 and the 纸白/夜读 split).** Today: paper = persistent bar with speeds; night = play button in the chrome, no speeds. Options:
- (A) **One bar for both themes** (S1 colours for paper, existing glass for night), mounted while paused, hidden while the chrome is up and after 3 s of playing — the 10-26 handoff wording. Simple, but a persistent control on the page in both themes.
- (B) **Play button in the capsule dock for both themes** (the 2b62af8 night model), speeds as a row in the settings sheet 「带读速度 · 0.6× / 1× / 1.6×」 under 整句模式. Nothing on the page; the dock is already "the place controls live"; 带读 becomes reachable from the same tap that reaches 目录 and Aa.
- Recommendation: **(B)**. It restores "no persistent buttons", gives night its speeds back, and the progress track (which the bar also carried) is already in the eyebrow percentage. If (A) is chosen, S1 + S9 are the build; if (B), the build is: remove `GuideBar` from `ReaderView.tsx:252-257`, pass `guide` for both themes at `:264-268`, add the settings row in `SettingsSheet.tsx` after 整句模式 (seg buttons like 预测生词, `prefs.set('guideSpeed', v)`), keep `GuideBar.tsx` for Storybook or delete it with its story.

**O3 · Chrome idle 3 s → 5 s (F5).** One constant (`ReaderView.tsx:28`), but README → Top bar says 3 s. Recommendation: 5 s; readers pause to read the capsule, and S3 covers the remaining edge.

**O7 · Flag, no build: `CLAUDE.md` and TASKS 59 still say 带读 is 夜读-only** while C1026 and the code mount it in 纸白. Whatever O1 decides, the scope line should be updated in the same change.

**Not proposed, by scope:** pausing blur while the Agent drawer is open, carrying a tapped word into the chat, system dark mode, a 夜读 row in settings, the 想读 filter, selection auto-scroll — all listed out of scope and none of them blocks the reading experience.

---

## 4. Build queue (S and M only, in order)

| # | ID | One line |
|---|---|---|
| 1 | **S1** | Paper 带读 bar in ink: `.gd-bar` paper tokens in `reader.css:255-281`, night values moved under `[data-theme='night']`; labels .62 ink (4.55 : 1). |
| 2 | **S2** | Show the top bar and capsule once a book has mounted (after the probe), then the normal 3 s fade — `ReaderView.tsx:134`. |
| 3 | **S3** | A tap in the dock zone within 400 ms of the capsule fading brings the capsule back instead of opening a word — `ReaderView.tsx:215`. |
| 4 | **M1** | Re-predicted footnotes apply only to paragraphs outside the ±1-viewport window; visible lines keep theirs until they leave — `useWordLookup.tsx:182,481`, `engine.ts:300-311`. |
| 5 | **S4** | Drawer gloss: first sense at 500 / cream, the rest at .62 on the same line — `gloss.ts`, `WordDrawer.tsx:107`, `reader.css:176`. |
| 6 | **S5** | One rule between the shelf and 预测生词 — `home.css:117-121`. |
| 7 | **S6** | Droplet: paper halo and .55 ink so it reads over a gloss — `reader.css:125-129`. |
| 8 | **S10** | Hide the 带读 bar while the first-launch probe runs — `ReaderView.tsx:252`. |
| 9 | **S11** | Key card title says which feature needs the key (语法分析 / 旁注) — `AiKeyCard.tsx:58-61`. |
| 10 | **S12** | Agent header without 「历史 0 ·」 before the first conversation — `AgentDrawer.tsx:199`. |
| 11 | **S7** | Agent attachment × → 44 px — `agent.css:100`. |
| 12 | **S8** | Sheet grip → 44 px tall — `reader.css:347`. |
| 13 | **M2** | Scroll back by the keep-on-screen offset as a low drawer closes, so the band returns to the sentence — `useWordLookup.tsx:158-163,290-318`. |
| — | **S9** | Only if O1 = (A): mount the bar in 夜读 while paused and drop the night play button. |

Owner decisions waiting (not to be built): **O1** 带读 placement and speed control (recommend B) · **O2** first-run hint (recommend one 6 s line) · **O3** chrome idle 5 s · **O4** small-text contrast policy (recommend raising eyebrow and saved footnote; decide predicted) · **O5** 撤回 → 认识 · **O6** one night accent · **O7** update the 带读 scope line in `CLAUDE.md`/TASKS 59.
