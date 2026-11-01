import { useEffect, useState } from 'react';

/**
 * Auf welcher Seite des Bildschirms im Querformat die Oberkante des Geräts liegt, also Kamera,
 * Notch oder Dynamic Island (Vorhaben „Parallel kochen“: Die Rezept-Schiene steht gegenüber).
 *
 * Quelle ist zuerst `window.orientation`: 90 heißt „nach links gedreht, Home-Taste rechts“
 * (Apple, Beispielcode „iPhoneOrientation“), die Oberkante liegt dann links; -90 heißt nach
 * rechts gedreht. Chrome auf Android zählt nach meinem Stand genauso. `screen.orientation.angle`
 * erst, wenn es `window.orientation` nicht gibt: Laut WebKit-Bug 254863 (nicht selbst
 * nachgelesen) meldet Safari dort für dieselbe Lage 90, wo Android 270 meldet. Am Gerät nicht
 * geprüft; steht die Schiene auf der Kameraseite, sind die beiden Zweige zu tauschen.
 *
 * @returns {'left'|'right'|null} null im Hochformat und wenn der Browser die Richtung nicht meldet
 */
export function getCameraSide() {
  if (typeof window === 'undefined') return null;
  const legacy = window.orientation;
  if (typeof legacy === 'number') {
    if (legacy === 90) return 'left';
    if (legacy === -90 || legacy === 270) return 'right';
    return null;
  }
  // Wie Chrome auf Android: 90 = gegen den Uhrzeigersinn gedreht, die Oberkante liegt links
  const angle = window.screen?.orientation?.angle;
  if (angle === 90) return 'left';
  if (angle === 270 || angle === -90) return 'right';
  return null;
}

/** Wie getCameraSide, folgt dem Drehen (auch der halben Drehung von quer nach quer, ohne `resize`). */
export default function useLandscapeCameraSide() {
  const [side, setSide] = useState(getCameraSide);

  useEffect(() => {
    const update = () => setSide(getCameraSide());
    const screenOrientation = window.screen?.orientation;
    window.addEventListener('orientationchange', update);
    window.addEventListener('resize', update);
    screenOrientation?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('resize', update);
      screenOrientation?.removeEventListener?.('change', update);
    };
  }, []);

  return side;
}
