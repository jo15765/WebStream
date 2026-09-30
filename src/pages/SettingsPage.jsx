import { useCallback, useEffect, useState } from "react";
import {
  fetchAppSettings,
  fetchAuthHint,
  forgetSavedLogin,
  saveRecordingSettings,
} from "../api/http.js";
import { usePortal } from "../state/PortalContext.jsx";

export function SettingsPage() {
  const { profile, disconnect } = usePortal();
  const [recordingDir, setRecordingDir] = useState("");
  const [ffmpegPath, setFfmpegPath] = useState("ffmpeg");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState(null);
  const [settingsError, setSettingsError] = useState(null);
  const [savedLogin, setSavedLogin] = useState(false);
  const [forgetBusy, setForgetBusy] = useState(false);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const data = await fetchAppSettings();
      setRecordingDir(data?.recording?.directory ?? "");
      setFfmpegPath(data?.recording?.ffmpegPath ?? "ffmpeg");
      const hint = await fetchAuthHint().catch(() => ({}));
      setSavedLogin(Boolean(hint?.remember));
    } catch (e) {
      setSettingsError(e.message || "Could not load settings.");
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const onSaveRecording = async (e) => {
    e.preventDefault();
    setSettingsSaving(true);
    setSettingsMessage(null);
    setSettingsError(null);
    try {
      const data = await saveRecordingSettings({
        directory: recordingDir,
        ffmpegPath,
      });
      setRecordingDir(data?.recording?.directory ?? recordingDir);
      setFfmpegPath(data?.recording?.ffmpegPath ?? ffmpegPath);
      setSettingsMessage("Recording settings saved.");
    } catch (err) {
      setSettingsError(err.message || "Could not save settings.");
    } finally {
      setSettingsSaving(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Settings</h1>
      </header>
      <section className="panel">
        <h2>Recordings</h2>
        <p className="muted settings-lead">
          Live recordings are written on the server (where WebStream runs) using{" "}
          <strong>ffmpeg</strong>. Set an absolute folder path on that machine.
        </p>
        {settingsLoading ? <p className="muted">Loading…</p> : null}
        <form className="settings-form" onSubmit={onSaveRecording}>
          <label className="field">
            <span>Save folder</span>
            <input
              type="text"
              value={recordingDir}
              onChange={(e) => setRecordingDir(e.target.value)}
              placeholder="/Users/you/Videos/WebStream"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>ffmpeg command</span>
            <input
              type="text"
              value={ffmpegPath}
              onChange={(e) => setFfmpegPath(e.target.value)}
              placeholder="ffmpeg"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <p className="muted settings-hint">
            Default folder is <code>recordings/</code> in the project unless{" "}
            <code>WEBSTREAM_RECORDINGS_DIR</code> is set. Files are MPEG-TS (
            <code>.ts</code>) with stream copy (no re-encode).
          </p>
          {settingsError ? <p className="form-error">{settingsError}</p> : null}
          {settingsMessage ? <p className="form-success">{settingsMessage}</p> : null}
          <button type="submit" className="btn" disabled={settingsSaving || settingsLoading}>
            {settingsSaving ? "Saving…" : "Save recording settings"}
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>Connection</h2>
        <dl className="kv">
          <dt>Portal</dt>
          <dd>{profile?.portal}</dd>
          <dt>Username</dt>
          <dd>{profile?.userInfo?.username}</dd>
          <dt>Status</dt>
          <dd>{profile?.userInfo?.status}</dd>
          <dt>Expires</dt>
          <dd>{profile?.userInfo?.exp_date || "—"}</dd>
        </dl>
        <p className="muted settings-hint">
          Saved login on server:{" "}
          <strong>{savedLogin ? "On (auto-connect on all devices)" : "Off"}</strong>
        </p>
        <div className="settings-actions">
          <button type="button" className="btn danger" onClick={() => disconnect()}>
            Disconnect session
          </button>
          {savedLogin ? (
            <button
              type="button"
              className="btn ghost"
              disabled={forgetBusy}
              onClick={async () => {
                setForgetBusy(true);
                try {
                  await forgetSavedLogin();
                  setSavedLogin(false);
                  await disconnect();
                } finally {
                  setForgetBusy(false);
                }
              }}
            >
              {forgetBusy ? "Removing…" : "Forget saved login"}
            </button>
          ) : null}
        </div>
      </section>
      <section className="panel">
        <h2>About</h2>
        <p className="muted">
          WebStream is an independent open-source IPTV front-end for Xtream Codes providers. It uses
          webpack + React on the client and Express for API and stream proxying.
        </p>
      </section>
    </div>
  );
}
