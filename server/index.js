import express from "express";
import session from "express-session";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { xtreamAction, mediaPath, streamPortalUrl } from "./xtream.js";
import { proxyStreamRequest, probeStreamUrl } from "./streamProxy.js";
import { fetchProxiedImage, sendPlaceholder } from "./imageProxy.js";
import { resolveNowPlaying } from "./epgNow.js";
import { recallProxyUrl } from "./proxyRegistry.js";
import { shouldBypassServerProxy, sanitizeUrlForLog } from "./streamHosts.js";
import { getPlaybackClientIp, isPlausibleClientIp } from "./clientIp.js";
import { scheduleSessionSave } from "./sessionSave.js";
import {
  clearRememberedCredentials,
  getAppSettings,
  getAuthHint,
  getLibrary,
  loadDataStore,
  saveLibrary,
  saveRecordingSettings,
  setRememberedCredentials,
} from "./dataStore.js";
import {
  establishXtreamSession,
  mePayload,
  saveSession,
  tryRememberedLogin,
} from "./autoLogin.js";
import {
  getActiveRecording,
  startRecording,
  stopRecording,
} from "./recording.js";
import {
  getEventLogMeta,
  getEventLogStats,
  logEvent,
  logEventFromRequest,
} from "./eventLog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");

const PORT = Number(process.env.PORT) || 8080;
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-only-change-in-production";

function sessionCookieSecure() {
  const flag = String(process.env.SESSION_COOKIE_SECURE ?? "").trim().toLowerCase();
  if (flag === "true" || flag === "1" || flag === "yes") return true;
  if (flag === "false" || flag === "0" || flag === "no") return false;
  return false;
}

if (process.env.NODE_ENV === "production" && SESSION_SECRET === "dev-only-change-in-production") {
  console.warn("[WebStream] Set SESSION_SECRET in production.");
}

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));

app.use(
  session({
    name: "ws.sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: sessionCookieSecure(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

function requireSession(req, res, next) {
  if (!req.session?.xtream) {
    return res.status(401).json({ error: "Not connected to a provider" });
  }
  next();
}

function streamReferer(xtreamSession) {
  return `${streamPortalUrl(xtreamSession)}/`;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "webstream" });
});

app.get("/api/auth/hint", (_req, res) => {
  res.json(getAuthHint());
});

app.post("/api/auth/forget", async (_req, res) => {
  try {
    await clearRememberedCredentials();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Could not clear saved login" });
  }
});

app.get("/api/me", async (req, res) => {
  if (!req.session?.xtream) {
    try {
      const loggedIn = await tryRememberedLogin(req);
      if (loggedIn) {
        return res.json(mePayload(req.session));
      }
    } catch (e) {
      logEvent({
        level: "warn",
        category: "auth",
        message: e.message || "Saved login failed",
        detail: { autoLogin: true },
      });
      return res.json({
        connected: false,
        autoLoginFailed: true,
        error: e.message || "Saved login failed",
        ...getAuthHint(),
      });
    }
    return res.json({ connected: false, ...getAuthHint() });
  }
  res.json(mePayload(req.session));
});

app.post("/api/connect", async (req, res) => {
  const { portal, username, password, playbackClientIp, rememberCredentials } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  try {
    await establishXtreamSession(req, {
      portal,
      username,
      password,
      playbackClientIp: isPlausibleClientIp(playbackClientIp)
        ? String(playbackClientIp).trim()
        : null,
    });
    await setRememberedCredentials({
      remember: Boolean(rememberCredentials),
      portal,
      username,
      password,
    });
    await saveSession(req);
    res.json({ ok: true });
  } catch (e) {
    logEvent({
      level: "error",
      category: "auth",
      message: e.message || "Connection failed",
      detail: { username: String(username || "").slice(0, 64) },
    });
    res.status(401).json({ error: e.message || "Connection failed" });
  }
});

app.get("/api/diagnostics/meta", requireSession, async (_req, res) => {
  try {
    const stats = await getEventLogStats();
    res.json({ meta: getEventLogMeta(), stats });
  } catch (e) {
    res.status(500).json({ error: e.message || "Could not read log info" });
  }
});

