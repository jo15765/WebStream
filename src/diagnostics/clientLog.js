const recent = new Map();
const DEFAULT_DEBOUNCE_MS = 4000;

function fingerprint(category, message) {
  return `${category}:${String(message).slice(0, 120)}`;
}

export function reportClientDiagnostic(category, level, message, detail, debounceMs = DEFAULT_DEBOUNCE_MS) {
  if (typeof window === "undefined") return;
  const msg = String(message || "").trim();
  if (!msg) return;

  const fp = fingerprint(category, msg);
  const now = Date.now();
  const last = recent.get(fp) ?? 0;
  const isError = level === "error" || level === "warn";
  if (!isError && debounceMs > 0 && now - last < debounceMs) return;
  recent.set(fp, now);

  fetch("/api/diagnostics/event", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      level: level || "info",
      category: category || "playback",
      message: msg.slice(0, 500),
      detail: detail ?? undefined,
    }),
  }).catch(() => {});
}

export function reportPlaybackHiccup(message, detail) {
  reportClientDiagnostic("playback", "warn", message, detail, 2500);
}

export function reportPlaybackError(message, detail) {
  reportClientDiagnostic("playback", "error", message, detail, 0);
}
