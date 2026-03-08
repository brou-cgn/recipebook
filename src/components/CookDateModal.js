import React, { useState } from 'react';
import './CookDateModal.css';
import { setCookDate } from '../utils/recipeCookDates';

/**
 * CookDateModal component
 *
 * Opens as a modal dialog to let the user record when they cooked a recipe.
 *
 * @param {Object}   props
 * @param {string}   props.recipeId      - Recipe document ID
 * @param {Object}   props.currentUser   - Current user object
 * @param {Date|null} props.lastCookDate - Last recorded cook date, or null
 * @param {Function} props.onSaved       - Called with the new Date when saved
 * @param {Function} props.onClose       - Called when the modal should close
 */
function CookDateModal({ recipeId, currentUser, lastCookDate, onSaved, onClose }) {
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const formatDate = (date) => {
    if (!date) return null;
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const handleSave = async () => {
    if (!selectedDate || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const date = new Date(selectedDate);
      await setCookDate(currentUser.id, recipeId, date);
      setSaved(true);
      onSaved(date);
      setTimeout(onClose, 600);
    } catch (error) {
      console.error('Error saving cook date:', error);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="cook-date-modal-overlay" onClick={onClose}>
      <div className="cook-date-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cook-date-modal-header">
          <h2 className="cook-date-modal-title">Kochdatum eintragen</h2>
          <button className="cook-date-modal-close" onClick={onClose} aria-label="Schließen">✕</button>
        </div>
        <div className="cook-date-modal-body">
          {lastCookDate && (
            <p className="cook-date-last-cooked">
              Zuletzt gekocht: {formatDate(lastCookDate)}
            </p>
          )}
          <div>
            <label className="cook-date-label" htmlFor="cook-date-input">
              Wann hast du dieses Rezept gekocht?
            </label>
            <input
              id="cook-date-input"
              className="cook-date-input"
              type="date"
              value={selectedDate}
              max={todayStr}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
        </div>
        <div className="cook-date-modal-footer">
          <button className="cook-date-modal-cancel-btn" onClick={onClose}>Abbrechen</button>
          <button
            className="cook-date-modal-save-btn"
            onClick={handleSave}
            disabled={!selectedDate || isSubmitting || saved}
          >
            {saved ? '✓ Gespeichert' : isSubmitting ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CookDateModal;
