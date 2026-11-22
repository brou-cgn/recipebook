import React, { useState, useEffect, useCallback } from 'react';
import './RatingModal.css';
import Button from './Button';
import DeleteRowButton from './DeleteRowButton';
import UndoSnackbar from './UndoSnackbar';
import TrashIcon from './icons/TrashIcon';
import useSwipeToDelete from '../hooks/useSwipeToDelete';
import useUndoableDelete from '../hooks/useUndoableDelete';
import { rateRecipe, getUserRatingData, subscribeToRatingSummary, getAllRatings, deleteRating } from '../utils/recipeRatings';
import { getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import useModalScrollLock from '../hooks/useModalScrollLock';
import { useSprache, useTexte } from '../contexts/SpracheContext';
import { formatiereDatum, formatiereZahl } from '../i18n/format';
import bewertungTexte from '../i18n/texte/bewertung';
import allgemeinTexte from '../i18n/texte/allgemein';

// iOS Safari: reset any zoom triggered by focusing on input fields.
// Temporarily adding maximum-scale=1.0 forces Safari to snap back to scale 1.
function resetSafariZoom() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  const prev = meta.content;
  meta.content = prev + ', maximum-scale=1.0';
  setTimeout(() => { meta.content = prev; }, 300);
}

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
/**
 * Eine Bewertung in der Liste mit Löschen nach CLAUDE.md: am Desktop DeleteRowButton am rechten Rand der
 * Kopfzeile, auf dem Handy Linksswipe (useSwipeToDelete). Gelöscht wird erst nach dem Rückgängig-Fenster.
 */
