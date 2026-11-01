import React, { useEffect, useRef } from 'react';
import { useCookingSession } from '../contexts/CookingSessionContext';
import useSwipeToDelete from '../hooks/useSwipeToDelete';
import useUndoableDelete from '../hooks/useUndoableDelete';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion';
import useOffscreenItems from '../hooks/useOffscreenItems';
import { getRecipeThumbnail } from '../utils/recipeThumbnail';
import { cookingStatus, pickJumpTarget } from '../utils/cookingSessionStatus';
import CookingAddRecipeButton from './CookingAddRecipeButton';
import UndoSnackbar from './UndoSnackbar';
import TrashIcon from './icons/TrashIcon';
import ArrowVerticalIcon from './icons/ArrowVerticalIcon';
import './DeleteRowButton.css';
import './CookingSessionRail.css';

/**
 * Rezept-Schiene der Kochsitzung im Querformat (Vorhaben „Parallel kochen“, Entwurf Q2):
 * eine schmale Spalte mit allen Rezepten der Sitzung, je Rezept Bild und Timer bzw. Schritt,
 * darunter „+“ (Sheet „Was kochst du dazu?“).
 *
 * Sie steht auf der Seite gegenüber der Kamera (side, RecipeDetail bestimmt sie mit
 * useLandscapeCameraSide) und reicht dort bis an den Displayrand. Die Kreise sind so groß wie die
 * FAB-Buttons (56 px). Passen nicht alle Rezepte in die Höhe, scrollt die Liste als Karussell und
 * rastet je Rezept ein; das Rezept vorn bleibt dabei im Blick. Liegt ein fälliges Rezept außer
 * Sicht, zeigt ein oranger Hinweis am Rand der Liste, wo es liegt (wie das Karussell auf dem iPad).
 *
 * Anders als die Leiste im Hochformat steht das Rezept vorn mit in der Schiene (als Lasche zur
 * Spalte daneben), und die Reihenfolge bleibt fest, wie die Sitzung sie führt: Sortiert nach dem
 * nächsten Timer würden die Kreise springen, sobald ein Timer startet. Ein Rezept vorn, das noch
 * nicht in der Sitzung ist, steht am Ende; dort parkt es beim Tauschen.
 *
 * Tippen holt ein Rezept nach vorn (onSelect, das vordere parkt), Linksswipe nimmt ein
 * geparktes aus der Sitzung (mit „Rückgängig“, wie die Leiste). Das Rezept vorn hat keinen
 * Swipe; es endet wie bisher über „Kochmodus beenden“ im Hochformat.
 */

function RailThumb({ recipe, label = '' }) {
  const thumbnail = getRecipeThumbnail(recipe);
  if (thumbnail) return <img className="cooking-rail-thumb" src={thumbnail} alt={label} />;
  // Ohne Bild sähen alle Kreise gleich aus: dann der Anfangsbuchstabe des Rezepts
  const initial = (recipe.title || '').trim().charAt(0).toUpperCase();
  return (
    <span
      className="cooking-rail-thumb cooking-rail-thumb--initial"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {initial}
    </span>
  );
}

function RailStatus({ status }) {
  return (
    <span className={`cooking-rail-status cooking-rail-status--${status.kind}`}>
      {status.shortText || status.text}
    </span>
  );
}

function itemClass(status, extra = '') {
  return `cooking-rail-item${status.urgent ? ' cooking-rail-item--urgent' : ''}${extra}`;
}

// Das Rezept vorn: kein Knopf, nur markiert (aria-current)
function CurrentItem({ entry, status }) {
  return (
    <li className={itemClass(status, ' cooking-rail-item--current')} data-recipe-id={entry.recipe.id}>
      <span className="cooking-rail-button" aria-current="true" title={`${entry.recipe.title}, vorn`}>
        <RailThumb recipe={entry.recipe} label={entry.recipe.title} />
        <RailStatus status={status} />
      </span>
    </li>
  );
}

