import React, { useState, useEffect } from 'react';
import './RecipeRating.css';
import { rateRecipe, getUserRating, subscribeToRatingSummary } from '../utils/recipeRatings';
import { getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import { useSprache, useTexte } from '../contexts/SpracheContext';
import { formatiereZahl } from '../i18n/format';
import bewertungTexte from '../i18n/texte/bewertung';

/**
 * Durchschnitt mit einer Nachkommastelle in der geltenden Sprache (4,8 / 4.8).
 */
const formatRatingAvg = (avg, sprache) =>
  formatiereZahl(avg, sprache, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

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
  const t = useTexte(bewertungTexte);
  const { sprache } = useSprache();
  const [avg, setAvg] = useState(initialAvg || 0);
  const [count, setCount] = useState(initialCount || 0);
  const [userRating, setUserRating] = useState(null);
  const [hoveredRating, setHoveredRating] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [heartEmptyIcon, setHeartEmptyIcon] = useState(DEFAULT_BUTTON_ICONS.ratingHeartEmpty);
  const [heartFilledIcon, setHeartFilledIcon] = useState(DEFAULT_BUTTON_ICONS.ratingHeartFilled);
  const [allButtonIcons, setAllButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);

  // Load configurable heart icons
  useEffect(() => {
    getButtonIcons().then((icons) => {
      setAllButtonIcons(icons);
    });
  }, []);

  // Re-compute icon states when icons or dark mode changes
  useEffect(() => {
    setHeartEmptyIcon(getEffectiveIcon(allButtonIcons, 'ratingHeartEmpty', isDarkMode) || DEFAULT_BUTTON_ICONS.ratingHeartEmpty);
    setHeartFilledIcon(getEffectiveIcon(allButtonIcons, 'ratingHeartFilled', isDarkMode) || DEFAULT_BUTTON_ICONS.ratingHeartFilled);
  }, [allButtonIcons, isDarkMode]);

  // Listen for dark mode changes
  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
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
      return <img src={icon} alt={filled ? t('herzGefuellt') : t('herzLeer')} className="rating-heart-img" />;
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
          title={t('bewerten')}
          aria-label={count > 0 ? t('zusammenfassung', { schnitt: formatRatingAvg(avg, sprache), anzahl: count }) : t('jetztBewerten')}
        >
          <span className={`rating-heart-icon ${userRating !== null ? 'filled' : 'empty'}`}>{renderHeartIcon(userRating !== null)}</span>
          {count > 0 && (
            <span className="rating-detail-summary-text">{formatRatingAvg(avg, sprache)} ({count})</span>
          )}
        </button>
      );
    }
    const cardTitle = userRating !== null
      ? t('deineBewertung', { anzahl: userRating })
      : count > 0
        ? t('durchschnitt', { schnitt: formatRatingAvg(avg, sprache), anzahl: count })
        : t('nochKeine');
    return (
      <div className="recipe-rating-compact" title={cardTitle} aria-label={cardTitle}>
        <span className={`rating-heart-icon ${userRating !== null ? 'filled' : 'empty'}`} aria-hidden="true">
          {renderHeartIcon(userRating !== null)}
        </span>
        {count > 0 && <span className="rating-text">{formatRatingAvg(avg, sprache)} ({count})</span>}
      </div>
    );
  }

  // Interactive display (used in recipe detail)
  const activeRating = hoveredRating || userRating || 0;
  return (
    <div className="recipe-rating-interactive">
      <div className="rating-hearts-interactive" role="group" aria-label={t('rezeptBewerten')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            className={`rating-heart-btn ${activeRating >= n ? 'filled' : 'empty'}`}
            onClick={() => handleRate(n)}
            onMouseEnter={() => setHoveredRating(n)}
            onMouseLeave={() => setHoveredRating(null)}
            disabled={isSubmitting}
            title={t('herzen', { anzahl: n })}
            aria-label={t('vonFuenf', { anzahl: n })}
            aria-pressed={userRating === n}
          >
            {renderHeartIcon(activeRating >= n)}
          </button>
        ))}
      </div>
      {count > 0 && (
        <span className="rating-summary-text">
          {formatRatingAvg(avg, sprache)} <span className="rating-count-text">({t('anzahlBewertungen', { anzahl: count })})</span>
        </span>
      )}
    </div>
  );
}

export default RecipeRating;
