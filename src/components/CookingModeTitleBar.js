import React from 'react';
import CookingAddRecipeButton from './CookingAddRecipeButton';
import { getRecipeThumbnail } from '../utils/recipeThumbnail';
import './CookingModeTitleBar.css';

/**
 * Titelzeile des Kochmodus (Vorhaben „Parallel kochen“, Rollen-Flag parallelKochen, nicht im Handy-Querformat):
 * Name des Rezepts vorn, die Timer anderer Schritte dieses Rezepts als Chips und der Knopf „Rezept dazunehmen“.
 *
 * Auf dem Tablet (Feinschliff Tablet, Punkt 2) wie eine Karte im Karussell: Bild, Name groß, „Schritt x von y“.
 * So entspricht das Rezept vorn den Karten links, und beim Tauschen ist klar, was wohin wandert.
 *
 * Chips (Punkt 3, Tech-Check P9): Ein Timer steht nur auf der Karte seines Schritts; wer weiterblättert, sähe
 * ihn sonst nirgends. Tippen springt zum Schritt. Höchstens zwei, fällige zuerst, der Rest als „+n“.
 * Auf dem Tablet quer stehen sie neben dem Namen, sonst in einer eigenen Zeile darunter (CookingModeTitleBar.css).
 */
const MAX_CHIPS = 2;

function TitleBarThumb({ recipe }) {
  const thumbnail = getRecipeThumbnail(recipe);
  if (thumbnail) return <img className="cooking-mode-titlebar-thumb" src={thumbnail} alt="" />;
  // Ohne Bild der Anfangsbuchstabe, wie im Karussell
  const initial = (recipe.title || '').trim().charAt(0).toUpperCase();
  return <span className="cooking-mode-titlebar-thumb cooking-mode-titlebar-thumb--initial" aria-hidden="true">{initial}</span>;
}

function ClockIcon() {
  return (
    <svg className="cooking-mode-timer-chip-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M9 2h6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="cooking-mode-timer-chip-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function CookingModeTitleBar({
  recipe,
  tablet = false,
  stepNumber = 0,
  totalSteps = 0,
  timerChips = [],
  onJumpToStep,
  addIcon,
  addIconLoaded = true,
  onAdd,
}) {
  const chips = timerChips.slice(0, MAX_CHIPS);
  const more = timerChips.length - chips.length;

  return (
    <div className={`cooking-mode-titlebar${tablet ? ' cooking-mode-titlebar--tablet' : ''}`}>
      {tablet && <TitleBarThumb recipe={recipe} />}
      <div className="cooking-mode-titlebar-titles">
        <h2 className="cooking-mode-titlebar-title">{recipe.title}</h2>
        {tablet && totalSteps > 0 && (
          <span className="cooking-mode-titlebar-step">Schritt {stepNumber} von {totalSteps}</span>
        )}
      </div>
      {chips.length > 0 && (
        <div className="cooking-mode-timer-chips" role="group" aria-label="Timer anderer Schritte">
          {chips.map((chip) => (
            <button
              key={`${chip.stepIndex}-${chip.kind}`}
              type="button"
              className={`cooking-mode-timer-chip${chip.urgent ? ' cooking-mode-timer-chip--urgent' : ''}`}
              onClick={() => onJumpToStep(chip.stepIndex)}
              aria-label={`Zu Schritt ${chip.stepIndex + 1} springen, ${chip.label}`}
            >
              {chip.kind === 'finished' ? <CheckIcon /> : <ClockIcon />}
              <span className="cooking-mode-timer-chip-step">Schritt {chip.stepIndex + 1}</span>
              <span className="cooking-mode-timer-chip-time">{chip.text}</span>
            </button>
          ))}
          {more > 0 && <span className="cooking-mode-timer-chips-more">+{more}</span>}
        </div>
      )}
      <CookingAddRecipeButton icon={addIcon} loaded={addIconLoaded} onClick={onAdd} />
    </div>
  );
}

export default CookingModeTitleBar;
