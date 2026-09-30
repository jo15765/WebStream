import { Readable } from "node:stream";
import { URL } from "node:url";
import { rememberProxyUrl } from "./proxyRegistry.js";
import { applyCookies, storeCookies } from "./cdnCookies.js";
import {
  isEdgeTsSegment,
  isKnownEdgeCdnHost,
  shouldBypassServerProxy,
} from "./streamHosts.js";

export const STREAM_HEADERS = {
  Accept: "*/*",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

function portalHost(portalReferer) {
  try {
    return new URL(portalReferer).hostname;
  } catch {
    return "";
  }
}

function targetHost(targetUrl) {
  try {
    return new URL(targetUrl).hostname;
  } catch {
    return "";
  }
}

function makeRewriteMapper(session, portalReferer) {
  const xtream = session?.xtream;
  return (absoluteUrl) => {
    if (isEdgeTsSegment(absoluteUrl)) {
      return rememberProxyUrl(session, absoluteUrl);
    }
    if (xtream && shouldBypassServerProxy(absoluteUrl, xtream)) {
      return absoluteUrl;
    }
    const tHost = targetHost(absoluteUrl);
    const pHost = portalHost(portalReferer);
    if (tHost && pHost && tHost !== pHost) {
      return absoluteUrl;
    }
    return rememberProxyUrl(session, absoluteUrl);
  };
}

export { shouldBypassServerProxy };

export function buildStreamHeaders(portalReferer, clientIp, targetUrl) {
  const tHost = targetHost(targetUrl);
  const pHost = portalHost(portalReferer);
  const externalCdn = tHost && pHost && tHost !== pHost;

  const headers = {
    ...STREAM_HEADERS,
    Referer: portalReferer,
  };

  if (!externalCdn) {
    try {
      headers.Origin = new URL(portalReferer).origin;
    } catch {
    }
  } else {
    try {
      headers.Referer = new URL(targetUrl).origin + "/";
    } catch {
    }
  }

  if (clientIp && (!externalCdn || isKnownEdgeCdnHost(tHost))) {
    headers["X-Forwarded-For"] = clientIp;
    headers["X-Real-IP"] = clientIp;
  }

  return headers;
}

function resolvePlaylistReference(ref, baseUrl) {
  const trimmed = ref.trim();
  if (trimmed.startsWith("/")) {
    return new URL(trimmed, new URL(baseUrl).origin).href;
  }
  return new URL(trimmed, baseUrl).href;
}

function rewriteTagUris(line, baseUrl, toProxyPath) {
  return line.replace(/URI="([^"]+)"/gi, (_match, uri) => {
    try {
      const absolute = resolvePlaylistReference(uri, baseUrl);
      return `URI="${toProxyPath(absolute)}"`;
    } catch {
      return _match;
    }
  });
}

export function rewriteManifest(body, baseUrl, toProxyPath) {
  const lines = body.split(/\r?\n/);
  const lineRewritten = lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith("#")) {
        if (trimmed.includes("URI=")) {
          return rewriteTagUris(line, baseUrl, toProxyPath);
        }
        return line;
      }

      try {
        const absolute = resolvePlaylistReference(trimmed, baseUrl);
        return toProxyPath(absolute);
      } catch {
        return line;
      }
    })
    .join("\n");

  return lineRewritten.replace(/https?:\/\/[^\s"'<>]+/gi, (raw) => {
    try {
      const absolute = resolvePlaylistReference(raw, baseUrl);
      return toProxyPath(absolute);
    } catch {
      return raw;
    }
  });
}

function pipeWebBody(upstream, res) {
  res.status(upstream.status);
  if (!upstream.body) {
    res.end();
    return;
  }
  const nodeStream = Readable.fromWeb(upstream.body);
  nodeStream.on("error", () => {
    if (!res.writableEnded) res.destroy();
  });
  res.on("close", () => nodeStream.destroy());
  nodeStream.pipe(res);
}

function shouldTreatAsManifest(targetUrl, contentType, rewriteAsHls) {
  if (/\.m3u8(\?|$)/i.test(targetUrl)) return true;
  if (rewriteAsHls && /\.m3u(\?|$)/i.test(targetUrl)) return true;
  if (contentType.includes("mpegurl") || contentType.includes("m3u")) return true;
  return false;
}

async function fetchUpstream(targetUrl, portalReferer, clientIp, session) {
  let selfReferer = portalReferer;
  try {
    selfReferer = new URL(targetUrl).href;
  } catch {
  }

  const headerSets = [
    buildStreamHeaders(portalReferer, clientIp, targetUrl),
    { ...STREAM_HEADERS, Referer: portalReferer },
    { ...STREAM_HEADERS, Referer: selfReferer },
    { ...STREAM_HEADERS },
  ];

  let lastStatus = 0;
  let lastDetail = "";

  for (const baseHeaders of headerSets) {
    const headers = applyCookies(session, targetUrl, { ...baseHeaders });
    try {
      const upstream = await fetch(targetUrl, { headers, redirect: "follow" });
      lastStatus = upstream.status;
      if (session) storeCookies(session, targetUrl, upstream);
      if (upstream.ok) {
        return { upstream, lastStatus, finalUrl: upstream.url || targetUrl };
      }
      lastDetail = (await upstream.text().catch(() => "")).slice(0, 160);
    } catch (e) {
      lastDetail = e.message || "fetch failed";
    }
  }

  return { upstream: null, lastStatus, lastDetail, finalUrl: targetUrl };
}

export async function probeStreamUrl(targetUrl, referer, clientIp, session = null) {
  const { upstream } = await fetchUpstream(targetUrl, referer, clientIp, session);
  return Boolean(upstream);
}

export async function proxyStreamRequest(
  targetUrl,
  res,
  { rewriteAsHls = false, session, referer, clientIp, onSessionTouch } = {},
) {
  const { upstream, lastStatus, lastDetail, finalUrl } = await fetchUpstream(
    targetUrl,
    referer,
    clientIp,
    session,
  );

  if (!upstream) {
    return { ok: false, status: lastStatus || 502, detail: lastDetail };
  }

  const manifestBase = finalUrl || targetUrl;
  const contentType = upstream.headers.get("content-type") || "";
  const toProxyPath = session ? makeRewriteMapper(session, referer) : (url) => url;

  if (shouldTreatAsManifest(targetUrl, contentType, rewriteAsHls)) {
    const text = await upstream.text();
    if (text.includes("#EXTM3U") || text.includes("#EXTINF")) {
      const rewritten = rewriteManifest(text, manifestBase, toProxyPath);
      if (onSessionTouch) await Promise.resolve(onSessionTouch());
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.send(rewritten);
      return { ok: true };
    }

    const retryResult = await fetchUpstream(targetUrl, referer, clientIp, session);
    if (!retryResult.upstream) {
      return { ok: false, status: retryResult.lastStatus || 502, detail: retryResult.lastDetail };
    }
    if (contentType) res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-cache");
    pipeWebBody(retryResult.upstream, res);
    return { ok: true };
  }

  if (contentType) res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-store");
  pipeWebBody(upstream, res);
  return { ok: true };
}
