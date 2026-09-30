import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { mediaPath, streamPortalUrl } from "./xtream.js";
import { probeStreamUrl, buildStreamHeaders } from "./streamProxy.js";
import { applyCookies } from "./cdnCookies.js";
import { ensureRecordingDirectory, getRecordingConfig } from "./appSettings.js";
import { getPlaybackClientIp } from "./clientIp.js";

const activeBySession = new Map();

function sessionKey(req) {
  return req.sessionID || req.session?.id || "anonymous";
}

function sanitizeFilenamePart(s) {
  return String(s || "channel")
    .replace(/[^\w\s.-]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "channel";
}

function makeOutputFilename(title, streamId) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = sanitizeFilenamePart(title);
  return `${stamp}_${base}_${streamId}.ts`;
}

function headersForFfmpeg(session, targetUrl, referer, clientIp) {
  const headers = applyCookies(
    session,
    targetUrl,
    buildStreamHeaders(referer, clientIp, targetUrl),
  );
  return `${Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\r\n")}\r\n`;
}

async function resolveStreamTarget(session, kind, streamId, referer, clientIp) {
  const tryExts =
    kind === "live"
      ? ["m3u8", "ts", "mp4"]
      : ["mp4", "mkv", "m3u8"];
  for (const ext of tryExts) {
    const target = mediaPath(session, kind, streamId, ext);
    if (await probeStreamUrl(target, referer, clientIp, session)) {
      return { target, ext };
    }
  }
  return null;
}

function newRecordingId() {
  return randomBytes(8).toString("hex");
}

export function getActiveRecording(req) {
  const rec = activeBySession.get(sessionKey(req));
  if (!rec) return null;
  return {
    id: rec.id,
    title: rec.title,
    streamId: rec.streamId,
    kind: rec.kind,
    startedAt: rec.startedAt,
    filePath: rec.filePath,
    filename: path.basename(rec.filePath),
  };
}

export async function startRecording(req, { kind, streamId, title }) {
  if (!req.session?.xtream) {
    throw new Error("Not connected to a provider.");
  }
  const normalizedKind = kind === "movie" || kind === "series" ? kind : "live";
  const id = String(streamId ?? "").trim();
  if (!id) throw new Error("streamId is required.");

  const key = sessionKey(req);
  const existing = activeBySession.get(key);
  if (existing) {
    await stopRecording(req, existing.id);
  }

  const referer = `${streamPortalUrl(req.session.xtream)}/`;
  const clientIp = getPlaybackClientIp(req);
  const resolved = await resolveStreamTarget(
    req.session.xtream,
    normalizedKind,
    id,
    referer,
    clientIp,
  );
  if (!resolved) {
    throw new Error("Could not open stream from provider for recording.");
  }

  const dir = await ensureRecordingDirectory();
  const filename = makeOutputFilename(title, id);
  const filePath = path.join(dir, filename);
  const { ffmpegPath } = getRecordingConfig();
  const headerBlock = headersForFfmpeg(
    req.session,
    resolved.target,
    referer,
    clientIp,
  );

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-headers",
    headerBlock,
    "-i",
    resolved.target,
    "-c",
    "copy",
    "-f",
    "mpegts",
    "-y",
    filePath,
  ];

  const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
  const rec = {
    id: newRecordingId(),
    proc,
    filePath,
    title: String(title || "Recording"),
    streamId: id,
    kind: normalizedKind,
    startedAt: Date.now(),
    stderr: "",
  };

  proc.stderr?.on("data", (chunk) => {
    rec.stderr = (rec.stderr + chunk.toString()).slice(-2000);
  });

  await new Promise((resolve, reject) => {
    let settled = false;
    const failTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill("SIGTERM");
      reject(new Error("Recording did not start (ffmpeg timeout). Is ffmpeg installed?"));
    }, 8000);

    const finishOk = () => {
      if (settled) return;
      settled = true;
      clearTimeout(failTimer);
      resolve(true);
    };

    proc.once("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(failTimer);
      reject(
        new Error(
          err.code === "ENOENT"
            ? `ffmpeg not found (${ffmpegPath}). Install ffmpeg or set path in Settings.`
            : err.message || "Could not start ffmpeg.",
        ),
      );
    });

    if (proc.pid) {
      finishOk();
      return;
    }
    proc.once("spawn", finishOk);
  });

  proc.on("exit", (code, signal) => {
    const current = activeBySession.get(key);
    if (current?.id !== rec.id) return;
    activeBySession.delete(key);
    if (code !== 0 && code !== null && signal !== "SIGTERM") {
      console.warn(
        `[WebStream] Recording ended (${code || signal}): ${rec.stderr.slice(0, 200)}`,
      );
    }
  });

  activeBySession.set(key, rec);

  return {
    id: rec.id,
    filename,
    filePath,
    directory: dir,
  };
}

export async function stopRecording(req, recordingId) {
  const key = sessionKey(req);
  const rec = activeBySession.get(key);
  if (!rec) {
    return { stopped: false, reason: "none_active" };
  }
  if (recordingId && rec.id !== recordingId) {
    throw new Error("Recording id does not match active session.");
  }

  return new Promise((resolve) => {
    const finish = () => {
      activeBySession.delete(key);
      resolve({
        stopped: true,
        id: rec.id,
        filename: path.basename(rec.filePath),
        filePath: rec.filePath,
      });
    };

    if (rec.proc.exitCode != null) {
      finish();
      return;
    }

    rec.proc.once("exit", () => finish());
    rec.proc.kill("SIGTERM");
    setTimeout(() => {
      if (rec.proc.exitCode == null) {
        rec.proc.kill("SIGKILL");
      }
    }, 4000);
  });
}
