import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCatalog } from "../hooks/useCatalog.js";
import { usePaginatedList } from "../hooks/usePaginatedList.js";
import { MediaPoster } from "../components/MediaPoster.jsx";
import { CatalogPagination } from "../components/CatalogPagination.jsx";
import { useLibrary } from "../state/LibraryContext.jsx";

export function SeriesPage() {
  const { data: categories } = useCatalog("get_series_categories");
  const { data: series, loading } = useCatalog("get_series");
  const [categoryId, setCategoryId] = useState("all");
  const [query, setQuery] = useState("");
  const { toggleFavorite } = useLibrary();
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    let list = [...(series ?? [])];
    if (categoryId !== "all") {
      list = list.filter((s) => String(s.category_id) === String(categoryId));
    }
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((s) => s.name?.toLowerCase().includes(q));
    }
    list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return list;
  }, [series, categoryId, query]);

  const paginationKey = `${categoryId}|${query}`;
  const { slice, total, pageSize, pageIndex, pageCount, goToPage } = usePaginatedList(
    filtered,
    undefined,
    paginationKey,
  );

  return (
    <div className="page">
      <header className="page-header split">
        <div>
          <h1>Series</h1>
          <p className="muted">{total} shows</p>
        </div>
        <div className="toolbar">
          <input
            className="search-inline"
            placeholder="Search series…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
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

      {loading ? <p className="muted">Loading series…</p> : null}
      <div className="media-grid">
        {slice.map((show) => (
          <MediaPoster
            key={show.series_id}
            title={show.name}
            subtitle={show.releaseDate || show.last_modified}
            src={show.cover}
            onClick={() => navigate(`/series/${show.series_id}`)}
            favoriteAction={() =>
              toggleFavorite({
                kind: "series",
                series_id: show.series_id,
                name: show.name,
                stream_icon: show.cover,
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
