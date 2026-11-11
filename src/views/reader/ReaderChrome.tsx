/**
 * ‹ 书架, the title bar and the capsule (目录 · Aa) show and hide together: a tap on blank space, the page
 * edge or the title area brings them up (owner decision 2026-11-11; ‹ 书架 used to stay on the page).
 */
export function ReaderChrome({ visible, title, onBack, onToc, onSettings }: {
  visible: boolean; title: string; onBack: () => void; onToc: () => void; onSettings: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className={visible ? 'rd-back rd-chrome-on' : 'rd-back'}
        aria-hidden={!visible}
        tabIndex={visible ? 0 : -1}
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
