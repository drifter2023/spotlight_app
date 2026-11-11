# 阅读摩擦 · 2026-10-26

These override the older paragraphs in `README.md` and the v4 scope note. The interactive prototype (`聚焦阅读 App.dc.html`) and its screenshots still show the previous chrome, fade, and home key card. The scope document is v5.

- **‹ 书架** stays visible and tappable. The book title and the 目录 · Aa capsule still show and hide together (title area, blank space, page edge; hide on text, after 3s, or on scroll).
- **Blurred words.** With 聚焦模糊 on, a word outside the sharp band scrolls to the vertical centre, then its drawer opens. A touch or wheel during that scroll cancels it. Sharp words open immediately. A title-area tap never looks a word up. With 聚焦模糊 off, every word below the title area opens immediately.
- **带读** is mounted in 纸白 and 夜读, and steps aside while the title and capsule are up. The Home capsule is still the only theme switch. Switching to 纸白 pauses playback. Night colours are unchanged.
- **保存.** A tap still opens the drawer and writes a lookup. The 9px footnote appears after 保存. Closing without 保存 leaves none. 撤回 forgets the lemma. Predicted footnotes do not need 保存; they use lighter ink (about 0.38). A saved word that was also predicted uses the ordinary footnote (0.6). A short word's gloss may extend to about 6em. Line height does not change.
- **Paper fade.** Blur is still `blurMax · t`. Paper opacity is `1 − 0.55t` (0.45 at the edge). Night opacity stays `1 − 0.92t` (0.08 at t = 1).
- **Home.** Continue reading shows the chapter title when the book has one. An empty shelf's bundled books say 从这本开始. The vocabulary card stays. The DeepSeek key is not on Home; 填写 Key appears when a grammar droplet or an Agent question needs a key, and the request runs only after the key is accepted. 导出内测日志 is the last row of the reader settings sheet.
