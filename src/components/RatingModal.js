import React, { useState, useEffect } from 'react';
import './RatingModal.css';
import { rateRecipe, getUserRatingData, subscribeToRatingSummary, getAllRatings, deleteRating } from '../utils/recipeRatings';
import { getButtonIcons, DEFAULT_BUTTON_ICONS } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';

/**
 * RatingModal component
 *
 * Opens as a modal dialog to let the user submit or update their heart rating
 * and an optional comment for a recipe.
 *
 * @param {Object}   props
 * @param {string}   props.recipeId      - Recipe document ID
 * @param {Object}   [props.currentUser] - Current user or null for guests
 * @param {boolean}  [props.canDeleteRatings] - Whether the current user may delete ratings
 * @param {Function} props.onClose       - Called when the modal should close
 */
function RatingModal({ recipeId, currentUser, canDeleteRatings = false, onClose }) {
  const [avg, setAvg] = useState(0);
  const [count, setCount] = useState(0);
  const [selectedRating, setSelectedRating] = useState(null);
  const [comment, setComment] = useState('');
  const [hoveredRating, setHoveredRating] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [allRatings, setAllRatings] = useState([]);
  const [heartEmptyIcon, setHeartEmptyIcon] = useState(DEFAULT_BUTTON_ICONS.ratingHeartEmptyModal);
  const [heartFilledIcon, setHeartFilledIcon] = useState(DEFAULT_BUTTON_ICONS.ratingHeartFilled);

  const isGuest = !currentUser || currentUser.isGuest;

  // Load configurable heart icons
  useEffect(() => {
    getButtonIcons().then((icons) => {
      setHeartEmptyIcon(icons.ratingHeartEmptyModal || DEFAULT_BUTTON_ICONS.ratingHeartEmptyModal);
      setHeartFilledIcon(icons.ratingHeartFilled || DEFAULT_BUTTON_ICONS.ratingHeartFilled);
    });
  }, []);

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

  // Load all ratings for display
  useEffect(() => {
    let cancelled = false;
    getAllRatings(recipeId).then((ratings) => {
      if (!cancelled) setAllRatings(ratings);
    });
    return () => { cancelled = true; };
  }, [recipeId]);

  const handleSave = async () => {
    if (!selectedRating || isSubmitting) return;
    if (isGuest && !guestName.trim()) return;
    setIsSubmitting(true);
    try {
      await rateRecipe(recipeId, selectedRating, currentUser, comment, guestName.trim() || null);
      setSaved(true);
      getAllRatings(recipeId).then(setAllRatings);
      setTimeout(onClose, 600);
    } catch (error) {
      console.error('Error saving rating:', error);
      setIsSubmitting(false);
    }
  };

  const handleDeleteRating = async (ratingId) => {
    try {
      await deleteRating(recipeId, ratingId);
      getAllRatings(recipeId).then(setAllRatings);
    } catch (error) {
      console.error('Error deleting rating:', error);
    }
  };

  const activeRating = hoveredRating || selectedRating || 0;

  const renderHeartIcon = (filled) => {
    const icon = filled ? heartFilledIcon : heartEmptyIcon;
    if (isBase64Image(icon)) {
      return <img src={icon} alt={filled ? '♥' : '♡'} className="rating-heart-img" />;
    }
    return icon;
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

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
                {renderHeartIcon(activeRating >= n)}
              </button>
            ))}
          </div>
          {isGuest && (
            <input
              className="rating-name-input"
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Dein Name *"
              maxLength={50}
              required
            />
          )}
          <textarea
            className="rating-comment-input"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Kommentar (optional)…"
            rows={3}
          />
          {allRatings.length > 0 && (
            <div className="rating-reviews-list">
              <h3 className="rating-reviews-title">Alle Bewertungen</h3>
              {allRatings.map((r) => (
                <div key={r.id} className="rating-review-item">
                  <div className="rating-review-header">
                    <span className="rating-review-name">{r.raterName || 'Anonym'}</span>
                    <span className="rating-review-date">{formatDate(r.updatedAt || r.createdAt)}</span>
                    {canDeleteRatings && (
                      <button
                        className="rating-review-delete-btn"
                        onClick={() => handleDeleteRating(r.id)}
                        title="Bewertung löschen"
                        aria-label="Bewertung löschen"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                  <div className="rating-review-hearts" aria-label={`${r.rating} von 5 Herzen`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className={`rating-review-heart ${r.rating >= n ? 'filled' : 'empty'}`}>
                        {renderHeartIcon(r.rating >= n)}
                      </span>
                    ))}
                  </div>
                  {r.comment && <p className="rating-review-comment">{r.comment}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rating-modal-footer">
          <button className="rating-modal-cancel-btn" onClick={onClose}>Abbrechen</button>
          <button
            className="rating-modal-save-btn"
            onClick={handleSave}
            disabled={!selectedRating || isSubmitting || saved || (isGuest && !guestName.trim())}
          >
            {saved ? '✓ Gespeichert' : isSubmitting ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RatingModal;
