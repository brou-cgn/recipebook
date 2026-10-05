import React from 'react';
import { PRINT_FORMAT_ELEMENTS } from '../../utils/printElements';

/** One checkbox chip per registry element to show/hide it on the page. */
export default function VisibilityChips({ elements, onToggle }) {
  return (
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
            <input type="checkbox" checked={isVisible} onChange={(e) => onToggle(def.id, e.target.checked)} />
            {def.label}
          </label>
        );
      })}
    </div>
  );
}
