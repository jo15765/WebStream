const DEFAULT_TIMEOUT_MS = 25_000;

function normalizePortalUrl(raw) {
  let url = String(raw || "").trim();
  if (!url) throw new Error("Portal URL is required");
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  return url.replace(/\/+$/, "");
}

function playerApiUrl(portal, username, password, extra = {}) {
  const u = new URL(`${portal}/player_api.php`);
  u.searchParams.set("username", username);
  u.searchParams.set("password", password);
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

async function fetchJson(url, signal) {
  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Provider returned ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`);
  }
  return res.json();
}

export async function verifyCredentials(portalRaw, username, password) {
  const portal = normalizePortalUrl(portalRaw);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const data = await fetchJson(
      playerApiUrl(portal, username, password),
      controller.signal,
    );
    if (!data?.user_info || data.user_info.auth !== 1) {
      throw new Error("Invalid username or password");
    }
    return {
      portal,
      username,
      password,
      userInfo: data.user_info,
      serverInfo: data.server_info ?? {},
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseServerHost(raw) {
  const trimmed = String(raw || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  if (!trimmed) return { host: "", port: null };
  const slash = trimmed.indexOf("/");
  const authority = slash >= 0 ? trimmed.slice(0, slash) : trimmed;
  if (authority.includes(":")) {
    const [host, port] = authority.split(":");
    return { host, port };
  }
  return { host: authority, port: null };
}

export function streamPortalUrl(session) {
  const loginPortal = String(session.portal || "").replace(/\/+$/, "");
  const info = session.serverInfo || {};
  const { host, port: hostPort } = parseServerHost(info.url);
  if (!host) return loginPortal;

  const protocol = String(info.server_protocol || "http")
    .replace(/:$/, "")
    .toLowerCase();
  const portRaw =
    hostPort ??
    (protocol === "https" ? info.https_port ?? info.port : info.port);
  const port = portRaw != null && String(portRaw).trim() !== "" ? Number(portRaw) : null;
  const defaultPort = protocol === "https" ? 443 : 80;
  const usePort = port != null && !Number.isNaN(port) && port !== defaultPort;

  const built = `${protocol}://${host}${usePort ? `:${port}` : ""}`;

  try {
    const login = new URL(loginPortal.match(/^https?:\/\//i) ? loginPortal : `http://${loginPortal}`);
    const builtUrl = new URL(built);
    if (login.hostname === builtUrl.hostname && login.port === builtUrl.port) {
      return loginPortal;
    }
  } catch {
  }

  return built;
}

export async function xtreamAction(session, action, params = {}) {
  const url = playerApiUrl(session.portal, session.username, session.password, {
    action,
    ...params,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetchJson(url, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export function mediaPath(session, kind, streamId, extension) {
  const portal = streamPortalUrl(session);
  const { username, password } = session;
  const ext = extension.replace(/^\./, "");
  const segment = kind === "live" ? "live" : kind === "movie" ? "movie" : "series";
  return `${portal}/${segment}/${username}/${password}/${streamId}.${ext}`;
}

export { normalizePortalUrl };
