import React, { useRef, useCallback, useEffect, useState } from 'react';
import './PrintFormatEditor.css';
import {
  PRINT_FORMAT_ELEMENTS,
  DEFAULT_PRINT_ELEMENTS_PORTRAIT,
  DEFAULT_PRINT_ELEMENTS_LANDSCAPE,
  mergePrintElementsWithDefaults,
  PRINT_FONT_OPTIONS,
  PRINT_IMAGE_COLUMNS_OPTIONS,
  PRINT_ROTATION_OPTIONS,
  PRINT_ASPECT_RATIO_OPTIONS,
  PRINT_TEXT_ALIGN_H_OPTIONS,
  PRINT_TEXT_ALIGN_V_OPTIONS,
  DEFAULT_PRINT_PAGE_WIDTH_CM,
  DEFAULT_PRINT_PAGE_HEIGHT_CM,
} from '../utils/customLists';

// Minimum element size in percent of page
const MIN_W = 5;
const MIN_H = 3;

// Snap threshold in percent of page (e.g. 2 = snap within 2% of page size)
const SNAP_THRESHOLD = 2;

// Minimum mouse movement (in percent of page) before a mousedown becomes a drag
const DRAG_THRESHOLD = 0.5;

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
 * Compute snap guides and adjusted position for a dragged element.
 * Returns { x, y, guides: { h: number[], v: number[] } }
 * guides.h = horizontal guide lines (y% on page)
 * guides.v = vertical guide lines (x% on page)
 */
