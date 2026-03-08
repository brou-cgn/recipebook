import React, { useState, useEffect } from 'react';
import './RecipeRating.css';
import { rateRecipe, getUserRating, subscribeToRatingSummary } from '../utils/recipeRatings';
import { getButtonIcons, DEFAULT_BUTTON_ICONS } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';

/**
 * Formats a rating average using German locale (comma as decimal separator).
 * E.g. 4.8 → "4,8"
 */
const formatRatingAvg = (avg) =>
  avg.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

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
  const [heartEmptyIcon, setHeartEmptyIcon] = useState(DEFAULT_BUTTON_ICONS.ratingHeartEmpty);
  const [heartFilledIcon, setHeartFilledIcon] = useState(DEFAULT_BUTTON_ICONS.ratingHeartFilled);

  // Load configurable heart icons
  useEffect(() => {
    getButtonIcons().then((icons) => {
      setHeartEmptyIcon(icons.ratingHeartEmpty || DEFAULT_BUTTON_ICONS.ratingHeartEmpty);
      setHeartFilledIcon(icons.ratingHeartFilled || DEFAULT_BUTTON_ICONS.ratingHeartFilled);
    });
  }, []);

  // Non-interactive: sync with prop changes
  useEffect(() => {
    if (!interactive) {
      setAvg(initialAvg || 0);
      setCount(initialCount || 0);
    }
  }, [interactive, initialAvg, initialCount]);

  // Non-interactive: load user's own rating for personalised heart display
  useEffect(() => {
    if (interactive || !recipeId) return;
    getUserRating(recipeId, currentUser).then(setUserRating);
  }, [interactive, recipeId, currentUser]);

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
  const renderHeartIcon = (filled) => {
    const icon = filled ? heartFilledIcon : heartEmptyIcon;
    if (isBase64Image(icon)) {
      return <img src={icon} alt={filled ? '♥' : '♡'} className="rating-heart-img" />;
    }
    return icon;
  };

  if (!interactive) {
    // Detail-view summary: single heart + avg + count, clickable to open modal
    if (onOpenModal) {
      return (
        <button
          className="recipe-rating-detail-summary"
          onClick={onOpenModal}
          title="Bewerten"
          aria-label={count > 0 ? `Bewertung: Ø ${formatRatingAvg(avg)} (${count} ${count === 1 ? 'Bewertung' : 'Bewertungen'}) – Jetzt bewerten` : 'Jetzt bewerten'}
        >
          <span className={`rating-heart-icon ${userRating !== null ? 'filled' : 'empty'}`}>{renderHeartIcon(userRating !== null)}</span>
          {count > 0 && (
            <span className="rating-detail-summary-text">{formatRatingAvg(avg)} ({count})</span>
          )}
        </button>
      );
    }
    const cardTitle = userRating !== null
      ? `Deine Bewertung: ${userRating} Herz${userRating === 1 ? '' : 'en'}`
      : count > 0
        ? `Ø ${formatRatingAvg(avg)} (${count} Bewertungen)`
        : 'Noch keine Bewertungen';
    return (
      <div className="recipe-rating-compact" title={cardTitle} aria-label={cardTitle}>
        <span className={`rating-heart-icon ${userRating !== null ? 'filled' : 'empty'}`} aria-hidden="true">
          {renderHeartIcon(userRating !== null)}
        </span>
        {count > 0 && <span className="rating-text">{formatRatingAvg(avg)} ({count})</span>}
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
            {renderHeartIcon(activeRating >= n)}
          </button>
        ))}
      </div>
      {count > 0 && (
        <span className="rating-summary-text">
          {formatRatingAvg(avg)} <span className="rating-count-text">({count} {count === 1 ? 'Bewertung' : 'Bewertungen'})</span>
        </span>
      )}
    </div>
  );
}

export default RecipeRating;
