import { useEffect, useRef, useState } from 'react';

const EMPTY = { calls: [], days: [], aggregates: [] };
const asList = (value) => (Array.isArray(value) ? value : []);

/**
 * Lädt ein Aufruf-Protokoll der Seite Küchenbetrieb (Einzelaufrufe,
 * Tagesdokumente und zusammengefasste Monate/Jahre) erst, wenn sein Reiter zum
 * ersten Mal aktiv ist, und behält es danach. Tech-Check K2: Vorher las die Seite
 * beim Öffnen beide Historien komplett, auch wenn nur ein anderer Reiter gebraucht
 * wurde.
 *
 * @param {Function} load - () => Promise<{calls, days, aggregates}>, stabile Referenz
 * @param {boolean} active - Reiter ist sichtbar
 * @returns {{loading: boolean, calls: Array, days: Array, aggregates: Array}}
 */
export default function useCallLog(load, active) {
  const [state, setState] = useState({ loading: true, ...EMPTY });
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
          calls: asList(result?.calls),
          days: asList(result?.days),
          aggregates: asList(result?.aggregates),
        });
      })
      .catch((error) => {
        console.error('Error loading call log:', error);
        if (mountedRef.current) setState({ loading: false, ...EMPTY });
      });
  }, [active, load]);

  return state;
}
