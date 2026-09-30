import { decodeEpgText, normalizeEpgListing } from "./epgText.js";

const CACHE_TTL_MS = 3 * 60 * 1000;
const cache = new Map();

function parseInstant(row, prefix) {
  const tsKey = `${prefix}_timestamp`;
  if (row[tsKey] !== undefined && row[tsKey] !== null && row[tsKey] !== "") {
    const n = Number(row[tsKey]);
    if (!Number.isNaN(n)) {
      return n > 1e12 ? n : n * 1000;
    }
  }
  const raw = row[prefix] ?? row[`${prefix}_utc`];
  if (raw) {
    const text = String(raw).trim();
    const parsed = Date.parse(text.includes("T") ? text : text.replace(" ", "T"));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

export function pickCurrentListing(listings, nowMs = Date.now()) {
  if (!Array.isArray(listings) || listings.length === 0) return null;

  for (const row of listings) {
    const startMs = parseInstant(row, "start");
    const endMs = parseInstant(row, "stop");
    if (startMs && endMs && nowMs >= startMs && nowMs < endMs) {
      return formatAiring(row, startMs, endMs, nowMs);
    }
  }

  const first = listings[0];
  const startMs = parseInstant(first, "start");
  const endMs = parseInstant(first, "stop");
  if (startMs && endMs) {
    return formatAiring(first, startMs, endMs, nowMs);
  }

  const title = decodeEpgText(first.title) || decodeEpgText(first.name);
  if (title) {
    return {
      title,
      startMs: null,
      endMs: null,
      startLabel: first.start ? String(first.start) : null,
      endLabel: first.stop ? String(first.stop) : null,
      progress: null,
    };
  }
  return null;
}

function formatAiring(row, startMs, endMs, nowMs) {
  const fmt = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const duration = endMs - startMs;
  const elapsed = nowMs - startMs;
  const progress = duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : null;

  const title =
    decodeEpgText(row.title) ||
    decodeEpgText(row.name) ||
    decodeEpgText(row.description) ||
    "On now";

  return {
    title,
    startMs,
    endMs,
    startLabel: fmt.format(new Date(startMs)),
    endLabel: fmt.format(new Date(endMs)),
    progress,
  };
}

async function runPool(ids, concurrency, worker) {
  const results = {};
  let index = 0;

  async function runner() {
    while (index < ids.length) {
      const i = index++;
      const id = ids[i];
      results[id] = await worker(id);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, ids.length) }, () => runner());
  await Promise.all(runners);
  return results;
}

export async function resolveNowPlaying(session, xtreamAction, streamIds) {
  const unique = [...new Set(streamIds.map(String))].filter(Boolean).slice(0, 80);
  const now = Date.now();
  const missing = [];

  const out = {};
  for (const id of unique) {
    const hit = cache.get(id);
    if (hit && now - hit.at < CACHE_TTL_MS) {
      out[id] = hit.data;
    } else {
      missing.push(id);
    }
  }

  if (missing.length === 0) return out;

  const fetched = await runPool(missing, 6, async (streamId) => {
    try {
      const res = await xtreamAction(session, "get_short_epg", {
        stream_id: streamId,
        limit: 4,
      });
      const listings = res?.epg_listings ?? res?.data ?? res;
      const list = Array.isArray(listings) ? listings.map(normalizeEpgListing) : [];
      const current = pickCurrentListing(list, now);
      cache.set(streamId, { at: now, data: current });
      return current;
    } catch {
      cache.set(streamId, { at: now, data: null });
      return null;
    }
  });

  return { ...out, ...fetched };
}
