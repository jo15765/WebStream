import { useEffect, useState } from "react";
import { catalog } from "../api/http.js";
import { fetchCatalog, getCachedCatalog } from "../api/catalogCache.js";

export function useCatalog(action, params = {}, deps = []) {
  const paramKey = JSON.stringify(params);
  const cached = getCachedCatalog(action, params);

  const [data, setData] = useState(cached);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(cached === null);

  useEffect(() => {
    let cancelled = false;
    const hadCache = getCachedCatalog(action, params) !== null;
    if (!hadCache) {
      setLoading(true);
    }
    setError("");

    fetchCatalog(catalog, action, params)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [action, paramKey, ...deps]);

  return { data, error, loading: loading && data === null };
}
