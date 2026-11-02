import { useEffect, useState } from 'react';

/**
 * Tablet und seine Lage (Vorhaben „Parallel kochen“, Entwürfe I4 quer und T1 hochkant): ein
 * Touch-Bildschirm, quer ab TABLET_LANDSCAPE_MIN_WIDTH breit und höher als ein Handy quer,
 * hochkant ab TABLET_PORTRAIT_MIN_WIDTH breit.
 *
 * Handys zählen nicht: Quer sind sie höchstens 480 px hoch (isMobileLandscape in RecipeDetail),
 * hochkant schmaler als ein iPad mini. Desktop-Browser auch nicht, selbst in einem breiten oder
 * hohen Fenster: Sie haben eine Maus oder ein Trackpad als Zeiger, kein grobes (Finger). Das iPad
 * meldet sich im Safari als Mac, deshalb zählt der Zeiger und nicht die Kennung des Browsers.
 */
export const TABLET_LANDSCAPE_MIN_WIDTH = 900;
// Höher als ein Handy im Querformat (RecipeDetail: MOBILE_BREAKPOINT = 480)
export const TABLET_LANDSCAPE_MIN_HEIGHT = 481;
// iPad mini hochkant ist 744 px breit. Darunter bleiben Handys (das größte iPhone ist 440 px breit)
// und iPad-Fenster in Split View oder Slide Over; sie behalten das Handy-Layout.
export const TABLET_PORTRAIT_MIN_WIDTH = 744;
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

export function isTabletPortrait() {
  if (typeof window === 'undefined') return false;
  const { innerWidth: width, innerHeight: height } = window;
  return height > width
    && width >= TABLET_PORTRAIT_MIN_WIDTH
    && hasTouchScreen();
}

/** 'landscape' oder 'portrait' auf einem Tablet, sonst null */
export function getTabletOrientation() {
  if (isTabletLandscape()) return 'landscape';
  if (isTabletPortrait()) return 'portrait';
  return null;
}

/** Lage des Tablets ('landscape', 'portrait', null); folgt Drehen und Fenstergröße (entprellt wie RecipeDetail). */
export default function useTabletOrientation() {
  const [value, setValue] = useState(getTabletOrientation);

  useEffect(() => {
    let timeoutId = null;
    const update = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setValue(getTabletOrientation()), DEBOUNCE_MS);
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
