export function PageLoader({ label = "Loading…" }) {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <div className="page-loader-orbit" aria-hidden />
      <p>{label}</p>
    </div>
  );
}
