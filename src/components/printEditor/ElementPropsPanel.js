import React from 'react';
import {
  PRINT_ROTATION_OPTIONS,
  PRINT_ASPECT_RATIO_OPTIONS,
  PRINT_TEXT_ALIGN_H_OPTIONS,
  PRINT_TEXT_ALIGN_V_OPTIONS,
} from '../../utils/printElements';
import { clamp, cmToPct, getMaxY, MIN_ELEMENT_H, MIN_ELEMENT_W, pctToCm } from '../../utils/printLayout';

const BORDER_SIDES = [
  { key: 'borderTop', label: '↑', title: 'Oben' },
  { key: 'borderRight', label: '→', title: 'Rechts' },
  { key: 'borderBottom', label: '↓', title: 'Unten' },
  { key: 'borderLeft', label: '←', title: 'Links' },
];

const ALIGN_ROWS = [
  [['y', 'start', '⬆ Oben', 'Oben bündig'], ['y', 'center', '↕ Mitte', 'Vertikal mittig'], ['y', 'end', '⬇ Unten', 'Unten bündig']],
  [['x', 'start', '⬅ Links', 'Links bündig'], ['x', 'center', '↔ Mitte', 'Horizontal mittig'], ['x', 'end', '➡ Rechts', 'Rechts bündig']],
];

