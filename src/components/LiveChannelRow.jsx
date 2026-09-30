import { memo, useState } from "react";
import { imageUrl } from "../api/http.js";
import { NowAiring } from "./NowAiring.jsx";

function ChannelLogo({ channel }) {
  const [broken, setBroken] = useState(false);
  const src = imageUrl(channel.stream_icon);

  if (!src || broken) {
    return (
      <span className="channel-logo fallback">{channel.name?.slice(0, 1)?.toUpperCase()}</span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className="channel-logo"
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  );
}

function PlayGlyph() {
  return (
    <svg className="play-glyph" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  );
}

export const LiveChannelRow = memo(function LiveChannelRow({
  channel,
  categoryLabel,
  isSelected,
  isFavorite,
  airing,
  onSelect,
  onPlay,
  onGuide,
  onToggleFavorite,
}) {
  return (
    <li className={isSelected ? "channel-row selected" : "channel-row"}>
      <button
        type="button"
        className="channel-main"
        onClick={() => onSelect(channel)}
        aria-pressed={isSelected}
      >
        <ChannelLogo channel={channel} />
        <span className="channel-text">
          <span className="channel-name">{channel.name}</span>
          <span className="muted channel-cat">{categoryLabel}</span>
          <NowAiring info={airing} compact />
        </span>
      </button>
      <div className="channel-row-actions">
        <button
          type="button"
          className="btn-play-row"
          onClick={() => onPlay(channel)}
          aria-label={`Play ${channel.name}`}
        >
          <PlayGlyph />
          <span>Play</span>
        </button>
        <button type="button" className="btn-icon" onClick={() => onGuide(channel)} title="TV guide">
          Guide
        </button>
        <button
          type="button"
          className={isFavorite ? "btn-icon fav on" : "btn-icon fav"}
          onClick={() => onToggleFavorite(channel)}
          title={isFavorite ? "Remove favorite" : "Add favorite"}
          aria-pressed={isFavorite}
        >
          ★
        </button>
      </div>
    </li>
  );
});
