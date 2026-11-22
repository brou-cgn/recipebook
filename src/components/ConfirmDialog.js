import React from 'react';
import './ConfirmDialog.css';
import Button from './Button';
import { useTexte } from '../contexts/SpracheContext';
import allgemeinTexte from '../i18n/texte/allgemein';

/**
 * In-app confirmation for the few deletions that keep a question: a whole
 * recipe with content, a whole list, menu or event (AGENTS.md, Löschaktionen).
 * Replaces the native window.confirm.
 *
 * @param {Object} props
 * @param {string} props.title
 * @param {string} props.message
 * @param {string} [props.confirmLabel] - Standard „Löschen“ in der geltenden Sprache
 * @param {string} [props.confirmVariant] - Rolle des Bestätigungsknopfs (Button-System), Standard danger
 * @param {Function} props.onConfirm
 * @param {Function} props.onCancel
 */
function ConfirmDialog({ title, message, confirmLabel, confirmVariant = 'danger', onConfirm, onCancel }) {
  const t = useTexte(allgemeinTexte);
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
          <Button variant="secondary" onClick={onCancel}>
            {t('abbrechen')}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} autoFocus>
            {confirmLabel || t('loeschen')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
