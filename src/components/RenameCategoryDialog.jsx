import { useEffect, useRef, useState } from "react";

export function RenameCategoryDialog({ open, title, originalName, initialValue, onConfirm, onClose }) {
  const [value, setValue] = useState(initialValue ?? "");
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue ?? "");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, initialValue]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card category-rename-modal"
        role="dialog"
        aria-labelledby="rename-cat-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="rename-cat-title">Rename group</h2>
        <div className="muted rename-group-intro">
          <p className="rename-group-line">
            Custom name for <strong>{title}</strong>
          </p>
          <p className="rename-group-line">Provider name: {originalName}</p>
        </div>
        <label className="field">
          <span>Display name</span>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={originalName}
            maxLength={120}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirm(value);
              if (e.key === "Escape") onClose();
            }}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => onConfirm("")}
            title="Use provider name again"
          >
            Reset name
          </button>
          <button type="button" className="btn" onClick={() => onConfirm(value)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
