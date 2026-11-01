import React, { useId, useRef } from 'react';
import { useCookingSession } from '../contexts/CookingSessionContext';
import useSwipeToDelete from '../hooks/useSwipeToDelete';
import useUndoableDelete from '../hooks/useUndoableDelete';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion';
import useOffscreenItems from '../hooks/useOffscreenItems';
import { getRecipeThumbnail } from '../utils/recipeThumbnail';
import { cookingStatus, currentStep, pickJumpTarget } from '../utils/cookingSessionStatus';
import UndoSnackbar from './UndoSnackbar';
import TrashIcon from './icons/TrashIcon';
import ArrowVerticalIcon from './icons/ArrowVerticalIcon';
import './DeleteRowButton.css';
import './CookingSessionCarousel.css';

/**
 * Karussell der Kochsitzung im iPad-Querformat (Vorhaben „Parallel kochen“, Entwurf I4):
 * die linke Spalte neben dem Kochmodus, der rechts wie im Hochformat läuft. Je weiteres
 * Rezept der Sitzung eine Karte mit Bild, Name, Schritt und Timer und dem Text des Schritts,
 * an dem das Rezept steht. Das Rezept vorn steht nicht darin.
 *
 * Das Karussell scrollt senkrecht und rastet je Karte ein. Bis zu zwei Karten teilen sich
 * die Höhe, ab drei werden sie kompakt (drei ganz, die vierte schaut heraus). Die Reihenfolge
 * ist die der Sitzung; Tippen tauscht an Ort und Stelle (swapWith mit inPlace in RecipeDetail),
 * so bleiben die übrigen Karten stehen. Liegt ein fälliges Rezept außerhalb des sichtbaren
 * Bereichs, zeigt eine Pille, wo es ist; Tippen scrollt hin.
 *
 * Linksswipe nimmt ein Rezept aus der Sitzung, mit „Rückgängig“ wie Leiste und Schiene.
 *
 * Ohne weitere Rezepte steht die Spalte trotzdem da (sonst spränge das Layout beim zweiten
 * Rezept), mit einem Hinweis und „Rezept dazunehmen“ (onAdd, Sheet „Was kochst du dazu?“).
 */

// Ab so vielen Karten kompakt
const COMPACT_FROM = 3;
// Ab diesem Anteil gilt eine Karte als sichtbar
const VISIBLE_RATIO = 0.5;

function ClockIcon() {
  return (
    <svg className="cooking-carousel-clock" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M9 2h6" />
    </svg>
  );
}

// Name und Status stehen im Knopf, das Bild ist Schmuck
function CarouselThumb({ recipe }) {
  const thumbnail = getRecipeThumbnail(recipe);
  if (thumbnail) return <img className="cooking-carousel-thumb" src={thumbnail} alt="" />;
  // Ohne Bild sähen alle Kreise gleich aus: dann der Anfangsbuchstabe des Rezepts
  const initial = (recipe.title || '').trim().charAt(0).toUpperCase();
  return <span className="cooking-carousel-thumb cooking-carousel-thumb--initial" aria-hidden="true">{initial}</span>;
}

// Wie der Balken der Schrittkarte: zeigt die Restzeit; abgelaufen ganz gefüllt (orange)
function timerProgress(status) {
  if (status.kind === 'finished') return 100;
  const { timer } = status;
  if (status.kind !== 'timer' || !timer || !(timer.totalSeconds > 0)) return null;
  return Math.max(0, Math.min(100, (timer.remainingSeconds / timer.totalSeconds) * 100));
}

function CarouselCard({ entry, status, onSelect, onRemove }) {
  const { offset, isDeleteVisible, reset, handlers } = useSwipeToDelete();
  const stepId = useId();
  const { recipe } = entry;
  const step = currentStep(entry);
  const progress = timerProgress(status);

  const handleRemove = (e) => {
    e.stopPropagation();
    reset();
    onRemove(entry);
  };

  const itemClass = `cooking-carousel-item${status.urgent ? ' cooking-carousel-item--urgent' : ''}${isDeleteVisible ? ' swipe-delete-active' : ''}`;
  return (
    <li className={itemClass} data-recipe-id={recipe.id}>
      <div className="swipe-delete-background" aria-hidden={!isDeleteVisible && offset === 0}>
        <button
          type="button"
          className="swipe-delete-action"
          onClick={handleRemove}
          aria-label={`${recipe.title} entfernen`}
          tabIndex={isDeleteVisible ? 0 : -1}
        >
          <span className="swipe-delete-icon-text"><TrashIcon /></span>
        </button>
      </div>
      <button
        type="button"
        className="cooking-carousel-card"
        style={{ transform: `translateX(${offset}px)`, transition: 'transform 0.15s ease' }}
        onClick={() => { if (isDeleteVisible) reset(); else onSelect(entry); }}
        aria-label={`${recipe.title} nach vorn holen, ${status.label}`}
        aria-describedby={step.text ? stepId : undefined}
        {...handlers}
      >
        <span className="cooking-carousel-head">
          <CarouselThumb recipe={recipe} />
          <span className="cooking-carousel-titles">
            <span className="cooking-carousel-name">{recipe.title}</span>
            {step.total > 0 && (
              <span className="cooking-carousel-step-number">Schritt {step.number} von {step.total}</span>
            )}
          </span>
          {status.kind !== 'step' && (
            <span className={`cooking-carousel-status cooking-carousel-status--${status.kind}`}>
              {status.kind === 'timer' && <ClockIcon />}
              {status.text}
            </span>
          )}
        </span>
        {step.total > 1 && (
          <span className="cooking-carousel-steps" aria-hidden="true">
            {Array.from({ length: step.total }, (_, index) => (
              <span
                key={index}
                className={`cooking-carousel-steps-dot${index === step.number - 1 ? ' cooking-carousel-steps-dot--active' : ''}`}
              />
            ))}
          </span>
        )}
        {step.text && <span className="cooking-carousel-step" id={stepId}>{step.text}</span>}
        {progress !== null && (
          <span className="cooking-carousel-timer-bar" aria-hidden="true">
            <span className="cooking-carousel-timer-fill" style={{ width: `${progress}%` }} />
          </span>
        )}
      </button>
    </li>
  );
}

