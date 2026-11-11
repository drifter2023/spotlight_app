import { useEffect, useState } from 'react';
import { checkKey } from '../../core/ai/deepseek.ts';
import { clearKey, getKey, maskKey, setKey } from '../../core/ai/key.ts';
import type { Db } from '../../core/db/types.ts';

type Note = { tone: 'error' | 'quiet'; text: string } | null;

/**
 * The DeepSeek API key used by the grammar drawer, the Agent drawer and 札记 (G-01).
 * Saved only after `checkKey` (`GET /models`) accepts it. `place` is where it sits:
 * the paper card, inline in the Agent drawer, or on the grammar drawer's leather.
 */
export function AiKeyCard({ db, onSaved, place = 'card', initiallyEditing = false, title = 'AI 语法分析' }: {
  db: Db;
  /** After a key has been checked and stored. */
  onSaved?: () => void;
  place?: 'card' | 'inline' | 'leather';
  /** Names the feature that asked for the key, e.g. 「旁注需要 DeepSeek Key」 (review S11). */
  title?: string;
  /** Open the field immediately, even when a key is already stored (replacing an invalid one). */
  initiallyEditing?: boolean;
}) {
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [editing, setEditing] = useState(initiallyEditing);
  const [draft, setDraft] = useState('');
  const [shown, setShown] = useState(false);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<Note>(null);

  useEffect(() => { void getKey(db).then(setSaved); }, [db]);
  if (saved === undefined) return null;
  const open = editing || !saved;

  const confirm = async () => {
    const key = draft.trim();
    if (!key) { setNote({ tone: 'error', text: '请先填写 API Key' }); return; }
    setChecking(true);
    setNote({ tone: 'quiet', text: '正在验证…' });
    const r = await checkKey(key);
    setChecking(false);
    if (r === 'invalid') { setNote({ tone: 'error', text: 'Key 无效，请检查后重新填写' }); return; }
    if (r === 'network') { setNote({ tone: 'error', text: '连不上 DeepSeek，请检查网络后再试' }); return; }
    await setKey(db, key);
    setSaved(key);
    setDraft('');
    setShown(false);
    setEditing(false);
    setNote(null);
    onSaved?.();
  };

  const clear = async () => {
    await clearKey(db);
    setSaved(null);
    setEditing(false);
    setNote(null);
  };

  return (
    <section className="ai-card" data-place={place} aria-label={title}>
      <div className="ai-head">
        <span className="eyebrow">{title}</span>
        <span className="ai-status" data-state={saved ? 'on' : 'off'}>{saved ? `已连接 ${maskKey(saved)}` : '未设置'}</span>
      </div>
      {open ? (
        <form className="ai-form" onSubmit={(e) => { e.preventDefault(); if (!checking) void confirm(); }}>
          <div className="ai-field">
            <input
              type={shown ? 'text' : 'password'}
              value={draft}
              onChange={(e) => { setDraft(e.target.value); if (note?.tone === 'error') setNote(null); }}
              placeholder="DeepSeek API Key（sk-…）"
              aria-label="DeepSeek API Key"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <button type="button" className="ai-eye" onClick={() => setShown((s) => !s)}>{shown ? '隐藏' : '显示'}</button>
          </div>
          <div className="ai-actions">
            {saved && <button type="button" className="ai-link" onClick={() => { setEditing(false); setDraft(''); setNote(null); }}>取消</button>}
            <button type="submit" className="ai-primary" disabled={checking}>确认</button>
          </div>
        </form>
      ) : (
        <div className="ai-actions">
          <button type="button" className="ai-link" onClick={() => setEditing(true)}>更换</button>
          <button type="button" className="ai-link" onClick={() => void clear()}>清除</button>
        </div>
      )}
      {note && <p className={note.tone === 'error' ? 'ai-note ai-note-error' : 'ai-note'} role="status">{note.text}</p>}
      <p className="ai-fine">语法分析、旁注提问和札记整理会把内容发给 DeepSeek。Key 只保存在这台设备上。</p>
    </section>
  );
}
