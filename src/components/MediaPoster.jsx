import { imageUrl } from "../api/http.js";

export function MediaPoster({ src, title, subtitle, onClick, badge, favoriteAction }) {
  const img = imageUrl(src);
  return (
    <article className="media-card">
      <button type="button" className="media-card-hit" onClick={onClick}>
        <div className="media-thumb">
          {img ? (
            <img src={img} alt="" loading="lazy" />
          ) : (
            <span className="media-fallback">{(title || "?").slice(0, 2).toUpperCase()}</span>
          )}
          {badge ? <span className="media-badge">{badge}</span> : null}
        </div>
        <div className="media-meta">
          <h3>{title}</h3>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
      </button>
      {favoriteAction ? (
        <button type="button" className="fav-btn" onClick={favoriteAction} aria-label="Toggle favorite">
          ★
        </button>
      ) : null}
    </article>
  );
}
