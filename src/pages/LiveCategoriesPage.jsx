import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Tab, TabList, TabPanel, Tabs } from "react-tabs";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCatalog } from "../hooks/useCatalog.js";
import { useUniformCardWidth } from "../hooks/useUniformCardWidth.js";
import { RenameCategoryDialog } from "../components/RenameCategoryDialog.jsx";
import { useLibrary } from "../state/LibraryContext.jsx";
import {
  displayCategoryName,
  ensureCategoryOrder,
  normalizeLiveCategoryLayout,
} from "../utils/liveCategoryLayout.js";

const TAB_KEYS = ["all", "visible", "hidden"];

function GripIcon() {
  return (
    <svg className="group-grip" viewBox="0 0 24 24" aria-hidden>
      <circle cx="9" cy="7" r="1.5" fill="currentColor" />
      <circle cx="15" cy="7" r="1.5" fill="currentColor" />
      <circle cx="9" cy="12" r="1.5" fill="currentColor" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" />
      <circle cx="9" cy="17" r="1.5" fill="currentColor" />
      <circle cx="15" cy="17" r="1.5" fill="currentColor" />
    </svg>
  );
}

function GroupCard({
  category,
  layout,
  cardWidth,
  reorderEnabled,
  onRename,
  onToggleHidden,
  onMove,
  canMoveUp,
  canMoveDown,
}) {
  const id = String(category.category_id);
  const hidden = layout.hidden.includes(id);
  const label = displayCategoryName(category, layout.labels);
  const isCustom = Boolean(layout.labels[id]?.length);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !reorderEnabled || hidden,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: cardWidth,
    maxWidth: "100%",
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`group-card${hidden ? " is-hidden-group" : ""}${isDragging ? " is-dragging" : ""}`}
    >
      <div className="group-card-top">
        {reorderEnabled && !hidden ? (
          <button type="button" className="group-card-grip" {...attributes} {...listeners}>
            <GripIcon />
            <span className="sr-only">Drag to reorder</span>
          </button>
        ) : (
          <span className="group-card-grip spacer" aria-hidden />
        )}
        <span className={`group-card-status${hidden ? " hidden" : " visible"}`}>
          {hidden ? "Hidden" : "Visible"}
        </span>
      </div>
      <h3 className="group-card-title">{label}</h3>
      {isCustom ? (
        <p className="muted group-card-provider">Provider: {category.category_name}</p>
      ) : null}
      <div className="group-card-actions">
        <button type="button" className="btn ghost group-card-btn" onClick={() => onRename(category)}>
          Rename
        </button>
        {!hidden && canMoveUp ? (
          <button type="button" className="btn ghost group-card-btn" onClick={() => onMove(id, -1)}>
            ↑
          </button>
        ) : null}
        {!hidden && canMoveDown ? (
          <button type="button" className="btn ghost group-card-btn" onClick={() => onMove(id, 1)}>
            ↓
          </button>
        ) : null}
        <button
          type="button"
          className={`btn ghost group-card-btn${hidden ? "" : " danger"}`}
          onClick={() => onToggleHidden(id, !hidden)}
        >
          {hidden ? "Show" : "Hide"}
        </button>
      </div>
    </article>
  );
}

function GroupCardGrid({
  items,
  layout,
  order,
  cardWidth,
  reorderEnabled,
  query,
  onRename,
  onToggleHidden,
  onMove,
  onDragEnd,
  sensors,
}) {
  const ids = items.map((c) => String(c.category_id));

  const grid = (
    <div
      className="group-card-grid"
      style={{ "--group-card-w": `${cardWidth}px` }}
      role="list"
    >
      {items.map((c) => {
        const id = String(c.category_id);
        const idx = order.indexOf(id);
        return (
          <GroupCard
            key={c.category_id}
            category={c}
            layout={layout}
            cardWidth={cardWidth}
            reorderEnabled={reorderEnabled && !query}
            onRename={onRename}
            onToggleHidden={onToggleHidden}
            onMove={onMove}
            canMoveUp={idx > 0}
            canMoveDown={idx >= 0 && idx < order.length - 1}
          />
        );
      })}
    </div>
  );

  if (items.length === 0) {
    return <p className="empty group-card-empty">No groups in this view.</p>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        {grid}
      </SortableContext>
    </DndContext>
  );
}

