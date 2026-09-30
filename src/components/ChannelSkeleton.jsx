export function ChannelSkeleton({ rows = 8 }) {
  return (
    <ul className="channel-list" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="channel-row skeleton-row">
          <span className="sk-circle" />
          <span className="sk-lines">
            <span className="sk-line w80" />
            <span className="sk-line w40" />
          </span>
          <span className="sk-pill" />
        </li>
      ))}
    </ul>
  );
}
