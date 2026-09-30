import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(path.resolve(__dirname, ".."), "data");
const logFile = path.join(dataDir, "errors.txt");
const MAX_BYTES = 5 * 1024 * 1024;

let writeChain = Promise.resolve();

function sanitizeText(value, maxLen = 800) {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function formatDetail(detail) {
  if (detail == null) return "";
  try {
    const s = typeof detail === "string" ? detail : JSON.stringify(detail);
    return sanitizeText(s, 1200);
  } catch {
    return "";
  }
}

function formatLine({ level, source, category, message, detail }) {
  const ts = new Date().toISOString();
  const parts = [
    ts,
    sanitizeText(level, 12) || "info",
    sanitizeText(source, 24) || "server",
    sanitizeText(category, 32) || "general",
    sanitizeText(message, 500) || "(no message)",
  ];
  const d = formatDetail(detail);
  return d ? `${parts.join("\t")}\t${d}` : parts.join("\t");
}

async function rotateIfNeeded() {
  try {
    const stat = await fs.stat(logFile);
    if (stat.size >= MAX_BYTES) {
      const rotated = `${logFile}.1`;
      await fs.unlink(rotated).catch(() => {});
      await fs.rename(logFile, rotated);
    }
  } catch (e) {
    if (e?.code !== "ENOENT") throw e;
  }
}

export function getEventLogMeta() {
  return {
    relativePath: "data/errors.txt",
    description:
      "Tab-separated log on the WebStream host (Docker: /app/data/errors.txt on the webstream-data volume).",
  };
}

export async function getEventLogStats() {
  try {
    const stat = await fs.stat(logFile);
    return { exists: true, bytes: stat.size, updatedAt: stat.mtime.toISOString() };
  } catch (e) {
    if (e?.code === "ENOENT") return { exists: false, bytes: 0, updatedAt: null };
    throw e;
  }
}

export function logEvent({ level = "info", source = "server", category = "general", message, detail }) {
  const line = formatLine({ level, source, category, message, detail });
  writeChain = writeChain
    .then(async () => {
      await fs.mkdir(dataDir, { recursive: true });
      await rotateIfNeeded();
      await fs.appendFile(logFile, `${line}\n`, "utf8");
    })
    .catch((err) => {
      console.error("[WebStream] event log write failed:", err.message || err);
    });
  return writeChain;
}

export function logEventFromRequest(req, payload) {
  const username = req.session?.xtream?.userInfo?.username;
  const detail = {
    ...(payload.detail && typeof payload.detail === "object" ? payload.detail : {}),
    user: username ? sanitizeText(username, 64) : undefined,
    ip: sanitizeText(req.headers["x-forwarded-for"] || req.socket?.remoteAddress, 64),
  };
  return logEvent({
    level: payload.level,
    source: payload.source || "client",
    category: payload.category,
    message: payload.message,
    detail,
  });
}
