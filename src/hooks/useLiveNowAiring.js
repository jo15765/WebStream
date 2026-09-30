import { useEffect, useRef, useState } from "react";

const REFRESH_MS = 5 * 60 * 1000;

export function useLiveNowAiring(streamIds, { enabled = true } = {}) {
  const key = streamIds.join(",");
  const idsRef = useRef(streamIds);
  idsRef.current = streamIds;

  const [map, setMap] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !key) {
      setMap({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    let refreshTimer;

    const run = () => {
      if (cancelled) return;
      setLoading(true);
      const payload = idsRef.current;

      fetch("/api/epg/now", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamIds: payload }),
      })
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((res) => {
          if (!cancelled) setMap(res?.airing ?? {});
        })
        .catch(() => {
          if (!cancelled) setMap({});
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    const debounce = setTimeout(() => {
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(run, { timeout: 2500 });
      } else {
        run();
      }
      refreshTimer = setInterval(run, REFRESH_MS);
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(debounce);
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, [enabled, key]);

  return { airing: map, loading };
}
