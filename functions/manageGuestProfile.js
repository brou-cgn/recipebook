const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const ALLOWED_ROLES = new Set(['edit', 'moderator', 'admin']);
const ALLOWED_FACTORS = new Set([0, 0.25, 0.5, 0.75, 1]);

function getTrimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    throw new HttpsError('invalid-argument', 'profile ist erforderlich.');
  }

  const vorname = getTrimmed(profile.vorname);
  const nachname = getTrimmed(profile.nachname);
  const email = getTrimmed(profile.email).toLowerCase();
  const praeferenzFaktor = Number(profile['präferenzFaktor']);

  if (!vorname || !nachname) {
    throw new HttpsError('invalid-argument', 'vorname und nachname sind erforderlich.');
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'email ist ungültig.');
  }
  if (!ALLOWED_FACTORS.has(praeferenzFaktor)) {
    throw new HttpsError('invalid-argument', 'präferenzFaktor muss 0, 0.25, 0.5, 0.75 oder 1 sein.');
  }

  const bevorzugteGetraenke = Array.isArray(profile['bevorzugteGetränke'])
    ? [...new Set(profile['bevorzugteGetränke'].filter((item) => typeof item === 'string' && item.trim()))]
    : [];

  const bevorzugteKategorien = Array.isArray(profile['bevorzugteKategorien'])
    ? [...new Set(profile['bevorzugteKategorien'].filter((item) => typeof item === 'string' && item.trim()))]
    : [];

  return {
    vorname,
    nachname,
    email,
    kind: profile.kind === true,
    alkoholischeGetränke: profile['alkoholischeGetränke'] !== false,
    bevorzugteGetränke: bevorzugteGetraenke,
    bevorzugteKategorien,
    präferenzFaktor: praeferenzFaktor,
  };
}

async function getUserRole(db, uid) {
  const userSnap = await db.collection('users').doc(uid).get();
  return userSnap.exists ? userSnap.data()?.role : null;
}

/**
 * Ermittelt, unter welchem Nutzer (targetUid) die Gaeste-Operation ausgefuehrt
 * werden darf. Standardmaessig wirkt der Aufruf auf die eigenen Gaeste (uid
 * benoetigt edit-Rechte); wird ein abweichendes ownerId angegeben, darf nur
 * ein Admin auf die Gaeste eines anderen Nutzers zugreifen.
 * @param {object} db Firestore-Instanz.
 * @param {string} uid Firebase-Nutzer-ID des Aufrufers.
 * @param {string|undefined} ownerId Optionales Ziel-Nutzer-ID (fuer Admin-Zugriff).
 * @return {Promise<string>} Die Nutzer-ID, deren Gaesteprofile bearbeitet werden.
 */
async function resolveTargetUid(db, uid, ownerId) {
  const role = await getUserRole(db, uid);
  const targetUid = ownerId || uid;
  if (targetUid !== uid) {
    if (role !== 'admin') {
      throw new HttpsError('permission-denied', 'Nur Admins können Gäste anderer Nutzer verwalten.');
    }
    return targetUid;
  }
  if (!ALLOWED_ROLES.has(role)) {
    throw new HttpsError('permission-denied', 'Nur Benutzer mit edit-Rechten können Gäste verwalten.');
  }
  return targetUid;
}

exports.manageGuestProfile = onCall({maxInstances: 10}, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login erforderlich.');
  }

  const uid = request.auth.uid;
  const {action, profileId, profile, ownerId} = request.data || {};
  const db = admin.firestore();

  const targetUid = await resolveTargetUid(db, uid, ownerId);

  const guestsRef = db.collection('guests').doc(targetUid).collection('profiles');
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (action === 'delete') {
    const id = getTrimmed(profileId);
    if (!id) throw new HttpsError('invalid-argument', 'profileId ist erforderlich.');
    await guestsRef.doc(id).delete();
    return {id};
  }

  if (action !== 'create' && action !== 'update') {
    throw new HttpsError('invalid-argument', 'action muss create, update oder delete sein.');
  }

  const validated = validateProfile(profile);

  if (action === 'update') {
    const id = getTrimmed(profileId);
    if (!id) throw new HttpsError('invalid-argument', 'profileId ist erforderlich.');
    const docRef = guestsRef.doc(id);
    const existing = await docRef.get();
    if (!existing.exists) {
      throw new HttpsError('not-found', 'Gästeprofil nicht gefunden.');
    }
    await docRef.set({...validated, aktualisiert: now}, {merge: true});
    return {id};
  }

  const docRef = guestsRef.doc();
  await docRef.set({
    id: docRef.id,
    ...validated,
    erstellt: now,
    aktualisiert: now,
    erstelltVon: uid,
  });
  return {id: docRef.id};
});

exports._internal = {validateProfile};
