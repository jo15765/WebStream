import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const storeFile = path.join(dataDir, "webstream.json");
const legacySettingsFile = path.join(dataDir, "app-settings.json");

function defaultStore() {
  return {
    recording: {
      directory:
        process.env.WEBSTREAM_RECORDINGS_DIR?.trim() ||
        path.join(root, "recordings"),
      ffmpegPath: process.env.WEBSTREAM_FFMPEG?.trim() || "ffmpeg",
    },
    credentials: {
      remember: false,
      portal: "",
      username: "",
      password: "",
    },
    library: {
      favorites: [],
      progress: {},
      liveCategories: {
        order: [],
        labels: {},
        hidden: [],
      },
    },
  };
}

let cached = defaultStore();
let writeChain = Promise.resolve();

function normalizeLiveCategories(raw) {
  const base = { order: [], labels: {}, hidden: [] };
  if (!raw || typeof raw !== "object") return base;
  const labels =
    raw.labels && typeof raw.labels === "object" && !Array.isArray(raw.labels)
      ? Object.fromEntries(
          Object.entries(raw.labels).map(([k, v]) => [String(k), String(v ?? "").slice(0, 120)]),
        )
      : {};
  return {
    order: Array.isArray(raw.order) ? raw.order.map(String) : [],
    labels,
    hidden: Array.isArray(raw.hidden) ? raw.hidden.map(String) : [],
  };
}

function validateDirectory(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    throw new Error("Recording folder path is required.");
  }
  const resolved = path.resolve(trimmed);
  if (resolved === path.parse(resolved).root) {
    throw new Error("Choose a folder inside a disk volume, not the volume root.");
  }
  return resolved;
}

function normalizeStore(raw) {
  const base = defaultStore();
  const merged = {
    recording: { ...base.recording, ...(raw?.recording || {}) },
    credentials: { ...base.credentials, ...(raw?.credentials || {}) },
    library: {
      favorites: Array.isArray(raw?.library?.favorites)
        ? raw.library.favorites
        : base.library.favorites,
      progress:
        raw?.library?.progress && typeof raw.library.progress === "object"
          ? raw.library.progress
          : base.library.progress,
      liveCategories: normalizeLiveCategories(raw?.library?.liveCategories),
    },
  };
  try {
    merged.recording.directory = validateDirectory(merged.recording.directory);
  } catch {
    merged.recording.directory = base.recording.directory;
  }
  merged.credentials.remember = Boolean(merged.credentials.remember);
  merged.credentials.portal = String(merged.credentials.portal || "");
  merged.credentials.username = String(merged.credentials.username || "");
  merged.credentials.password = String(merged.credentials.password || "");
  if (!merged.credentials.remember) {
    merged.credentials.password = "";
  }
  return merged;
}

async function persistStore() {
  const snapshot = structuredClone(cached);
  writeChain = writeChain.then(async () => {
    await fs.mkdir(dataDir, { recursive: true });
    const tmp = `${storeFile}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), "utf8");
    await fs.rename(tmp, storeFile);
  });
  return writeChain;
}

async function migrateLegacySettings() {
  try {
    const text = await fs.readFile(legacySettingsFile, "utf8");
    const parsed = JSON.parse(text);
    if (parsed?.recording) {
      cached.recording = { ...cached.recording, ...parsed.recording };
      cached.recording.directory = validateDirectory(cached.recording.directory);
      await persistStore();
    }
  } catch (e) {
    if (e?.code !== "ENOENT") {
      console.warn("[WebStream] Legacy settings migration skipped:", e.message || e);
    }
  }
}

export async function loadDataStore() {
  try {
    const text = await fs.readFile(storeFile, "utf8");
    cached = normalizeStore(JSON.parse(text));
  } catch (e) {
    if (e?.code !== "ENOENT") {
      console.warn("[WebStream] Could not load data store:", e.message || e);
    }
    cached = defaultStore();
    try {
      cached.recording.directory = validateDirectory(cached.recording.directory);
    } catch {
      cached.recording.directory = path.join(root, "recordings");
    }
    await migrateLegacySettings();
    if (!(await fileExists(storeFile))) {
      await persistStore();
    }
  }
  return getPublicStore();
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function getPublicStore() {
  return {
    recording: { ...cached.recording },
    credentials: {
      remember: cached.credentials.remember,
      portal: cached.credentials.portal,
      username: cached.credentials.username,
    },
    library: structuredClone(cached.library),
  };
}

export function getAuthHint() {
  return {
    remember: cached.credentials.remember,
    portal: cached.credentials.portal,
    username: cached.credentials.username,
  };
}

export function getRememberedCredentials() {
  if (!cached.credentials.remember) return null;
  const { portal, username, password } = cached.credentials;
  if (!username || !password) return null;
  return { portal, username, password };
}

export async function setRememberedCredentials({ remember, portal, username, password }) {
  cached.credentials.remember = Boolean(remember);
  cached.credentials.portal = String(portal || "").trim();
  cached.credentials.username = String(username || "").trim();
  if (cached.credentials.remember) {
    cached.credentials.password = String(password || "");
  } else {
    cached.credentials.password = "";
  }
  await persistStore();
}

export async function clearRememberedCredentials() {
  cached.credentials = {
    remember: false,
    portal: "",
    username: "",
    password: "",
  };
  await persistStore();
}

export function getRecordingConfig() {
  return { ...cached.recording };
}

export function getAppSettings() {
  return {
    recording: { ...cached.recording },
  };
}

export async function saveRecordingSettings({ directory, ffmpegPath } = {}) {
  const next = { ...cached.recording };
  if (directory !== undefined) {
    next.directory = validateDirectory(directory);
  }
  if (ffmpegPath !== undefined) {
    next.ffmpegPath = String(ffmpegPath || "").trim() || "ffmpeg";
  }
  cached.recording = next;
  await persistStore();
  await fs.mkdir(next.directory, { recursive: true });
  return getAppSettings();
}

export async function ensureRecordingDirectory() {
  const dir = cached.recording.directory;
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function getLibrary() {
  return structuredClone(cached.library);
}

export async function saveLibrary(library) {
  cached.library = {
    favorites: Array.isArray(library?.favorites) ? library.favorites : [],
    progress:
      library?.progress && typeof library.progress === "object" ? library.progress : {},
    liveCategories: normalizeLiveCategories(library?.liveCategories),
  };
  await persistStore();
  return getLibrary();
}
