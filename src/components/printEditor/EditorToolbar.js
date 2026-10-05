import React from 'react';
import { PRINT_FONT_OPTIONS, DEFAULT_PRINT_PAGE_WIDTH_CM, DEFAULT_PRINT_PAGE_HEIGHT_CM } from '../../utils/printElements';

/** Orientation, page size, font and reset for one print format. */
export default function EditorToolbar({ format, orientation, page, fontFamily, onUpdate, onOrientationChange, onReset }) {
  return (
    <div className="pfe-toolbar">
      <div className="pfe-toolbar-group">
        <span className="pfe-toolbar-label">Ausrichtung:</span>
        {[['portrait', 'Hochformat'], ['landscape', 'Querformat']].map(([value, label]) => (
          <label key={value} className="pfe-radio-label">
            <input
              type="radio"
              name={`pfe-orientation-${format?.id}`}
              value={value}
              checked={orientation === value}
              onChange={() => onOrientationChange(value)}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="pfe-toolbar-group">
        <span className="pfe-toolbar-label">Seitengröße:</span>
        <input
          type="number"
          className="pfe-props-number pfe-toolbar-number"
          min="5"
          max="200"
          step="0.1"
          value={page.widthCm}
          onChange={(e) => {
            const widthCm = parseFloat(e.target.value) || DEFAULT_PRINT_PAGE_WIDTH_CM;
            onUpdate({ pageWidthCm: widthCm, orientation: widthCm >= page.heightCm ? 'landscape' : 'portrait' });
          }}
          title="Seitenbreite in cm"
          aria-label="Seitenbreite in cm"
        />
        <span className="pfe-props-unit">×</span>
        <input
          type="number"
          className="pfe-props-number pfe-toolbar-number"
          min="5"
          max="200"
          step="0.1"
          value={page.heightCm}
          onChange={(e) => {
            const heightCm = parseFloat(e.target.value) || DEFAULT_PRINT_PAGE_HEIGHT_CM;
            onUpdate({ pageHeightCm: heightCm, orientation: page.widthCm >= heightCm ? 'landscape' : 'portrait' });
          }}
          title="Seitenhöhe in cm"
          aria-label="Seitenhöhe in cm"
        />
        <span className="pfe-props-unit">cm</span>
      </div>

      <div className="pfe-toolbar-group">
        <span className="pfe-toolbar-label">Schriftart:</span>
        <select
          className="pfe-select"
          value={fontFamily}
          onChange={(e) => onUpdate({ fontFamily: e.target.value })}
          aria-label="Schriftart"
        >
          {PRINT_FONT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <button type="button" className="pfe-reset-btn" onClick={onReset} title="Standardlayout wiederherstellen">
        Layout zurücksetzen
      </button>
    </div>
  );
}
