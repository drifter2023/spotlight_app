import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '../../app/boot.ts';
import { deleteSession, listAllSessions } from '../../core/agent/store.ts';
import type { SessionListItem } from '../../core/agent/types.ts';
import { FAILURE, NO_RETRY } from '../../core/ai/failure.ts';
import { getKey } from '../../core/ai/key.ts';
import { MOTION } from '../../core/motion.ts';
import { deleteItem, getAuto, listEntries, markRead, pending, setAuto, type Auto } from '../../core/notes/store.ts';
import type { NoteEntry, NoteItem, Pending, RunState } from '../../core/notes/types.ts';
import { Confirm } from '../Confirm.tsx';
import { AiKeyCard } from '../home/AiKeyCard.tsx';
import { Conversations } from './Conversations.tsx';
import { Journal, notesFailure } from './Journal.tsx';

export type NotesView = 'notes' | 'conversations';

interface Data {
  entries: NoteEntry[]; pending: Pending[]; conversations: SessionListItem[]; auto: Auto; hasKey: boolean;
}

const KEY_TITLE = '整理札记需要 DeepSeek Key';

/**
 * The 札记 page (docs/plans/2026-11-11-zhaji.md §3.4): a full-screen layer over Home with two views,
 * 札记 (the journal) and 对话 (every conversation). Each view keeps its own scroll.
 */
