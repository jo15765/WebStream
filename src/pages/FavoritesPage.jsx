import { useState } from "react";
import { useLibrary } from "../state/LibraryContext.jsx";
import { playUrl } from "../api/http.js";
import { StreamPlayer } from "../components/StreamPlayer.jsx";
import { Link } from "react-router-dom";

export function FavoritesPage() {
  const { favorites, toggleFavorite } = useLibrary();
  const [playing, setPlaying] = useState(null);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Favorites</h1>
        <p className="muted">Stored in this browser only.</p>
      </header>

      {playing ? (
        <StreamPlayer
          title={playing.name}
          src={
            playing.kind === "series"
              ? null
              : playUrl(
                  playing.kind,
                  playing.stream_id,
                  playing.container_extension || "m3u8",
                )
          }
          onClose={() => setPlaying(null)}
        />
      ) : null}

      {favorites.length === 0 ? (
        <p className="empty">Star channels or titles while browsing to save them here.</p>
      ) : (
        <ul className="fav-list">
          {favorites.map((item) => (
            <li key={`${item.kind}:${item.stream_id ?? item.series_id}`}>
              <div>
                <strong>{item.name}</strong>
                <span className="muted"> · {item.kind}</span>
              </div>
              <div className="row-actions">
                {item.kind === "series" ? (
                  <Link to={`/series/${item.series_id}`} className="btn tiny">
                    Open
                  </Link>
                ) : (
                  <button type="button" className="btn tiny" onClick={() => setPlaying(item)}>
                    Play
                  </button>
                )}
                <button type="button" className="btn tiny" onClick={() => toggleFavorite(item)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
