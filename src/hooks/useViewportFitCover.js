import { useEffect } from 'react';

/**
 * Lässt die Seite bis an den Displayrand reichen (`viewport-fit=cover` im meta viewport), solange
 * `active` gilt (Vorhaben „Parallel kochen“: die Rezept-Schiene im Querformat bis an den Rand
 * gegenüber der Kamera).
 *
 * Ohne `viewport-fit=cover` lässt iOS im Querformat links und rechts die Sicherheitsabstände frei
 * (iPhone 15: je 59 px), und `env(safe-area-inset-*)` ist dort 0. Mit `cover` zeichnet die Seite
 * über den ganzen Bildschirm; was frei bleiben muss (Kamera, Home-Leiste), hält das CSS über
 * `env()` frei. Deshalb nur, solange die Schiene da ist, nicht in index.html: Die übrigen Seiten
 * rechnen nicht mit den Abständen. Danach gilt wieder, was vorher im meta viewport stand.
 *
 * Dass iOS das Umschalten zur Laufzeit übernimmt, ist nicht am Gerät geprüft. Greift es nicht,
 * bleibt die Seite wie bisher innerhalb der Abstände; die env()-Werte bleiben dann 0.
 */
const FIT = /^viewport-fit\s*=/i;

function parts(content) {
  return (content || '').split(',').map((part) => part.trim()).filter(Boolean);
}

/** viewport-fit aus dem Inhalt eines meta viewport, sonst null */
export function readViewportFit(content) {
  const found = parts(content).find((part) => FIT.test(part));
  return found ? found.split('=')[1].trim() : null;
}

/** Inhalt des meta viewport mit `viewport-fit=<value>`; mit value null ohne viewport-fit. Der Rest bleibt. */
export function withViewportFit(content, value) {
  const rest = parts(content).filter((part) => !FIT.test(part));
  return (value ? [...rest, `viewport-fit=${value}`] : rest).join(', ');
}

export default function useViewportFitCover(active) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return undefined;
    const before = readViewportFit(meta.getAttribute('content'));
    meta.setAttribute('content', withViewportFit(meta.getAttribute('content'), 'cover'));
    // Nur viewport-fit zurücksetzen: Was andere inzwischen geändert haben (Zoom-Reset in index.html), bleibt
    return () => meta.setAttribute('content', withViewportFit(meta.getAttribute('content'), before));
  }, [active]);
}
