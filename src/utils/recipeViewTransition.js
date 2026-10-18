import { flushSync } from 'react-dom';

/**
 * Übergang Karte → Rezeptdetail per View Transitions API (Progressive Enhancement).
 *
 * Die Navigation läuft über State statt Router, daher die Handarbeit: Das Bild
 * der angeklickten Karte und das erste Bild der Detailansicht bekommen
 * nacheinander denselben view-transition-name, der Browser morpht zwischen
 * beiden. Ohne API, bei „Bewegung reduzieren" oder ohne Kartenbild wird der
 * State direkt gesetzt – genau wie vorher.
 */

const NAME = 'recipe-hero';
const SOURCE_CARD = '.recipe-card, .trending-card';
const SOURCE_IMAGE = '.ric-image, .trending-card-image img';
const TARGET_IMAGE = '.recipe-detail-image img';
// Der Klick und der Aufruf von openRecipeWithTransition liegen im selben
// Event-Durchlauf; das Fenster deckt nur verzögerte Aufrufe ab.
const MAX_ACTIVATION_AGE_MS = 500;
// Länger wartet der Übergang nicht auf das Detailbild, sonst wirkt der Klick träge.
const MAX_IMAGE_WAIT_MS = 250;

let lastActivation = null;

const recordActivation = (e) => {
  if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
  lastActivation = { target: e.target, time: Date.now() };
};

if (typeof document !== 'undefined') {
  // Capture-Phase am document: läuft vor Reacts Root-Listener, also vor onClick.
  document.addEventListener('click', recordActivation, true);
  document.addEventListener('keydown', recordActivation, true);
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Das sichtbare Bild der zuletzt aktivierten Karte, sonst null. */
export function findSourceImage() {
  if (!lastActivation || Date.now() - lastActivation.time > MAX_ACTIVATION_AGE_MS) return null;
  const target = lastActivation.target;
  const card = target && typeof target.closest === 'function' ? target.closest(SOURCE_CARD) : null;
  if (!card) return null;
  const images = Array.from(card.querySelectorAll(SOURCE_IMAGE));
  if (images.length <= 1) return images[0] || null;
  // Bildkarussell in der Karte: das Bild mit der größten sichtbaren Breite nehmen.
  const cardRect = card.getBoundingClientRect();
  let best = null;
  let bestWidth = 0;
  images.forEach((img) => {
    const r = img.getBoundingClientRect();
    const visible = Math.min(r.right, cardRect.right) - Math.max(r.left, cardRect.left);
    if (visible > bestWidth) {
      bestWidth = visible;
      best = img;
    }
  });
  return best;
}

const waitForImage = (img) => {
  if (img.complete || typeof img.decode !== 'function') return Promise.resolve();
  return Promise.race([
    img.decode().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, MAX_IMAGE_WAIT_MS)),
  ]);
};

/**
 * Führt `update` (setzt den State für die Detailansicht) aus – mit Übergang,
 * wenn die Voraussetzungen erfüllt sind.
 */
export function openRecipeWithTransition(update) {
  const source = typeof document !== 'undefined'
    && typeof document.startViewTransition === 'function'
    && !prefersReducedMotion()
    ? findSourceImage()
    : null;
  lastActivation = null;
  if (!source) {
    update();
    return;
  }

  source.style.viewTransitionName = NAME;
  let target = null;
  const transition = document.startViewTransition(() => {
    source.style.viewTransitionName = '';
    flushSync(update);
    target = document.querySelector(TARGET_IMAGE);
    if (!target) return undefined;
    target.style.viewTransitionName = NAME;
    return waitForImage(target);
  });
  const cleanup = () => {
    source.style.viewTransitionName = '';
    if (target) target.style.viewTransitionName = '';
  };
  // ready lehnt ab, wenn der Übergang übersprungen wird – kein Fehlerfall.
  transition.ready.catch(() => {});
  transition.finished.then(cleanup, cleanup);
}
