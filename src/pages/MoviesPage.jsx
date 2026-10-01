import { useMemo, useState } from "react";
import { useCatalog } from "../hooks/useCatalog.js";
import { usePaginatedList } from "../hooks/usePaginatedList.js";
import { MediaPoster } from "../components/MediaPoster.jsx";
import { StreamPlayer } from "../components/StreamPlayer.jsx";
import { CatalogPagination } from "../components/CatalogPagination.jsx";
import { playUrl } from "../api/http.js";
import { useLibrary } from "../state/LibraryContext.jsx";

export function MoviesPage() {
  const { data: categories } = useCatalog("get_vod_categories");
  const { data: movies, loading } = useCatalog("get_vod_streams");
  const [categoryId, setCategoryId] = useState("all");
  const [sort, setSort] = useState("name");
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState(null);
  const { toggleFavorite, isFavorite, saveProgress, getProgress } = useLibrary();

  const filtered = useMemo(() => {
    let list = [...(movies ?? [])];
    if (categoryId !== "all") {
      list = list.filter((m) => String(m.category_id) === String(categoryId));
    }
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((m) => m.name?.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      if (sort === "rating") return (Number(b.rating) || 0) - (Number(a.rating) || 0);
      return (a.name || "").localeCompare(b.name || "");
    });
    return list;
  }, [movies, categoryId, query, sort]);

  const paginationKey = `${categoryId}|${query}|${sort}`;
  const { slice, total, pageSize, pageIndex, pageCount, goToPage } = usePaginatedList(
    filtered,
    undefined,
    paginationKey,
  );

  return (
    <div className="page">
      <header className="page-header split">
        <div>
          <h1>Movies</h1>
          <p className="muted">{total} titles</p>
        </div>
        <div className="toolbar">
          <input
            className="search-inline"
            placeholder="Search movies…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">Name</option>
            <option value="rating">Rating</option>
          </select>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="all">All categories</option>
            {(categories ?? []).map((c) => (
              <option key={c.category_id} value={c.category_id}>
                {c.category_name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {playing ? (
        <StreamPlayer
          title={playing.name}
          src={playUrl("movie", playing.stream_id, playing.container_extension || "mp4")}
          poster={playing.stream_icon}
          initialTime={getProgress({ kind: "movie", stream_id: playing.stream_id })?.positionSec}
          onClose={() => setPlaying(null)}
          onProgress={(pos, dur) =>
            saveProgress({ kind: "movie", stream_id: playing.stream_id, name: playing.name, stream_icon: playing.stream_icon }, pos, dur)
          }
        />
      ) : null}

      {loading ? <p className="muted">Loading library…</p> : null}
      <div className="media-grid">
        {slice.map((movie) => (
          <MediaPoster
            key={movie.stream_id}
            title={movie.name}
            subtitle={movie.rating ? `★ ${movie.rating}` : undefined}
            src={movie.stream_icon}
            onClick={() => setPlaying(movie)}
            favoriteAction={() =>
              toggleFavorite({
                kind: "movie",
                stream_id: movie.stream_id,
                name: movie.name,
                stream_icon: movie.stream_icon,
              })
            }
          />
        ))}
      </div>

      <CatalogPagination
        pageCount={pageCount}
        pageIndex={pageIndex}
        pageSize={pageSize}
        total={total}
        onPageChange={goToPage}
      />
    </div>
  );
}
