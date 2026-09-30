import crypto from "node:crypto";

const MAX_URLS = 4000;

export function rememberProxyUrl(session, absoluteUrl) {
  if (!session.proxyUrls) session.proxyUrls = {};
  const hash = crypto.createHash("sha256").update(absoluteUrl).digest("hex").slice(0, 20);
  session.proxyUrls[hash] = absoluteUrl;

  const keys = Object.keys(session.proxyUrls);
  if (keys.length > MAX_URLS) {
    for (const key of keys.slice(0, keys.length - MAX_URLS)) {
      delete session.proxyUrls[key];
    }
  }

  return `/api/proxy/h/${hash}`;
}

export function recallProxyUrl(session, hash) {
  return session.proxyUrls?.[hash] ?? null;
}

export function makeProxyMapper(session) {
  return (absoluteUrl) => rememberProxyUrl(session, absoluteUrl);
}
