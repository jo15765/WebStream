function looksLikeBase64(value) {
  const s = String(value).replace(/\s/g, "");
  if (s.length < 8 || s.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/=]+$/.test(s);
}

function decodeBase64Utf8(value) {
  try {
    const normalized = String(value).replace(/\s/g, "");
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const decoded = new TextDecoder("utf-8").decode(bytes).trim();
    if (!decoded || decoded.includes("\uFFFD")) return null;
    return decoded;
  } catch {
    return null;
  }
}

function fixMojibake(value) {
  if (!value || typeof value !== "string") return value;
  if (!/[ÃÂÐÑÕØÙÚÛÜÝÞßà-ÿ]/.test(value)) return value;
  try {
    const bytes = Uint8Array.from(value, (c) => c.charCodeAt(0));
    const fixed = new TextDecoder("utf-8").decode(bytes).trim();
    if (fixed && !fixed.includes("\uFFFD")) return fixed;
  } catch {
  }
  return value;
}

export function decodeEpgText(value) {
  if (value === undefined || value === null) return "";
  const raw = String(value).trim();
  if (!raw) return "";

  if (looksLikeBase64(raw)) {
    const decoded = decodeBase64Utf8(raw);
    if (decoded) return fixMojibake(decoded);
  }

  return fixMojibake(raw);
}
