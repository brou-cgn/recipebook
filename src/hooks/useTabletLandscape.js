import { useEffect, useState } from 'react';

/**
 * Tablet im Querformat (Vorhaben „Parallel kochen“, Entwurf I4): ein Touch-Bildschirm,
 * breiter als hoch, ab TABLET_LANDSCAPE_MIN_WIDTH breit und höher als ein Handy quer.
 *
 * Handys im Querformat sind höchstens 480 px hoch (isMobileLandscape in RecipeDetail) und
 * zählen nicht dazu. Desktop-Browser auch nicht, selbst in einem breiten Fenster: Sie haben
 * eine Maus oder ein Trackpad als Zeiger, kein grobes (Finger). Das iPad meldet sich im Safari
 * als Mac, deshalb zählt der Zeiger und nicht die Kennung des Browsers.
 */
export const TABLET_LANDSCAPE_MIN_WIDTH = 900;
// Höher als ein Handy im Querformat (RecipeDetail: MOBILE_BREAKPOINT = 480)
export const TABLET_LANDSCAPE_MIN_HEIGHT = 481;
const COARSE_POINTER = '(pointer: coarse)';
const DEBOUNCE_MS = 150;

function hasTouchScreen() {
  if (typeof window.matchMedia === 'function') return window.matchMedia(COARSE_POINTER).matches;
  // Ohne matchMedia (ältere Browser, Tests): Touch-Punkte wie bei der iPad-Erkennung im Header
  return (navigator.maxTouchPoints || 0) > 1;
}

export function isTabletLandscape() {
  if (typeof window === 'undefined') return false;
  const { innerWidth: width, innerHeight: height } = window;
  return width > height
    && width >= TABLET_LANDSCAPE_MIN_WIDTH
    && height >= TABLET_LANDSCAPE_MIN_HEIGHT
    && hasTouchScreen();
}

/** true auf einem Tablet im Querformat; folgt Drehen und Fenstergröße (entprellt wie RecipeDetail). */
export default function useTabletLandscape() {
  const [value, setValue] = useState(isTabletLandscape);

  useEffect(() => {
    let timeoutId = null;
    const update = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setValue(isTabletLandscape()), DEBOUNCE_MS);
    };
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return value;
}
