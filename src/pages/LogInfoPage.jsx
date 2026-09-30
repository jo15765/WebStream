import { useEffect, useState } from "react";
import { fetchDiagnosticsMeta } from "../api/http.js";

export function LogInfoPage() {
  const [meta, setMeta] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDiagnosticsMeta()
      .then((data) => {
        setMeta(data.meta ?? null);
        setStats(data.stats ?? null);
      })
      .catch((e) => setError(e.message || "Could not load diagnostics info."));
  }, []);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Logs &amp; diagnostics</h1>
        <p className="muted log-info-lead">
          WebStream records playback and server issues locally to help you troubleshoot stutter,
          lag, and connection problems over time.
        </p>
      </header>

      <section className="panel log-info-panel">
        <h2>Privacy</h2>
        <p>
          Logs are stored <strong>only on your WebStream server</strong> (your machine or Docker
          host). They are not uploaded anywhere automatically. Share a log file only if you choose
          to, for analysis or debugging with someone you trust.
        </p>
      </section>

      <section className="panel log-info-panel">
        <h2>What gets logged</h2>
        <ul className="log-info-list">
          <li>Live playback stalls, buffer gaps, unexpected pauses, and HLS recovery attempts</li>
          <li>Stream proxy / CDN errors (403, 410, timeouts) without storing your password</li>
          <li>Login, catalog, and recording failures on the server</li>
          <li>Lag and buffer snapshots when the player detects repeated hiccups</li>
        </ul>
        <p className="muted">
          Each line is timestamped in <code>data/errors.txt</code> on the server. In Docker, that
          file lives on the <code>webstream-data</code> volume at{' '}
          <code>/app/data/errors.txt</code>.
        </p>
      </section>

      <section className="panel log-info-panel">
        <h2>On this server</h2>
        {error ? <p className="form-error">{error}</p> : null}
        {meta ? (
          <dl className="kv log-info-kv">
            <dt>Log file</dt>
            <dd>
              <code>{meta.relativePath}</code>
            </dd>
            <dt>Status</dt>
            <dd>
              {stats?.exists
                ? `Active (${Math.round((stats.bytes || 0) / 1024)} KB, updated ${stats.updatedAt ? new Date(stats.updatedAt).toLocaleString() : "—"})`
                : "No entries yet — logging starts when issues occur."}
            </dd>
          </dl>
        ) : null}
        <p className="muted log-info-tip">
          To inspect on Docker:{' '}
          <code>docker exec -it &lt;container&gt; cat /app/data/errors.txt</code> or copy from the
          volume on the host.
        </p>
      </section>
    </div>
  );
}