function ParkedItem({ entry, status, onSelect, onRemove }) {
  // So weit, wie die Schiene breit ist: Das Rezept gleitet ganz hinaus, kein Rest bleibt stehen
  const { offset, isDeleteVisible, reset, handlers } = useSwipeToDelete({ maxOffset: 70 });
  const { recipe } = entry;

  const handleRemove = (e) => {
    e.stopPropagation();
    reset();
    onRemove(entry);
  };

  return (
    <li className={itemClass(status, isDeleteVisible ? ' swipe-delete-active' : '')} data-recipe-id={recipe.id}>
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
        className="cooking-rail-button"
        style={{ transform: `translateX(${offset}px)`, transition: 'transform 0.15s ease' }}
        onClick={() => { if (isDeleteVisible) reset(); else onSelect(entry); }}
        aria-label={`${recipe.title} öffnen, ${status.label}`}
        title={recipe.title}
        {...handlers}
      >
        <RailThumb recipe={recipe} />
        <RailStatus status={status} />
      </button>
    </li>
  );
}

// Nur die Liste scrollen, nicht die Seite: 'nearest' bewegt nichts, was schon zu sehen ist
function scrollItemIntoView(list, recipeId, behavior) {
  const item = Array.from(list?.children || []).find((el) => el.dataset.recipeId === recipeId);
  if (item && typeof item.scrollIntoView === 'function') item.scrollIntoView({ behavior, block: 'nearest' });
}

function CookingSessionRail({
  currentRecipe,
  currentStepIndex = 0,
  side = 'left',
  onSelect,
  onAdd,
  addIcon,
  addIconLoaded = true,
}) {
  const session = useCookingSession();
  const reducedMotion = usePrefersReducedMotion();
  const { banners, pendingKeys, scheduleDelete, undoDelete } = useUndoableDelete();
  const listRef = useRef(null);

  const current = { recipe: currentRecipe, stepIndex: currentStepIndex, current: true };
  const listed = session.sessionRecipes.filter((e) => !pendingKeys.has(e.recipe.id));
  const items = listed.some((e) => e.recipe.id === currentRecipe.id)
    ? listed.map((e) => (e.recipe.id === currentRecipe.id ? current : e))
    : [...listed, current];
  const statuses = items.map((entry) => cookingStatus(entry, session.allTimers));
  const offscreen = useOffscreenItems(listRef, items.map((entry) => entry.recipe.id).join('|'));
  const jumpIndex = pickJumpTarget(items, statuses, offscreen);
  const jump = jumpIndex >= 0
    ? { entry: items[jumpIndex], status: statuses[jumpIndex], up: offscreen[items[jumpIndex].recipe.id] === 'up' }
    : null;

  // Das Rezept vorn im Blick halten: beim Einblenden und wenn ein anderes nach vorn kommt
  // (ein dazugenommenes steht am Ende der Liste)
  useEffect(() => {
    scrollItemIntoView(listRef.current, currentRecipe.id, 'auto');
  }, [currentRecipe.id]);

  const handleRemove = (entry) => scheduleDelete({
    key: entry.recipe.id,
    message: entry.recipe.title,
    onConfirm: () => session.removeFromSession(entry.recipe.id),
    onUndo: () => {},
  });
  const lastBanner = banners[banners.length - 1];

  return (
    <>
      <nav className={`cooking-rail cooking-rail--${side === 'right' ? 'right' : 'left'}`} aria-label="Rezepte am Herd">
        <div className="cooking-rail-viewport">
          <ul className="cooking-rail-list" ref={listRef}>
            {items.map((entry, index) => (entry.current ? (
              <CurrentItem key={entry.recipe.id} entry={entry} status={statuses[index]} />
            ) : (
              <ParkedItem key={entry.recipe.id} entry={entry} status={statuses[index]} onSelect={onSelect} onRemove={handleRemove} />
            )))}
          </ul>
          {jump && (
            <button
              type="button"
              className={`cooking-rail-jump${jump.up ? ' cooking-rail-jump--up' : ''}`}
              onClick={() => scrollItemIntoView(listRef.current, jump.entry.recipe.id, reducedMotion ? 'auto' : 'smooth')}
              aria-label={`Zu ${jump.entry.recipe.title} scrollen, ${jump.status.label}`}
            >
              <ArrowVerticalIcon up={jump.up} size={12} strokeWidth={3} />
              <span className="cooking-rail-jump-label">{jump.status.text}</span>
            </button>
          )}
        </div>
        <div className="cooking-rail-add">
          <CookingAddRecipeButton icon={addIcon} loaded={addIconLoaded} onClick={onAdd} />
        </div>
      </nav>
      <UndoSnackbar
        itemName={lastBanner?.message}
        onUndo={() => lastBanner && undoDelete(lastBanner.id)}
      />
    </>
  );
}

export default CookingSessionRail;
