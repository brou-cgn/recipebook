/**
 * Was Rezept-Leiste (CookingSessionDock) und Rezept-Schiene (CookingSessionRail) der
 * Kochsitzung zu einem Rezept anzeigen (Vorhaben „Parallel kochen“): abgelaufener Timer,
 * sonst der nächste laufende, sonst der Schritt.
 */

// Ab dieser Restzeit wird ein Rezept als bald fällig hervorgehoben
export const DUE_SOON_SECONDS = 5 * 60;

export function formatRemaining(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function countSteps(recipe) {
  return (recipe.steps || []).filter((step) => typeof step === 'string' || step?.type !== 'heading').length;
}

/**
 * @param {{ recipe: Object, stepIndex?: number }} entry Rezept der Sitzung mit seinem Schritt
 * @param {Object} timers Alle Timer der Sitzung (timers[recipeId][stepKey][timerIndex])
 * @returns {{ kind: 'finished'|'timer'|'step', text: string, shortText?: string, urgent: boolean, label: string }}
 */
export function cookingStatus(entry, timers) {
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
