import { Link } from "react-router-dom";
import { useLibrary } from "../state/LibraryContext.jsx";
import { playUrl } from "../api/http.js";
import { StreamPlayer } from "../components/StreamPlayer.jsx";
import { useState } from "react";

export function HomePage() {
  const { continueWatching } = useLibrary();
  const [active, setActive] = useState(null);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Home</h1>
        <p className="muted">Pick up where you left off or jump into Live TV.</p>
      </header>

      {active ? (
        <StreamPlayer
          title={active.label}
          src={playUrl(active.kind, active.streamId)}
          onClose={() => setActive(null)}
          initialTime={active.positionSec}
          onProgress={() => {}}
        />
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h2>Continue watching</h2>
          <Link to="/movies" className="text-link">
            Browse movies
          </Link>
        </div>
        {continueWatching.length === 0 ? (
          <p className="empty">Nothing in progress yet. Start a movie or series episode.</p>
        ) : (
          <div className="chip-row">
            {continueWatching.map((item) => (
              <button
                key={item.key}
                type="button"
                className="resume-chip"
                onClick={() => setActive(item)}
              >
                <span className="resume-title">{item.label}</span>
                <span className="muted">
                  {Math.round((item.positionSec / item.durationSec) * 100)}% watched
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="quick-grid">
        <Link to="/live" className="quick-tile live">
          <strong>Live TV</strong>
          <span>Channels & guide</span>
        </Link>
        <Link to="/movies" className="quick-tile movies">
          <strong>Movies</strong>
          <span>On-demand library</span>
        </Link>
        <Link to="/series" className="quick-tile series">
          <strong>Series</strong>
          <span>Seasons & episodes</span>
        </Link>
      </section>
    </div>
  );
}
