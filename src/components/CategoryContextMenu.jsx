import { useEffect, useRef } from "react";

export function CategoryContextMenu({
  open,
  x,
  y,
  canMoveUp,
  canMoveDown,
  onRename,
  onMoveUp,
  onMoveDown,
  onOrganize,
  onClose,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const clampedX = Math.min(x, window.innerWidth - 220);
  const clampedY = Math.min(y, window.innerHeight - 240);

  return (
    <div
      ref={menuRef}
      className="category-context-menu"
      style={{ top: clampedY, left: clampedX }}
      role="menu"
    >
      <button type="button" role="menuitem" className="ctx-item" onClick={onRename}>
        Rename…
      </button>
      <button
        type="button"
        role="menuitem"
        className="ctx-item"
        disabled={!canMoveUp}
        onClick={onMoveUp}
      >
        Move up
      </button>
      <button
        type="button"
        role="menuitem"
        className="ctx-item"
        disabled={!canMoveDown}
        onClick={onMoveDown}
      >
        Move down
      </button>
      <div className="ctx-sep" role="separator" />
      <button type="button" role="menuitem" className="ctx-item" onClick={onOrganize}>
        Open group organizer…
      </button>
    </div>
  );
}
