import { useState, useRef, useEffect, useCallback } from 'react';
import usePrefersReducedMotion from './usePrefersReducedMotion';

export const FADE_OUT_MS = 250;

/**
 * Verzögert das Schließen eines Overlays, damit es ausblenden kann.
 * Liefert `[closing, close]`: `closing` setzt die CSS-Klasse für den Fade-out,
 * `close` ersetzt den ursprünglichen `onClose` und ruft ihn erst nach der
 * Animation auf. Bei „Bewegung reduzieren" wird sofort geschlossen.
 * Der Timer endet beim Unmount; ein wiederholtes `close` während des Fade-outs
 * wird ignoriert.
 */
export default function useFadeOutClose(onClose, duration = FADE_OUT_MS) {
  const [closing, setClosing] = useState(false);
  const reduced = usePrefersReducedMotion();
  const onCloseRef = useRef(onClose);
  const timerRef = useRef(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const close = useCallback(() => {
    if (timerRef.current) return;
    if (reduced) {
      if (onCloseRef.current) onCloseRef.current();
      return;
    }
    setClosing(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (onCloseRef.current) onCloseRef.current();
      // Falls das Overlay gemountet bleibt (z. B. isOpen), wieder einblendbar machen.
      setClosing(false);
    }, duration);
  }, [reduced, duration]);

  return [closing, close];
}
