import React from 'react';

function UnitChip({ label, selected, onToggle }) {
  return (
    <button
      type="button"
      className={`events-unit-chip${selected ? ' events-unit-chip--selected' : ''}`}
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={label}
    >
      {selected && <span className="events-unit-chip-check" aria-hidden="true">✓ </span>}
      {label}
    </button>
  );
}

export default UnitChip;
