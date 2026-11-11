/** ‹ 书架 stays up. The title bar and the capsule (目录 · Aa) show and hide together.
 *  夜读 adds a play button beside the capsule; 纸白 keeps the 带读 bar. */
export function ReaderChrome({ visible, title, onBack, onToc, onSettings, guide = null }: {
  visible: boolean; title: string; onBack: () => void; onToc: () => void; onSettings: () => void;
  /** 夜读 only. The button shows and hides with the capsule. */
  guide?: { playing: boolean; onPlay: () => void; onPause: () => void } | null;
}) {
  return (
    <>
      <button
        type="button"
        className="rd-back"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); onBack(); }}
      >
        ‹ 书架
      </button>
      <header className={visible ? 'rd-top rd-chrome-on' : 'rd-top'} aria-hidden={!visible} onClick={(e) => e.stopPropagation()}>
        <span className="rd-top-pad" />
        <h1 className="rd-title">{title}</h1>
        <span className="rd-top-pad" />
      </header>
      <div className="rd-dock" onClick={(e) => e.stopPropagation()}>
        {guide && (
          <button
            type="button"
            className={visible ? 'rd-guide rd-chrome-on' : 'rd-guide'}
            data-noswipe=""
            aria-label={guide.playing ? '暂停带读' : '开始带读'}
            aria-pressed={guide.playing}
            aria-hidden={!visible}
            tabIndex={visible ? 0 : -1}
            onClick={guide.playing ? guide.onPause : guide.onPlay}
          >
            {guide.playing ? (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2" width="2.6" height="8" rx=".8" fill="currentColor" /><rect x="6.9" y="2" width="2.6" height="8" rx=".8" fill="currentColor" /></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 2.2v7.6a.6.6 0 0 0 .9.5l6-3.8a.6.6 0 0 0 0-1L4.4 1.7a.6.6 0 0 0-.9.5z" fill="currentColor" /></svg>
            )}
          </button>
        )}
        <nav className={visible ? 'rd-capsule rd-chrome-on' : 'rd-capsule'} aria-hidden={!visible}>
          <button type="button" onClick={onToc} tabIndex={visible ? 0 : -1} aria-label="目录">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 4.5h9M6 9h9M6 13.5h9" /><circle cx="2.8" cy="4.5" r=".6" fill="currentColor" /><circle cx="2.8" cy="9" r=".6" fill="currentColor" /><circle cx="2.8" cy="13.5" r=".6" fill="currentColor" />
            </svg>
            <span>目录</span>
          </button>
          <i className="rd-capsule-rule" />
          <button type="button" onClick={onSettings} tabIndex={visible ? 0 : -1} aria-label="阅读设置">
            <span className="rd-aa">Aa</span>
          </button>
        </nav>
      </div>
    </>
  );
}
