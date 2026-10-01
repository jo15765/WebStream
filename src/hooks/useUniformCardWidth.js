import { useEffect, useState } from "react";

const FONT =
  '600 0.92rem "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif';

function cleanMeasureText(raw) {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function useUniformCardWidth(texts, { min = 140, max = 260, pad = 36 } = {}) {
  const [width, setWidth] = useState(min);

  const textKey = Array.isArray(texts) ? texts.join("\u0001") : "";

  useEffect(() => {
    if (typeof document === "undefined") return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.font = FONT;
    let maxText = min - pad;
    for (const raw of textKey.split("\u0001")) {
      const text = cleanMeasureText(raw);
      if (!text) continue;
      maxText = Math.max(maxText, ctx.measureText(text).width);
    }
    setWidth(Math.min(max, Math.max(min, Math.ceil(maxText) + pad)));
  }, [textKey, min, max, pad]);

  return width;
}
