/**
 * Aufräumen beim Löschen eines Kontos: Kochtagebuch-Einträge (cookDates) des
 * Mitglieds. Aufgerufen vom Löschzweig von syncPublicProfile (handlers/admin.js),
 * neben followCleanup.js. Die Logik hängt nur an `db`, damit sie ohne Emulator
 * testbar ist.
 *
 * Nicht Teil davon: Rezepte des Mitglieds und fremde Einträge auf seinen Rezepten
 * (eigene Entscheidung, siehe docs/vorhaben/follow.md).
 */

const BATCH_SIZE = 400;

/**
 * Löscht alle cookDates, die `uid` angelegt hat.
 * @param {Object} db - Firestore
 * @param {string} uid - Konto, das gelöscht wurde
 * @return {Promise<number>} Anzahl gelöschter Dokumente
 */
const deleteCookDatesOfUser = async (db, uid) => {
  if (typeof uid !== 'string' || !uid || uid.includes('/')) return 0;
  const snap = await db.collection('cookDates').where('userId', '==', uid).get();
  const refs = snap.docs.map((doc) => doc.ref);
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    refs.slice(i, i + BATCH_SIZE).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  return refs.length;
};

module.exports = {deleteCookDatesOfUser};