app.post("/api/diagnostics/event", requireSession, (req, res) => {
  const { level, category, message, detail } = req.body ?? {};
  const msg = String(message || "").trim();
  if (!msg) {
    return res.status(400).json({ error: "message is required" });
  }
  const allowed = new Set(["debug", "info", "warn", "error"]);
  logEventFromRequest(req, {
    level: allowed.has(level) ? level : "info",
    source: "client",
    category: String(category || "playback").slice(0, 32),
    message: msg.slice(0, 500),
    detail,
  });
  res.json({ ok: true });
});

app.get("/api/library", requireSession, (_req, res) => {
  res.json(getLibrary());
});

app.put("/api/library", requireSession, async (req, res) => {
  try {
    const library = await saveLibrary(req.body ?? {});
    res.json(library);
  } catch (e) {
    res.status(500).json({ error: e.message || "Could not save library" });
  }
});

app.post("/api/disconnect", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/session/playback-ip", requireSession, (req, res) => {
  res.json({
    playbackClientIp: req.session.playbackClientIp ?? null,
    registered: Boolean(req.session.playbackClientIp),
  });
});

app.post("/api/session/playback-ip", requireSession, (req, res) => {
  const ip = req.body?.playbackClientIp ?? req.headers["x-playback-client-ip"];
  if (!isPlausibleClientIp(ip)) {
    return res.status(400).json({
      error:
        "Could not register a public IP for stream tokens. Allow WebStream to reach api64.ipify.org or log in again on this network.",
    });
  }
  req.session.playbackClientIp = String(ip).trim();
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: "Could not save session" });
    res.json({ ok: true, playbackClientIp: req.session.playbackClientIp });
  });
});

app.post("/api/epg/now", requireSession, async (req, res) => {
  const ids = req.body?.streamIds;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "streamIds array is required" });
  }
  try {
    const airing = await resolveNowPlaying(req.session.xtream, xtreamAction, ids);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.json({ airing });
  } catch (e) {
    logEvent({ level: "warn", category: "epg", message: e.message || "EPG lookup failed" });
    res.status(502).json({ error: e.message || "EPG lookup failed" });
  }
});

app.get("/api/catalog/:action", requireSession, async (req, res) => {
  const { action } = req.params;
  const allowed = new Set([
    "get_live_categories",
    "get_live_streams",
    "get_vod_categories",
    "get_vod_streams",
    "get_series_categories",
    "get_series",
    "get_series_info",
    "get_short_epg",
    "get_simple_data_table",
  ]);
  if (!allowed.has(action)) {
    return res.status(400).json({ error: "Unknown catalog action" });
  }
  const query = { ...req.query };
  try {
    const data = await xtreamAction(req.session.xtream, action, query);
    res.setHeader("Cache-Control", "private, max-age=120");
    res.json(data);
  } catch (e) {
    logEvent({
      level: "error",
      category: "catalog",
      message: e.message || "Provider error",
      detail: { action },
    });
    res.status(502).json({ error: e.message || "Provider error" });
  }
});

app.get("/api/play-remote", requireSession, async (req, res) => {
  let target;
  try {
    target = decodeURIComponent(String(req.query.url || ""));
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }
  if (!/^https?:\/\//i.test(target)) {
    return res.status(400).json({ error: "Invalid stream URL" });
  }

  const referer = streamReferer(req.session.xtream);
  const clientIp = getPlaybackClientIp(req);
  try {
    const result = await proxyStreamRequest(target, res, {
      rewriteAsHls: /\.m3u8(\?|$)/i.test(target),
      session: req.session,
      referer,
      clientIp,
      onSessionTouch: () => {
        scheduleSessionSave(req);
        return Promise.resolve();
      },
    });
    if (!result.ok && !res.headersSent) {
      logEvent({
        level: "warn",
        category: "proxy",
        message: "Remote stream proxy failed",
        detail: { status: result.status, detail: result.detail },
      });
      res.status(502).json({
        error: "Could not open remote stream",
        upstreamStatus: result.status,
      });
    }
  } catch (e) {
    if (!res.headersSent) {
      logEvent({ level: "error", category: "proxy", message: e.message || "Playback proxy failed" });
      res.status(502).json({ error: e.message || "Playback proxy failed" });
    }
  }
});

