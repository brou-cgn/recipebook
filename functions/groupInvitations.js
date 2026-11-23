/**
 * Einladungen in private Listen per E-Mail (Tech-Check S16).
 *
 * Bis November 2026 standen die Adressen noch nicht registrierter Eingeladener im
 * Listendokument (`groups/{id}.invitedEmails`) und waren damit für jedes Mitglied der Liste
 * lesbar. Jetzt liegen sie in `groupInvitations/{id}`, das nur Cloud Functions lesen und
 * schreiben (firestore.rules):
 * - `assertCanInvite`: nur der Eigentümer einer privaten Liste lädt ein (Admins auch), wie in
 *   GroupDetail.js, wo nur der Eigentümer Mitglieder hinzufügt
 * - `recordInvitation`: legt die Einladung an (Callable sendGroupInvitationEmail)
 * - `acceptInvitations`: nimmt ein neu registriertes Konto in alle Listen auf, in die seine
 *   Adresse eingeladen ist, und löscht die Einladungen (Trigger bei der Registrierung)
 * - `migrateLegacyInvitedEmails`: verlagert das alte Feld aus den Listendokumenten (nächtlich)
 *
 * Übergangsweise liest `acceptInvitations` auch das alte Feld, damit keine Einladung verloren
 * geht, bevor die Migration gelaufen ist. Danach können dieser Lesezweig und die Migration
 * entfallen (Tech-Check S16).
 *
 * FieldValue, FieldPath und HttpsError reicht der Handler herein, damit die Logik ohne
 * Emulator testbar ist. Keine Adressen in Logs (functions/logPolicy.test.js).
 */

const crypto = require('node:crypto');

const COLLECTION = 'groupInvitations';
// Unter dem Firestore-Limit von 500 Schreibvorgängen je Batch.
const BATCH_SIZE = 400;
const MIGRATION_PAGE_SIZE = 300;

/** Kleinschreibung ohne Leerzeichen am Rand, wie der Client die Adresse speichert. */
const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

const isValidGroupId = (groupId) =>
  typeof groupId === 'string' && groupId.length > 0 && groupId.length <= 200 && !groupId.includes('/');

/**
 * Eine Einladung je Liste und Adresse: dieselbe Adresse erneut einzuladen überschreibt das
 * Dokument statt ein zweites anzulegen. Gehasht, weil Adressen Zeichen enthalten dürfen, die in
 * einer Dokument-ID nicht gehen (`/`).
 * @param {string} groupId
 * @param {string} email
 * @return {string}
 */
const invitationId = (groupId, email) =>
  crypto.createHash('sha256').update(`${groupId}\n${normalizeEmail(email)}`).digest('hex');

/**
 * Wirft, wenn `userId` nicht in die Liste einladen darf: Die Liste muss privat und keine
 * Systemliste („Für dich entdeckt“) sein, der Aufrufer ihr Eigentümer oder Admin.
 * @param {Object} db - getFirestore()
 * @param {Function} HttpsError
 * @param {{groupId: *, userId: string, isAdmin: boolean}} params
 * @throws {HttpsError} invalid-argument, not-found, failed-precondition oder permission-denied
 */
