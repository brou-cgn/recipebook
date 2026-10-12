import { useState, useEffect } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

const read = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY).matches
    : false;

/**
 * Liefert true, wenn das System „Bewegung reduzieren" meldet.
 * Für Animationen, die per Inline-Style oder JS gesteuert werden und sich
 * daher nicht per CSS-Media-Query abschalten lassen. Reagiert auf Änderungen.
 */
export default function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(read);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(QUERY);
    const onChange = (e) => setReduced(e.matches);
    setReduced(mql.matches);
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  return reduced;
}
