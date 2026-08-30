import React from 'react';
import './SavingOverlay.css';

// Full-screen loading overlay shown while a form save/mutation is in flight
// (recipes, menus, events, ...). See SavingOverlay.css for the blurred
// backdrop + bouncing-dots animation.
function SavingOverlay({ label }) {
  return (
    <div className="saving-overlay" aria-busy="true" aria-label={label}>
      <div className="saving-overlay-dots">
        <span className="saving-overlay-dot" />
        <span className="saving-overlay-dot" />
        <span className="saving-overlay-dot" />
      </div>
    </div>
  );
}

export default SavingOverlay;
