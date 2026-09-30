import { streamPortalUrl } from "./xtream.js";

function hostnameFromPortal(portal) {
  try {
    const raw = String(portal || "").trim();
    const href = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    return new URL(href).hostname.toLowerCase();
  } catch {
    return "";
  }
}

const EDGE_CDN_SUFFIXES = [
  "infinity.gives",
  "infinitycdn.com",
  "fluxcdn.io",
  "cdnxstream.com",
  "xstream-cdn.com",
  "bp-v2.net",
  "cdnbp.net",
];

export function isKnownEdgeCdnHost(host) {
  const h = String(host || "").toLowerCase();
  if (!h) return false;
  return EDGE_CDN_SUFFIXES.some((suffix) => h === suffix || h.endsWith(`.${suffix}`));
}

export function isSignedStreamPath(url) {
  const s = String(url || "");
  if (!s) return false;
  if (/\/play\/(seg|live|hls|stream)/i.test(s)) return true;
  if (/\/(?:seg|segment|chunks?)\//i.test(s)) return true;
  if (/[?&]token=/i.test(s)) return true;
  if (/eyJ[A-Za-z0-9_-]{8,}/.test(s)) return true;
  return false;
}

export function isEdgeTsSegment(url) {
  const s = String(url || "");
  if (!/\/play\/seg\/.*\.ts(\?|$)/i.test(s)) return false;
  try {
    return isKnownEdgeCdnHost(new URL(s).hostname);
  } catch {
    return isSignedStreamPath(s);
  }
}

export function shouldBypassServerProxy(targetUrl, xtreamSession) {
  if (!targetUrl || !xtreamSession) return false;

  if (isEdgeTsSegment(targetUrl)) return false;

  let host = "";
  try {
    host = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    return false;
  }

  if (isKnownEdgeCdnHost(host)) return true;
  if (isSignedStreamPath(targetUrl)) return true;

  const loginHost = hostnameFromPortal(xtreamSession.portal);
  const streamHost = hostnameFromPortal(streamPortalUrl(xtreamSession));

  if (loginHost && host !== loginHost && streamHost && host !== streamHost) {
    return true;
  }

  if (streamHost && host === streamHost && isKnownEdgeCdnHost(host)) {
    return true;
  }

  return false;
}

export function sanitizeUrlForLog(targetUrl) {
  try {
    const u = new URL(targetUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    const safePath = parts.map((p, i) => {
      if (i >= 2 && parts[i - 2] === "live") return "***";
      if (i >= 2 && (parts[i - 2] === "movie" || parts[i - 2] === "series")) return "***";
      if (p.length > 48) return `${p.slice(0, 12)}…`;
      return p;
    });
    return `${u.hostname}${safePath.length ? `/${safePath.join("/")}` : ""}`;
  } catch {
    return "unknown";
  }
}
