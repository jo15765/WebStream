import { verifyCredentials } from "./xtream.js";
import { getRememberedCredentials } from "./dataStore.js";

export async function establishXtreamSession(req, { portal, username, password, playbackClientIp }) {
  const sessionData = await verifyCredentials(portal, username, password);
  req.session.xtream = sessionData;
  if (playbackClientIp) {
    req.session.playbackClientIp = String(playbackClientIp).trim();
  }
  return sessionData;
}

export function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

export async function tryRememberedLogin(req) {
  const creds = getRememberedCredentials();
  if (!creds) return false;
  await establishXtreamSession(req, {
    portal: creds.portal,
    username: creds.username,
    password: creds.password,
    playbackClientIp: req.session?.playbackClientIp,
  });
  await saveSession(req);
  return true;
}

export function mePayload(session) {
  const { userInfo, serverInfo, portal } = session.xtream;
  return {
    connected: true,
    portal,
    userInfo: {
      username: userInfo.username,
      status: userInfo.status,
      exp_date: userInfo.exp_date,
      active_cons: userInfo.active_cons,
      max_connections: userInfo.max_connections,
    },
    serverInfo: {
      url: serverInfo.url,
      timezone: serverInfo.timezone,
    },
  };
}
