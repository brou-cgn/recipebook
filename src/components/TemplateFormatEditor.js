import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import './TemplateFormatEditor.css';
import './PrintFormatEditor.css';
import PrintPage from './PrintPage';
import TemplateGallery from './templateEditor/TemplateGallery';
import StylePanel from './templateEditor/StylePanel';
import FloatingToolbar from './templateEditor/FloatingToolbar';
import { getPageSize } from '../utils/printLayout';
import { SAMPLE_RECIPE } from '../utils/printSampleRecipe';
import {
  applyTemplate,
  hasFlowCustomisations,
  normalizeFlowOverrides,
  resolveFlowStyle,
} from '../utils/printTemplates';

const REPLACE_CONFIRM = 'Die Vorlage ersetzt deine bisherigen Einstellungen für dieses Format. Fortfahren?';
const TOOLBAR_GAP = 8;

/**
 * Template-based print format editor: pick a template, adjust a few options and
 * click elements in the preview to format them (Word-style floating format bar).
 *
 * Props:
 *   format        {object}   flow format
 *   onChange      {function} called with the updated format
 *   previewRecipe {object}   optional; the built-in sample recipe is used otherwise
 *   authorName    {string}   optional author name for the preview
 */
export default function TemplateFormatEditor({ format, onChange, previewRecipe, authorName }) {
  const previewRef = useRef(null);
  const toolbarRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const page = getPageSize(format);
  const style = resolveFlowStyle(format);
  const overrides = normalizeFlowOverrides(format.overrides);

  const update = useCallback((patch) => onChange({ ...format, ...patch }), [format, onChange]);
  const updateStyle = (patch) => update({
    style: { ...style, ...patch },
    ...(patch.fontFamily ? { fontFamily: patch.fontFamily } : {}),
  });
  const updatePage = ({ widthCm, heightCm }) => {
    const w = widthCm ?? page.widthCm;
    const h = heightCm ?? page.heightCm;
    update({ pageWidthCm: w, pageHeightCm: h, orientation: w >= h ? 'landscape' : 'portrait' });
  };
  const updateOverride = (id, patch) => {
    const next = normalizeFlowOverrides({ ...overrides, [id]: { ...overrides[id], ...patch } });
    update({ overrides: next });
  };
  const resetOverride = (id) => {
    const { [id]: _removed, ...rest } = overrides;
    update({ overrides: rest });
  };

  const chooseTemplate = (id) => {
    if (id === format.template && !hasFlowCustomisations(format)) return;
    if (hasFlowCustomisations(format) && !window.confirm(REPLACE_CONFIRM)) return;
    setSelected(null);
    onChange(applyTemplate(format, id));
  };

  // Keep the floating bar next to the selected element (above it, or below when there is no room).
  useLayoutEffect(() => {
    if (!selected) return undefined;
    const place = () => {
      const wrap = previewRef.current;
      const target = wrap?.querySelector(`[data-flow-el="${selected}"]`);
      const bar = toolbarRef.current;
      if (!wrap || !target || !bar) return;
      const w = wrap.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      let top = t.top - w.top - bar.offsetHeight - TOOLBAR_GAP;
      if (top < 0) top = t.bottom - w.top + TOOLBAR_GAP;
      const left = Math.max(0, Math.min(t.left - w.left, w.width - bar.offsetWidth));
      setPosition((prev) => (prev.top === top && prev.left === left ? prev : { top, left }));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [selected, format, previewRecipe]);

  const hide = (id) => {
    updateStyle({ show: { ...style.show, [id]: false } });
    setSelected(null);
  };

  // Hidden elements cannot stay selected.
  const activeSelection = selected && style.show[selected] ? selected : null;

  return (
    <div className="tfe-root">
      <TemplateGallery activeId={format.template} onSelect={chooseTemplate} />
      <div className="tfe-main">
        <StylePanel format={format} page={page} style={style} onStyle={updateStyle} onPage={updatePage} />
        <div className="tfe-preview" ref={previewRef}>
          <p className="pfe-hint">Klicke ein Element in der Vorschau an, um es direkt zu formatieren.</p>
          <PrintPage
            recipe={previewRecipe || SAMPLE_RECIPE}
            format={format}
            authorName={previewRecipe ? authorName : 'Anna'}
            mode="preview"
            selectedElement={activeSelection}
            onSelectElement={setSelected}
          />
          {activeSelection && (
            <FloatingToolbar
              ref={toolbarRef}
              elementId={activeSelection}
              style={style}
              override={overrides[activeSelection]}
              position={position}
              onOverride={(patch) => updateOverride(activeSelection, patch)}
              onResetOverride={() => resetOverride(activeSelection)}
              onStyle={updateStyle}
              onHide={() => hide(activeSelection)}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
