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
 *   notifyDeleted: (opts: { id: string|number, name: string, undo: () => void }) => void,
 *   undo: () => void,
 *   pendingName: string|null,
 * }}
 */
export default function useUndoableDelete(timeoutMs = UNDO_TIMEOUT_MS) {
  const [banners, setBanners] = useState([]);
  const entriesRef = useRef(new Map()); // id -> { key, timeoutId, onUndo }
  const counterRef = useRef(0);
  const lastCompatIdRef = useRef(null);
  const lastCompatNameRef = useRef(null);

  // Leaving the view (unmount) or the page (pagehide: tab closed, app sent to
  // background on iOS) before the undo window ends commits the pending deletes
  // instead of dropping them - otherwise the item silently comes back later
  // although the user saw it disappear and never pressed "Rückgängig".
  useEffect(() => {
    const entries = entriesRef.current;
    const flushPending = () => {
      const pending = Array.from(entries.values());
      entries.forEach(({ timeoutId }) => clearTimeout(timeoutId));
      entries.clear();
      pending.forEach(({ onConfirm }) => onConfirm());
      return pending.length > 0;
    };
    const handlePageHide = () => {
      if (flushPending()) setBanners([]);
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      flushPending();
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
    entriesRef.current.set(id, { key, timeoutId, onConfirm, onUndo });
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

  // Compatibility API for components that use the simpler notifyDeleted/undo/pendingName pattern.
  const notifyDeleted = useCallback(({ id, name, undo: onUndo }) => {
    const key = String(id);
    const message = `„${name}" entfernt`;
    const bannerId = counterRef.current;
    lastCompatIdRef.current = bannerId;
    lastCompatNameRef.current = name;
    scheduleDelete({ key, message, onConfirm: () => {
      if (lastCompatIdRef.current === bannerId) {
        lastCompatIdRef.current = null;
        lastCompatNameRef.current = null;
      }
    }, onUndo: () => {
      if (lastCompatIdRef.current === bannerId) {
        lastCompatIdRef.current = null;
        lastCompatNameRef.current = null;
      }
      onUndo();
    } });
  }, [scheduleDelete]);

  const undo = useCallback(() => {
    const bannerId = lastCompatIdRef.current;
    if (bannerId === null) return;
    undoDelete(bannerId);
  }, [undoDelete]);

  const pendingName = banners.some((b) => b.id === lastCompatIdRef.current) ? lastCompatNameRef.current : null;

  return { banners, pendingKeys, scheduleDelete, undoDelete, notifyDeleted, undo, pendingName };
}
