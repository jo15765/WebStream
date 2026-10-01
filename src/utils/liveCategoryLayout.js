export function emptyLiveCategoryLayout() {
  return { order: [], labels: {}, hidden: [] };
}

export function normalizeLiveCategoryLayout(raw) {
  const base = emptyLiveCategoryLayout();
  if (!raw || typeof raw !== "object") return base;
  return {
    order: Array.isArray(raw.order) ? raw.order.map(String) : [],
    labels:
      raw.labels && typeof raw.labels === "object"
        ? Object.fromEntries(
            Object.entries(raw.labels).map(([k, v]) => [String(k), String(v ?? "").trim()]),
          )
        : {},
    hidden: Array.isArray(raw.hidden) ? raw.hidden.map(String) : [],
  };
}

export function ensureCategoryOrder(apiCategories, layout) {
  const ids = (apiCategories ?? []).map((c) => String(c.category_id));
  const order = [...(layout?.order ?? [])].filter((id) => ids.includes(id));
  for (const id of ids) {
    if (!order.includes(id)) order.push(id);
  }
  return order;
}

export function normalizeGroupLabel(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function displayCategoryName(category, labels) {
  const id = String(category.category_id);
  const custom = normalizeGroupLabel(labels?.[id]);
  if (custom.length > 0) return custom;
  return normalizeGroupLabel(category.category_name) || "Category";
}

export function buildLiveCategoryViews(apiCategories, layout) {
  const normalized = normalizeLiveCategoryLayout(layout);
  const hidden = new Set(normalized.hidden);
  const order = ensureCategoryOrder(apiCategories, normalized);
  const byId = new Map(
    (apiCategories ?? []).map((c) => [String(c.category_id), c]),
  );

  const views = [];
  for (const id of order) {
    if (hidden.has(id)) continue;
    const raw = byId.get(id);
    if (!raw) continue;
    views.push({
      ...raw,
      displayName: displayCategoryName(raw, normalized.labels),
      hasCustomLabel: Boolean(normalized.labels[id]?.length),
    });
  }
  return { views, order, layout: normalized };
}

export function moveCategoryInOrder(order, categoryId, delta) {
  const id = String(categoryId);
  const idx = order.indexOf(id);
  if (idx < 0) return order;
  const target = idx + delta;
  if (target < 0 || target >= order.length) return order;
  const next = [...order];
  [next[idx], next[target]] = [next[target], next[idx]];
  return next;
}

export function reorderCategoryIds(order, activeId, overId) {
  const active = String(activeId);
  const over = String(overId);
  if (active === over) return order;
  const oldIndex = order.indexOf(active);
  const newIndex = order.indexOf(over);
  if (oldIndex < 0 || newIndex < 0) return order;
  const next = [...order];
  next.splice(oldIndex, 1);
  next.splice(newIndex, 0, active);
  return next;
}
