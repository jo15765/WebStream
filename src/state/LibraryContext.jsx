import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchLibrary, saveLibrary } from "../api/http.js";
import { reportClientDiagnostic } from "../diagnostics/clientLog.js";
import { usePortal } from "./PortalContext.jsx";

const LEGACY_STORAGE_KEY = "webstream.library.v1";

const LibraryContext = createContext(null);

function readLegacyLocalStore() {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      progress: parsed.progress && typeof parsed.progress === "object" ? parsed.progress : {},
    };
  } catch {
    return null;
  }
}

export function LibraryProvider({ children }) {
  const { connected, loading: portalLoading } = usePortal();
  const [store, setStore] = useState({ favorites: [], progress: {} });
  const saveTimerRef = useRef(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (portalLoading) return;
    if (!connected) {
      hydratedRef.current = false;
      setStore({ favorites: [], progress: {} });
      return;
    }
    let cancelled = false;
    hydratedRef.current = false;
    fetchLibrary()
      .then(async (data) => {
        if (cancelled) return;
        let next = {
          favorites: Array.isArray(data?.favorites) ? data.favorites : [],
          progress: data?.progress && typeof data.progress === "object" ? data.progress : {},
        };
        const empty =
          next.favorites.length === 0 && Object.keys(next.progress).length === 0;
        const legacy = empty ? readLegacyLocalStore() : null;
        if (legacy) {
          next = legacy;
          try {
            await saveLibrary(next);
            localStorage.removeItem(LEGACY_STORAGE_KEY);
          } catch {
          }
        }
        setStore(next);
        hydratedRef.current = true;
      })
      .catch(() => {
        if (!cancelled) hydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [connected, portalLoading]);

  const persist = useCallback(
    (updater) => {
      setStore((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        if (connected && hydratedRef.current) {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => {
            saveLibrary(next).catch((e) => {
              console.warn("[WebStream library]", e.message || e);
              reportClientDiagnostic(
                "library",
                "warn",
                e.message || "Library save failed",
                undefined,
                8000,
              );
            });
          }, 400);
        }
        return next;
      });
    },
    [connected],
  );

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  const toggleFavorite = useCallback(
    (item) => {
      persist((prev) => {
        const key = itemKey(item);
        const exists = prev.favorites.some((f) => itemKey(f) === key);
        const favorites = exists
          ? prev.favorites.filter((f) => itemKey(f) !== key)
          : [...prev.favorites, { ...item, savedAt: Date.now() }];
        return { ...prev, favorites };
      });
    },
    [persist],
  );

  const isFavorite = useCallback(
    (item) => store.favorites.some((f) => itemKey(f) === itemKey(item)),
    [store.favorites],
  );

  const saveProgress = useCallback(
    (item, positionSec, durationSec) => {
      if (!item?.stream_id && !item?.series_id) return;
      persist((prev) => ({
        ...prev,
        progress: {
          ...prev.progress,
          [itemKey(item)]: {
            positionSec,
            durationSec,
            updatedAt: Date.now(),
            label: item.name || item.title,
            kind: item.kind,
            streamId: item.stream_id || item.series_id,
            cover: item.stream_icon || item.cover,
          },
        },
      }));
    },
    [persist],
  );

  const getProgress = useCallback(
    (item) => store.progress[itemKey(item)],
    [store.progress],
  );

  const continueWatching = useMemo(() => {
    return Object.entries(store.progress)
      .map(([key, value]) => ({ key, ...value }))
      .filter((e) => e.durationSec > 0 && e.positionSec / e.durationSec < 0.92)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 12);
  }, [store.progress]);

  const value = useMemo(
    () => ({
      favorites: store.favorites,
      toggleFavorite,
      isFavorite,
      saveProgress,
      getProgress,
      continueWatching,
    }),
    [store.favorites, toggleFavorite, isFavorite, saveProgress, getProgress, continueWatching],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used within LibraryProvider");
  return ctx;
}

function itemKey(item) {
  return `${item.kind}:${item.stream_id ?? item.series_id ?? item.name}`;
}
