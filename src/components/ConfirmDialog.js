import React from 'react';
import './ConfirmDialog.css';

/**
 * In-app confirmation for the few deletions that keep a question
 * (a whole list or menu with content; see AGENTS.md, Löschaktionen).
 * Replaces the native window.confirm.
 *
 * @param {Object} props
 * @param {string} props.title
 * @param {string} props.message
 * @param {string} [props.confirmLabel]
 * @param {Function} props.onConfirm
 * @param {Function} props.onCancel
 */
function ConfirmDialog({ title, message, confirmLabel = 'Löschen', onConfirm, onCancel }) {
  return (
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-message" className="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          <button type="button" className="confirm-dialog-cancel" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="button" className="confirm-dialog-confirm" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
