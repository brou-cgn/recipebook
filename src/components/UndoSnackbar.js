import React from 'react';
import { useTexte } from '../contexts/SpracheContext';
import allgemeinTexte from '../i18n/texte/allgemein';
import './UndoSnackbar.css';

// Bottom-center "<Item> entfernt" + Rückgängig snackbar, driven by
// useUndoableDelete's `pendingName`/`undo`. Renders nothing while no
// deletion is pending; remounts fresh on every new pending item so its
// entrance animation always restarts (skipped under reduced motion, see
// UndoSnackbar.css). `message` and `actionLabel` replace the default
// wording for other short-lived hints with one action (e.g. the cooking
// session's „… läuft im Hintergrund“ + Zurück). Default texts in the current
// language (Mehrsprachigkeit PR 6a, src/i18n/texte/allgemein.js).
function UndoSnackbar({ itemName, onUndo, message, actionLabel }) {
  const t = useTexte(allgemeinTexte);
  if (!itemName && !message) return null;

  return (
    <div className="undo-snackbar" role="status">
      <span className="undo-snackbar-message">{message || t('entfernt', { name: itemName })}</span>
      <button type="button" className="undo-snackbar-action" onClick={onUndo}>
        {actionLabel || t('rueckgaengig')}
      </button>
    </div>
  );
}

export default UndoSnackbar;
