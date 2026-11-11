import type { Tier } from '../prefs/prefs.ts';
import type { ReaderEngine } from './engine.ts';

export interface ProbeResult {
  frames: number; dropped: number; ratio: number; avgPaintMs: number;
  /** False when the time budget ran out before all frames were measured: the device is too slow for full blur. */
  complete?: boolean;
}

export function summarise(frameDeltas: number[], paintMs: number[]): ProbeResult {
  const sorted = [...frameDeltas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 16.7;
  const dropped = frameDeltas.filter((d) => d > median * 1.5).length;
  return {
    frames: frameDeltas.length,
    dropped,
    ratio: frameDeltas.length ? dropped / frameDeltas.length : 1,
    avgPaintMs: paintMs.length ? paintMs.reduce((a, b) => a + b, 0) / paintMs.length : 0,
  };
}

export function decideTier(r: ProbeResult): Tier {
  if (r.complete === false) return 'fallback';
  return r.ratio < 0.02 && r.avgPaintMs <= 4 ? 'full' : 'fallback';
}

/**
 * First-launch probe: scrolls the real reader for `frames` frames with full blur and measures. It stops
 * after `budgetMs` either way: a device that cannot draw 120 frames in 4 s (under ~30 fps) gets the
 * fallback tier at once, instead of the reader waiting on 正在适配这台设备… for half a minute.
 */
export function runProbe(engine: Pick<ReaderEngine, 'scroller' | 'paintNow' | 'stats'>, frames = 120, warmup = 10, budgetMs = 4000): Promise<ProbeResult> {
  const el = engine.scroller;
  const start = el.scrollTop;
  const deltas: number[] = [];
  const paint: number[] = [];
  let dir = 1;
  let last = 0;
  let n = 0;
  const t0 = performance.now();
  return new Promise((resolve) => {
    const step = (ts: number): void => {
      if (last && n > warmup) deltas.push(ts - last);
      last = ts;
      n++;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) dir = -1;
      if (el.scrollTop <= 0) dir = 1;
      el.scrollTop += 6 * dir;
      engine.paintNow();
      if (n > warmup) paint.push(engine.stats.lastPaintMs);
      const outOfTime = performance.now() - t0 > budgetMs;
      if (deltas.length < frames && !outOfTime) {
        requestAnimationFrame(step);
      } else {
        el.scrollTop = start;
        engine.paintNow();
        resolve({ ...summarise(deltas, paint), complete: deltas.length >= frames });
      }
    };
    requestAnimationFrame(step);
  });
}
