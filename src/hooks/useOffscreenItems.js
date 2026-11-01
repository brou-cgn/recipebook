import { useEffect, useState } from 'react';

/**
 * Welche Einträge einer scrollenden Liste gerade nicht (genug) zu sehen sind, und auf welcher Seite
 * (Vorhaben „Parallel kochen“: Karussell auf dem iPad quer, Rezept-Schiene im Querformat). Damit
 * zeigen beide einen Hinweis, wenn ein fälliges Rezept außer Sicht liegt (pickJumpTarget).
 *
 * Die Einträge sind die direkten Kinder der Liste und tragen `data-recipe-id`. Neu beobachtet wird,
 * wenn sich `idsKey` ändert (Einträge dazu oder weg). Ohne IntersectionObserver bleibt es leer.
 *
 * @param {{ current: HTMLElement|null }} listRef Die scrollende Liste
 * @param {string} idsKey z. B. die Rezept-IDs, mit „|“ verbunden
 * @param {number} [visibleRatio=0.5] Ab diesem Anteil gilt ein Eintrag als sichtbar
 * @returns {Object<string, 'up'|'down'>} Rezept-ID -> Seite, auf der der Eintrag außer Sicht liegt
 */
export default function useOffscreenItems(listRef, idsKey, visibleRatio = 0.5) {
  const [offscreen, setOffscreen] = useState({});

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((records) => {
      setOffscreen((prev) => {
        const next = { ...prev };
        records.forEach((record) => {
          const id = record.target.dataset.recipeId;
          if (record.intersectionRatio >= visibleRatio) {
            delete next[id];
          } else {
            const rootTop = record.rootBounds ? record.rootBounds.top : 0;
            next[id] = record.boundingClientRect.top < rootTop ? 'up' : 'down';
          }
        });
        return next;
      });
    }, { root: list, threshold: [0, visibleRatio, 1] });
    Array.from(list.children).forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [listRef, idsKey, visibleRatio]);

  return offscreen;
}
