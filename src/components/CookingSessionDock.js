import React, { useEffect, useRef } from 'react';
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

/**
 * Meldet die Höhe der unten liegenden Leiste als CSS-Variable `--cooking-dock-offset`,
 * damit Hinweise am unteren Rand (UndoSnackbar, z. B. „… läuft im Hintergrund“) oberhalb
 * der Leiste erscheinen statt sie zu verdecken. Die Höhe schwankt (Umbruch ab 4 Rezepten,
 * Safe-Area), deshalb wird gemessen statt fest verdrahtet.
 */
function useDockOffset(ref, active) {
  useEffect(() => {
    const node = ref.current;
    if (!active || !node) return undefined;
    const root = document.documentElement;
    const update = () => root.style.setProperty('--cooking-dock-offset', `${node.offsetHeight}px`);
    update();
    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(update);
      observer.observe(node);
    }
    return () => {
      if (observer) observer.disconnect();
      root.style.removeProperty('--cooking-dock-offset');
    };
  }, [ref, active]);
}

function CookingSessionDock({ placement = 'inline', currentRecipeId = null, onSelect }) {
  const session = useCookingSession();
  const navRef = useRef(null);
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
  useDockOffset(navRef, visible && placement === 'inline');

  return (
    <>
      {visible && (
        <nav ref={navRef} className={`cooking-dock cooking-dock--${placement} cooking-dock--${density}`} aria-label="Rezepte im Hintergrund">
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
