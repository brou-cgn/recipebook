/**
 * Follow: Aufräumen beim Löschen eines Kontos (Vorhaben Follow, Tracker
 * docs/vorhaben/follow.md). Löscht alle Follow-Daten eines Mitglieds, damit seine
 * Aktivität nach der Löschung nicht weiter an Follower ausgespielt wird.
 *
 * Gelöscht werden:
 * - follows, in denen das Mitglied folgt oder gefolgt wird
 * - followCooldowns: die zu diesen follows gehörenden, alle mit dem Mitglied als
 *   Anfragendem (Präfix) und seine Blockliste; eine Sperrfrist ohne follows-Dokument
 *   (Anfragender hat zurückgezogen) läuft nach 30 Tagen von selbst ab und wird
 *   hier nicht gefunden
 * - followLimits des Mitglieds (Tageszähler)
 * - seine Unterseiten users/{uid}/followInbox, followBlocks, fuerDichEntdeckt
 *   (Firestore löscht sie mit dem übergeordneten Dokument nicht mit)
 * - die Gegenstücke in fremden Unterseiten: users/{followee}/followInbox/{uid}
 *   und users/{followee}/followBlocks/{uid}
 *
 * Nicht gelöscht: Rezepte und cookDates des Mitglieds (bestehen unabhängig von Follow),
 * und der Name in fremden fuerDichEntdeckt/current (Rotation schreibt es neu).
 * Die Logik hängt nur an `admin` und `db`, damit sie ohne Emulator testbar ist.
 */

const BATCH_SIZE = 400;
const OWN_SUBCOLLECTIONS = ['followInbox', 'followBlocks', 'fuerDichEntdeckt'];

const followId = (followerId, followeeId) => `${followerId}_${followeeId}`;

/** Löscht Dokumente in Batches unterhalb des Firestore-Limits (500 pro Batch). */
const deleteRefs = async (db, refs) => {
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    refs.slice(i, i + BATCH_SIZE).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
};

/** Dokumente, deren ID mit `prefix` beginnt. */
const refsWithIdPrefix = async (admin, db, collection, prefix) => {
  const documentId = admin.firestore.FieldPath.documentId();
  const snap = await db.collection(collection)
      .where(documentId, '>=', prefix)
      .where(documentId, '<', `${prefix}`)
      .get();
  return snap.docs.map((doc) => doc.ref);
};

/**
 * Entfernt alle Follow-Daten von `uid`.
 * @param {Object} admin - firebase-admin
 * @param {Object} db - Firestore
 * @param {string} uid - Konto, das gelöscht wurde
 * @return {Promise<number>} Anzahl gelöschter Dokumente
 */
const cleanupFollowData = async (admin, db, uid) => {
  if (typeof uid !== 'string' || !uid || uid.includes('/')) return 0;

  const [asFollower, asFollowee] = await Promise.all([
    db.collection('follows').where('followerId', '==', uid).get(),
    db.collection('follows').where('followeeId', '==', uid).get(),
  ]);
  const followDocs = [...asFollower.docs, ...asFollowee.docs];

  const refs = new Map();
  const add = (ref) => refs.set(ref.path, ref);

  followDocs.forEach((doc) => {
    add(doc.ref);
    add(db.doc(`followCooldowns/${doc.id}`));
  });
  asFollower.docs.forEach((doc) => {
    const followeeId = doc.data().followeeId;
    add(db.doc(`users/${followeeId}/followInbox/${uid}`));
    add(db.doc(`users/${followeeId}/followBlocks/${uid}`));
  });

  const blocked = await db.collection(`users/${uid}/followBlocks`).get();
  blocked.docs.forEach((doc) => add(db.doc(`followCooldowns/${followId(doc.id, uid)}`)));

  for (const ref of await refsWithIdPrefix(admin, db, 'followCooldowns', `${uid}_`)) add(ref);
  for (const ref of await refsWithIdPrefix(admin, db, 'followLimits', `${uid}_`)) add(ref);

  for (const name of OWN_SUBCOLLECTIONS) {
    const snap = await db.collection(`users/${uid}/${name}`).get();
    snap.docs.forEach((doc) => add(doc.ref));
  }

  // Ein delete auf ein nicht vorhandenes Dokument ist in Firestore ein No-op.
  const all = [...refs.values()];
  await deleteRefs(db, all);
  return all.length;
};

module.exports = {cleanupFollowData};
