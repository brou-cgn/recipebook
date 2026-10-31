import React from 'react';
import './UndoSnackbar.css';

// Bottom-center "<Item> entfernt" + Rückgängig snackbar, driven by
// useUndoableDelete's `pendingName`/`undo`. Renders nothing while no
// deletion is pending; remounts fresh on every new pending item so its
// entrance animation always restarts (skipped under reduced motion, see
// UndoSnackbar.css). `message` and `actionLabel` replace the default
// wording for other short-lived hints with one action (e.g. the cooking
// session's „… läuft im Hintergrund“ + Zurück).
function UndoSnackbar({ itemName, onUndo, message, actionLabel = 'Rückgängig' }) {
  if (!itemName && !message) return null;

  return (
    <div className="undo-snackbar" role="status">
      <span className="undo-snackbar-message">{message || <>„{itemName}" entfernt</>}</span>
      <button type="button" className="undo-snackbar-action" onClick={onUndo}>
        {actionLabel}
      </button>
    </div>
  );
}

export default UndoSnackbar;
