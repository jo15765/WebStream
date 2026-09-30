import { useEffect, useState } from "react";

export function useProgressiveReveal(items, { initial = 36, step = 40 } = {}) {
  const total = items.length;
  const [limit, setLimit] = useState(() => Math.min(initial, total));

  useEffect(() => {
    setLimit(Math.min(initial, total));
  }, [items, initial, total]);

  useEffect(() => {
    if (limit >= total) return;

    const grow = () => setLimit((prev) => Math.min(prev + step, total));

    if (limit <= initial) {
      const id = requestAnimationFrame(grow);
      return () => cancelAnimationFrame(id);
    }

    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(grow, { timeout: 200 });
      return () => cancelIdleCallback(id);
    }

    const id = setTimeout(grow, 0);
    return () => clearTimeout(id);
  }, [limit, total, step, initial]);

  return {
    visibleItems: items.slice(0, limit),
    shown: Math.min(limit, total),
    total,
    isComplete: limit >= total,
  };
}