app.get("/api/play/:kind/:streamId", requireSession, async (req, res) => {
  const { kind, streamId } = req.params;
  const ext = String(req.query.ext || (kind === "live" ? "m3u8" : "m3u8")).replace(/^\./, "");
  if (!["live", "movie", "series"].includes(kind)) {
    return res.status(400).json({ error: "Invalid stream kind" });
  }

  const referer = streamReferer(req.session.xtream);
  const clientIp = getPlaybackClientIp(req);
  const tryExts =
    kind === "live"
      ? [...new Set([ext, "m3u8", "ts", "mp4"].filter(Boolean))]
      : [...new Set([ext, "mp4", "mkv", "m3u8"])];

  try {
    let chosen = null;
    for (const tryExt of tryExts) {
      const target = mediaPath(req.session.xtream, kind, streamId, tryExt);
      if (await probeStreamUrl(target, referer, clientIp, req.session)) {
        chosen = { target, tryExt };
        break;
      }
    }

    if (!chosen) {
      logEvent({
        level: "warn",
        category: "play",
        message: "Could not open stream from provider",
        detail: { kind, streamId, ext },
      });
      return res.status(502).json({ error: "Could not open stream from provider" });
    }

    const result = await proxyStreamRequest(chosen.target, res, {
      rewriteAsHls: chosen.tryExt.includes("m3u8"),
      session: req.session,
      referer,
      clientIp,
      onSessionTouch: () => {
        scheduleSessionSave(req);
        return Promise.resolve();
      },
    });
    if (!result.ok && !res.headersSent) {
      logEvent({
        level: "warn",
        category: "play",
        message: "Stream proxy upstream error",
        detail: { kind, streamId, status: result.status, detail: result.detail },
      });
      res.status(502).json({
        error: "Could not open stream from provider",
        upstreamStatus: result.status,
        detail: result.detail,
      });
    }
  } catch (e) {
    if (!res.headersSent) {
      logEvent({
        level: "error",
        category: "play",
        message: e.message || "Playback proxy failed",
        detail: { kind, streamId },
      });
      res.status(502).json({ error: e.message || "Playback proxy failed" });
    }
  }
});

app.get("/api/proxy/h/:hash", requireSession, async (req, res) => {
  const target = recallProxyUrl(req.session, req.params.hash);
  if (!target) {
    logEvent({ level: "info", category: "proxy", message: "Segment URL expired (410)" });
    return res.status(410).send("Stream URL expired — reopen the channel.");
  }

  if (shouldBypassServerProxy(target, req.session.xtream)) {
    return res.redirect(307, target);
  }

  const referer = streamReferer(req.session.xtream);
  const clientIp = getPlaybackClientIp(req);
  try {
    const result = await proxyStreamRequest(target, res, {
      rewriteAsHls: /\.m3u8(\?|$)/i.test(target),
      session: req.session,
      referer,
      clientIp,
      onSessionTouch: () => {
        scheduleSessionSave(req);
        return Promise.resolve();
      },
    });
    if (!result.ok && !res.headersSent) {
      const detail = result.detail || "";
      if (result.status === 403 && /wrong server/i.test(detail)) {
        return res.redirect(307, target);
      }
      logEvent({
        level: "warn",
        category: "proxy",
        message: "Segment proxy upstream error",
        detail: { status: result.status, hint: sanitizeUrlForLog(target), detail: detail.slice(0, 120) },
      });
      const hint = sanitizeUrlForLog(target);
      res
        .status(502)
        .type("text")
        .send(
          `Upstream error (${result.status || 502})${detail ? `: ${detail}` : ""} [${hint}]`,
        );
    }
  } catch (e) {
    if (!res.headersSent) {
      logEvent({ level: "error", category: "proxy", message: e.message || "Proxy error" });
      res.status(502).send(e.message || "Proxy error");
    }
  }
});

