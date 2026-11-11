import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import type { Session } from '../app/boot.ts';
import { devTools, exposeDevHandle } from '../app/devtools.ts';
import { shareTextFile } from '../app/share.ts';
import { exportMetrics, logMetric } from '../core/metrics/metrics.ts';
import { ReaderEngine, type EngineBook } from '../core/reader/engine.ts';
import { PositionSaver, savePosition } from '../core/reader/position.ts';
import { decideTier, runProbe } from '../core/reader/probe.ts';
import { MENU_PAD, onText, routeTap } from '../core/reader/tap.ts';
import type { Anchor } from '../core/types.ts';
import { AgentDrawer } from './agent/AgentDrawer.tsx';
import { useAgentSwipe } from './agent/useAgentSwipe.ts';
import { DevPanel } from './DevPanel.tsx';
import { FpsMeter } from './FpsMeter.tsx';
import { blurMaxFor } from '../core/prefs/prefs.ts';
import { ReaderChrome } from './reader/ReaderChrome.tsx';
import { SettingsSheet } from './reader/SettingsSheet.tsx';
import { TocSheet } from './reader/TocSheet.tsx';
import { useTextSelection } from './reader/useTextSelection.tsx';
import { useExposure } from './useExposure.ts';
import { drawerInner, useWordLookup } from './useWordLookup.tsx';

export interface ReaderBook extends EngineBook { title: string }
interface Props { session: Session; book: ReaderBook; initialAnchor: Anchor | null; onBack: () => void }

const CHROME_IDLE_MS = 3000;
/** A tap on the capsule's place this soon after it faded still counts as a tap on the capsule. */
const DOCK_GRACE_MS = 400;

function within(r: DOMRect, x: number, y: number, pad: number): boolean {
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
}
const MIN_SESSION_MS = 5000;

