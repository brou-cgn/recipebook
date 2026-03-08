import React, { useState } from 'react';
import './CookDateModal.css';
import { setCookDate } from '../utils/recipeCookDates';
import { isBase64Image } from '../utils/imageUtils';

/**
 * CookDateModal component
 *
 * Opens as a modal dialog to let the user record when they cooked a recipe.
 *
 * @param {Object}   props
 * @param {string}   props.recipeId                    - Recipe document ID
 * @param {Object}   props.currentUser                 - Current user object
 * @param {Date|null} props.lastCookDate               - Last recorded cook date, or null
 * @param {*}        props.recipeCreatedAt             - Recipe creation date (Date, Firestore Timestamp, or ISO string)
 * @param {string}   [props.recipeTitle]               - Recipe title for display in the timeline tiles
 * @param {string}   [props.recipeImage]               - Recipe image URL for display in the timeline tiles
 * @param {string}   [props.timelineBubbleIcon]        - Bubble icon for the "Erstellt am" marker (same as in Mein Kochbuch)
 * @param {string}   [props.timelineCookEventBubbleIcon] - Bubble icon for the "Gekocht am" marker
 * @param {string}   [props.timelineCookEventDefaultImage] - Default image for cooking events when no recipe image is available
 * @param {Function} props.onSaved                     - Called with the new Date when saved
 * @param {Function} props.onClose                     - Called when the modal should close
 */
function CookDateModal({ recipeId, currentUser, lastCookDate, recipeCreatedAt, recipeTitle, recipeImage, timelineBubbleIcon = null, timelineCookEventBubbleIcon = null, timelineCookEventDefaultImage = null, onSaved, onClose }) {
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const formatDate = (date) => {
    if (!date) return null;
    let d = date;
    if (typeof date.toDate === 'function') d = date.toDate();
    else if (typeof date === 'string') d = new Date(date);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatSelectedDate = (dateStr) => {
    if (!dateStr) return '–';
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
          <h2 className="cook-date-modal-title">Kochbuch</h2>
          <button className="cook-date-modal-close" onClick={onClose} aria-label="Schließen">✕</button>
        </div>
        <div className="cook-date-modal-body">
          <div className="cook-date-input-wrapper">
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
          <div className="cook-date-timeline">
            <div className="cook-date-timeline-line" />
            {recipeCreatedAt && (
              <div className="cook-date-timeline-item">
                <div className="cook-date-timeline-marker">
                  {timelineBubbleIcon ? (
                    isBase64Image(timelineBubbleIcon) ? (
                      <img src={timelineBubbleIcon} alt="" className="cook-date-timeline-marker-icon" />
                    ) : (
                      <span className="cook-date-timeline-marker-emoji">{timelineBubbleIcon}</span>
                    )
                  ) : (
                    <span className="cook-date-timeline-marker-emoji">📝</span>
                  )}
                </div>
                <div className="cook-date-timeline-card">
                  {recipeImage && (
                    <div className="cook-date-timeline-card-image">
                      <img src={recipeImage} alt={recipeTitle || 'Rezept'} />
                    </div>
                  )}
                  <div className="cook-date-timeline-card-info">
                    <span className="cook-date-timeline-label">Erstellt am</span>
                    <span className="cook-date-timeline-date">{formatDate(recipeCreatedAt)}</span>
                    {recipeTitle && <span className="cook-date-timeline-recipe-title">{recipeTitle}</span>}
                  </div>
                </div>
              </div>
            )}
            <div className="cook-date-timeline-item">
              <div className="cook-date-timeline-marker cook-date-timeline-marker--cook">
                {timelineCookEventBubbleIcon ? (
                  isBase64Image(timelineCookEventBubbleIcon) ? (
                    <img src={timelineCookEventBubbleIcon} alt="" className="cook-date-timeline-marker-icon" />
                  ) : (
                    <span className="cook-date-timeline-marker-emoji">{timelineCookEventBubbleIcon}</span>
                  )
                ) : (
                  <span className="cook-date-timeline-marker-emoji">🍳</span>
                )}
              </div>
              <div className="cook-date-timeline-card">
                {(recipeImage || timelineCookEventDefaultImage) && (
                  <div className="cook-date-timeline-card-image">
                    <img src={recipeImage || timelineCookEventDefaultImage} alt={recipeTitle || 'Rezept'} />
                  </div>
                )}
                <div className="cook-date-timeline-card-info">
                  <span className="cook-date-timeline-label">Gekocht am</span>
                  <span className="cook-date-timeline-date">{formatSelectedDate(selectedDate)}</span>
                  {recipeTitle && <span className="cook-date-timeline-recipe-title">{recipeTitle}</span>}
                </div>
              </div>
            </div>
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
