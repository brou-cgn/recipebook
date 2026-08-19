import React from 'react';
import './UndoSnackbar.css';

// Bottom-center "<Item> entfernt" + Rückgängig snackbar, driven by
// useUndoableDelete's `pendingName`/`undo`. Renders nothing while no
// deletion is pending; remounts fresh on every new pending item so its
// entrance animation always restarts (skipped under reduced motion, see
// UndoSnackbar.css).
function UndoSnackbar({ itemName, onUndo }) {
  if (!itemName) return null;

  return (
    <div className="undo-snackbar" role="status">
      <span className="undo-snackbar-message">„{itemName}" entfernt</span>
      <button type="button" className="undo-snackbar-action" onClick={onUndo}>
        Rückgängig
      </button>
    </div>
  );
}

export default UndoSnackbar;
