export function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return xff.split(",")[0].trim();
  }
  if (Array.isArray(xff) && xff[0]) {
    return String(xff[0]).trim();
  }
  const addr = req.socket?.remoteAddress || "";
  if (addr.startsWith("::ffff:")) return addr.slice(7);
  return addr;
}

function isLoopback(ip) {
  const s = String(ip || "").toLowerCase();
  return s === "127.0.0.1" || s === "::1" || s === "localhost";
}

export function isPlausibleClientIp(ip) {
  const s = String(ip || "").trim();
  if (!s || s.length > 64) return false;
  if (isLoopback(s)) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return true;
  if (s.includes(":")) return true;
  return false;
}

export function getPlaybackClientIp(req) {
  const stored = req.session?.playbackClientIp;
  if (isPlausibleClientIp(stored)) return stored;

  const fromHeader = req.headers["x-playback-client-ip"];
  const headerIp = typeof fromHeader === "string" ? fromHeader.trim() : "";
  if (isPlausibleClientIp(headerIp)) return headerIp;

  const socketIp = getClientIp(req);
  if (!isLoopback(socketIp)) return socketIp;

  return stored || socketIp;
}
