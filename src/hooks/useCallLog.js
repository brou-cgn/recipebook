import { useEffect, useRef, useState } from 'react';

/**
 * Lädt ein Aufruf-Protokoll der Seite Küchenbetrieb (Einzelaufrufe und
 * zusammengefasste Aufrufe) erst, wenn sein Reiter zum ersten Mal aktiv ist, und
 * behält es danach. Tech-Check K2: Vorher las die Seite beim Öffnen beide
 * Historien komplett, auch wenn nur ein anderer Reiter gebraucht wurde.
 *
 * @param {Function} load - () => Promise<{calls: Array, aggregates: Array}>, stabile Referenz
 * @param {boolean} active - Reiter ist sichtbar
 * @returns {{loading: boolean, calls: Array, aggregates: Array}}
 */
export default function useCallLog(load, active) {
  const [state, setState] = useState({ loading: true, calls: [], aggregates: [] });
  const startedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!active || startedRef.current) return;
    startedRef.current = true;
    Promise.resolve()
      .then(load)
      .then((result) => {
        if (!mountedRef.current) return;
        setState({
          loading: false,
          calls: Array.isArray(result?.calls) ? result.calls : [],
          aggregates: Array.isArray(result?.aggregates) ? result.aggregates : [],
        });
      })
      .catch((error) => {
        console.error('Error loading call log:', error);
        if (mountedRef.current) setState({ loading: false, calls: [], aggregates: [] });
      });
  }, [active, load]);

  return state;
}