app.get("/api/proxy", requireSession, async (req, res) => {
  const raw = req.query.url;
  if (!raw) return res.status(400).send("Missing url");
  let target;
  try {
    target = decodeURIComponent(String(raw));
  } catch {
    return res.status(400).send("Invalid url");
  }
  const referer = streamReferer(req.session.xtream);
  const clientIp = getPlaybackClientIp(req);
  try {
    const result = await proxyStreamRequest(target, res, {
      rewriteAsHls: /\.m3u8(\?|$)/i.test(target),
      session: req.session,
      referer,
      clientIp,
      onSessionTouch: () => {
        scheduleSessionSave(req);
        return Promise.resolve();
      },
    });
    if (!result.ok && !res.headersSent) {
      res.status(502).send(`Upstream error (${result.status || 502})`);
    }
  } catch (e) {
    if (!res.headersSent) res.status(502).send(e.message || "Proxy error");
  }
});

app.get("/api/settings", requireSession, (_req, res) => {
  res.json(getAppSettings());
});

app.put("/api/settings/recording", requireSession, async (req, res) => {
  try {
    const { directory, ffmpegPath } = req.body ?? {};
    const settings = await saveRecordingSettings({ directory, ffmpegPath });
    res.json(settings);
  } catch (e) {
    res.status(400).json({ error: e.message || "Invalid settings" });
  }
});

app.get("/api/record/active", requireSession, (req, res) => {
  res.json({ active: getActiveRecording(req) });
});

app.post("/api/record/start", requireSession, async (req, res) => {
  try {
    const { kind, streamId, title } = req.body ?? {};
    const result = await startRecording(req, { kind, streamId, title });
    res.json({ ok: true, ...result });
  } catch (e) {
    logEvent({
      level: "error",
      category: "recording",
      message: e.message || "Recording failed",
      detail: { streamId: req.body?.streamId },
    });
    res.status(502).json({ error: e.message || "Recording failed" });
  }
});

app.post("/api/record/stop", requireSession, async (req, res) => {
  try {
    const { id } = req.body ?? {};
    const result = await stopRecording(req, id);
    res.json({ ok: true, ...result });
  } catch (e) {
    logEvent({ level: "warn", category: "recording", message: e.message || "Stop failed" });
    res.status(400).json({ error: e.message || "Stop failed" });
  }
});

app.get("/api/image", requireSession, async (req, res) => {
  const raw = req.query.src;
  if (!raw) return res.status(400).end();
  let target;
  try {
    target = decodeURIComponent(String(raw));
  } catch {
    return res.status(400).end();
  }
  try {
    const parsed = new URL(target);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return sendPlaceholder(res);
    }
    if (parsed.protocol === "https:") {
      return res.redirect(302, target);
    }
    const result = await fetchProxiedImage(target);
    if (!result.ok) {
      sendPlaceholder(res);
      return;
    }
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(result.body);
  } catch {
    sendPlaceholder(res);
  }
});

const isProd = process.env.NODE_ENV === "production";

async function attachFrontend(app) {
  if (isProd) {
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
    return;
  }
  const { attachDevAssets } = await import("./devAssets.js");
  attachDevAssets(app);
}

loadDataStore()
  .then(() => {
    logEvent({ level: "info", category: "system", message: "WebStream server starting" });
    const settings = getAppSettings();
    const hint = getAuthHint();
    console.log(`[WebStream] Data file: ${path.join(root, "data", "webstream.json")}`);
    console.log(`[WebStream] Recordings folder: ${settings.recording.directory}`);
    if (hint.remember) {
      console.log(`[WebStream] Saved login enabled for ${hint.username || "user"}`);
    }
  })
  .catch((e) => {
    console.warn("[WebStream] Settings load failed:", e.message || e);
  })
  .finally(async () => {
    try {
      await attachFrontend(app);
    } catch (e) {
      logEvent({
        level: "error",
        category: "system",
        message: e.message || "Frontend setup failed",
      });
      console.error("[WebStream] Frontend setup failed:", e.message || e);
      process.exit(1);
    }
    const server = app.listen(PORT, () => {
      const mode = isProd ? "production" : "development";
      console.log(`[WebStream] ${mode} at http://localhost:${PORT}`);
    });

    server.on("error", onServerError);
  });

function onServerError(err) {

  if (err.code === "EADDRINUSE") {
    console.error(
      `[WebStream] Port ${PORT} is already in use (often a previous "npm run dev").`,
    );
    console.error(`  Stop it: lsof -i :${PORT} -sTCP:LISTEN   then kill <PID>`);
    console.error(`  Or use another port: PORT=8081 npm run dev`);
    process.exit(1);
  }
  throw err;
}
