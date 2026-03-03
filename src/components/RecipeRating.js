import React, { useState, useEffect } from 'react';
import './RecipeRating.css';
import { rateRecipe, getUserRating, subscribeToRatingSummary } from '../utils/recipeRatings';

/**
 * Returns true when a heart at position `n` (1–5) should be shown as filled,
 * given the supplied average. Rounds to the nearest half-heart so a 3.5 avg
 * fills positions 1–3 fully and position 4 partially (displayed as filled).
 */
const shouldFillHeart = (avg, n) => avg >= n - 0.5;

/**
 * RecipeRating component
 *
 * Displays a 1–5 heart rating. In interactive mode the user can click a heart
 * to submit or update their rating; in compact (read-only) mode only the
 * average and count are shown.
 *
 * When `onOpenModal` is provided (detail-view summary), a single heart + avg +
 * count is rendered as a clickable button that opens the rating modal.
 *
 * @param {Object}   props
 * @param {string}   props.recipeId      - Recipe document ID
 * @param {number}   [props.ratingAvg]   - Pre-loaded average (from recipe document)
 * @param {number}   [props.ratingCount] - Pre-loaded count   (from recipe document)
 * @param {Object}   [props.currentUser] - Current user or null for guests
 * @param {boolean}  [props.interactive] - If true, subscribe live and allow rating
 * @param {Function} [props.onOpenModal] - If provided, render a clickable summary
 *                                         that calls this instead of inline rating
 */
function RecipeRating({ recipeId, ratingAvg: initialAvg, ratingCount: initialCount, currentUser, interactive = false, onOpenModal }) {
  const [avg, setAvg] = useState(initialAvg || 0);
  const [count, setCount] = useState(initialCount || 0);
  const [userRating, setUserRating] = useState(null);
  const [hoveredRating, setHoveredRating] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Non-interactive: sync with prop changes
  useEffect(() => {
    if (!interactive) {
      setAvg(initialAvg || 0);
      setCount(initialCount || 0);
    }
  }, [interactive, initialAvg, initialCount]);

  // Interactive: live subscription + load user's existing rating
  useEffect(() => {
    if (!interactive || !recipeId) return;

    getUserRating(recipeId, currentUser).then(setUserRating);

    const unsubscribe = subscribeToRatingSummary(recipeId, ({ avg: a, count: c }) => {
      setAvg(a);
      setCount(c);
    });

    return unsubscribe;
  }, [interactive, recipeId, currentUser]);

  const handleRate = async (rating) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await rateRecipe(recipeId, rating, currentUser);
      setUserRating(rating);
    } catch (error) {
      console.error('Error submitting rating:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Compact / read-only display (used on recipe cards)
  if (!interactive) {
    // Detail-view summary: single heart + avg + count, clickable to open modal
    if (onOpenModal) {
      return (
        <button
          className="recipe-rating-detail-summary"
          onClick={onOpenModal}
          title="Bewerten"
          aria-label={count > 0 ? `Bewertung: Ø ${avg.toFixed(1)} (${count} ${count === 1 ? 'Bewertung' : 'Bewertungen'}) – Jetzt bewerten` : 'Jetzt bewerten'}
        >
          <span className="rating-heart-icon filled">♥</span>
          {count > 0 && (
            <span className="rating-detail-summary-text">{avg.toFixed(1)} ({count})</span>
          )}
        </button>
      );
    }
    if (!count) return null;
    return (
      <div className="recipe-rating-compact" title={`Ø ${avg.toFixed(1)} (${count} Bewertungen)`}>
        <span className="rating-hearts-display" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className={`rating-heart-icon ${shouldFillHeart(avg, n) ? 'filled' : 'empty'}`}>
              {shouldFillHeart(avg, n) ? '♥' : '♡'}
            </span>
          ))}
        </span>
        <span className="rating-text">{avg.toFixed(1)} ({count})</span>
      </div>
    );
  }

  // Interactive display (used in recipe detail)
  const activeRating = hoveredRating || userRating || 0;
  return (
    <div className="recipe-rating-interactive">
      <div className="rating-hearts-interactive" role="group" aria-label="Rezept bewerten">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            className={`rating-heart-btn ${activeRating >= n ? 'filled' : 'empty'}`}
            onClick={() => handleRate(n)}
            onMouseEnter={() => setHoveredRating(n)}
            onMouseLeave={() => setHoveredRating(null)}
            disabled={isSubmitting}
            title={`${n} Herz${n === 1 ? '' : 'en'}`}
            aria-label={`${n} von 5 Herzen`}
            aria-pressed={userRating === n}
          >
            {activeRating >= n ? '♥' : '♡'}
          </button>
        ))}
      </div>
      {count > 0 && (
        <span className="rating-summary-text">
          {avg.toFixed(1)} <span className="rating-count-text">({count} {count === 1 ? 'Bewertung' : 'Bewertungen'})</span>
        </span>
      )}
    </div>
  );
}

export default RecipeRating;
