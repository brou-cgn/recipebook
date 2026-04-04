import React, { useRef, useCallback, useEffect } from 'react';
import './PrintFormatEditor.css';
import {
  PRINT_FORMAT_ELEMENTS,
  DEFAULT_PRINT_ELEMENTS_PORTRAIT,
  DEFAULT_PRINT_ELEMENTS_LANDSCAPE,
  mergePrintElementsWithDefaults,
  PRINT_FONT_OPTIONS,
  PRINT_IMAGE_COLUMNS_OPTIONS,
} from '../utils/customLists';

// Minimum element size in percent of page
const MIN_W = 5;
const MIN_H = 3;

/**
 * Returns default elements for the given orientation.
 * Falls back to portrait defaults.
 */
function getDefaultElements(orientation) {
  return orientation === 'landscape'
    ? DEFAULT_PRINT_ELEMENTS_LANDSCAPE
    : DEFAULT_PRINT_ELEMENTS_PORTRAIT;
}

/**
 * Clamp a value between min and max.
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * WYSIWYG print format editor.
 *
 * Props:
 *   format        {object}   - The current print format object
 *   onChange      {function} - Called with the updated format whenever anything changes
 */
export default function PrintFormatEditor({ format, onChange }) {
  const pageRef = useRef(null);

  // Interaction state: null | { type: 'drag'|'resize', elementId, handle?,
  //   startMouseX, startMouseY, startElemX, startElemY, startElemW, startElemH }
  const interactionRef = useRef(null);

  const orientation = format?.orientation || 'portrait';
  const fontFamily = format?.fontFamily || "Georgia, 'Times New Roman', serif";
  const imageColumns = format?.imageColumns || 'auto';

  // Merge stored elements with defaults so we always have all element IDs
  const elements = mergePrintElementsWithDefaults(format?.elements, orientation);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const updateFormat = useCallback(
    (patch) => onChange({ ...format, ...patch }),
    [format, onChange],
  );

  const updateElements = useCallback(
    (newElements) => updateFormat({ elements: newElements }),
    [updateFormat],
  );

  const updateElement = useCallback(
    (id, patch) => {
      const updated = elements.map((el) =>
        el.id === id ? { ...el, ...patch } : el,
      );
      updateElements(updated);
    },
    [elements, updateElements],
  );

  // ─── Mouse event handlers ────────────────────────────────────────────────────

  const getPageRect = () => pageRef.current?.getBoundingClientRect();

  const startDrag = useCallback(
    (e, elementId) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = getPageRect();
      if (!rect) return;
      const el = elements.find((el) => el.id === elementId);
      if (!el) return;
      interactionRef.current = {
        type: 'drag',
        elementId,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startElemX: el.x,
        startElemY: el.y,
        pageWidth: rect.width,
        pageHeight: rect.height,
      };
    },
    [elements],
  );

  const startResize = useCallback(
    (e, elementId, handle) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = getPageRect();
      if (!rect) return;
      const el = elements.find((el) => el.id === elementId);
      if (!el) return;
      interactionRef.current = {
        type: 'resize',
        elementId,
        handle,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startElemX: el.x,
        startElemY: el.y,
        startElemW: el.w,
        startElemH: el.h,
        pageWidth: rect.width,
        pageHeight: rect.height,
      };
    },
    [elements],
  );

  useEffect(() => {
    const onMouseMove = (e) => {
      const state = interactionRef.current;
      if (!state) return;

      const dx = ((e.clientX - state.startMouseX) / state.pageWidth) * 100;
      const dy = ((e.clientY - state.startMouseY) / state.pageHeight) * 100;

      if (state.type === 'drag') {
        const el = elements.find((el) => el.id === state.elementId);
        if (!el) return;
        const newX = clamp(state.startElemX + dx, 0, 100 - el.w);
        const newY = clamp(state.startElemY + dy, 0, 100 - el.h);
        updateElement(state.elementId, { x: newX, y: newY });
      } else if (state.type === 'resize') {
        const { handle } = state;
        let x = state.startElemX;
        let y = state.startElemY;
        let w = state.startElemW;
        let h = state.startElemH;

        if (handle.includes('e')) w = Math.max(MIN_W, state.startElemW + dx);
        if (handle.includes('s')) h = Math.max(MIN_H, state.startElemH + dy);
        if (handle.includes('w')) {
          const newW = Math.max(MIN_W, state.startElemW - dx);
          x = clamp(state.startElemX + (state.startElemW - newW), 0, 100 - MIN_W);
          w = newW;
        }
        if (handle.includes('n')) {
          const newH = Math.max(MIN_H, state.startElemH - dy);
          y = clamp(state.startElemY + (state.startElemH - newH), 0, 100 - MIN_H);
          h = newH;
        }

        // Clamp to page bounds
        w = Math.min(w, 100 - x);
        h = Math.min(h, 100 - y);

        updateElement(state.elementId, { x, y, w, h });
      }
    };

    const onMouseUp = () => {
      interactionRef.current = null;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [elements, updateElement]);

  // ─── Orientation change ──────────────────────────────────────────────────────

  const handleOrientationChange = (newOrientation) => {
    updateFormat({
      orientation: newOrientation,
      elements: getDefaultElements(newOrientation),
    });
  };

  const handleResetLayout = () => {
    updateElements(getDefaultElements(orientation));
  };

  // ─── Page aspect ratio ───────────────────────────────────────────────────────
  // A4: 210 × 297 mm  → portrait padding-bottom ≈ 141.4%, landscape ≈ 70.7%
  const pagePaddingBottom = orientation === 'landscape' ? '70.71%' : '141.43%';

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="pfe-root">
      {/* ── Settings toolbar ──────────────────────────────────────────────── */}
      <div className="pfe-toolbar">
        {/* Orientation */}
        <div className="pfe-toolbar-group">
          <span className="pfe-toolbar-label">Ausrichtung:</span>
          <label className="pfe-radio-label">
            <input
              type="radio"
              name={`pfe-orientation-${format?.id}`}
              value="portrait"
              checked={orientation === 'portrait'}
              onChange={() => handleOrientationChange('portrait')}
            />
            Hochformat
          </label>
          <label className="pfe-radio-label">
            <input
              type="radio"
              name={`pfe-orientation-${format?.id}`}
              value="landscape"
              checked={orientation === 'landscape'}
              onChange={() => handleOrientationChange('landscape')}
            />
            Querformat
          </label>
        </div>

        {/* Font */}
        <div className="pfe-toolbar-group">
          <span className="pfe-toolbar-label">Schriftart:</span>
          <select
            className="pfe-select"
            value={fontFamily}
            onChange={(e) => updateFormat({ fontFamily: e.target.value })}
          >
            {PRINT_FONT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Image columns */}
        <div className="pfe-toolbar-group">
          <span className="pfe-toolbar-label">Bildspalten:</span>
          <select
            className="pfe-select"
            value={imageColumns}
            onChange={(e) => updateFormat({ imageColumns: e.target.value })}
          >
            {PRINT_IMAGE_COLUMNS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Reset layout */}
        <button
          type="button"
          className="pfe-reset-btn"
          onClick={handleResetLayout}
          title="Standardlayout wiederherstellen"
        >
          Layout zurücksetzen
        </button>
      </div>

      {/* ── Visibility toggles ────────────────────────────────────────────── */}
      <div className="pfe-visibility-row">
        {PRINT_FORMAT_ELEMENTS.map((def) => {
          const el = elements.find((e) => e.id === def.id);
          const isVisible = el ? el.visible !== false : true;
          return (
            <label
              key={def.id}
              className={`pfe-vis-chip ${isVisible ? 'pfe-vis-chip--on' : 'pfe-vis-chip--off'}`}
              style={{ '--chip-color': def.color }}
            >
              <input
                type="checkbox"
                checked={isVisible}
                onChange={(e) =>
                  updateElement(def.id, { visible: e.target.checked })
                }
              />
              {def.label}
            </label>
          );
        })}
      </div>

      {/* ── Page canvas ───────────────────────────────────────────────────── */}
      <div className="pfe-page-wrapper">
        <div
          className="pfe-page"
          ref={pageRef}
          style={{ paddingBottom: pagePaddingBottom }}
        >
          <div className="pfe-page-inner">
            {elements.map((el) => {
              const def = PRINT_FORMAT_ELEMENTS.find((d) => d.id === el.id);
              if (!def) return null;
              return (
                <div
                  key={el.id}
                  className={`pfe-element ${el.visible === false ? 'pfe-element--hidden' : ''}`}
                  style={{
                    left: `${el.x}%`,
                    top: `${el.y}%`,
                    width: `${el.w}%`,
                    height: `${el.h}%`,
                    '--el-color': def.color,
                  }}
                  onMouseDown={(e) => startDrag(e, el.id)}
                  title={`${def.label} – ziehen zum Verschieben`}
                >
                  <span className="pfe-element-label">{def.label}</span>

                  {/* Resize handles (8 directions) */}
                  {['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].map((handle) => (
                    <div
                      key={handle}
                      className={`pfe-resize-handle pfe-resize-${handle}`}
                      onMouseDown={(e) => startResize(e, el.id, handle)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <p className="pfe-hint">
          Elemente verschieben: Drag &amp; Drop · Größe ändern: Ziehen an den Rändern/Ecken ·
          Elemente ein-/ausblenden: Häkchen oben
        </p>
      </div>
    </div>
  );
}