export function NotesPage({ session, onClose, onOpenConversation, focusEntry, now: fixedNow, initialView }: {
  session: Session;
  onClose: () => void;
  /** A 对话 row was tapped: open that book with the Agent drawer on this conversation (Z-11). */
  onOpenConversation: (item: SessionListItem, el: HTMLElement) => void;
  /** Open at this entry (the Home line's unread one). */
  focusEntry?: number | undefined;
  /** Stories and tests: a fixed clock. */
  now?: number;
  /** Which view to open on; by default 札记, or 对话 when there is nothing to show or make there. */
  initialView?: NotesView;
}) {
  const { db, notes } = session;
  const [data, setData] = useState<Data | null>(null);
  const [view, setView] = useState<NotesView | null>(initialView ?? null);
  const [run, setRun] = useState<RunState>(notes.state);
  const [firstRun, setFirstRun] = useState(false);
  const [swipedNote, setSwipedNote] = useState<number | null>(null);
  const [swipedConv, setSwipedConv] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ note: NoteItem } | { conv: SessionListItem } | null>(null);
  const [closing, setClosing] = useState(false);
  const journalRef = useRef<HTMLDivElement>(null);
  const now = fixedNow ?? Date.now();

  const load = useCallback(async () => {
    const t = fixedNow ?? Date.now();
    const [entries, pend, conversations, auto, key] = await Promise.all([
      listEntries(db), pending(db, t), listAllSessions(db), getAuto(db), getKey(db),
    ]);
    setData({ entries, pending: pend, conversations, auto, hasKey: key !== null });
    setView((v) => v ?? (entries.length || pend.length || !key ? 'notes' : 'conversations'));
  }, [db, fixedNow]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => notes.subscribe((s) => {
    setRun(s);
    if (s.status !== 'running') {
      if (notes.takeOptedIn()) setFirstRun(true);
      void load();
    }
  }), [notes, load]);
  useEffect(() => { if (notes.takeOptedIn()) setFirstRun(true); }, [notes]);

  // The journal has been seen: its entries are read, so the Home line returns to 札记 (Z-10).
  const seen = view === 'notes' && data !== null && data.entries.some((e) => e.readAt === null);
  useEffect(() => { if (seen) void markRead(db); }, [seen, db]);

  // Opened from the Home line's unread entry: start there.
  const focused = useRef(false);
  useEffect(() => {
    if (focused.current || !data || view !== 'notes' || focusEntry === undefined) return;
    focused.current = true;
    const el = journalRef.current?.querySelector<HTMLElement>(`[data-entry-id="${focusEntry}"]`);
    const day = el?.closest<HTMLElement>('.notes-day');
    if (day && journalRef.current) journalRef.current.scrollTop = day.offsetTop - journalRef.current.offsetTop;
  }, [data, view, focusEntry]);

  const close = () => {
    setClosing(true);
    window.setTimeout(onClose, MOTION.chrome);
  };
  const runNow = () => void notes.run();

  if (!data || !view) return <div className="notes" />;
  const keyProblem = run.status === 'error' && !run.auto && (run.reason === 'no-key' || run.reason === 'invalid-key');
  const empty = data.entries.length === 0;
  const running = run.status === 'running';

  return (
    <div className="notes" data-closing={closing || undefined} role="dialog" aria-label="札记" onClick={() => { setSwipedNote(null); setSwipedConv(null); }}>
      <div className="notes-top">
        <button type="button" className="notes-back" onClick={close}>‹ 书架</button>
        <div className="filter" role="tablist">
          {([['notes', '札记'], ['conversations', '对话']] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}>{label}</button>
          ))}
        </div>
      </div>

      <div ref={journalRef} className="notes-view" role="tabpanel" aria-label="札记" hidden={view !== 'notes'}>
        {keyProblem || (empty && !data.hasKey && data.conversations.length > 0) ? (
          <>
            <p className="notes-copy">{keyProblem ? FAILURE[run.reason] : '把和旁注聊过的内容整理成几条札记，第二天打开就能重温。'}</p>
            <AiKeyCard db={db} place="inline" title={KEY_TITLE} initiallyEditing={run.status === 'error' && run.reason === 'invalid-key'} onSaved={runNow} />
          </>
        ) : null}
        {empty && data.conversations.length === 0 && <p className="notes-copy">还没有札记。读书时向左滑，问旁注一个问题。</p>}
        {empty && data.conversations.length > 0 && data.hasKey && !keyProblem && (
          <>
            <p className="notes-copy">把和旁注聊过的内容整理成几条札记，第二天打开就能重温。</p>
            {running ? (
              <div className="notes-state" role="status">正在整理…<span className="notes-dots" aria-hidden="true"><i /><i /><i /></span></div>
            ) : run.status === 'error' && !run.auto ? (
              <div className="notes-state" data-tone="error" role="alert">
                <span>没有整理成：{notesFailure(run.reason)}</span>
                {!NO_RETRY.has(run.reason) && <button type="button" className="notes-action" onClick={runNow}>重试</button>}
              </div>
            ) : data.pending.length > 0 && <button type="button" className="notes-action" onClick={runNow}>整理</button>}
          </>
        )}
        {!empty && (
          <Journal
            db={db} entries={data.entries} pending={data.pending} run={run} now={now} firstRun={firstRun}
            swiped={swipedNote} onSwipe={setSwipedNote} onDelete={(note) => setConfirm({ note })} onRun={runNow}
          />
        )}
        {data.auto !== null && (
          <div className="notes-auto">
            <label className="notes-auto-row">
              <span>自动整理</span>
              <input type="checkbox" role="switch" className="notes-switch" aria-label="自动整理" checked={data.auto === 'on'}
                onChange={(e) => { const v = e.target.checked ? 'on' : 'off'; setData((d) => d && { ...d, auto: v }); void setAuto(db, v); }} />
            </label>
            <p>打开首页时，整理前一天的对话。</p>
            <p>整理时，当天的问答会发给 DeepSeek，用你自己的 Key；札记只保存在这台设备上。</p>
          </div>
        )}
      </div>

      <div className="notes-view" role="tabpanel" aria-label="对话" hidden={view !== 'conversations'}>
        <Conversations
          items={data.conversations} swiped={swipedConv} onSwipe={setSwipedConv} now={now}
          onOpen={onOpenConversation} onDelete={(conv) => setConfirm({ conv })}
        />
      </div>

      {confirm && (
        <Confirm
          title={'note' in confirm ? '删除这条札记？' : '删除这段对话？'}
          body={'note' in confirm ? '对话不会被删除。' : '由它整理出的札记也会删除。'}
          action="删除"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const c = confirm;
            setConfirm(null);
            setSwipedNote(null);
            setSwipedConv(null);
            void ('note' in c ? deleteItem(db, c.note.id) : deleteSession(db, c.conv.id)).then(load);
          }}
        />
      )}
    </div>
  );
}