function CookingSessionCarousel({ currentRecipeId, onSelect, onAdd }) {
  const session = useCookingSession();
  const reducedMotion = usePrefersReducedMotion();
  const { banners, pendingKeys, scheduleDelete, undoDelete } = useUndoableDelete();
  const listRef = useRef(null);

  const items = session.sessionRecipes.filter(
    (entry) => entry.recipe.id !== currentRecipeId && !pendingKeys.has(entry.recipe.id)
  );
  const statuses = items.map((entry) => cookingStatus(entry, session.allTimers));
  const compact = items.length >= COMPACT_FROM;
  const idsKey = items.map((entry) => entry.recipe.id).join('|');
  // Rezept-ID -> 'up' | 'down' für Karten, die gerade nicht (genug) zu sehen sind
  const offscreen = useOffscreenItems(listRef, idsKey, VISIBLE_RATIO);

  const jumpIndex = pickJumpTarget(items, statuses, offscreen);
  const jump = jumpIndex >= 0
    ? { entry: items[jumpIndex], status: statuses[jumpIndex], up: offscreen[items[jumpIndex].recipe.id] === 'up' }
    : null;

  const scrollToCard = (recipeId) => {
    const card = Array.from(listRef.current?.children || []).find((el) => el.dataset.recipeId === recipeId);
    if (card && typeof card.scrollIntoView === 'function') {
      card.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
    }
  };

  const handleRemove = (entry) => scheduleDelete({
    key: entry.recipe.id,
    message: entry.recipe.title,
    onConfirm: () => session.removeFromSession(entry.recipe.id),
    onUndo: () => {},
  });
  const lastBanner = banners[banners.length - 1];

  let heading = 'Am Herd';
  if (items.length === 1) heading = 'Am Herd · 1 weiteres';
  else if (items.length > 1) heading = `Am Herd · ${items.length} weitere`;

  return (
    <>
      <nav className={`cooking-carousel${compact ? ' cooking-carousel--compact' : ''}`} aria-label="Weitere Rezepte am Herd">
        <h2 className="cooking-carousel-heading">{heading}</h2>
        {items.length === 0 && (
          <div className="cooking-carousel-empty">
            <p className="cooking-carousel-empty-title">Noch kein weiteres Rezept am Herd</p>
            <p className="cooking-carousel-empty-text">Was du dazunimmst, steht hier mit seinem aktuellen Schritt.</p>
            {onAdd && (
              <button type="button" className="cooking-carousel-empty-add" onClick={onAdd}>
                Rezept dazunehmen
              </button>
            )}
          </div>
        )}
        <ul className="cooking-carousel-list" ref={listRef}>
          {items.map((entry, index) => (
            <CarouselCard
              key={entry.recipe.id}
              entry={entry}
              status={statuses[index]}
              onSelect={onSelect}
              onRemove={handleRemove}
            />
          ))}
        </ul>
        {jump && (
          <button
            type="button"
            className={`cooking-carousel-jump${jump.up ? ' cooking-carousel-jump--up' : ''}`}
            onClick={() => scrollToCard(jump.entry.recipe.id)}
            aria-label={`Zu ${jump.entry.recipe.title} scrollen, ${jump.status.label}`}
          >
            <CarouselThumb recipe={jump.entry.recipe} />
            <span className="cooking-carousel-jump-label">{jump.entry.recipe.title} · {jump.status.text}</span>
            <ArrowVerticalIcon up={jump.up} />
          </button>
        )}
      </nav>
      <UndoSnackbar
        itemName={lastBanner?.message}
        onUndo={() => lastBanner && undoDelete(lastBanner.id)}
      />
    </>
  );
}

export default CookingSessionCarousel;