function ChoiceButtons({ options, value, onChange }) {
  return (
    <div className="pfe-props-style-btns">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`pfe-style-btn pfe-textalign-btn ${value === opt.value ? 'pfe-style-btn--active' : ''}`}
          onClick={() => onChange(opt.value)}
          title={opt.label}
        >
          <span className="pfe-textalign-label">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

function StyleToggle({ field, label, className, element, onPatch, title }) {
  return (
    <button
      type="button"
      className={`pfe-style-btn ${className} ${element[field] ? 'pfe-style-btn--active' : ''}`}
      onClick={() => onPatch({ [field]: !element[field] })}
      title={title}
      aria-pressed={!!element[field]}
    >
      {label}
    </button>
  );
}

/** Properties of the selected element: geometry, text, rotation, aspect ratio, border, alignment. */
export default function ElementPropsPanel({ element, def, page, onPatch, onAlign, onClose }) {
  const maxY = getMaxY(page);
  const cm = (pct) => pctToCm(pct, page).toFixed(1);
  const pct = (value) => cmToPct(value, page);
  const rows = [
    ['X', 'x', 'Horizontale Position in cm', (v) => ({ x: clamp(pct(v), 0, 100 - element.w) }), page.widthCm],
    ['Y', 'y', 'Vertikale Position in cm', (v) => ({ y: clamp(pct(v), 0, maxY - element.h) }), page.heightCm],
    ['B', 'w', 'Breite in cm', (v) => ({ w: Math.min(Math.max(MIN_ELEMENT_W, pct(v)), 100 - element.x) }), page.widthCm],
    ['H', 'h', 'Höhe in cm', (v) => ({ h: Math.min(Math.max(MIN_ELEMENT_H, pct(v)), maxY - element.y) }), page.heightCm],
  ];

  return (
    <div className="pfe-props-panel">
      <div className="pfe-props-title">
        <span className="pfe-props-color-dot" style={{ background: def.color }} />
        {def.label}
      </div>

      <div className="pfe-props-section-label">Position &amp; Größe:</div>
      {[rows.slice(0, 2), rows.slice(2)].map((pair, i) => (
        <div className="pfe-props-row" key={i}>
          {pair.map(([label, field, title, toPatch, max]) => (
            <React.Fragment key={field}>
              <span className="pfe-props-label pfe-props-label--sm">{label}:</span>
              <input
                type="number"
                className="pfe-props-number"
                min={field === 'w' || field === 'h' ? '0.1' : '0'}
                max={max}
                step="0.1"
                value={cm(element[field])}
                onChange={(e) => onPatch(toPatch(e.target.value))}
                title={title}
                aria-label={title}
              />
              <span className="pfe-props-unit">cm</span>
            </React.Fragment>
          ))}
        </div>
      ))}

      {!def.isImage && (
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
              value={element.fontSizeScale ?? 1}
              onChange={(e) => onPatch({ fontSizeScale: parseFloat(e.target.value) || 1 })}
              title="Schriftgrößen-Faktor (1 = normal)"
              aria-label="Schriftgrößen-Faktor"
            />
            <span className="pfe-props-unit">×</span>
          </div>
          <div className="pfe-props-row">
            <span className="pfe-props-label">Stil:</span>
            <div className="pfe-props-style-btns">
              <StyleToggle field="fontBold" label="B" className="pfe-style-btn--bold" title="Fett" element={element} onPatch={onPatch} />
              <StyleToggle field="fontItalic" label="I" className="pfe-style-btn--italic" title="Kursiv" element={element} onPatch={onPatch} />
              <StyleToggle field="fontUnderline" label="U" className="pfe-style-btn--underline" title="Unterstrichen" element={element} onPatch={onPatch} />
            </div>
          </div>
          <div className="pfe-props-row">
            <span className="pfe-props-label">Farbe:</span>
            <input
              type="color"
              className="pfe-props-color"
              value={element.fontColor || '#000000'}
              onChange={(e) => onPatch({ fontColor: e.target.value })}
              title="Schriftfarbe"
              aria-label="Schriftfarbe"
            />
          </div>

          <div className="pfe-props-section-label">Textausrichtung:</div>
          <div className="pfe-props-row">
            <span className="pfe-props-label pfe-props-label--sm">H:</span>
            <ChoiceButtons options={PRINT_TEXT_ALIGN_H_OPTIONS} value={element.textAlignH || 'left'} onChange={(v) => onPatch({ textAlignH: v })} />
          </div>
          <div className="pfe-props-row">
            <span className="pfe-props-label pfe-props-label--sm">V:</span>
            <ChoiceButtons options={PRINT_TEXT_ALIGN_V_OPTIONS} value={element.textAlignV || 'top'} onChange={(v) => onPatch({ textAlignV: v })} />
          </div>
        </>
      )}

      <div className="pfe-props-row">
        <span className="pfe-props-label">Drehung:</span>
        <select
          className="pfe-select pfe-props-select"
          value={element.rotation ?? 0}
          onChange={(e) => onPatch({ rotation: parseInt(e.target.value, 10) })}
          aria-label="Drehung"
        >
          {PRINT_ROTATION_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>

      {def.isImage && (
        <div className="pfe-props-row">
          <span className="pfe-props-label">Seitenverhältnis:</span>
          <select
            className="pfe-select pfe-props-select"
            value={element.aspectRatio || 'none'}
            onChange={(e) => onPatch({ aspectRatio: e.target.value })}
            aria-label="Seitenverhältnis"
          >
            {PRINT_ASPECT_RATIO_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
      )}

      <div className="pfe-props-section-label">Rahmen:</div>
      <div className="pfe-props-row">
        <span className="pfe-props-label">Seiten:</span>
        <div className="pfe-border-sides">
          {BORDER_SIDES.map(({ key, label, title }) => (
            <label key={key} className="pfe-border-side-label" title={title}>
              <input type="checkbox" checked={!!element[key]} onChange={(e) => onPatch({ [key]: e.target.checked })} aria-label={`Rahmen ${title}`} />
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
          value={element.borderColor || '#000000'}
          onChange={(e) => onPatch({ borderColor: e.target.value })}
          title="Rahmenfarbe"
          aria-label="Rahmenfarbe"
        />
        <span className="pfe-props-label pfe-props-label--sm">Dicke:</span>
        <input
          type="number"
          className="pfe-props-number pfe-props-number--sm"
          min="0.5"
          max="20"
          step="0.5"
          value={element.borderWidth || 1}
          onChange={(e) => onPatch({ borderWidth: parseFloat(e.target.value) || 1 })}
          title="Rahmendicke in px"
          aria-label="Rahmendicke in px"
        />
        <span className="pfe-props-unit">px</span>
      </div>

      <div className="pfe-props-section-label">Ausrichten:</div>
      {ALIGN_ROWS.map((row, i) => (
        <div className="pfe-props-align-row" key={i}>
          {row.map(([axis, edge, label, title]) => (
            <button key={`${axis}-${edge}`} type="button" className="pfe-align-btn" onClick={() => onAlign(axis, edge)} title={title}>
              {label}
            </button>
          ))}
        </div>
      ))}

      <button type="button" className="pfe-props-close-btn" onClick={onClose}>Schließen</button>
    </div>
  );
}
