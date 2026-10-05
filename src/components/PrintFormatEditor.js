import React, { useCallback, useRef, useState } from 'react';
import './PrintFormatEditor.css';
import {
  PRINT_FORMAT_ELEMENTS,
  DEFAULT_PRINT_PAGE_WIDTH_CM,
  DEFAULT_PRINT_PAGE_HEIGHT_CM,
  DEFAULT_PRINT_FONT_FAMILY,
  getDefaultPrintElements,
  mergePrintElementsWithDefaults,
} from '../utils/printElements';
import { clamp, cmToPct, effectiveDimensions, getMaxY, getPageSize } from '../utils/printLayout';
import usePrintEditorInteractions from './printEditor/usePrintEditorInteractions';
import EditorToolbar from './printEditor/EditorToolbar';
import VisibilityChips from './printEditor/VisibilityChips';
import EditorCanvas from './printEditor/EditorCanvas';
import ElementPropsPanel from './printEditor/ElementPropsPanel';

const RESET_CONFIRM = 'Das Layout wird auf das Standardlayout zurückgesetzt. Alle Anpassungen gehen verloren. Fortfahren?';

const sameLayout = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * WYSIWYG print format editor.
 *
 * Props:
 *   format        {object}   current print format
 *   onChange      {function} called with the updated format on every change
 *   previewRecipe {object}   optional; renders real recipe content under the boxes
 *   authorName    {string}   optional author name for the preview
 */
export default function PrintFormatEditor({ format, onChange, previewRecipe, authorName }) {
  const pageRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);

  const orientation = format?.orientation || 'portrait';
  const fontFamily = format?.fontFamily || DEFAULT_PRINT_FONT_FAMILY;
  const page = getPageSize(format);
  const elements = mergePrintElementsWithDefaults(format?.elements, orientation);
  const selected = elements.find((el) => el.id === selectedId) || null;
  const selectedDef = selected ? PRINT_FORMAT_ELEMENTS.find((d) => d.id === selected.id) : null;

  const updateFormat = useCallback((patch) => onChange({ ...format, ...patch }), [format, onChange]);
  const updateElement = useCallback(
    (id, patch) => updateFormat({ elements: elements.map((el) => (el.id === id ? { ...el, ...patch } : el)) }),
    [elements, updateFormat],
  );

  const { startDrag, startResize, snapGuides } = usePrintEditorInteractions({
    pageRef, elements, page, updateElement, onSelect: setSelectedId,
  });

  const confirmReset = () =>
    sameLayout(format?.elements, getDefaultPrintElements(orientation)) || window.confirm(RESET_CONFIRM);

  const handleOrientationChange = (next) => {
    if (next === orientation || !confirmReset()) return;
    setSelectedId(null);
    updateFormat({
      orientation: next,
      elements: getDefaultPrintElements(next).map((el) => ({ ...el })),
      pageWidthCm: next === 'landscape' ? DEFAULT_PRINT_PAGE_HEIGHT_CM : DEFAULT_PRINT_PAGE_WIDTH_CM,
      pageHeightCm: next === 'landscape' ? DEFAULT_PRINT_PAGE_WIDTH_CM : DEFAULT_PRINT_PAGE_HEIGHT_CM,
    });
  };

  const handleReset = () => {
    if (!confirmReset()) return;
    setSelectedId(null);
    updateFormat({ elements: getDefaultPrintElements(orientation).map((el) => ({ ...el })) });
  };

  const handleToggleVisible = (id, visible) => {
    updateElement(id, { visible });
    if (!visible && selectedId === id) setSelectedId(null);
  };

  const alignSelected = (axis, edge) => {
    if (!selected) return;
    const others = elements.filter((el) => el.id !== selectedId && el.visible !== false);
    if (others.length === 0) return;
    const [pos, size, max] = axis === 'x' ? ['x', 'w', 100] : ['y', 'h', getMaxY(page)];
    let value;
    if (edge === 'start') value = Math.min(...others.map((o) => o[pos]));
    else if (edge === 'center') {
      const centers = others.map((o) => o[pos] + o[size] / 2);
      value = centers.reduce((a, b) => a + b, 0) / centers.length - selected[size] / 2;
    } else value = Math.max(...others.map((o) => o[pos] + o[size])) - selected[size];
    updateElement(selectedId, { [pos]: clamp(value, 0, max - selected[size]) });
  };

  // Keyboard: arrows move by 0.1 cm (Shift: 1 cm), Enter/Space select, Delete hides.
  const handleElementKeyDown = (e, el) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelectedId(el.id);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      handleToggleVisible(el.id, false);
      return;
    }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!arrows[e.key]) return;
    e.preventDefault();
    const step = cmToPct(e.shiftKey ? 1 : 0.1, page);
    const { effW, effH } = effectiveDimensions(el);
    updateElement(el.id, {
      x: clamp(el.x + arrows[e.key][0] * step, 0, 100 - effW),
      y: clamp(el.y + arrows[e.key][1] * step, 0, getMaxY(page) - effH),
    });
  };

  return (
    <div className="pfe-root">
      <EditorToolbar
        format={format}
        orientation={orientation}
        page={page}
        fontFamily={fontFamily}
        onUpdate={updateFormat}
        onOrientationChange={handleOrientationChange}
        onReset={handleReset}
      />
      <VisibilityChips elements={elements} onToggle={handleToggleVisible} />
      {format?.migrationNotes?.includes('legacy-layout-replaced') && (
        <p className="pfe-hint" role="note">
          Dieses Format stammte aus dem alten Layoutsystem und wurde durch das Standardlayout ersetzt. Bitte prüfen und speichern.
        </p>
      )}
      <div className="pfe-canvas-and-props">
        <EditorCanvas
          pageRef={pageRef}
          format={format}
          page={page}
          elements={elements}
          selectedId={selectedId}
          snapGuides={snapGuides}
          previewRecipe={previewRecipe}
          authorName={authorName}
          onStartDrag={startDrag}
          onStartResize={startResize}
          onKeyDown={handleElementKeyDown}
          onBackgroundDown={() => setSelectedId(null)}
        />
        {selected && selectedDef && (
          <ElementPropsPanel
            element={selected}
            def={selectedDef}
            page={page}
            onPatch={(patch) => updateElement(selectedId, patch)}
            onAlign={alignSelected}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
