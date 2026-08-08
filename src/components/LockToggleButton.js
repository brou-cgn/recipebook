import React from 'react';
import LockIcon from './icons/LockIcon';
import UnlockIcon from './icons/UnlockIcon';

// Sperren/Entsperren-Button fuer eine Getraenke-Gruppe (z.B. Eingekauft- oder
// Verbraucht/Uebrig-Menge). Wiederverwendet fuer beide Sperren-Arten in ConsumptionForm.
function LockToggleButton({ locked, onToggle, lockedLabel, unlockedLabel, lockedTitle, unlockedTitle, disabled }) {
  return (
    <button
      type="button"
      className="events-lock-btn"
      onClick={onToggle}
      aria-label={locked ? lockedLabel : unlockedLabel}
      title={locked ? lockedTitle : unlockedTitle}
      disabled={disabled}
    >
      {locked ? <UnlockIcon size={18} /> : <LockIcon size={18} />}
    </button>
  );
}

export default LockToggleButton;