async function assertCanInvite(db, HttpsError, {groupId, userId, isAdmin}) {
  if (!isValidGroupId(groupId)) throw new HttpsError('invalid-argument', 'Ungültige Liste.');
  const snap = await db.collection('groups').doc(groupId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Die Liste gibt es nicht mehr.');
  const group = snap.data() || {};
  if (group.type !== 'private' || group.systemKey) {
    throw new HttpsError('failed-precondition', 'In diese Liste kann man nicht einladen.');
  }
  if (group.ownerId !== userId && !isAdmin) {
    throw new HttpsError('permission-denied', 'Nur der Eigentümer der Liste kann Mitglieder einladen.');
  }
}

/**
 * Legt die Einladung von `email` in die Liste an.
 * @param {Object} db
 * @param {{FieldValue: Object}} firestore - aus firebase-admin/firestore
 * @param {{groupId: string, email: string, invitedBy: (string|null)}} params
 * @return {Promise<void>}
 */
async function recordInvitation(db, {FieldValue}, {groupId, email, invitedBy}) {
  const normalized = normalizeEmail(email);
  await db.collection(COLLECTION).doc(invitationId(groupId, normalized)).set({
    groupId,
    email: normalized,
    invitedBy: invitedBy || null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** Führt Schreibvorgänge `(batch) => void` in Batches unterhalb des Firestore-Limits aus. */
async function commitInBatches(db, writes) {
  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const batch = db.batch();
    writes.slice(i, i + BATCH_SIZE).forEach((write) => write(batch));
    await batch.commit();
  }
}

/**
 * Nimmt das neu registrierte Konto in alle Listen auf, in die seine Adresse eingeladen ist, und
 * entfernt die Einladungen. Listen, die es nicht mehr gibt, werden übersprungen, ihre Einladung
 * wird trotzdem gelöscht. Liest übergangsweise auch das alte Feld `groups.invitedEmails` und
 * entfernt die Adresse dort.
 * @param {Object} db
 * @param {{FieldValue: Object}} firestore - aus firebase-admin/firestore
 * @param {{userId: string, email: string}} params
 * @return {Promise<{groups: number, invitations: number}>} aufgenommene Listen, gelöschte Einladungen
 */
async function acceptInvitations(db, {FieldValue}, {userId, email}) {
  const normalized = normalizeEmail(email);
  if (!normalized || typeof userId !== 'string' || !userId) return {groups: 0, invitations: 0};

  const [invitationsSnap, legacySnap] = await Promise.all([
    db.collection(COLLECTION).where('email', '==', normalized).get(),
    db.collection('groups').where('invitedEmails', 'array-contains', normalized).get(),
  ]);

  // groupId -> {ref, invitedEmails?}; eine Aktualisierung je Liste, auch wenn sie in beiden steht.
  const updates = new Map();
  legacySnap.docs.forEach((doc) => {
    const rest = (doc.data().invitedEmails || []).filter((entry) => normalizeEmail(entry) !== normalized);
    updates.set(doc.id, {ref: doc.ref, invitedEmails: rest});
  });

  const invitedGroupIds = [...new Set(invitationsSnap.docs.map((doc) => doc.data().groupId))]
      .filter((groupId) => isValidGroupId(groupId) && !updates.has(groupId));
  const groupSnaps = await Promise.all(invitedGroupIds.map((groupId) => db.collection('groups').doc(groupId).get()));
  groupSnaps.forEach((snap, index) => {
    if (snap.exists) updates.set(invitedGroupIds[index], {ref: snap.ref});
  });

  const writes = [];
  updates.forEach(({ref, invitedEmails}) => {
    const data = {memberIds: FieldValue.arrayUnion(userId), updatedAt: FieldValue.serverTimestamp()};
    if (invitedEmails) data.invitedEmails = invitedEmails.length > 0 ? invitedEmails : FieldValue.delete();
    writes.push((batch) => batch.update(ref, data));
  });
  invitationsSnap.docs.forEach((doc) => writes.push((batch) => batch.delete(doc.ref)));
  await commitInBatches(db, writes);

  return {groups: updates.size, invitations: invitationsSnap.docs.length};
}

/**
 * Verlagert das alte Feld `invitedEmails` aus allen Listen nach `groupInvitations` und entfernt
 * es aus dem Listendokument, je Liste in einem Batch. Liest seitenweise nach Dokument-ID und nur
 * dieses Feld. Idempotent: Listen ohne das Feld bleiben unberührt.
 * @param {Object} db
 * @param {{FieldValue: Object, FieldPath: Object}} firestore - aus firebase-admin/firestore
 * @param {{pageSize?: number}} [options]
 * @return {Promise<{checked: number, groups: number, invitations: number}>}
 */
async function migrateLegacyInvitedEmails(db, {FieldValue, FieldPath}, {pageSize = MIGRATION_PAGE_SIZE} = {}) {
  const result = {checked: 0, groups: 0, invitations: 0};
  let last = null;
  for (;;) {
    let query = db.collection('groups').orderBy(FieldPath.documentId()).select('invitedEmails').limit(pageSize);
    if (last) query = query.startAfter(last);
    const snap = await query.get();

    for (const doc of snap.docs) {
      result.checked += 1;
      const data = doc.data() || {};
      if (!('invitedEmails' in data)) continue;
      const emails = [...new Set((Array.isArray(data.invitedEmails) ? data.invitedEmails : [])
          .map(normalizeEmail).filter(Boolean))];
      const batch = db.batch();
      emails.forEach((email) => batch.set(db.collection(COLLECTION).doc(invitationId(doc.id, email)), {
        groupId: doc.id,
        email,
        invitedBy: null,
        createdAt: FieldValue.serverTimestamp(),
      }));
      batch.update(doc.ref, {invitedEmails: FieldValue.delete()});
      await batch.commit();
      result.groups += 1;
      result.invitations += emails.length;
    }

    if (snap.docs.length < pageSize) return result;
    last = snap.docs[snap.docs.length - 1];
  }
}

module.exports = {
  COLLECTION,
  acceptInvitations,
  assertCanInvite,
  invitationId,
  migrateLegacyInvitedEmails,
  normalizeEmail,
  recordInvitation,
};
