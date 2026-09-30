import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, catalog, detectPublicClientIp } from "../api/http.js";
import { fetchCatalog } from "../api/catalogCache.js";

const PortalContext = createContext(null);

export function PortalProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api("/api/me");
      const connected = data.connected ? data : null;
      setProfile(connected);
      if (!connected && data.autoLoginFailed) {
        setLoginError(data.error || "Saved login failed. Sign in again.");
      } else {
        setLoginError(null);
      }
      if (connected) {
        queueMicrotask(() => {
          fetchCatalog(catalog, "get_live_categories").catch(() => {});
        });
      }
    } catch {
      setProfile(null);
      setLoginError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const connect = useCallback(async (portal, username, password, rememberCredentials = false) => {
    const playbackClientIp = await detectPublicClientIp().catch(() => null);
    await api("/api/connect", {
      method: "POST",
      body: JSON.stringify({
        portal,
        username,
        password,
        playbackClientIp,
        rememberCredentials,
      }),
    });
    await refresh();
  }, [refresh]);

  const disconnect = useCallback(async () => {
    await api("/api/disconnect", { method: "POST" });
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({
      profile,
      loading,
      connected: Boolean(profile),
      connect,
      disconnect,
      refresh,
      loginError,
    }),
    [profile, loading, connect, disconnect, refresh, loginError],
  );

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortal must be used within PortalProvider");
  return ctx;
}
