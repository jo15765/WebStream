let cachedPublicIp = null;
let publicIpPromise = null;

export async function detectPublicClientIp() {
  if (cachedPublicIp) return cachedPublicIp;
  if (publicIpPromise) return publicIpPromise;
  publicIpPromise = (async () => {
    const endpoints = [
      "https://api64.ipify.org?format=json",
      "https://api.ipify.org?format=json",
    ];
    for (const url of endpoints) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) continue;
        const data = await res.json();
        if (data?.ip) {
          cachedPublicIp = String(data.ip).trim();
          return cachedPublicIp;
        }
      } catch {
      }
    }
    return null;
  })();
  const ip = await publicIpPromise;
  publicIpPromise = null;
  return ip;
}

export async function registerPlaybackClientIp(ip) {
  if (!ip) return null;
  return api("/api/session/playback-ip", {
    method: "POST",
    body: JSON.stringify({ playbackClientIp: ip }),
  });
}

export async function ensurePlaybackClientIp() {
  const ip = await detectPublicClientIp();
  if (!ip) {
    throw new Error(
      "Could not detect your public IP. Live TV on this provider requires it for stream tokens.",
    );
  }
  await registerPlaybackClientIp(ip);
  return ip;
}

export async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const body = isJson ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) {
    const message = typeof body === "object" && body?.error ? body.error : res.statusText;
    throw new Error(message || "Request failed");
  }
  return body;
}

export function catalog(action, params = {}) {
  const q = new URLSearchParams(params).toString();
  const suffix = q ? `?${q}` : "";
  return api(`/api/catalog/${action}${suffix}`);
}

export function playUrl(kind, streamId, ext) {
  const fallback = kind === "live" ? "m3u8" : "mp4";
  const resolved = (ext || fallback).replace(/^\./, "");
  return `/api/play/${kind}/${streamId}?ext=${encodeURIComponent(resolved)}`;
}

function normalizeMediaUrl(src) {
  let s = String(src || "").trim();
  if (!s) return null;
  if (s.startsWith("/")) return s;
  if (s.startsWith("api/")) return `/${s}`;
  if (s.startsWith("//")) return `https:${s}`;
  if (/^https?:\/\//i.test(s)) return s;
  const hostPart = s.split(/[/?#]/)[0];
  if (/^[\w.-]+\.[a-z]{2,}$/i.test(hostPart)) {
    return `https://${s}`;
  }
  return s;
}

export function livePlayCandidates(channel) {
  const streamId = channel?.stream_id ?? channel?.id ?? channel?.num;
  if (streamId === undefined || streamId === null || streamId === "") {
    return [];
  }

  const direct = normalizeMediaUrl(channel?.direct_source);
  if (direct) {
    return [`/api/play-remote?url=${encodeURIComponent(direct)}`];
  }

  const preferred = (channel?.container_extension || channel?.target_container || "")
    .replace(/^\./, "")
    .toLowerCase();

  const formats = [...new Set([preferred, "m3u8", "mp4"].filter(Boolean))];
  return formats.map((ext) => playUrl("live", streamId, ext));
}

export function livePlayUrl(channel) {
  const list = livePlayCandidates(channel);
  return list[0] ?? null;
}

export function streamSegmentUsesCredentials(url) {
  const s = String(url || "");
  return s.includes("/api/");
}

export function stripLiveManifestCacheParams(apiPlayUrl) {
  try {
    const u = new URL(apiPlayUrl, window.location.origin);
    u.searchParams.delete("_ws");
    return `${u.pathname}${u.search}`;
  } catch {
    return String(apiPlayUrl || "").replace(/([?&])_ws=\d+(&|$)/g, "$1").replace(/[?&]$/, "");
  }
}

export function bumpLiveManifestUrl(apiPlayUrl) {
  try {
    const u = new URL(stripLiveManifestCacheParams(apiPlayUrl), window.location.origin);
    u.searchParams.set("_ws", String(Date.now()));
    return `${u.pathname}${u.search}`;
  } catch {
    const base = stripLiveManifestCacheParams(apiPlayUrl);
    const join = base.includes("?") ? "&" : "?";
    return `${base}${join}_ws=${Date.now()}`;
  }
}

export function prefetchLiveManifest(apiPlayUrl) {
  const url = bumpLiveManifestUrl(stripLiveManifestCacheParams(apiPlayUrl));
  return fetch(url, {
    credentials: "include",
    cache: "no-store",
    priority: "low",
  }).catch(() => {});
}

function shouldProxyRemoteImage(s) {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  const onLocalDev = host === "localhost" || host === "127.0.0.1";
  if (onLocalDev) return true;
  if (window.location.protocol === "https:" && /^http:\/\//i.test(s)) return true;
  return false;
}

export async function fetchDiagnosticsMeta() {
  return api("/api/diagnostics/meta");
}

export async function fetchAuthHint() {
  const res = await fetch("/api/auth/hint", { credentials: "same-origin" });
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const body = isJson ? await res.json().catch(() => ({})) : {};
  return body;
}

export async function forgetSavedLogin() {
  return api("/api/auth/forget", { method: "POST" });
}

export async function fetchLibrary() {
  return api("/api/library");
}

export async function saveLibrary(library) {
  return api("/api/library", {
    method: "PUT",
    body: JSON.stringify(library),
  });
}

export async function fetchAppSettings() {
  return api("/api/settings");
}

export async function saveRecordingSettings({ directory, ffmpegPath }) {
  return api("/api/settings/recording", {
    method: "PUT",
    body: JSON.stringify({ directory, ffmpegPath }),
  });
}

export async function fetchActiveRecording() {
  return api("/api/record/active");
}

export async function startRecording({ kind, streamId, title }) {
  return api("/api/record/start", {
    method: "POST",
    body: JSON.stringify({ kind, streamId, title }),
  });
}

export async function stopRecording(id) {
  return api("/api/record/stop", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export function imageUrl(src) {
  const s = normalizeMediaUrl(src);
  if (!s) return null;
  if (s.startsWith("/")) return s;

  if (/^https?:\/\//i.test(s) && shouldProxyRemoteImage(s)) {
    return `/api/image?src=${encodeURIComponent(s)}`;
  }

  if (/^https:\/\//i.test(s)) {
    return s;
  }

  if (/^http:\/\//i.test(s)) {
    return s;
  }

  return null;
}
