import React from 'react';
import { useCookingSession, sortByNextDue } from '../contexts/CookingSessionContext';
import useSwipeToDelete from '../hooks/useSwipeToDelete';
import useUndoableDelete from '../hooks/useUndoableDelete';
import { getRecipeThumbnail } from '../utils/recipeThumbnail';
import { cookingStatus } from '../utils/cookingSessionStatus';
import UndoSnackbar from './UndoSnackbar';
import TrashIcon from './icons/TrashIcon';
import './DeleteRowButton.css';
import './CookingSessionDock.css';

/**
 * Rezept-Leiste der Kochsitzung (Vorhaben „Parallel kochen“, Entwurf H1): ein Chip je
 * Rezept im Hintergrund, nach Dringlichkeit sortiert. Tippen holt das Rezept nach vorn,
 * Linksswipe nimmt es aus der Sitzung (mit „Rückgängig“, CLAUDE.md Löschaktionen).
 *
 * placement: 'inline' unten im Kochmodus (RecipeDetail), 'top' direkt unter dem Header
 * der Hauptansicht (App.js); die Seite darunter rückt entsprechend nach unten.
 */

function DockChip({ entry, status, compact, onSelect, onRemove }) {
  const { offset, isDeleteVisible, reset, handlers } = useSwipeToDelete({ maxOffset: 64 });
  const { recipe } = entry;
  const thumbnail = getRecipeThumbnail(recipe);

  const handleRemove = (e) => {
    e.stopPropagation();
    reset();
    onRemove(entry);
  };

  return (
    <li className={`cooking-dock-chip${status.urgent ? ' cooking-dock-chip--urgent' : ''}${isDeleteVisible ? ' swipe-delete-active' : ''}`}>
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
        className="cooking-dock-chip-main"
        style={{ transform: `translateX(${offset}px)`, transition: 'transform 0.15s ease' }}
        onClick={() => { if (isDeleteVisible) reset(); else onSelect(entry); }}
        aria-label={`${recipe.title} öffnen, ${status.label}`}
        {...handlers}
      >
        {thumbnail ? (
          <img className="cooking-dock-chip-thumb" src={thumbnail} alt="" />
        ) : (
          <span className="cooking-dock-chip-thumb cooking-dock-chip-thumb--empty" aria-hidden="true" />
        )}
        <span className="cooking-dock-chip-text">
          <span className="cooking-dock-chip-title">{recipe.title}</span>
          <span className={`cooking-dock-chip-status cooking-dock-chip-status--${status.kind}`}>{compact && status.shortText ? status.shortText : status.text}</span>
        </span>
      </button>
    </li>
  );
}

function CookingSessionDock({ placement = 'inline', currentRecipeId = null, onSelect }) {
  const session = useCookingSession();
  const { banners, pendingKeys, scheduleDelete, undoDelete } = useUndoableDelete();
  const entries = sortByNextDue(
    session.sessionRecipes.filter((e) => e.recipe.id !== currentRecipeId && !pendingKeys.has(e.recipe.id)),
    session.allTimers
  );
  const visible = entries.length > 0;
  // Ab 3 Rezepten nur noch Schritt „x / y“ (Timer bleiben), ab 4 nur der Bild-Kreis
  const density = entries.length >= 4 ? 'thumb' : entries.length === 3 ? 'compact' : 'full';

  const handleSelect = onSelect || ((entry) => session.switchTo(entry.recipe.id));
  const handleRemove = (entry) => scheduleDelete({
    key: entry.recipe.id,
    message: entry.recipe.title,
    onConfirm: () => session.removeFromSession(entry.recipe.id),
    onUndo: () => {},
  });
  const lastBanner = banners[banners.length - 1];

  return (
    <>
      {visible && (
        <nav className={`cooking-dock cooking-dock--${placement} cooking-dock--${density}`} aria-label="Rezepte im Hintergrund">
          <ul className="cooking-dock-list">
            {entries.map((entry) => (
              <DockChip
                key={entry.recipe.id}
                entry={entry}
                status={cookingStatus(entry, session.allTimers)}
                compact={density !== 'full'}
                onSelect={handleSelect}
                onRemove={handleRemove}
              />
            ))}
          </ul>
        </nav>
      )}
      <UndoSnackbar
        itemName={lastBanner?.message}
        onUndo={() => lastBanner && undoDelete(lastBanner.id)}
      />
    </>
  );
}

export default CookingSessionDock;
