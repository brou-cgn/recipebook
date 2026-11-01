import React from 'react';
import { useCookingSession } from '../contexts/CookingSessionContext';
import useSwipeToDelete from '../hooks/useSwipeToDelete';
import useUndoableDelete from '../hooks/useUndoableDelete';
import { getRecipeThumbnail } from '../utils/recipeThumbnail';
import { cookingStatus } from '../utils/cookingSessionStatus';
import CookingAddRecipeButton from './CookingAddRecipeButton';
import UndoSnackbar from './UndoSnackbar';
import TrashIcon from './icons/TrashIcon';
import './DeleteRowButton.css';
import './CookingSessionRail.css';

/**
 * Rezept-Schiene der Kochsitzung im Querformat (Vorhaben „Parallel kochen“, Entwurf Q2):
 * eine schmale Spalte am linken Rand mit allen Rezepten der Sitzung, je Rezept Bild und
 * Timer bzw. Schritt, darunter „+“ (Sheet „Was kochst du dazu?“).
 *
 * Anders als die Leiste im Hochformat steht das Rezept vorn mit in der Schiene (als Lasche,
 * die in die Zutatenspalte übergeht), und die Reihenfolge bleibt fest, wie die Sitzung sie
 * führt: Sortiert nach dem nächsten Timer würden die Kreise springen, sobald ein Timer startet.
 * Ein Rezept vorn, das noch nicht in der Sitzung ist, steht am Ende; dort parkt es beim Tauschen.
 *
 * Tippen holt ein Rezept nach vorn (onSelect, das vordere parkt), Linksswipe nimmt ein
 * geparktes aus der Sitzung (mit „Rückgängig“, wie die Leiste). Das Rezept vorn hat keinen
 * Swipe; es endet wie bisher über „Kochmodus beenden“ im Hochformat.
 */

// Ab so vielen Rezepten kleinere Kreise: sechs samt „+“ passen dann in rund 390 px Höhe
const COMPACT_FROM = 4;

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
    <li className={itemClass(status, ' cooking-rail-item--current')}>
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
    <li className={itemClass(status, isDeleteVisible ? ' swipe-delete-active' : '')}>
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

function CookingSessionRail({ currentRecipe, currentStepIndex = 0, onSelect, onAdd, addIcon, addIconLoaded = true }) {
  const session = useCookingSession();
  const { banners, pendingKeys, scheduleDelete, undoDelete } = useUndoableDelete();

  const current = { recipe: currentRecipe, stepIndex: currentStepIndex, current: true };
  const listed = session.sessionRecipes.filter((e) => !pendingKeys.has(e.recipe.id));
  const items = listed.some((e) => e.recipe.id === currentRecipe.id)
    ? listed.map((e) => (e.recipe.id === currentRecipe.id ? current : e))
    : [...listed, current];
  const compact = items.length >= COMPACT_FROM;

  const handleRemove = (entry) => scheduleDelete({
    key: entry.recipe.id,
    message: entry.recipe.title,
    onConfirm: () => session.removeFromSession(entry.recipe.id),
    onUndo: () => {},
  });
  const lastBanner = banners[banners.length - 1];

  return (
    <>
      <nav className={`cooking-rail${compact ? ' cooking-rail--compact' : ''}`} aria-label="Rezepte am Herd">
        <ul className="cooking-rail-list">
          {items.map((entry) => {
            const status = cookingStatus(entry, session.allTimers);
            return entry.current ? (
              <CurrentItem key={entry.recipe.id} entry={entry} status={status} />
            ) : (
              <ParkedItem key={entry.recipe.id} entry={entry} status={status} onSelect={onSelect} onRemove={handleRemove} />
            );
          })}
        </ul>
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
