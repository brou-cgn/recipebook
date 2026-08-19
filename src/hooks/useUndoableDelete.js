<<<<<<< HEAD
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Shared "Löschen wirkt sofort + Snackbar 'Rückgängig'" behavior (see CLAUDE.md),
// used by every swipe-to-delete row in the app. The item disappears from view the
// moment the gesture completes; the actual mutation (a Firestore delete, or nothing
// at all for a purely local list) only runs once the undo window has passed without
// being cancelled.
const UNDO_TIMEOUT_MS = 6000;

/**
 * @param {number} [timeoutMs] - How long the "Rückgängig" snackbar stays up.
 * @returns {{
 *   banners: Array<{id: number, key: string, message: string}>,
 *   pendingKeys: Set<string>,
 *   scheduleDelete: (opts: { key: string, message: string, onConfirm: () => void, onUndo: () => void }) => void,
 *   undoDelete: (id: number) => void,
 * }}
 */
export default function useUndoableDelete(timeoutMs = UNDO_TIMEOUT_MS) {
  const [banners, setBanners] = useState([]);
  const entriesRef = useRef(new Map()); // id -> { key, timeoutId, onUndo }
  const counterRef = useRef(0);

  useEffect(() => {
    const entries = entriesRef.current;
    return () => {
      entries.forEach(({ timeoutId }) => clearTimeout(timeoutId));
      entries.clear();
    };
  }, []);

  const scheduleDelete = useCallback(({ key, message, onConfirm, onUndo }) => {
    const id = counterRef.current;
    counterRef.current = (id + 1) % 100000;
    const timeoutId = setTimeout(() => {
      entriesRef.current.delete(id);
      setBanners((prev) => prev.filter((banner) => banner.id !== id));
      onConfirm();
    }, timeoutMs);
    entriesRef.current.set(id, { key, timeoutId, onUndo });
    setBanners((prev) => [...prev, { id, key, message }]);
  }, [timeoutMs]);

  const undoDelete = useCallback((id) => {
    const entry = entriesRef.current.get(id);
    if (!entry) return;
    clearTimeout(entry.timeoutId);
    entriesRef.current.delete(id);
    setBanners((prev) => prev.filter((banner) => banner.id !== id));
    entry.onUndo();
  }, []);

  const pendingKeys = useMemo(() => new Set(banners.map((banner) => banner.key)), [banners]);

  return { banners, pendingKeys, scheduleDelete, undoDelete };
=======
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
>>>>>>> origin/main
}
