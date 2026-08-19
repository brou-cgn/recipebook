import { useCallback, useEffect, useRef, useState } from 'react';

const UNDO_TIMEOUT_MS = 6000;

/**
 * Gemeinsames "sofort löschen + Rückgängig"-Muster für Listen-Zeilen
 * (DeleteRowButton + UndoSnackbar). Die Löschung selbst passiert sofort und
 * synchron beim Aufruf von `notifyDeleted` - der Aufrufer entfernt das
 * Element also schon, bevor er den Hook informiert. Der Hook merkt sich nur,
 * wie man die Löschung rückgängig macht, zeigt 6s lang die Undo-Snackbar
 * und ruft bei Klick auf "Rückgängig" die übergebene `undo`-Funktion auf.
 * Es ist immer nur eine Snackbar/ein Undo gleichzeitig aktiv: eine neue
 * Löschung ersetzt die alte (deren Undo-Möglichkeit damit verfällt, die
 * Löschung selbst bleibt bestehen) und startet den 6s-Timer neu. Der Timer
 * wird beim Unmount abgebrochen (die Löschung ist da längst passiert, es
 * gibt nur nichts mehr zu tun als das Timeout selbst zu vergessen).
 */
export default function useUndoableDelete() {
  const [pending, setPending] = useState(null); // { id, name, undo }
  const pendingRef = useRef(null);
  const timeoutRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const notifyDeleted = useCallback(({ id, name, undo }) => {
    clearTimer();
    const entry = { id, name, undo };
    pendingRef.current = entry;
    setPending(entry);

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      if (pendingRef.current === entry) {
        pendingRef.current = null;
        setPending(null);
      }
    }, UNDO_TIMEOUT_MS);
  }, [clearTimer]);

  const undo = useCallback(() => {
    clearTimer();
    const entry = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (entry) entry.undo();
  }, [clearTimer]);

  return {
    notifyDeleted,
    undo,
    pendingName: pending?.name ?? null,
  };
}
