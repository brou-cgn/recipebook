/**
 * Was Rezept-Leiste (CookingSessionDock), Rezept-Schiene (CookingSessionRail) und Karussell der
 * Kochsitzung (CookingSessionCarousel) zu einem Rezept anzeigen (Vorhaben „Parallel kochen“): abgelaufener Timer,
 * sonst der nächste laufende, sonst der Schritt.
 */

import { erstelleT } from '../i18n/texte';
import { STANDARD_SPRACHE } from '../i18n/sprachen';
import kochmodusTexte from '../i18n/texte/kochmodus';

// Texte über t aus src/i18n/texte/kochmodus.js (Mehrsprachigkeit PR 6a); ohne t Deutsch
const T_DEUTSCH = erstelleT(kochmodusTexte, STANDARD_SPRACHE);

// Ab dieser Restzeit wird ein Rezept als bald fällig hervorgehoben
export const DUE_SOON_SECONDS = 5 * 60;

export function formatRemaining(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// Schritte ohne Zwischenüberschriften, wie der Kochmodus sie zählt (stepItems in RecipeDetail)
function cookingSteps(recipe) {
  return (recipe.steps || []).filter((step) => typeof step === 'string' || step?.type !== 'heading');
}

export function countSteps(recipe) {
  return cookingSteps(recipe).length;
}

/**
 * Der Schritt, an dem ein Rezept der Sitzung steht (Karussell im iPad-Querformat, Entwurf I4).
 * @returns {{ number: number, total: number, text: string }} number beginnt bei 1; ohne Schritte total 0
 */
export function currentStep(entry) {
  const steps = cookingSteps(entry.recipe);
  if (steps.length === 0) return { number: 0, total: 0, text: '' };
  const index = Math.min(Math.max(entry.stepIndex || 0, 0), steps.length - 1);
  const step = steps[index];
  return { number: index + 1, total: steps.length, text: typeof step === 'string' ? step : (step?.text || '') };
}

/**
 * @param {{ recipe: Object, stepIndex?: number }} entry Rezept der Sitzung mit seinem Schritt
 * @param {Object} timers Alle Timer der Sitzung (timers[recipeId][stepKey][timerIndex])
 * @param {Function} [t] Übersetzungsfunktion für kochmodus.js (useTexte), sonst Deutsch
 * @returns {{ kind: 'finished'|'timer'|'step', text: string, shortText?: string, urgent: boolean, label: string,
 *   timer?: Object }} timer: der abgelaufene bzw. nächste laufende Timer (für den Fortschrittsbalken im Karussell)
 */
export function cookingStatus(entry, timers, t = T_DEUTSCH) {
  let finished = null;
  let next = null;
  Object.values(timers[entry.recipe.id] || {}).forEach((byIndex) => {
    Object.values(byIndex).forEach((timer) => {
      if (timer.finished) finished = finished || timer;
      else if (timer.running && (!next || timer.endTime < next.endTime)) next = timer;
    });
  });
  if (finished) return { kind: 'finished', text: t('fertig'), urgent: true, label: t('timerAbgelaufen'), timer: finished };
  if (next) {
    const time = formatRemaining(next.remainingSeconds);
    return { kind: 'timer', text: time, urgent: next.remainingSeconds <= DUE_SOON_SECONDS, label: t('timerRestzeit', { zeit: time }), timer: next };
  }
  const total = countSteps(entry.recipe);
  const step = Math.min((entry.stepIndex || 0) + 1, Math.max(total, 1));
  return total > 0
    ? {
      kind: 'step',
      text: t('schrittKurz', { schritt: step, gesamt: total }),
      shortText: `${step} / ${total}`,
      urgent: false,
      label: t('schrittVon', { schritt: step, gesamt: total }),
    }
    : { kind: 'step', text: t('kocht'), urgent: false, label: t('kochtKlein') };
}

/**
 * Das dringendste fällige Rezept außerhalb des sichtbaren Bereichs (Karussell auf dem iPad quer,
 * Rezept-Schiene im Querformat): abgelaufen vor laufend, dann die kürzeste Restzeit.
 * @param {Array<{ recipe: Object }>} items Einträge in der Reihenfolge der Liste
 * @param {Array<Object>} statuses cookingStatus je Eintrag
 * @param {Object<string, 'up'|'down'>} offscreen aus useOffscreenItems
 * @returns {number} Index des Eintrags, -1 wenn keiner
 */
export function pickJumpTarget(items, statuses, offscreen) {
  let best = -1;
  items.forEach((entry, index) => {
    const status = statuses[index];
    if (!status.urgent || !offscreen[entry.recipe.id]) return;
    if (best < 0) { best = index; return; }
    const other = statuses[best];
    if (status.kind === 'finished' && other.kind !== 'finished') best = index;
    else if (status.kind === 'timer' && other.kind === 'timer'
      && status.timer.remainingSeconds < other.timer.remainingSeconds) best = index;
  });
  return best;
}

const STEP_KEY = /^step_(\d+)$/;

/**
 * Timer anderer Schritte des Rezepts vorn, für die Chips in der Titelzeile des Kochmodus (Feinschliff Tablet,
 * Punkt 3; Tech-Check P9): Ein Timer steht nur auf der Karte seines Schritts. Wer weiterblättert, während er
 * läuft, sähe ihn sonst nirgends, denn Leiste und Karussell zeigen das Rezept vorn nicht. Der Timer des
 * aktuellen Schritts fehlt hier, er steht auf dessen Karte. Abgelaufene zuerst, dann nach Restzeit.
 * @param {Object} timers Timer des Rezepts vorn (getTimers: stepKey -> timerIndex -> Timer)
 * @param {number} currentStepIndex der Schritt, der gerade vorn steht
 * @param {Function} [t] Übersetzungsfunktion für kochmodus.js (useTexte), sonst Deutsch
 * @returns {Array<{ stepIndex: number, kind: 'finished'|'timer', text: string, urgent: boolean, label: string }>}
 */
export function stepTimerChips(timers, currentStepIndex, t = T_DEUTSCH) {
  const chips = [];
  Object.entries(timers || {}).forEach(([stepKey, byIndex]) => {
    const match = STEP_KEY.exec(stepKey);
    if (!match) return;
    const stepIndex = Number(match[1]);
    if (stepIndex === currentStepIndex) return;
    Object.values(byIndex || {}).forEach((timer) => {
      if (!timer) return;
      if (timer.finished) {
        chips.push({ stepIndex, kind: 'finished', text: t('fertig'), urgent: true, label: t('timerAbgelaufen'), remaining: -1 });
      } else if (timer.running) {
        const time = formatRemaining(timer.remainingSeconds);
        chips.push({
          stepIndex, kind: 'timer', text: time, urgent: timer.remainingSeconds <= DUE_SOON_SECONDS, label: t('timerRestzeit', { zeit: time }), remaining: timer.remainingSeconds,
        });
      }
    });
  });
  return chips
    .sort((a, b) => a.remaining - b.remaining || a.stepIndex - b.stepIndex)
    .map(({ remaining, ...chip }) => chip);
}
