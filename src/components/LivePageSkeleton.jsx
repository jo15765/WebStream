import { ChannelSkeleton } from "./ChannelSkeleton.jsx";

export function LivePageSkeleton() {
  return (
    <div className="page live-page" aria-busy="true" aria-label="Loading Live TV">
      <header className="page-header live-header">
        <div>
          <h1>Live TV</h1>
          <p className="muted live-sub">Loading your channel list…</p>
        </div>
        <div className="search-inline sk-line w80 sk-block" />
      </header>

      <section className="watch-dock watch-dock-skeleton">
        <div className="watch-dock-preview">
          <span className="watch-dock-logo fallback sk-pulse" />
          <div className="watch-dock-copy">
            <span className="sk-line w40 sk-block" />
            <span className="sk-line w80 sk-block" />
          </div>
        </div>
        <span className="sk-pill wide sk-block" />
      </section>

      <div className="live-layout">
        <aside className="category-rail">
          <p className="rail-title">Categories</p>
          <div className="rail-skeleton">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className="sk-chip" />
            ))}
          </div>
        </aside>
        <section className="channel-panel">
          <div className="channel-panel-head">
            <h2>Channels</h2>
            <span className="muted">Preparing guide…</span>
          </div>
          <ChannelSkeleton rows={10} />
        </section>
      </div>
    </div>
  );
}
