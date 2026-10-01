import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCatalog } from "../hooks/useCatalog.js";
import { useLibrary } from "../state/LibraryContext.jsx";
import { displayCategoryName } from "../utils/liveCategoryLayout.js";
import { useLiveNowAiring } from "../hooks/useLiveNowAiring.js";
import { imageUrl, livePlayUrl, playUrl } from "../api/http.js";
import { StreamPlayer } from "../components/StreamPlayer.jsx";
import { NowAiring } from "../components/NowAiring.jsx";

function PlayGlyph() {
  return (
    <svg className="play-glyph" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  );
}

function SearchLogo({ icon, name }) {
  const [broken, setBroken] = useState(false);
  const src = imageUrl(icon);
  if (!src || broken) {
    return (
      <span className="search-hit-logo fallback">{name?.slice(0, 1)?.toUpperCase() || "?"}</span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="search-hit-logo"
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

function liveFavoriteItem(ch) {
  return {
    kind: "live",
    stream_id: ch.stream_id,
    name: ch.name,
    stream_icon: ch.stream_icon,
  };
}

export function SearchPage() {
  const navigate = useNavigate();
  const { data: live } = useCatalog("get_live_streams");
  const { data: liveCategoryList } = useCatalog("get_live_categories");
  const { data: movies } = useCatalog("get_vod_streams");
  const { data: series } = useCatalog("get_series");
  const { toggleFavorite, isFavorite, liveCategories: liveCategoryLayout } = useLibrary();
  const [q, setQ] = useState("");
  const [playingLive, setPlayingLive] = useState(null);
  const [playingMovie, setPlayingMovie] = useState(null);

  const categoryById = useMemo(() => {
    const map = new Map();
    const labels = liveCategoryLayout?.labels ?? {};
    for (const c of liveCategoryList ?? []) {
      map.set(String(c.category_id), displayCategoryName(c, labels));
    }
    return map;
  }, [liveCategoryList, liveCategoryLayout]);

  const needle = q.trim().toLowerCase();

  const liveHits = useMemo(() => {
    if (!needle) return [];
    return (live ?? [])
      .filter((ch) => ch.name?.toLowerCase().includes(needle))
      .slice(0, 20);
  }, [needle, live]);

  const movieHits = useMemo(() => {
    if (!needle) return [];
    return (movies ?? [])
      .filter((m) => m.name?.toLowerCase().includes(needle))
      .slice(0, 16);
  }, [needle, movies]);

  const seriesHits = useMemo(() => {
    if (!needle) return [];
    return (series ?? [])
      .filter((s) => s.name?.toLowerCase().includes(needle))
      .slice(0, 16);
  }, [needle, series]);

  const liveIds = useMemo(
    () => liveHits.map((ch) => String(ch.stream_id ?? ch.id ?? ch.num)),
    [liveHits],
  );

  const { airing } = useLiveNowAiring(liveIds, {
    enabled: liveIds.length > 0,
  });

  const playingLiveAiring = playingLive ? airing[String(playingLive.stream_id)] : null;
  const playingLiveProgramTime =
    playingLiveAiring?.startLabel && playingLiveAiring?.endLabel
      ? `${playingLiveAiring.startLabel} – ${playingLiveAiring.endLabel}`
      : playingLiveAiring?.startLabel || playingLiveAiring?.endLabel || null;

  const totalHits = liveHits.length + movieHits.length + seriesHits.length;

  function openInLiveGuide(ch, play = false) {
    navigate("/live", {
      state: {
        liveStreamId: ch.stream_id,
        liveQuery: ch.name,
        livePlay: play,
      },
    });
  }

  return (
    <div className="page search-page">
      <header className="page-header search-page-header">
        <div>
          <h1>Search</h1>
          <p className="muted search-page-lead">
            Find a channel, movie, or series. Live results can play here or open in the TV guide.
          </p>
        </div>
        <input
          className="search-inline wide"
          autoFocus
          placeholder="Search channels, movies, series… (⌘K)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search catalog"
        />
      </header>

      {!needle ? (
        <div className="search-empty-state panel">
          <p className="search-empty-title">Start typing to search</p>
          <p className="muted">
            Try a channel name, movie title, or show. Use <kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd> from
            anywhere to jump here.
          </p>
        </div>
      ) : null}

      {needle && totalHits === 0 ? (
        <p className="empty">No matches for “{q.trim()}”.</p>
      ) : null}

      {liveHits.length > 0 ? (
        <section className="search-section" aria-labelledby="search-live-heading">
          <div className="search-section-head">
            <h2 id="search-live-heading">Live TV</h2>
            <span className="search-section-count">{liveHits.length} found</span>
          </div>
          <ul className="search-hit-list">
            {liveHits.map((ch) => {
              const fav = liveFavoriteItem(ch);
              const favOn = isFavorite(fav);
              return (
                <li key={`live-${ch.stream_id}`} className="search-hit-card search-hit-live">
                  <SearchLogo icon={ch.stream_icon} name={ch.name} />
                  <div className="search-hit-body">
                    <p className="search-hit-title">{ch.name}</p>
                    <p className="muted search-hit-meta">
                      {categoryById.get(String(ch.category_id)) ?? "Live channel"}
                    </p>
                    <NowAiring info={airing[String(ch.stream_id)]} compact />
                  </div>
                  <div className="search-hit-actions">
                    <button
                      type="button"
                      className="btn search-btn-watch"
                      onClick={() => setPlayingLive(ch)}
                    >
                      <PlayGlyph />
                      Watch live
                    </button>
                    <button
                      type="button"
                      className={favOn ? "btn-icon fav on" : "btn-icon fav"}
                      onClick={() => toggleFavorite(fav)}
                      title={favOn ? "Remove from favorites" : "Add to favorites"}
                      aria-pressed={favOn}
                      aria-label={favOn ? "Remove favorite" : "Add favorite"}
                    >
                      ★
                    </button>
                    <button
                      type="button"
                      className="btn ghost search-btn-guide"
                      onClick={() => openInLiveGuide(ch, false)}
                    >
                      TV guide
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {movieHits.length > 0 ? (
        <section className="search-section" aria-labelledby="search-movies-heading">
          <div className="search-section-head">
            <h2 id="search-movies-heading">Movies</h2>
            <span className="search-section-count">{movieHits.length} found</span>
          </div>
          <ul className="search-hit-list">
            {movieHits.map((m) => {
              const fav = {
                kind: "movie",
                stream_id: m.stream_id,
                name: m.name,
                stream_icon: m.stream_icon,
              };
              const favOn = isFavorite(fav);
              return (
                <li key={`movie-${m.stream_id}`} className="search-hit-card">
                  <SearchLogo icon={m.stream_icon} name={m.name} />
                  <div className="search-hit-body">
                    <p className="search-hit-title">{m.name}</p>
                    <p className="muted search-hit-meta">Movie</p>
                  </div>
                  <div className="search-hit-actions">
                    <button
                      type="button"
                      className="btn search-btn-watch"
                      onClick={() => setPlayingMovie(m)}
                    >
                      <PlayGlyph />
                      Play
                    </button>
                    <button
                      type="button"
                      className={favOn ? "btn-icon fav on" : "btn-icon fav"}
                      onClick={() => toggleFavorite(fav)}
                      aria-pressed={favOn}
                      title={favOn ? "Remove from favorites" : "Add to favorites"}
                    >
                      ★
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {seriesHits.length > 0 ? (
        <section className="search-section" aria-labelledby="search-series-heading">
          <div className="search-section-head">
            <h2 id="search-series-heading">Series</h2>
            <span className="search-section-count">{seriesHits.length} found</span>
          </div>
          <ul className="search-hit-list">
            {seriesHits.map((s) => {
              const fav = {
                kind: "series",
                series_id: s.series_id,
                name: s.name,
                stream_icon: s.cover,
              };
              const favOn = isFavorite(fav);
              return (
                <li key={`series-${s.series_id}`} className="search-hit-card">
                  <SearchLogo icon={s.cover} name={s.name} />
                  <div className="search-hit-body">
                    <p className="search-hit-title">{s.name}</p>
                    <p className="muted search-hit-meta">Series</p>
                  </div>
                  <div className="search-hit-actions">
                    <Link className="btn search-btn-watch" to={`/series/${s.series_id}`}>
                      Open show
                    </Link>
                    <button
                      type="button"
                      className={favOn ? "btn-icon fav on" : "btn-icon fav"}
                      onClick={() => toggleFavorite(fav)}
                      aria-pressed={favOn}
                      title={favOn ? "Remove from favorites" : "Add to favorites"}
                    >
                      ★
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {playingLive && livePlayUrl(playingLive) ? (
        <StreamPlayer
          title={playingLive.name}
          programTitle={playingLiveAiring?.title}
          programTime={playingLiveProgramTime}
          src={livePlayUrl(playingLive)}
          channel={playingLive}
          poster={imageUrl(playingLive.stream_icon)}
          onClose={() => setPlayingLive(null)}
        />
      ) : null}

      {playingMovie ? (
        <StreamPlayer
          title={playingMovie.name}
          src={playUrl("movie", playingMovie.stream_id, playingMovie.container_extension)}
          poster={imageUrl(playingMovie.stream_icon)}
          onClose={() => setPlayingMovie(null)}
        />
      ) : null}
    </div>
  );
}
