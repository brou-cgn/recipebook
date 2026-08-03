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

async function requireEditRole(db, uid) {
  const userSnap = await db.collection('users').doc(uid).get();
  const role = userSnap.exists ? userSnap.data()?.role : null;
  if (!ALLOWED_ROLES.has(role)) {
    throw new HttpsError('permission-denied', 'Nur Benutzer mit edit-Rechten können Gäste verwalten.');
  }
}

exports.manageGuestProfile = onCall({maxInstances: 10}, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login erforderlich.');
  }

  const uid = request.auth.uid;
  const {action, profileId, profile} = request.data || {};
  const db = admin.firestore();

  await requireEditRole(db, uid);

  const guestsRef = db.collection('guests').doc(uid).collection('profiles');
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
