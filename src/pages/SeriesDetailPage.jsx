import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { catalog, playUrl, imageUrl } from "../api/http.js";
import { StreamPlayer } from "../components/StreamPlayer.jsx";
import { useLibrary } from "../state/LibraryContext.jsx";

export function SeriesDetailPage() {
  const { seriesId } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(null);
  const { saveProgress, getProgress } = useLibrary();

  useEffect(() => {
    let cancelled = false;
    catalog("get_series_info", { series_id: seriesId })
      .then((res) => {
        if (!cancelled) setInfo(res);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [seriesId]);

  if (error) return <p className="form-error">{error}</p>;
  if (!info) return <p className="muted">Loading show…</p>;

  const seasons = info.episodes ? Object.keys(info.episodes).sort((a, b) => Number(a) - Number(b)) : [];

  return (
    <div className="page">
      <Link to="/series" className="text-link">
        ← Back to series
      </Link>
      <header className="detail-hero">
        {info.info?.cover ? (
          <img className="detail-cover" src={imageUrl(info.info.cover)} alt="" />
        ) : null}
        <div>
          <h1>{info.info?.name || "Series"}</h1>
          <p className="muted">{info.info?.plot}</p>
        </div>
      </header>

      {playing ? (
        <StreamPlayer
          title={playing.title}
          src={playUrl("series", playing.id, playing.container_extension || "mp4")}
          initialTime={
            getProgress({
              kind: "series",
              stream_id: playing.id,
              name: playing.title,
            })?.positionSec
          }
          onClose={() => setPlaying(null)}
          onProgress={(pos, dur) =>
            saveProgress(
              { kind: "series", stream_id: playing.id, name: playing.title },
              pos,
              dur,
            )
          }
        />
      ) : null}

      {seasons.map((seasonNum) => (
        <section key={seasonNum} className="panel">
          <h2>Season {seasonNum}</h2>
          <ul className="episode-list">
            {(info.episodes[seasonNum] ?? []).map((ep) => (
              <li key={ep.id}>
                <button
                  type="button"
                  className="episode-btn"
                  onClick={() =>
                    setPlaying({
                      id: ep.id,
                      title: `${info.info?.name} — S${seasonNum}E${ep.episode_num}`,
                      container_extension: ep.container_extension,
                    })
                  }
                >
                  <span className="ep-num">E{ep.episode_num}</span>
                  <span>{ep.title || `Episode ${ep.episode_num}`}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
