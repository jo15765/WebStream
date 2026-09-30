function looksLikeBase64(value) {
  const s = String(value).replace(/\s/g, "");
  if (s.length < 8 || s.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/=]+$/.test(s);
}

function decodeBase64Utf8(value) {
  try {
    const normalized = String(value).replace(/\s/g, "");
    const decoded = Buffer.from(normalized, "base64").toString("utf8").trim();
    if (!decoded || decoded.includes("\uFFFD")) return null;
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

function fixMojibake(value) {
  if (!value || typeof value !== "string") return value;
  if (!/[ÃÂÐÑÕØÙÚÛÜÝÞßà-ÿ]/.test(value)) return value;
  try {
    const fixed = Buffer.from(value, "latin1").toString("utf8").trim();
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

export function normalizeEpgListing(row) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    title: decodeEpgText(row.title || row.name || ""),
    name: decodeEpgText(row.name || row.title || ""),
    description: decodeEpgText(row.description || row.desc || ""),
  };
}
