import { useLayoutEffect } from 'react';

/**
 * Schriftstufen für lange Schritte (Vorhaben „Parallel kochen“, Feinschliff Tablet, Punkt 6): Passt der Text
 * einer Schrittkarte nicht in die Karte, setzt der Hook eine Stufe kleiner (data-fit="1", dann "2"; die Größen
 * stehen in RecipeDetail.css, nur auf dem Tablet). Erst wenn auch die kleinste Stufe nicht reicht, scrollt die
 * Karte wie bisher.
 *
 * Gemessen wird nach dem Rendern, wenn sich der Inhalt ändert (contentKey: Rezept, Timer-Knöpfe), wenn sich die
 * Größe des Schritt-Karussells ändert (Drehen, Karussell kommt oder geht) und nachdem die Schriften geladen sind.
 * Die Stufe steht direkt am DOM statt im State: Sie hängt an der gemessenen Höhe, als State gäbe es eine
 * Render-Schleife.
 */
export const STEP_FIT_LEVELS = 2;

// Jede Karte einzeln: erst ohne Stufe messen, dann so lange eine Stufe kleiner, bis der Text passt
export function fitStepCards(container) {
  container.querySelectorAll('.step-card').forEach((card) => {
    card.removeAttribute('data-fit');
    for (let level = 1; level <= STEP_FIT_LEVELS && card.scrollHeight > card.clientHeight + 1; level += 1) {
      card.setAttribute('data-fit', String(level));
    }
  });
}

export default function useStepCardFit(containerRef, enabled, contentKey) {
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    if (!enabled) {
      container.querySelectorAll('.step-card[data-fit]').forEach((card) => card.removeAttribute('data-fit'));
      return undefined;
    }

    let frame = null;
    let cancelled = false;
    const fit = () => fitStepCards(container);
    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        fit();
      });
    };

    fit();
    let observer = null;
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(schedule);
      observer.observe(container);
    }
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => { if (!cancelled) schedule(); });
    }

    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      if (observer) observer.disconnect();
    };
  }, [containerRef, enabled, contentKey]);
}
