import React, { useState, useEffect } from 'react';
import './RatingModal.css';
import { rateRecipe, getUserRatingData, subscribeToRatingSummary } from '../utils/recipeRatings';

/**
 * RatingModal component
 *
 * Opens as a modal dialog to let the user submit or update their heart rating
 * and an optional comment for a recipe.
 *
 * @param {Object}   props
 * @param {string}   props.recipeId      - Recipe document ID
 * @param {Object}   [props.currentUser] - Current user or null for guests
 * @param {Function} props.onClose       - Called when the modal should close
 */
function RatingModal({ recipeId, currentUser, onClose }) {
  const [avg, setAvg] = useState(0);
  const [count, setCount] = useState(0);
  const [selectedRating, setSelectedRating] = useState(null);
  const [comment, setComment] = useState('');
  const [hoveredRating, setHoveredRating] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  // Live rating summary subscription
  useEffect(() => {
    if (!recipeId) return;
    const unsubscribe = subscribeToRatingSummary(recipeId, ({ avg: a, count: c }) => {
      setAvg(a);
      setCount(c);
    });
    return unsubscribe;
  }, [recipeId]);

  // Load the user's existing rating and comment
  useEffect(() => {
    getUserRatingData(recipeId, currentUser).then(({ rating, comment: existingComment }) => {
      setSelectedRating(rating);
      setComment(existingComment || '');
    });
  }, [recipeId, currentUser]);

  const handleSave = async () => {
    if (!selectedRating || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await rateRecipe(recipeId, selectedRating, currentUser, comment);
      setSaved(true);
      setTimeout(onClose, 600);
    } catch (error) {
      console.error('Error saving rating:', error);
      setIsSubmitting(false);
    }
  };

  const activeRating = hoveredRating || selectedRating || 0;

  return (
    <div className="rating-modal-overlay" onClick={onClose}>
      <div className="rating-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rating-modal-header">
          <h2 className="rating-modal-title">Rezept bewerten</h2>
          <button className="rating-modal-close" onClick={onClose} aria-label="Schließen">✕</button>
        </div>
        <div className="rating-modal-body">
          {count > 0 && (
            <p className="rating-modal-avg">
              Ø {avg.toFixed(1)} ({count} {count === 1 ? 'Bewertung' : 'Bewertungen'})
            </p>
          )}
          <div className="rating-modal-hearts" role="group" aria-label="Bewertung auswählen">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={`rating-heart-btn ${activeRating >= n ? 'filled' : 'empty'}`}
                onClick={() => setSelectedRating(n)}
                onMouseEnter={() => setHoveredRating(n)}
                onMouseLeave={() => setHoveredRating(null)}
                aria-label={`${n} von 5 Herzen`}
                aria-pressed={selectedRating === n}
              >
                {activeRating >= n ? '♥' : '♡'}
              </button>
            ))}
          </div>
          <textarea
            className="rating-comment-input"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Kommentar (optional)…"
            rows={3}
          />
        </div>
        <div className="rating-modal-footer">
          <button className="rating-modal-cancel-btn" onClick={onClose}>Abbrechen</button>
          <button
            className="rating-modal-save-btn"
            onClick={handleSave}
            disabled={!selectedRating || isSubmitting || saved}
          >
            {saved ? '✓ Gespeichert' : isSubmitting ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RatingModal;
