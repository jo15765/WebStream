export function NowAiring({ info, compact = false }) {
  if (!info) {
    return <span className="now-airing empty">{compact ? "No guide data" : "Program guide unavailable"}</span>;
  }

  const timeRange =
    info.startLabel && info.endLabel
      ? `${info.startLabel} – ${info.endLabel}`
      : info.startLabel || info.endLabel || null;

  return (
    <div className={compact ? "now-airing compact" : "now-airing"}>
      <span className="now-badge">On now</span>
      <span className="now-title">{info.title}</span>
      {timeRange ? <span className="now-times muted">{timeRange}</span> : null}
      {typeof info.progress === "number" ? (
        <span className="now-progress" aria-hidden>
          <span className="now-progress-fill" style={{ width: `${Math.round(info.progress * 100)}%` }} />
        </span>
      ) : null}
    </div>
  );
}