function computeSnap(el, rawX, rawY, allElements) {
  const others = allElements.filter((o) => o.id !== el.id && o.visible !== false);

  // Candidate snap points for the current element (left, center, right edges)
  const elCenterX = rawX + el.w / 2;
  const elRightX  = rawX + el.w;
  const elCenterY = rawY + el.h / 2;
  const elBottomY = rawY + el.h;

  let snappedX = rawX;
  let snappedY = rawY;
  const hGuides = [];
  const vGuides = [];

  // Collect snap targets from other elements
  const xTargets = []; // [{ src: 'left'|'center'|'right', val }]
  const yTargets = [];
  others.forEach((o) => {
    xTargets.push({ val: o.x });
    xTargets.push({ val: o.x + o.w / 2 });
    xTargets.push({ val: o.x + o.w });
    yTargets.push({ val: o.y });
    yTargets.push({ val: o.y + o.h / 2 });
    yTargets.push({ val: o.y + o.h });
  });

  // Try to snap horizontal (x) for left/center/right edges
  const xEdges = [
    { pos: rawX,        offset: 0        },
    { pos: elCenterX,   offset: -el.w / 2 },
    { pos: elRightX,    offset: -el.w    },
  ];
  let bestXDist = SNAP_THRESHOLD;
  xEdges.forEach(({ pos, offset }) => {
    xTargets.forEach(({ val }) => {
      const dist = Math.abs(pos - val);
      if (dist < bestXDist) {
        bestXDist = dist;
        snappedX = val + offset;
        vGuides.length = 0;
        vGuides.push(val);
      } else if (dist === bestXDist) {
        vGuides.push(val);
      }
    });
  });

  // Try to snap vertical (y) for top/center/bottom edges
  const yEdges = [
    { pos: rawY,        offset: 0        },
    { pos: elCenterY,   offset: -el.h / 2 },
    { pos: elBottomY,   offset: -el.h    },
  ];
  let bestYDist = SNAP_THRESHOLD;
  yEdges.forEach(({ pos, offset }) => {
    yTargets.forEach(({ val }) => {
      const dist = Math.abs(pos - val);
      if (dist < bestYDist) {
        bestYDist = dist;
        snappedY = val + offset;
        hGuides.length = 0;
        hGuides.push(val);
      } else if (dist === bestYDist) {
        hGuides.push(val);
      }
    });
  });

  return { x: snappedX, y: snappedY, guides: { h: hGuides, v: vGuides } };
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
  // Track whether mouse has moved enough to be a drag (vs a click)
  const didDragRef = useRef(false);

  const [selectedElementId, setSelectedElementId] = useState(null);
  const [snapGuides, setSnapGuides] = useState({ h: [], v: [] });

  const orientation = format?.orientation || 'portrait';
  const fontFamily = format?.fontFamily || "Georgia, 'Times New Roman', serif";
  const imageColumns = format?.imageColumns || 'auto';

  // Page dimensions in cm (default: DIN A4)
  const pageWidthCm = format?.pageWidthCm ?? (orientation === 'landscape' ? DEFAULT_PRINT_PAGE_HEIGHT_CM : DEFAULT_PRINT_PAGE_WIDTH_CM);
  const pageHeightCm = format?.pageHeightCm ?? (orientation === 'landscape' ? DEFAULT_PRINT_PAGE_WIDTH_CM : DEFAULT_PRINT_PAGE_HEIGHT_CM);

  // Convert % ↔ cm (all coordinates are stored as % of page WIDTH)
  const pctToCmX = useCallback((pct) => ((pct / 100) * pageWidthCm).toFixed(1), [pageWidthCm]);
  const pctToCmY = useCallback((pct) => ((pct / 100) * pageWidthCm).toFixed(1), [pageWidthCm]);
  const cmToPctX = useCallback((cm) => (parseFloat(cm) / pageWidthCm) * 100, [pageWidthCm]);
  const cmToPctY = useCallback((cm) => (parseFloat(cm) / pageWidthCm) * 100, [pageWidthCm]);

  // Merge stored elements with defaults so we always have all element IDs
  const elements = mergePrintElementsWithDefaults(format?.elements, orientation);

  const selectedElement = elements.find((el) => el.id === selectedElementId) || null;
  const selectedDef = selectedElement
    ? PRINT_FORMAT_ELEMENTS.find((d) => d.id === selectedElement.id)
    : null;

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
      didDragRef.current = false;
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
      didDragRef.current = true; // resize is never a click
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
      const dy = ((e.clientY - state.startMouseY) / state.pageWidth) * 100;

      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        didDragRef.current = true;
      }

      if (!didDragRef.current) return;

      // Max y+h in % of page width (since all coords are % of page width)
      const maxPageYPct = (state.pageHeight / state.pageWidth) * 100;

      if (state.type === 'drag') {
        const el = elements.find((el) => el.id === state.elementId);
        if (!el) return;
        const rawX = clamp(state.startElemX + dx, 0, 100 - el.w);
        const rawY = clamp(state.startElemY + dy, 0, maxPageYPct - el.h);
        const snapped = computeSnap(el, rawX, rawY, elements);
        const newX = clamp(snapped.x, 0, 100 - el.w);
        const newY = clamp(snapped.y, 0, maxPageYPct - el.h);
        setSnapGuides(snapped.guides);
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
          y = clamp(state.startElemY + (state.startElemH - newH), 0, maxPageYPct - MIN_H);
          h = newH;
        }

        // Clamp to page bounds
        w = Math.min(w, 100 - x);
        h = Math.min(h, maxPageYPct - y);

        updateElement(state.elementId, { x, y, w, h });
      }
    };

    const onMouseUp = () => {
      const state = interactionRef.current;
      if (state && !didDragRef.current) {
        // It was a click – select the element
        setSelectedElementId(state.elementId);
      }
      interactionRef.current = null;
      setSnapGuides({ h: [], v: [] });
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
    setSelectedElementId(null);
    updateFormat({
      orientation: newOrientation,
      elements: getDefaultElements(newOrientation),
      pageWidthCm: newOrientation === 'landscape' ? DEFAULT_PRINT_PAGE_HEIGHT_CM : DEFAULT_PRINT_PAGE_WIDTH_CM,
      pageHeightCm: newOrientation === 'landscape' ? DEFAULT_PRINT_PAGE_WIDTH_CM : DEFAULT_PRINT_PAGE_HEIGHT_CM,
    });
  };

  const handleResetLayout = () => {
    setSelectedElementId(null);
    updateElements(getDefaultElements(orientation));
  };

  // ─── Alignment helpers ───────────────────────────────────────────────────────

  const alignSelected = useCallback(
    (axis, edge) => {
      if (!selectedElement) return;
      const others = elements.filter(
        (el) => el.id !== selectedElementId && el.visible !== false,
      );
      if (others.length === 0) return;

      let newVal;
      if (axis === 'x') {
        if (edge === 'start') {
          newVal = Math.min(...others.map((o) => o.x));
        } else if (edge === 'center') {
          const centers = others.map((o) => o.x + o.w / 2);
          const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
          newVal = avg - selectedElement.w / 2;
        } else {
          // end
          newVal = Math.max(...others.map((o) => o.x + o.w)) - selectedElement.w;
        }
        updateElement(selectedElementId, { x: clamp(newVal, 0, 100 - selectedElement.w) });
      } else {
        if (edge === 'start') {
          newVal = Math.min(...others.map((o) => o.y));
        } else if (edge === 'center') {
          const centers = others.map((o) => o.y + o.h / 2);
          const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
          newVal = avg - selectedElement.h / 2;
        } else {
          // end
          newVal = Math.max(...others.map((o) => o.y + o.h)) - selectedElement.h;
        }
        updateElement(selectedElementId, { y: clamp(newVal, 0, (pageHeightCm / pageWidthCm) * 100 - selectedElement.h) });
      }
    },
    [selectedElement, selectedElementId, elements, updateElement, pageHeightCm, pageWidthCm],
  );

  // ─── Page aspect ratio ───────────────────────────────────────────────────────
  // Derive aspect ratio from configured page dimensions (default: DIN A4)
  const pagePaddingBottom = `${(pageHeightCm / pageWidthCm) * 100}%`;
  // Max reachable y+h in % of page width (used for clamp bounds in the properties panel)
  const maxPageYPct = (pageHeightCm / pageWidthCm) * 100;

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

        {/* Page size in cm */}
        <div className="pfe-toolbar-group">
          <span className="pfe-toolbar-label">Seitengröße:</span>
          <input
            type="number"
            className="pfe-props-number pfe-toolbar-number"
            min="5"
            max="200"
            step="0.1"
            value={pageWidthCm}
            onChange={(e) => {
              const newWidth = parseFloat(e.target.value) || DEFAULT_PRINT_PAGE_WIDTH_CM;
              const newOrientation = newWidth >= pageHeightCm ? 'landscape' : 'portrait';
              updateFormat({ pageWidthCm: newWidth, orientation: newOrientation });
            }}
            title="Seitenbreite in cm"
          />
          <span className="pfe-props-unit">×</span>
          <input
            type="number"
            className="pfe-props-number pfe-toolbar-number"
            min="5"
            max="200"
            step="0.1"
            value={pageHeightCm}
            onChange={(e) => {
              const newHeight = parseFloat(e.target.value) || DEFAULT_PRINT_PAGE_HEIGHT_CM;
              const newOrientation = pageWidthCm >= newHeight ? 'landscape' : 'portrait';
              updateFormat({ pageHeightCm: newHeight, orientation: newOrientation });
            }}
            title="Seitenhöhe in cm"
          />
          <span className="pfe-props-unit">cm</span>
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
                onChange={(e) => {
                  updateElement(def.id, { visible: e.target.checked });
                  if (!e.target.checked && selectedElementId === def.id) {
                    setSelectedElementId(null);
                  }
                }}
              />
              {def.label}
            </label>
          );
        })}
      </div>

      {/* ── Canvas + properties panel ─────────────────────────────────────── */}
      <div className="pfe-canvas-and-props">
        {/* ── Page canvas ─────────────────────────────────────────────────── */}
        <div className="pfe-page-wrapper">
          <div
            className="pfe-page"
            ref={pageRef}
            style={{ paddingBottom: pagePaddingBottom }}
            onMouseDown={(e) => {
              // Click on page background deselects
              if (e.target === pageRef.current || e.target.classList.contains('pfe-page-inner')) {
                setSelectedElementId(null);
              }
            }}
          >
            <div className="pfe-page-inner">
              {/* Snap guides */}
              {snapGuides.h.map((y, i) => (
                <div
                  key={`h-${i}`}
                  className="pfe-snap-guide pfe-snap-guide--h"
                  style={{ top: `${y}%` }}
                />
              ))}
              {snapGuides.v.map((x, i) => (
                <div
                  key={`v-${i}`}
                  className="pfe-snap-guide pfe-snap-guide--v"
                  style={{ left: `${x}%` }}
                />
              ))}

              {elements.map((el) => {
                const def = PRINT_FORMAT_ELEMENTS.find((d) => d.id === el.id);
                if (!def) return null;
                if (el.visible === false) return null;
                const isSelected = el.id === selectedElementId;
                const rotation = el.rotation || 0;
                // Build border inline styles when borders are configured
                const hasBorder = el.borderTop || el.borderRight || el.borderBottom || el.borderLeft;
                const borderInlineStyles = hasBorder ? (() => {
                  const bw = `${el.borderWidth || 1}px`;
                  const bc = el.borderColor || '#000000';
                  const b = `${bw} solid ${bc}`;
                  return {
                    borderTop: el.borderTop ? b : 'none',
                    borderRight: el.borderRight ? b : 'none',
                    borderBottom: el.borderBottom ? b : 'none',
                    borderLeft: el.borderLeft ? b : 'none',
                  };
                })() : {};
                return (
                  <div
                    key={el.id}
                    className={`pfe-element ${isSelected ? 'pfe-element--selected' : ''}`.trim()}
                    style={{
                      left: `${el.x}%`,
                      top: `${el.y}%`,
                      width: `${el.w}%`,
                      height: `${el.h}%`,
                      '--el-color': def.color,
                      transform: rotation ? `rotate(${rotation}deg)` : undefined,
                      ...borderInlineStyles,
                    }}
                    onMouseDown={(e) => startDrag(e, el.id)}
                    title={`${def.label} – ziehen zum Verschieben, klicken zum Bearbeiten`}
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
            Elemente ein-/ausblenden: Häkchen oben · Klicken: Eigenschaften bearbeiten
          </p>
        </div>

        {/* ── Element properties panel ─────────────────────────────────────── */}
        {selectedElement && selectedDef && (
          <div className="pfe-props-panel">
            <div className="pfe-props-title">
              <span
                className="pfe-props-color-dot"
                style={{ background: selectedDef.color }}
              />
              {selectedDef.label}
            </div>

            {/* Position & Size in cm */}
            <div className="pfe-props-section-label">Position &amp; Größe:</div>
            <div className="pfe-props-row">
              <span className="pfe-props-label pfe-props-label--sm">X:</span>
              <input
                type="number"
                className="pfe-props-number"
                min="0"
                max={pageWidthCm}
                step="0.1"
                value={pctToCmX(selectedElement.x)}
                onChange={(e) => {
                  const newX = cmToPctX(e.target.value);
                  updateElement(selectedElementId, { x: clamp(newX, 0, 100 - selectedElement.w) });
                }}
                title="Horizontale Position in cm"
              />
              <span className="pfe-props-unit">cm</span>
              <span className="pfe-props-label pfe-props-label--sm">Y:</span>
              <input
                type="number"
                className="pfe-props-number"
                min="0"
                max={pageHeightCm}
                step="0.1"
                value={pctToCmY(selectedElement.y)}
                onChange={(e) => {
                  const newY = cmToPctY(e.target.value);
                  updateElement(selectedElementId, { y: clamp(newY, 0, maxPageYPct - selectedElement.h) });
                }}
                title="Vertikale Position in cm"
              />
              <span className="pfe-props-unit">cm</span>
            </div>
            <div className="pfe-props-row">
              <span className="pfe-props-label pfe-props-label--sm">B:</span>
              <input
                type="number"
                className="pfe-props-number"
                min="0.1"
                max={pageWidthCm}
                step="0.1"
                value={pctToCmX(selectedElement.w)}
                onChange={(e) => {
                  const newW = Math.max(MIN_W, cmToPctX(e.target.value));
                  updateElement(selectedElementId, { w: Math.min(newW, 100 - selectedElement.x) });
                }}
                title="Breite in cm"
              />
              <span className="pfe-props-unit">cm</span>
              <span className="pfe-props-label pfe-props-label--sm">H:</span>
              <input
                type="number"
                className="pfe-props-number"
                min="0.1"
                max={pageHeightCm}
                step="0.1"
                value={pctToCmY(selectedElement.h)}
                onChange={(e) => {
                  const newH = Math.max(MIN_H, cmToPctY(e.target.value));
                  updateElement(selectedElementId, { h: Math.min(newH, maxPageYPct - selectedElement.y) });
                }}
                title="Höhe in cm"
              />
              <span className="pfe-props-unit">cm</span>
            </div>

            {/* Text formatting – only for non-image elements */}
            {!selectedDef.isImage && (
              <>
                <div className="pfe-props-section-label">Schrift:</div>
                <div className="pfe-props-row">
                  <span className="pfe-props-label">Größe:</span>
                  <input
                    type="number"
                    className="pfe-props-number"
                    min="0.5"
                    max="4"
                    step="0.1"
                    value={selectedElement.fontSizeScale ?? 1}
                    onChange={(e) =>
                      updateElement(selectedElementId, {
                        fontSizeScale: parseFloat(e.target.value) || 1,
                      })
                    }
                    title="Schriftgrößen-Faktor (1 = normal)"
                  />
                  <span className="pfe-props-unit">×</span>
                </div>

                <div className="pfe-props-row">
                  <span className="pfe-props-label">Stil:</span>
                  <div className="pfe-props-style-btns">
                    <button
                      type="button"
                      className={`pfe-style-btn pfe-style-btn--bold ${selectedElement.fontBold ? 'pfe-style-btn--active' : ''}`}
                      onClick={() =>
                        updateElement(selectedElementId, { fontBold: !selectedElement.fontBold })
                      }
                      title="Fett"
                    >
                      B
                    </button>
                    <button
                      type="button"
                      className={`pfe-style-btn pfe-style-btn--italic ${selectedElement.fontItalic ? 'pfe-style-btn--active' : ''}`}
                      onClick={() =>
                        updateElement(selectedElementId, { fontItalic: !selectedElement.fontItalic })
                      }
                      title="Kursiv"
                    >
                      I
                    </button>
                    <button
                      type="button"
                      className={`pfe-style-btn pfe-style-btn--underline ${selectedElement.fontUnderline ? 'pfe-style-btn--active' : ''}`}
                      onClick={() =>
                        updateElement(selectedElementId, {
                          fontUnderline: !selectedElement.fontUnderline,
                        })
                      }
                      title="Unterstrichen"
                    >
                      U
                    </button>
                  </div>
                </div>

                <div className="pfe-props-row">
                  <span className="pfe-props-label">Farbe:</span>
                  <input
                    type="color"
                    className="pfe-props-color"
                    value={selectedElement.fontColor || '#000000'}
                    onChange={(e) =>
                      updateElement(selectedElementId, { fontColor: e.target.value })
                    }
                    title="Schriftfarbe"
                  />
                </div>

                {/* Text alignment */}
                <div className="pfe-props-section-label">Textausrichtung:</div>
                <div className="pfe-props-row">
                  <span className="pfe-props-label pfe-props-label--sm">H:</span>
                  <div className="pfe-props-style-btns">
                    {PRINT_TEXT_ALIGN_H_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`pfe-style-btn pfe-textalign-btn ${(selectedElement.textAlignH || 'left') === opt.value ? 'pfe-style-btn--active' : ''}`}
                        onClick={() =>
                          updateElement(selectedElementId, { textAlignH: opt.value })
                        }
                        title={opt.label}
                      >
                        <span className="pfe-textalign-label">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="pfe-props-row">
                  <span className="pfe-props-label pfe-props-label--sm">V:</span>
                  <div className="pfe-props-style-btns">
                    {PRINT_TEXT_ALIGN_V_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`pfe-style-btn pfe-textalign-btn ${(selectedElement.textAlignV || 'top') === opt.value ? 'pfe-style-btn--active' : ''}`}
                        onClick={() =>
                          updateElement(selectedElementId, { textAlignV: opt.value })
                        }
                        title={opt.label}
                      >
                        <span className="pfe-textalign-label">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Rotation – for all elements */}
            <div className="pfe-props-row">
              <span className="pfe-props-label">Drehung:</span>
              <select
                className="pfe-select pfe-props-select"
                value={selectedElement.rotation ?? 0}
                onChange={(e) =>
                  updateElement(selectedElementId, { rotation: parseInt(e.target.value, 10) })
                }
              >
                {PRINT_ROTATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Aspect ratio – only for image elements */}
            {selectedDef.isImage && (
              <div className="pfe-props-row">
                <span className="pfe-props-label">Seitenverhältnis:</span>
                <select
                  className="pfe-select pfe-props-select"
                  value={selectedElement.aspectRatio || 'none'}
                  onChange={(e) =>
                    updateElement(selectedElementId, { aspectRatio: e.target.value })
                  }
                >
                  {PRINT_ASPECT_RATIO_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Border – for all elements */}
            <div className="pfe-props-section-label">Rahmen:</div>
            <div className="pfe-props-row">
              <span className="pfe-props-label">Seiten:</span>
              <div className="pfe-border-sides">
                {[
                  { key: 'borderTop',    label: '↑' },
                  { key: 'borderRight',  label: '→' },
                  { key: 'borderBottom', label: '↓' },
                  { key: 'borderLeft',   label: '←' },
                ].map(({ key, label }) => (
                  <label key={key} className="pfe-border-side-label" title={key.replace('border', '')}>
                    <input
                      type="checkbox"
                      checked={!!selectedElement[key]}
                      onChange={(e) => updateElement(selectedElementId, { [key]: e.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div className="pfe-props-row">
              <span className="pfe-props-label">Farbe:</span>
              <input
                type="color"
                className="pfe-props-color"
                value={selectedElement.borderColor || '#000000'}
                onChange={(e) =>
                  updateElement(selectedElementId, { borderColor: e.target.value })
                }
                title="Rahmenfarbe"
              />
              <span className="pfe-props-label pfe-props-label--sm">Dicke:</span>
              <input
                type="number"
                className="pfe-props-number pfe-props-number--sm"
                min="0.5"
                max="20"
                step="0.5"
                value={selectedElement.borderWidth || 1}
                onChange={(e) =>
                  updateElement(selectedElementId, { borderWidth: parseFloat(e.target.value) || 1 })
                }
                title="Rahmendicke in px"
              />
              <span className="pfe-props-unit">px</span>
            </div>

            {/* Alignment */}
            <div className="pfe-props-section-label">Ausrichten:</div>
            <div className="pfe-props-align-row">
              <button
                type="button"
                className="pfe-align-btn"
                onClick={() => alignSelected('y', 'start')}
                title="Oben bündig"
              >
                ⬆ Oben
              </button>
              <button
                type="button"
                className="pfe-align-btn"
                onClick={() => alignSelected('y', 'center')}
                title="Vertikal mittig"
              >
                ↕ Mitte
              </button>
              <button
                type="button"
                className="pfe-align-btn"
                onClick={() => alignSelected('y', 'end')}
                title="Unten bündig"
              >
                ⬇ Unten
              </button>
            </div>
            <div className="pfe-props-align-row">
              <button
                type="button"
                className="pfe-align-btn"
                onClick={() => alignSelected('x', 'start')}
                title="Links bündig"
              >
                ⬅ Links
              </button>
              <button
                type="button"
                className="pfe-align-btn"
                onClick={() => alignSelected('x', 'center')}
                title="Horizontal mittig"
              >
                ↔ Mitte
              </button>
              <button
                type="button"
                className="pfe-align-btn"
                onClick={() => alignSelected('x', 'end')}
                title="Rechts bündig"
              >
                ➡ Rechts
              </button>
            </div>

            <button
              type="button"
              className="pfe-props-close-btn"
              onClick={() => setSelectedElementId(null)}
            >
              Schließen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