export function ReaderView({ session, book, initialAnchor, onBack }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chapterRef = useRef<HTMLSpanElement>(null);
  const eyebrowRef = useRef<HTMLDivElement>(null);
  const maskBottomRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const engineRef = useRef<ReaderEngine | null>(null);
  const saverRef = useRef<PositionSaver | null>(null);
  const [prefs, setPrefs] = useState(session.prefs.get());
  const [probing, setProbing] = useState(false);
  const [chrome, setChrome] = useState(false);
  const [sheet, setSheet] = useState<'settings' | 'toc' | null>(null);
  const [chapter, setChapter] = useState(initialAnchor?.chapter ?? 0);
  const chromeTimer = useRef(0);
  /** Where the capsule was when the idle timer faded it, and when (review S3). */
  const fadedDock = useRef<{ at: number; rect: DOMRect } | null>(null);
  const scrimDown = useRef<{ x: number; y: number } | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const shieldRef = useRef<HTMLDivElement>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const agentOpenRef = useRef(false);
  /** The text handed to the Agent drawer by 问旁注 (C3). */
  const [attachment, setAttachment] = useState<{ text: string; chapter: number } | null>(null);
  const agentSwipe = useAgentSwipe({ shell: shellRef, page: pageRef, panel: panelRef, dim: dimRef, shield: shieldRef }, (open) => {
    agentOpenRef.current = open;
    setAgentOpen(open);
    if (open) selectionRef.current.clear(); // a left swipe cancels the selection (and opens the drawer)
    else setAttachment(null); // closing drops the attachment: the next left swipe shows 当前句 (C3)
  });
  const lookup = useWordLookup(engineRef, session.db, book, session.prefs);
  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const selection = useTextSelection({
    engine: engineRef, page: pageRef, shell: shellRef, book,
    enabled: () => !sheetRef.current && !lookupRef.current.isOpen() && !agentOpenRef.current,
    onAsk: (text, chapter) => {
      setAttachment({ text, chapter });
      showChrome(false);
      agentSwipe.setOpen(true);
    },
  });
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  useExposure(scrollRef, engineRef, book, lookup);

  useEffect(() => {
    const saver = new PositionSaver((a, pct) => savePosition(session.db, book.id, a, pct));
    saverRef.current = saver;
    let pct = 1;
    // Session metrics: time visible and words advanced (README → Local log).
    let visibleSince = performance.now();
    let startWords = -1;
    let maxWords = 0;
    const endSession = () => {
      const ms = performance.now() - visibleSince;
      if (ms >= MIN_SESSION_MS) void logMetric(session.db, { type: 'session', bookId: book.id, ms: Math.round(ms), words: Math.max(0, maxWords - startWords) });
      startWords = -1;
    };
    const engine = new ReaderEngine(scrollRef.current!, book, session.prefs.get(), {
      // Written straight to the DOM: no React render per scroll frame.
      onProgress: (p) => {
        chapterRef.current!.textContent = p.chapterTitle;
        pctRef.current!.textContent = `${p.pct}%`;
        pct = p.pct;
        if (startWords < 0) { startWords = p.words; maxWords = p.words; }
        maxWords = Math.max(maxWords, p.words);
        setChapter(p.chapter);
      },
      onAnchor: (a) => saver.push(a, pct),
      onRelayout: () => { lookupRef.current.reset(); selectionRef.current.clear(); },
      onSelection: () => selectionRef.current.refresh(),
    });
    engineRef.current = engine;
    exposeDevHandle({ engine, prefs: session.prefs });
    const unsubscribe = session.prefs.subscribe((p) => {
      engine.setPrefs(p);
      setPrefs(p);
    });
    const onHide = () => {
      if (document.visibilityState === 'hidden') { void saver.flush(); endSession(); }
      else visibleSince = performance.now();
    };
    const onPageHide = () => { void saver.flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);

    let cancelled = false;
    void engine.mount(initialAnchor).then(async () => {
      if (cancelled || session.prefs.get().tier !== null) return;
      const forced = (window as { __forceTier?: 'full' | 'fallback' }).__forceTier; // e2e only
      if (forced) { await session.prefs.set('tier', forced); return; }
      setProbing(true);
      const result = await runProbe(engine);
      if (cancelled) return;
      await session.prefs.set('tier', decideTier(result));
      setProbing(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      endSession();
      void saver.flush();
      engine.destroy();
      engineRef.current = null;
    };
  }, [session, book, initialAnchor]);

  // Chrome: shown by a tap in the title area, on blank space or the page edge; hidden by the same tap again,
  // a tap on text, after 3 s idle or when scrolling starts.
  const showChrome = (on: boolean) => {
    clearTimeout(chromeTimer.current);
    setChrome(on);
    fadedDock.current = null;
    if (on) chromeTimer.current = window.setTimeout(() => {
      const dock = shellRef.current?.querySelector('.rd-dock');
      fadedDock.current = dock ? { at: performance.now(), rect: dock.getBoundingClientRect() } : null;
      setChrome(false);
    }, CHROME_IDLE_MS);
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !chrome) return;
    const hide = () => showChrome(false);
    el.addEventListener('scroll', hide, { passive: true, once: true });
    return () => el.removeEventListener('scroll', hide);
  }, [chrome]);
  useEffect(() => () => clearTimeout(chromeTimer.current), []);

  /**
   * Tap arbitration (README, routeTap): a tap inside a drawer is the drawer's own; otherwise an open
   * sheet or drawer closes first, a tap in the title area (down to just below the eyebrow) shows or
   * hides the top bar and capsule (even on a word — it never looks a word up). Then a sharp word or
   * droplet opens its drawer. With 聚焦模糊 on, a word outside the sharp band scrolls that line to
   * the centre and then opens. A tap that opens nothing shows or hides them on blank space or the
   * page edge, and only hides them on other text (owner request 2026-10-20).
   */
  const onTap = (e: MouseEvent) => {
    if (drawerInner(e.target)) return;
    const box = pageRef.current!.getBoundingClientRect();
    const menuH = eyebrowRef.current!.getBoundingClientRect().bottom - box.top + MENU_PAD;
    const action = routeTap({ selection: selection.has(), sheet: sheet !== null, drawer: lookup.isOpen(), y: e.clientY, pageTop: box.top, menuH });
    if (action === 'clear-selection') { selection.clear(); return; }
    if (action === 'close-sheet') { setSheet(null); return; }
    if (action === 'menu') { showChrome(!chrome); return; }
    if (action === 'drawer') {
      // Close; a tap on another word below the title area then opens it (R-05).
      lookup.onTap(e.clientX, e.clientY, e.timeStamp, e.clientY - box.top < menuH);
      return;
    }
    // A tap aimed at 目录 / Aa that lands just after the idle fade brings the capsule back instead of
    // opening the word under it (review S3).
    const faded = fadedDock.current;
    if (!chrome && faded && performance.now() - faded.at < DOCK_GRACE_MS && within(faded.rect, e.clientX, e.clientY, 8)) {
      showChrome(true);
      return;
    }
    if (lookup.onTap(e.clientX, e.clientY, e.timeStamp)) { if (chrome) showChrome(false); return; }
    // The bottom edge: the text there fades under the mask (in 夜读 the mask is off and only the margins count).
    const mask = maskBottomRef.current!.getBoundingClientRect();
    const edge = mask.height > 0 && e.clientY >= mask.top + mask.height / 2;
    if (edge || !onText(e.target, e.clientX, e.clientY)) { showChrome(!chrome); return; }
    if (chrome) showChrome(false);
  };

  const back = () => {
    void saverRef.current?.flush().then(onBack, onBack);
  };

  const vars = { '--focus-pct': prefs.focusPct, '--blur-max': `${blurMaxFor(prefs)}px` } as CSSProperties;
  return (
    <div ref={shellRef} className="rd-shell">
    <AgentDrawer db={session.db} book={book} engine={engineRef} open={agentOpen} panelRef={panelRef}
      attachment={attachment} onAttachment={setAttachment} />
    <div ref={pageRef} className={prefs.focusBlur ? 'rd-page' : 'rd-page rd-clear'} style={vars} onClick={onTap}>
      <div className="rd-column">
      <div ref={scrollRef} data-testid="reader-scroll" />
      {prefs.tier === 'fallback' && prefs.focusBlur && (
        <>
          <div className="rd-bblur rd-bblur-top" />
          <div className="rd-bblur rd-bblur-bottom" />
        </>
      )}
      <div className="rd-mask rd-mask-top" />
      <div ref={maskBottomRef} className="rd-mask rd-mask-bottom" />
      <div className="rd-vignette" />
      <div ref={eyebrowRef} className="rd-eyebrow">
        <span ref={chapterRef} className="rd-eyebrow-chapter" />
        <span ref={pctRef} className="rd-eyebrow-pct">1%</span>
      </div>
      {lookup.drawer}
      {selection.ui}
      <ReaderChrome
        visible={chrome && !sheet}
        title={book.title}
        onBack={back}
        onToc={() => { showChrome(false); setSheet('toc'); }}
        onSettings={() => { showChrome(false); setSheet('settings'); }}
      />
      {sheet && (
        <div
          className="sheet-scrim"
          data-noswipe
          onPointerDown={(e) => { scrimDown.current = { x: e.clientX, y: e.clientY }; }}
          onClick={(e) => {
            e.stopPropagation();
            const d = scrimDown.current;
            if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 8) setSheet(null); // a drag is not a tap
          }}
        />
      )}
      <SettingsSheet prefs={session.prefs} open={sheet === 'settings'} onClose={() => setSheet(null)} onExport={() => {
        const day = new Date().toISOString().slice(0, 10);
        void exportMetrics(session.db).then((text) => shareTextFile(`spotlight-log-${day}.json`, text)).catch(() => {});
      }} />
      <TocSheet
        chapters={book.chapters}
        current={chapter}
        open={sheet === 'toc'}
        onClose={() => setSheet(null)}
        onPick={(idx) => { setSheet(null); engineRef.current?.scrollToChapter(idx); }}
      />
      {probing && <p className="rd-probing">正在适配这台设备…</p>}
      {devTools && <FpsMeter engine={engineRef} />}
      {devTools && <DevPanel prefs={session.prefs} />}
      </div>
      <div ref={dimRef} className="ag-dim" />
      <div ref={shieldRef} className="ag-shield" />
    </div>
    </div>
  );
}
