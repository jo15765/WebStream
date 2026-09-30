import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { fetchAuthHint } from "../api/http.js";
import { usePortal } from "../state/PortalContext.jsx";

export function LoginPage() {
  const { connected, loading, connect, loginError } = usePortal();
  const navigate = useNavigate();
  const [portal, setPortal] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberCredentials, setRememberCredentials] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hintLoaded, setHintLoaded] = useState(false);

  useEffect(() => {
    if (loginError) setError(loginError);
  }, [loginError]);

  useEffect(() => {
    let cancelled = false;
    fetchAuthHint()
      .then((hint) => {
        if (cancelled) return;
        if (hint?.portal) setPortal(hint.portal);
        if (hint?.username) setUsername(hint.username);
        if (hint?.remember) setRememberCredentials(true);
        setHintLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setHintLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && connected) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await connect(portal, username, password, rememberCredentials);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Could not connect");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>WebStream</h1>
        <p className="lede">
          Connect your Xtream Codes subscription. Favorites and settings are stored on this
          WebStream server so every device on your network sees the same library.
        </p>
        <form onSubmit={onSubmit} className="stack-form">
          <label>
            Portal URL
            <input
              type="url"
              placeholder="https://example.com:8080"
              value={portal}
              onChange={(e) => setPortal(e.target.value)}
              required
              autoComplete="url"
            />
          </label>
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={rememberCredentials ? "current-password" : "off"}
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={rememberCredentials}
              onChange={(e) => setRememberCredentials(e.target.checked)}
            />
            <span>
              Save login on this server (auto-connect on all devices; stored in{" "}
              <code>data/webstream.json</code>)
            </span>
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" className="btn primary" disabled={busy || !hintLoaded}>
            {busy ? "Connecting…" : "Connect"}
          </button>
        </form>
        <p className="fine-print">
          WebStream is a player only. You must have rights to the content you watch. Only enable
          saved login on a server you trust (e.g. your own Docker host on your LAN).
        </p>
      </div>
    </div>
  );
}
