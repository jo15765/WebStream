function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function applyCookies(session, targetUrl, headers) {
  if (!session) return headers;
  const host = hostOf(targetUrl);
  const jar = session.cdnCookies?.[host];
  if (jar) {
    headers.Cookie = jar;
  }
  return headers;
}

export function storeCookies(session, targetUrl, response) {
  if (!session) return;
  const host = hostOf(targetUrl);
  if (!host) return;

  let setCookies = [];
  if (typeof response.headers.getSetCookie === "function") {
    setCookies = response.headers.getSetCookie();
  } else {
    const raw = response.headers.get("set-cookie");
    if (raw) setCookies = [raw];
  }
  if (!setCookies.length) return;

  if (!session.cdnCookies) session.cdnCookies = {};

  const pairs = setCookies.map((line) => line.split(";")[0].trim()).filter(Boolean);
  const merged = pairs.join("; ");
  session.cdnCookies[host] = session.cdnCookies[host]
    ? `${session.cdnCookies[host]}; ${merged}`
    : merged;
}