export function LiveCategoriesPage() {
  const { data: categories, loading } = useCatalog("get_live_categories");
  const {
    liveCategories,
    syncLiveCategoryOrder,
    setLiveCategoryOrder,
    renameLiveCategory,
    setLiveCategoryHidden,
    moveLiveCategory,
    resetLiveCategories,
  } = useLibrary();
  const [savedFlash, setSavedFlash] = useState(false);
  const [query, setQuery] = useState("");
  const [tabIndex, setTabIndex] = useState(1);
  const [reorderMode, setReorderMode] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);

  const layout = normalizeLiveCategoryLayout(liveCategories);
  const tab = TAB_KEYS[tabIndex] ?? "visible";

  useEffect(() => {
    if (categories?.length) syncLiveCategoryOrder(categories);
  }, [categories, syncLiveCategoryOrder]);

  const order = useMemo(
    () => ensureCategoryOrder(categories, layout),
    [categories, layout],
  );

  const allRows = useMemo(() => {
    const byId = new Map((categories ?? []).map((c) => [String(c.category_id), c]));
    return order.map((id) => byId.get(id)).filter(Boolean);
  }, [categories, order]);

  const hiddenSet = useMemo(() => new Set(layout.hidden), [layout.hidden]);

  const visibleRows = useMemo(
    () => allRows.filter((c) => !hiddenSet.has(String(c.category_id))),
    [allRows, hiddenSet],
  );

  const hiddenRows = useMemo(
    () => allRows.filter((c) => hiddenSet.has(String(c.category_id))),
    [allRows, hiddenSet],
  );

  const needle = query.trim().toLowerCase();

  const filterBySearch = useCallback(
    (list) => {
      if (!needle) return list;
      return list.filter((c) => {
        const display = displayCategoryName(c, layout.labels).toLowerCase();
        const provider = (c.category_name || "").toLowerCase();
        return display.includes(needle) || provider.includes(needle);
      });
    },
    [layout.labels, needle],
  );

  const filteredAll = useMemo(() => filterBySearch(allRows), [allRows, filterBySearch]);
  const filteredVisible = useMemo(
    () => filterBySearch(visibleRows),
    [visibleRows, filterBySearch],
  );
  const filteredHidden = useMemo(
    () => filterBySearch(hiddenRows),
    [hiddenRows, filterBySearch],
  );

  const activeRows =
    tab === "all" ? filteredAll : tab === "visible" ? filteredVisible : filteredHidden;

  const measureTexts = useMemo(
    () => activeRows.map((c) => displayCategoryName(c, layout.labels)),
    [activeRows, layout.labels],
  );

  const cardWidth = useUniformCardWidth(measureTexts);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (needle) setReorderMode(false);
  }, [needle]);

  useEffect(() => {
    if (tab === "hidden") setReorderMode(false);
  }, [tab]);

  const flashSaved = () => {
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1800);
  };

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setLiveCategoryOrder(arrayMove(order, oldIndex, newIndex));
    flashSaved();
  };

  const renderPanel = (rows) => (
    <GroupCardGrid
      items={rows}
      layout={layout}
      order={order}
      cardWidth={cardWidth}
      reorderEnabled={reorderMode && tab !== "hidden"}
      query={needle}
      sensors={sensors}
      onDragEnd={onDragEnd}
      onRename={setRenameTarget}
      onToggleHidden={(id, hide) => {
        setLiveCategoryHidden(id, hide);
        flashSaved();
      }}
      onMove={(id, delta) => {
        moveLiveCategory(id, delta);
        flashSaved();
      }}
    />
  );

  return (
    <div className="page group-organizer-page">
      <header className="page-header split">
        <div>
          <h1>Organize channel groups</h1>
          <p className="muted group-organizer-lead">
            Each group is a card below. Names align to the widest title so the grid stays even.
            Changes save to this server only.
          </p>
        </div>
        <div className="toolbar">
          <Link to="/live" className="btn ghost">
            Back to Live TV
          </Link>
          <button
            type="button"
            className="btn ghost danger"
            onClick={() => {
              if (window.confirm("Reset all group names, order, and visibility?")) {
                resetLiveCategories();
                flashSaved();
              }
            }}
          >
            Reset defaults
          </button>
        </div>
      </header>

      <div className="group-organizer-stats panel">
        <span>
          <strong>{allRows.length}</strong> total
        </span>
        <span className="group-stat-sep">·</span>
        <span>
          <strong>{visibleRows.length}</strong> visible on Live TV
        </span>
        <span className="group-stat-sep">·</span>
        <span>
          <strong>{hiddenRows.length}</strong> hidden
        </span>
        {savedFlash ? (
          <span className="form-success group-organizer-saved" role="status">
            Saved
          </span>
        ) : null}
      </div>

      <Tabs
        className="group-tabs"
        selectedIndex={tabIndex}
        onSelect={(index) => setTabIndex(index)}
      >
        <div className="group-organizer-toolbar">
          <TabList className="group-tab-list">
            <Tab className="group-tab">
              All
              <span className="group-tab-count">{allRows.length}</span>
            </Tab>
            <Tab className="group-tab">
              Visible
              <span className="group-tab-count">{visibleRows.length}</span>
            </Tab>
            <Tab className="group-tab">
              Hidden
              <span className="group-tab-count">{hiddenRows.length}</span>
            </Tab>
          </TabList>
          <input
            className="search-inline group-organizer-search"
            type="search"
            placeholder="Search groups…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search channel groups"
          />
          <label className="group-toggle">
            <input
              type="checkbox"
              checked={reorderMode}
              disabled={Boolean(needle) || tab === "hidden"}
              onChange={(e) => setReorderMode(e.target.checked)}
            />
            Drag to reorder
          </label>
        </div>

        <div className="group-card-scroll panel">
          {loading && !categories ? (
            <p className="muted">Loading groups…</p>
          ) : (
            <>
              <TabPanel className="group-tab-panel">
                {renderPanel(filteredAll)}
              </TabPanel>
              <TabPanel className="group-tab-panel">
                {renderPanel(filteredVisible)}
              </TabPanel>
              <TabPanel className="group-tab-panel">
                {renderPanel(filteredHidden)}
              </TabPanel>
            </>
          )}
        </div>
      </Tabs>

      <RenameCategoryDialog
        open={Boolean(renameTarget)}
        title={
          renameTarget
            ? displayCategoryName(renameTarget, layout.labels)
            : "Group"
        }
        originalName={renameTarget?.category_name ?? ""}
        initialValue={
          renameTarget ? layout.labels[String(renameTarget.category_id)] ?? "" : ""
        }
        onClose={() => setRenameTarget(null)}
        onConfirm={(value) => {
          if (renameTarget) renameLiveCategory(renameTarget.category_id, value);
          setRenameTarget(null);
          flashSaved();
        }}
      />
    </div>
  );
}
