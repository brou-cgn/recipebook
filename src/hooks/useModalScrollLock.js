import { useEffect } from 'react';

// Ist `el` (oder ein Vorfahre bis `boundary`, exklusiv) in vertikaler Richtung scrollbar?
const hasScrollableAncestor = (el, boundary) => {
  for (let node = el; node && node !== boundary && node.nodeType === 1; node = node.parentElement) {
    const { overflowY } = window.getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return true;
    }
  }
  return false;
};

/**
 * Sperrt das Scrollen der Seite hinter einem Overlay – gemeinsames Verhalten aller Dialoge
 * (Einkaufsliste, Portionsauswahl, „Was kochst du dazu?“ …).
 *
 * Bewusst layout-neutral (siehe TutorialVideoModal): nur `body { overflow: hidden }` für
 * Mausrad und Tastatur, dazu ein nicht-passiver `touchmove`-Handler, der das Wegscrollen
 * per Geste unterbindet (iOS ignoriert overflow:hidden auf dem body). Scrollbare Bereiche
 * im Dialog selbst (z. B. die Rezeptliste) bleiben bedienbar.
 * Der Handler hängt am document, weil React touchmove passiv am Root registriert und
 * preventDefault() dort wirkungslos wäre.
 *
 * @param {boolean} [active=true] Sperre nur aktiv, solange das Overlay offen ist.
 */
export default function useModalScrollLock(active = true) {
  useEffect(() => {
    if (!active) return undefined;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const blockTouchScroll = (e) => {
      // Nur Bereiche innerhalb des Dialogs dürfen scrollen – nie Vorfahren des Overlays
      // (die Seite dahinter) und nie der Hintergrund selbst.
      const dialog = e.target.closest ? e.target.closest('[aria-modal="true"]') : null;
      if (dialog && hasScrollableAncestor(e.target, dialog)) return;
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener('touchmove', blockTouchScroll, { passive: false });

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('touchmove', blockTouchScroll);
    };
  }, [active]);
}
