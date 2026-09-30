import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { StreamPlayer } from "../components/StreamPlayer.jsx";
import { useCatalog } from "../hooks/useCatalog.js";
import { decodeEpgText } from "../utils/epgText.js";
import { imageUrl, livePlayUrl } from "../api/http.js";
import { useLibrary } from "../state/LibraryContext.jsx";
import { ChannelSkeleton } from "../components/ChannelSkeleton.jsx";
import { NowAiring } from "../components/NowAiring.jsx";
import { useLiveNowAiring } from "../hooks/useLiveNowAiring.js";
import { useProgressiveReveal } from "../hooks/useProgressiveReveal.js";
import { LiveChannelRow } from "../components/LiveChannelRow.jsx";

function PlayGlyph() {
  return (
    <svg className="play-glyph" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  );
}

export function LivePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const deepLinkHandled = useRef(false);
  const { data: categories, loading: catLoading } = useCatalog("get_live_categories");
  const { data: streams, loading: streamLoading, error } = useCatalog("get_live_streams");
  const [categoryId, setCategoryId] = useState("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selected, setSelected] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [epgFor, setEpgFor] = useState(null);
  const [isPending, startTransition] = useTransition();
  const { toggleFavorite, isFavorite } = useLibrary();

  const categoryById = useMemo(() => {
    const map = new Map();
    for (const c of categories ?? []) {
      map.set(String(c.category_id), c.category_name);
    }
    return map;
  }, [categories]);

  const filtered = useMemo(() => {
    const list = streams ?? [];
    const q = deferredQuery.trim().toLowerCase();
    return list.filter((ch) => {
      if (categoryId !== "all" && String(ch.category_id) !== String(categoryId)) return false;
      if (q && !ch.name?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [streams, categoryId, deferredQuery]);

  const { visibleItems, shown, total, isComplete } = useProgressiveReveal(filtered, {
    initial: 32,
    step: 48,
  });

  const streamIdsForGuide = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const base = (streams ?? []).filter((ch) => {
      if (categoryId !== "all" && String(ch.category_id) !== String(categoryId)) return false;
      if (q && !ch.name?.toLowerCase().includes(q)) return false;
      return true;
    });
    const ids = base.slice(0, 40).map((ch) => String(ch.stream_id ?? ch.id ?? ch.num));
    if (playing) {
      const playId = String(playing.stream_id ?? playing.id ?? playing.num ?? "");
      if (playId && !ids.includes(playId)) ids.unshift(playId);
    }
    return ids;
  }, [streams, categoryId, deferredQuery, playing]);

  const listReady = Boolean(streams);
  const { airing, loading: airingLoading } = useLiveNowAiring(streamIdsForGuide, {
    enabled: listReady && streamIdsForGuide.length > 0,
  });

  const activePlaySrc = useMemo(
    () => (playing ? livePlayUrl(playing) : null),
    [playing],
  );
  const playingChannel = playing;

  const selectedAiring = selected ? airing[String(selected.stream_id)] : null;
  const playingAiring = playing ? airing[String(playing.stream_id)] : null;
  const playingProgramTime =
    playingAiring?.startLabel && playingAiring?.endLabel
      ? `${playingAiring.startLabel} – ${playingAiring.endLabel}`
      : playingAiring?.startLabel || playingAiring?.endLabel || null;

  useEffect(() => {
    const st = location.state;
    if (!st?.liveStreamId || !streams?.length || deepLinkHandled.current) return;
    const id = String(st.liveStreamId);
    const ch = streams.find((s) => String(s.stream_id ?? s.id ?? s.num) === id);
    if (!ch) return;
    deepLinkHandled.current = true;
    setSelected(ch);
    if (st.liveQuery) setQuery(String(st.liveQuery));
    if (st.livePlay) setPlaying(ch);
    navigate(location.pathname, { replace: true, state: null });
  }, [streams, location.state, location.pathname, navigate]);

  useEffect(() => {
    deepLinkHandled.current = false;
  }, [location.key]);

  useEffect(() => {
    if (!selected && visibleItems.length > 0) {
      setSelected(visibleItems[0]);
    }
  }, [visibleItems, selected]);

  useEffect(() => {
    if (selected && !filtered.some((ch) => ch.stream_id === selected.stream_id)) {
      setSelected(filtered[0] ?? null);
    }
  }, [filtered, selected]);

  const watchChannel = useCallback((ch) => {
    if (!ch) return;
    setSelected(ch);
    setPlaying(ch);
  }, []);

  const loadEpg = useCallback(async (channel) => {
    setEpgFor({ loading: true, channel, items: [] });
    try {
      const res = await fetch(
        `/api/catalog/get_short_epg?stream_id=${encodeURIComponent(channel.stream_id)}&limit=4`,
        { credentials: "same-origin" },
      ).then((r) => r.json());
      const items = res?.epg_listings ?? res ?? [];
      setEpgFor({ loading: false, channel, items: Array.isArray(items) ? items : [] });
    } catch {
      setEpgFor({ loading: false, channel, items: [] });
    }
  }, []);

  const onCategoryChange = useCallback((id) => {
    startTransition(() => setCategoryId(id));
  }, []);

  const listLoading = streamLoading && !streams;
  const channelCount = filtered.length;
  const isFiltering = query !== deferredQuery || isPending;

  return (
    <div className={`page live-page${isFiltering ? " is-filtering" : ""}`}>
      {listLoading ? <div className="top-progress" aria-hidden /> : null}

      <header className="page-header live-header">
        <div>
          <h1>Live TV</h1>
          <p className="muted live-sub">
            Pick a channel from the list, then press <strong>Watch live</strong> — or hit the play
            button on any row.
          </p>
        </div>
        <input
          className="search-inline"
          placeholder="Search channels…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search channels"
        />
      </header>

      <section className="watch-dock" aria-label="Watch controls">
        <div className="watch-dock-preview">
          {selected?.stream_icon ? (
            <img src={imageUrl(selected.stream_icon)} alt="" className="watch-dock-logo" loading="lazy" />
          ) : (
            <div className="watch-dock-logo fallback">
              {(selected?.name || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="watch-dock-copy">
            <span className="watch-dock-label">Ready to watch</span>
            <strong className="watch-dock-title">{selected?.name ?? "Select a channel"}</strong>
            {selected ? (
              <>
                <span className="muted watch-dock-meta">
                  {categoryById.get(String(selected.category_id)) ?? "Live channel"}
                </span>
                <NowAiring info={selectedAiring} />
              </>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className="btn watch-cta"
          disabled={!selected}
          onClick={() => watchChannel(selected)}
        >
          <PlayGlyph />
          Watch live
        </button>
      </section>

      {playing && activePlaySrc ? (
        <StreamPlayer
          title={playing.name}
          programTitle={playingAiring?.title}
          programTime={playingProgramTime}
          src={activePlaySrc}
          channel={playingChannel}
          poster={imageUrl(playing.stream_icon)}
          onClose={() => setPlaying(null)}
        />
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      <div className="live-layout">
        <aside className="category-rail" aria-label="Categories">
          <p className="rail-title">Categories</p>
          {catLoading && !categories ? (
            <div className="rail-skeleton">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className="sk-chip" />
              ))}
            </div>
          ) : (
            <>
              <button
                type="button"
                className={categoryId === "all" ? "cat-btn active" : "cat-btn"}
                onClick={() => onCategoryChange("all")}
              >
                All
                <span className="cat-count">{streams?.length ?? "…"}</span>
              </button>
              {(categories ?? []).map((c) => (
                <button
                  key={c.category_id}
                  type="button"
                  className={
                    String(categoryId) === String(c.category_id) ? "cat-btn active" : "cat-btn"
                  }
                  onClick={() => onCategoryChange(String(c.category_id))}
                >
                  {c.category_name}
                </button>
              ))}
            </>
          )}
        </aside>

        <section className="channel-panel" aria-label="Channel list">
          <div className="channel-panel-head">
            <h2>Channels</h2>
            <span className="muted">
              {listLoading
                ? "Loading channel list…"
                : !isComplete
                  ? `Showing ${shown} of ${total} channels…`
                  : `${channelCount} channels`}
              {!listLoading && airingLoading ? " · loading TV guide…" : null}
              {!listLoading && !airingLoading && visibleItems.length
                ? " · on‑air times for visible rows"
                : null}
            </span>
          </div>

          {listLoading ? (
            <ChannelSkeleton rows={10} />
          ) : channelCount === 0 ? (
            <p className="empty">No channels match your search.</p>
          ) : (
            <>
              <ul className="channel-list">
                {visibleItems.map((ch) => (
                  <LiveChannelRow
                    key={ch.stream_id}
                    channel={ch}
                    categoryLabel={categoryById.get(String(ch.category_id)) ?? "Live"}
                    isSelected={selected?.stream_id === ch.stream_id}
                    isFavorite={isFavorite({
                      kind: "live",
                      stream_id: ch.stream_id,
                      name: ch.name,
                    })}
                    airing={airing[String(ch.stream_id)]}
                    onSelect={setSelected}
                    onPlay={watchChannel}
                    onGuide={loadEpg}
                    onToggleFavorite={(item) =>
                      toggleFavorite({
                        kind: "live",
                        stream_id: item.stream_id,
                        name: item.name,
                        stream_icon: item.stream_icon,
                      })
                    }
                  />
                ))}
              </ul>
              {!isComplete ? (
                <p className="list-more muted" role="status">
                  Loading more channels in the background — you can browse and play while this
                  continues.
                </p>
              ) : null}
            </>
          )}
        </section>
      </div>

      {epgFor ? (
        <div className="drawer" role="dialog">
          <div className="drawer-head">
            <h2>Guide — {epgFor.channel?.name}</h2>
            <button type="button" className="btn ghost" onClick={() => setEpgFor(null)}>
              Close
            </button>
          </div>
          {epgFor.loading ? (
            <p className="muted">Loading…</p>
          ) : epgFor.items.length === 0 ? (
            <p className="empty">No guide data for this channel.</p>
          ) : (
            <ul className="epg-list">
              {epgFor.items.map((row, i) => (
                <li key={i}>
                  <strong>{decodeEpgText(row.title) || decodeEpgText(row.name) || "Program"}</strong>
                  <span className="muted epg-time-range">{formatDrawerTime(row)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatDrawerTime(row) {
  const startTs = Number(row.start_timestamp);
  const stopTs = Number(row.stop_timestamp);
  if (startTs && stopTs) {
    const fmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
    const startMs = startTs > 1e12 ? startTs : startTs * 1000;
    const stopMs = stopTs > 1e12 ? stopTs : stopTs * 1000;
    return `${fmt.format(new Date(startMs))} – ${fmt.format(new Date(stopMs))}`;
  }
  if (row.start && row.stop) return `${row.start} – ${row.stop}`;
  return row.start || row.stop || "—";
}
