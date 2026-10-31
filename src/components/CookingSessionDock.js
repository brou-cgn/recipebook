import React, { useEffect } from 'react';
import { useCookingSession, sortByNextDue } from '../contexts/CookingSessionContext';
import useSwipeToDelete from '../hooks/useSwipeToDelete';
import useUndoableDelete from '../hooks/useUndoableDelete';
import { getRecipeThumbnail } from '../utils/recipeThumbnail';
import UndoSnackbar from './UndoSnackbar';
import TrashIcon from './icons/TrashIcon';
import './DeleteRowButton.css';
import './CookingSessionDock.css';

/**
 * Rezept-Leiste der Kochsitzung (Vorhaben „Parallel kochen“, Entwurf H1): ein Chip je
 * Rezept im Hintergrund, nach Dringlichkeit sortiert. Tippen holt das Rezept nach vorn,
 * Linksswipe nimmt es aus der Sitzung (mit „Rückgängig“, CLAUDE.md Löschaktionen).
 *
 * placement: 'inline' unten im Kochmodus (RecipeDetail), 'bar' bzw. 'pill' fest über der
 * vollen Bottom-Navigation bzw. ihrer Pille (App.js).
 */

// Ab dieser Restzeit wird ein Chip als bald fällig hervorgehoben
const DUE_SOON_SECONDS = 5 * 60;
// Platz, den die feste Leiste unten belegt (Höhe plus Abstand), für Listen und schwebende Knöpfe
const FLOATING_DOCK_SPACE = '76px';

function formatRemaining(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function countSteps(recipe) {
  return (recipe.steps || []).filter((step) => typeof step === 'string' || step?.type !== 'heading').length;
}

// Was der Chip zeigt: abgelaufener Timer, sonst der nächste laufende, sonst der Schritt
function chipStatus(entry, timers) {
  let finished = false;
  let next = null;
  Object.values(timers[entry.recipe.id] || {}).forEach((byIndex) => {
    Object.values(byIndex).forEach((t) => {
      if (t.finished) finished = true;
      else if (t.running && (!next || t.endTime < next.endTime)) next = t;
    });
  });
  if (finished) return { kind: 'finished', text: 'Fertig', urgent: true, label: 'Timer abgelaufen' };
  if (next) {
    const time = formatRemaining(next.remainingSeconds);
    return { kind: 'timer', text: time, urgent: next.remainingSeconds <= DUE_SOON_SECONDS, label: `Timer ${time}` };
  }
  const total = countSteps(entry.recipe);
  const step = Math.min((entry.stepIndex || 0) + 1, Math.max(total, 1));
  return total > 0
    ? { kind: 'step', text: `Schritt ${step} / ${total}`, shortText: `${step} / ${total}`, urgent: false, label: `Schritt ${step} von ${total}` }
    : { kind: 'step', text: 'Kocht', urgent: false, label: 'kocht' };
}

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
  const floating = placement !== 'inline';
  // Ab 3 Rezepten nur noch Schritt „x / y“ (Timer bleiben), ab 4 nur der Bild-Kreis
  const density = entries.length >= 4 ? 'thumb' : entries.length === 3 ? 'compact' : 'full';

  // Feste Leiste: unten Platz freihalten, damit Listen und schwebende Knöpfe nicht darunter liegen
  useEffect(() => {
    if (!floating || !visible) return undefined;
    const root = document.documentElement;
    root.style.setProperty('--cooking-dock-space', FLOATING_DOCK_SPACE);
    return () => root.style.removeProperty('--cooking-dock-space');
  }, [floating, visible]);

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
                status={chipStatus(entry, session.allTimers)}
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
