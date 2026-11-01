import { useEffect } from 'react';
import { getCameraSide } from './useLandscapeCameraSide';

/**
 * Lässt die Seite im Querformat bis an den Displayrand reichen (`viewport-fit=cover` im meta viewport),
 * solange ein Rezeptdetail mit Kochsitzung es will (Vorhaben „Parallel kochen“: Rezept-Schiene ohne
 * Abstand zum Displayrand). Nur auf diese Ansicht beschränkt; in index.html steht `cover` nicht, weil die
 * übrigen Seiten (vor allem hochkant) nicht mit den Abständen rechnen (PR #3594, zurückgenommen).
 *
 * Umgeschaltet wird nur beim Drehen, synchron im `orientationchange`: quer an, hochkant aus. Dann
 * berechnet iOS die ganze Geometrie ohnehin neu. Im ersten Anlauf (PR 13) wurde 150 ms nach dem Drehen
 * umgeschaltet; danach reichte die fixierte Kochmodus-Fläche bis an den Rand, der übrige Seiteninhalt
 * blieb aber auf der Kameraseite um 59 pt eingerückt (Screenshot vom Gerät), und Tipps landeten um diesen
 * Versatz neben der Schiene. Deshalb kein Umschalten zwischendurch:
 * - Wird das Rezept erst im Querformat geöffnet, bleibt die Seite bis zum nächsten Drehen innerhalb der
 *   Abstände (die Schiene funktioniert, nur mit Abstand zum Rand).
 * - Wird es im Querformat verlassen, bleibt `cover` bis zum nächsten Drehen; `.App` und die
 *   Bottom-Navigation halten dann links und rechts die Abstände (App.css, BottomNavigation.css).
 * Rückfall: Steht das Gerät hochkant und `cover` ist noch an (etwa nach dem Drehen im Hintergrund),
 * wird es beim nächsten `resize` oder Zurückkehren in die App entfernt.
 *
 * Scroll-Versatz: Am Gerät (iPhone, Screenshot der Diagnose-Zeile) stand die Seite nach dem Umschalten
 * horizontal auf scrollX −59 (genau der Abstand auf der Kameraseite). Gezeichnet wurde bis an den Rand,
 * Tipps rechnete iOS aber mit dem Versatz um und ordnete sie 59 pt daneben zu (Tipp auf die Schiene → Schritte).
 * Solange `cover` an ist, wird ein horizontaler Versatz deshalb auf 0 zurückgesetzt: direkt nach dem
 * Umschalten, mehrmals danach (iOS setzt ihn erst nach dem Drehen, der Zoom-Reset in index.html ändert den
 * meta viewport nach rund 700 ms noch einmal) und bei jedem `scroll`/`resize`. Die App scrollt nie seitlich,
 * es geht also nichts verloren. Am Gerät bestätigt (01.11.2026, Drehung 90): scroll 0, Tipp auf die Schiene kommt an.
 *
 * Danach gilt wieder, was vorher im meta viewport stand.
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

// Zustand für die ganze Seite: welche Ansichten cover wollen (je eine Anmeldung), ob es gerade gesetzt ist,
// was vorher galt
const state = { wanted: new Set(), applied: false, before: null, listening: false, timers: [] };

// Wann nach dem Umschalten noch einmal nachgesehen wird (ms): nach dem Drehen und nach dem Zoom-Reset
// in index.html (400 + 300 ms)
export const SCROLL_RESET_DELAYS = [50, 300, 800, 1200];

function viewportMeta() {
  return typeof document === 'undefined' ? null : document.querySelector('meta[name="viewport"]');
}

function setCover(on) {
  const meta = viewportMeta();
  if (!meta || on === state.applied) return;
  const content = meta.getAttribute('content');
  if (on) {
    state.before = readViewportFit(content);
    meta.setAttribute('content', withViewportFit(content, 'cover'));
  } else {
    meta.setAttribute('content', withViewportFit(content, state.before));
  }
  state.applied = on;
}

/** Setzt einen horizontalen Scroll-Versatz auf 0, solange cover an ist (siehe oben) */
export function resetHorizontalScroll() {
  if (!state.applied || typeof window === 'undefined') return;
  const x = window.scrollX || window.pageXOffset || 0;
  if (x !== 0) window.scrollTo(0, window.scrollY || window.pageYOffset || 0);
}

function clearScrollTimers() {
  state.timers.forEach((id) => clearTimeout(id));
  state.timers = [];
}

function scheduleScrollReset() {
  clearScrollTimers();
  resetHorizontalScroll();
  state.timers = SCROLL_RESET_DELAYS.map((delay) => setTimeout(resetHorizontalScroll, delay));
}

function handleOrientationChange() {
  setCover(state.wanted.size > 0 && getCameraSide() !== null);
  if (state.applied) scheduleScrollReset();
  else clearScrollTimers();
}

// Nur Rückfall: hochkant nie cover. Quer wird hier nie eingeschaltet, nur beim Drehen.
function handleSettled() {
  if (state.applied && getCameraSide() === null) setCover(false);
  resetHorizontalScroll();
}

function handleVisibility() {
  if (document.visibilityState === 'visible') handleSettled();
}

function listen() {
  if (state.listening || typeof window === 'undefined') return;
  window.addEventListener('orientationchange', handleOrientationChange);
  window.addEventListener('resize', handleSettled);
  window.addEventListener('scroll', resetHorizontalScroll, { passive: true });
  window.visualViewport?.addEventListener('resize', resetHorizontalScroll);
  window.visualViewport?.addEventListener('scroll', resetHorizontalScroll);
  document.addEventListener('visibilitychange', handleVisibility);
  state.listening = true;
}

/** true, solange die Seite gerade bis an den Displayrand reicht */
export function isViewportCoverActive() {
  return state.applied;
}

/** Nur für Tests: Zustand und Listener zurücksetzen */
export function resetViewportCoverForTests() {
  if (state.listening) {
    window.removeEventListener('orientationchange', handleOrientationChange);
    window.removeEventListener('resize', handleSettled);
    window.removeEventListener('scroll', resetHorizontalScroll);
    window.visualViewport?.removeEventListener('resize', resetHorizontalScroll);
    window.visualViewport?.removeEventListener('scroll', resetHorizontalScroll);
    document.removeEventListener('visibilitychange', handleVisibility);
  }
  clearScrollTimers();
  state.wanted.clear();
  state.applied = false;
  state.before = null;
  state.listening = false;
}

/**
 * @param {boolean} wanted true, solange diese Ansicht im Querformat bis an den Rand reichen soll
 *   (RecipeDetail: Rollen-Flag parallelKochen auf einem Handy)
 */
export default function useViewportFitCover(wanted) {
  useEffect(() => {
    if (!wanted) return undefined;
    const registration = {};
    state.wanted.add(registration);
    listen();
    // Beim Verlassen nichts umschalten: cover bleibt bis zum nächsten Drehen (siehe oben)
    return () => { state.wanted.delete(registration); };
  }, [wanted]);
}
