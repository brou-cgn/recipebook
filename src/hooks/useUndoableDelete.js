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
}