function RatingReview({ canDelete, itemName, swipeLabel, onDelete, header, children }) {
  const { offset, isDeleteVisible, reset, handlers } = useSwipeToDelete({ disabled: !canDelete });
  return (
    <div className={`rating-review-swipe${offset < 0 ? ' swipe-delete-active' : ''}`}>
      {canDelete && (
        <div className="rating-review-swipe-background" aria-hidden={!isDeleteVisible}>
          {isDeleteVisible && (
            <button
              type="button"
              className="rating-review-swipe-action"
              onClick={() => { onDelete(); reset(); }}
              aria-label={swipeLabel}
            >
              <TrashIcon />
            </button>
          )}
        </div>
      )}
      <div
        className="rating-review-item delete-row-hover-target"
        style={offset ? { transform: `translateX(${offset}px)` } : undefined}
        {...handlers}
      >
        <div className="rating-review-header">
          {header}
          {canDelete && (
            <DeleteRowButton itemName={itemName} className="rating-review-delete" onClick={onDelete} />
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function RatingModal({ recipeId, currentUser, canDeleteRatings = false, onClose }) {
  const t = useTexte(bewertungTexte);
  const tAllgemein = useTexte(allgemeinTexte);
  const { sprache } = useSprache();
  // Wie die Einkaufsliste: Seite dahinter gesperrt
  useModalScrollLock();
  // Löschen wirkt sofort in der Ansicht, die Mutation erst nach dem Rückgängig-Fenster (CLAUDE.md)
  const { banners: deleteBanners, pendingKeys: pendingDeleteKeys, scheduleDelete, undoDelete } = useUndoableDelete();
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
  const [allButtonIcons, setAllButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);

  const isGuest = !currentUser || currentUser.isGuest;

  // Load configurable heart icons
  useEffect(() => {
    getButtonIcons().then((icons) => {
      setAllButtonIcons(icons);
    });
  }, []);

  // Re-compute icon states when icons or dark mode changes
  useEffect(() => {
    setHeartEmptyIcon(getEffectiveIcon(allButtonIcons, 'ratingHeartEmptyModal', isDarkMode) || DEFAULT_BUTTON_ICONS.ratingHeartEmptyModal);
    setHeartFilledIcon(getEffectiveIcon(allButtonIcons, 'ratingHeartFilled', isDarkMode) || DEFAULT_BUTTON_ICONS.ratingHeartFilled);
  }, [allButtonIcons, isDarkMode]);

  // Listen for dark mode changes
  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
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
      setTimeout(() => {
        resetSafariZoom();
        onClose();
      }, 600);
    } catch (error) {
      console.error('Error saving rating:', error);
      setIsSubmitting(false);
    }
  };

  const handleDeleteRating = (rating, itemName) => {
    scheduleDelete({
      key: `rating-${rating.id}`,
      message: itemName,
      onConfirm: () => {
        // Erst lokal entfernen, damit die Bewertung nach dem Fenster nicht kurz zurückkommt
        setAllRatings((prev) => prev.filter((r) => r.id !== rating.id));
        deleteRating(recipeId, rating.id)
          .then(() => getAllRatings(recipeId).then(setAllRatings))
          .catch((error) => console.error('Error deleting rating:', error));
      },
      onUndo: () => {},
    });
  };

  const activeRating = hoveredRating || selectedRating || 0;

  const handleClose = useCallback(() => {
    resetSafariZoom();
    onClose();
  }, [onClose]);

  const renderHeartIcon = (filled) => {
    const icon = filled ? heartFilledIcon : heartEmptyIcon;
    if (isBase64Image(icon)) {
      return <img src={icon} alt={filled ? t('herzGefuellt') : t('herzLeer')} className="rating-heart-img" />;
    }
    return icon;
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return formatiereDatum(date, sprache, { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="rating-modal-overlay" onClick={handleClose}>
      <div className="rating-modal" role="dialog" aria-modal="true" aria-label={t('rezeptBewerten')} onClick={(e) => e.stopPropagation()}>
        <div className="rating-modal-header">
          <h2 className="rating-modal-title">{t('rezeptBewerten')}</h2>
          <button className="rating-modal-close" onClick={handleClose} aria-label={tAllgemein('schliessen')}>×</button>
        </div>
        <div className="rating-modal-body">
          {count > 0 && (
            <p className="rating-modal-avg">
              {t('durchschnitt', {
                schnitt: formatiereZahl(avg, sprache, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
                anzahl: count,
              })}
            </p>
          )}
          <div className="rating-modal-hearts" role="group" aria-label={t('bewertungAuswaehlen')}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={`rating-heart-btn ${activeRating >= n ? 'filled' : 'empty'}`}
                onClick={() => setSelectedRating(n)}
                onMouseEnter={() => setHoveredRating(n)}
                onMouseLeave={() => setHoveredRating(null)}
                aria-label={t('vonFuenf', { anzahl: n })}
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
              placeholder={t('deinName')}
              maxLength={50}
              required
            />
          )}
          <textarea
            className="rating-comment-input"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('kommentar')}
            rows={3}
          />
          {allRatings.length > 0 && (
            <div className="rating-reviews-list">
              <h3 className="rating-reviews-title">{t('alleBewertungen')}</h3>
              {allRatings.filter((r) => !pendingDeleteKeys.has(`rating-${r.id}`)).map((r) => {
                const bewertungName = t('bewertungVon', { name: r.raterName || t('anonym') });
                return (
                  <RatingReview
                    key={r.id}
                    canDelete={canDeleteRatings}
                    itemName={bewertungName}
                    swipeLabel={t('bewertungLoeschen')}
                    onDelete={() => handleDeleteRating(r, bewertungName)}
                    header={(
                      <>
                        <span className="rating-review-name">{r.raterName || t('anonym')}</span>
                        <span className="rating-review-date">{formatDate(r.updatedAt || r.createdAt)}</span>
                      </>
                    )}
                  >
                    <div className="rating-review-hearts" aria-label={t('vonFuenf', { anzahl: r.rating })}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span key={n} className={`rating-review-heart ${r.rating >= n ? 'filled' : 'empty'}`}>
                          {renderHeartIcon(r.rating >= n)}
                        </span>
                      ))}
                    </div>
                    {r.comment && <p className="rating-review-comment">{r.comment}</p>}
                  </RatingReview>
                );
              })}
            </div>
          )}
        </div>
        <div className="rating-modal-footer">
          <Button variant="secondary" onClick={handleClose}>{tAllgemein('abbrechen')}</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!selectedRating || isSubmitting || saved || (isGuest && !guestName.trim())}
          >
            {saved ? tAllgemein('gespeichert') : isSubmitting ? tAllgemein('speichernKurz') : tAllgemein('speichern')}
          </Button>
        </div>
      </div>
      {/* Im Overlay, damit sie über dem Dialog liegt; ein Klick darauf schließt den Dialog nicht */}
      {deleteBanners.length > 0 && (
        <div className="rating-undo" onClick={(e) => e.stopPropagation()}>
          <UndoSnackbar
            itemName={deleteBanners[deleteBanners.length - 1].message}
            onUndo={() => undoDelete(deleteBanners[deleteBanners.length - 1].id)}
          />
        </div>
      )}
    </div>
  );
}

export default RatingModal;
