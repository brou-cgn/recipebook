import React, { useId } from 'react';

/** Row of exclusive choice buttons (radio group). */
export default function Segmented({ label, options, value, onChange }) {
  const labelId = useId();
  return (
    <div className="tfe-field">
      <span className="tfe-label" id={labelId}>{label}</span>
      <div className="tfe-segmented" role="radiogroup" aria-labelledby={labelId}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            className={`tfe-seg-btn${value === opt.value ? ' tfe-seg-btn--active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
