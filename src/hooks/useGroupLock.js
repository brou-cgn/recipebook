import { useState } from 'react';

/**
 * Verwaltet den Sperren-Zustand von Getraenke-Gruppen (alle Zeilen/Einheiten
 * einer Gruppe werden gemeinsam gesperrt/entsperrt) und synchronisiert die
 * Sperre optimistisch nach Firestore. Wird sowohl fuer die "Eingekauft"- als
 * auch die "Verbraucht/Uebrig"-Sperre in ConsumptionForm verwendet.
 * @param {Object} options
 * @param {Object} [options.initialLocked] - Bereits gesperrte Werte { kategorie: wert } aus Firestore
 * @param {Object} [options.currentUser] - Aktueller Nutzer ({ id })
 * @param {string} [options.ownerId] - Event-Eigentuemer, falls abweichend vom Aufrufer (Admin bearbeitet fremdes Event)
 * @param {string} options.eventId - ID des Events
 * @param {Function} options.lockFn - (uid, eventId, werteByKategorie) => Promise
 * @param {Function} options.unlockFn - (uid, eventId, kategorien) => Promise
 */
export function useGroupLock({ initialLocked, currentUser, ownerId, eventId, lockFn, unlockFn }) {
  const targetUid = ownerId || currentUser?.id;
  const [lockedKategorien, setLockedKategorien] = useState(
    () => new Set(Object.keys(initialLocked || {}))
  );

  const isGroupLocked = (group) =>
    group.rows.length > 0 && group.rows.every((row) => lockedKategorien.has(row.kategorie));

  /**
   * Sperrt/entsperrt eine Gruppe und gibt das neue Set der gesperrten Kategorien
   * synchron zurueck (fuer Folgeprüfungen wie "sind jetzt alle Gruppen gesperrt?",
   * ohne auf den naechsten Render warten zu muessen).
   * @param {Object} group - Getraenke-Gruppe ({ rows: [...] })
   * @param {Function} buildLockPayload - (kategorienKeys) => { kategorie: wert } beim Sperren
   * @returns {Set<string>} Das neue Set der gesperrten Kategorien
   */
  const toggleGroupLock = (group, buildLockPayload) => {
    const kategorienKeys = group.rows.map((row) => row.kategorie);
    const next = new Set(lockedKategorien);
    if (isGroupLocked(group)) {
      kategorienKeys.forEach((kategorie) => next.delete(kategorie));
      setLockedKategorien(next);
      if (targetUid) {
        unlockFn(targetUid, eventId, kategorienKeys).catch((err) => {
          console.error('Error unlocking values:', err);
        });
      }
    } else {
      kategorienKeys.forEach((kategorie) => next.add(kategorie));
      setLockedKategorien(next);
      if (targetUid) {
        lockFn(targetUid, eventId, buildLockPayload(kategorienKeys)).catch((err) => {
          console.error('Error locking values:', err);
        });
      }
    }
    return next;
  };

  return { lockedKategorien, isGroupLocked, toggleGroupLock };
}
