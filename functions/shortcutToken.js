/**
 * Persönlicher Kurzbefehl-Schlüssel (Tech-Check S7, Entscheidung vom 23.11.2026).
 *
 * Bisher erkannten die Kurzbefehl-Endpunkte ein Mitglied an einem für alle gleichen Schlüssel
 * (SHORTCUT_API_KEY) plus der E-Mail-Adresse im Header X-User-Email: Wer den Schlüssel kannte, konnte
 * im Namen jedes Mitglieds importieren. Jetzt erzeugt jedes Mitglied in den persönlichen Daten einen
 * eigenen Schlüssel und schickt ihn im Header X-Shortcut-Token; die E-Mail entfällt.
 *
 * Aufbau: rbk.<uid>.<geheim>. Die uid dient nur dem Nachschlagen, geheim sind die 32 Zufallsbytes
 * (base64url). Gespeichert wird nur der SHA-256-Fingerabdruck des Geheimnisses in
 * users/{uid}/security/shortcutToken, einer Untersammlung ohne Client-Zugriff (firestore.rules); der
 * Schlüssel selbst geht genau einmal an den Client zurück. SHA-256 statt scrypt wie beim PIN, weil
 * das Geheimnis zufällig und 256 Bit lang ist und nicht erraten werden kann.
 *
 * Hat ein Konto einen eigenen Schlüssel, lehnt shared/shortcutAuth.js für dieses Konto den alten
 * gemeinsamen Schlüssel ab. Konten ohne eigenen Schlüssel funktionieren wie bisher, bis der gemeinsame
 * Schlüssel abgeschaltet wird.
 */
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const crypto = require('crypto');

const TOKEN_PREFIX = 'rbk';
const SECRET_BYTES = 32;
// 32 Bytes base64url ergeben 43 Zeichen ohne Auffüllung
const TOKEN_PATTERN = /^rbk\.([A-Za-z0-9]{1,128})\.([A-Za-z0-9_-]{43})$/;

/**
 * @param {string} secret Geheimer Teil des Schlüssels.
 * @return {string} Hex-kodierter SHA-256-Fingerabdruck.
 */
function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db Firestore-Instanz.
 * @param {string} uid Firebase-Nutzer-ID.
 * @return {import('firebase-admin/firestore').DocumentReference} Gesperrtes Dokument mit dem Fingerabdruck.
 */
function getTokenDocRef(db, uid) {
  return db.collection('users').doc(uid).collection('security').doc('shortcutToken');
}

/**
 * Cloud Function: createShortcutToken
 * Erzeugt einen neuen persönlichen Schlüssel für das eigene Konto und ersetzt einen vorhandenen
 * (der alte gilt danach nicht mehr). Gibt den Schlüssel genau einmal zurück.
 */
exports.createShortcutToken = onCall({maxInstances: 10}, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login erforderlich.');
  }
  const uid = request.auth.uid;
  const db = getFirestore();
  const secret = crypto.randomBytes(SECRET_BYTES).toString('base64url');

  await getTokenDocRef(db, uid).set({
    hash: hashSecret(secret),
    createdAt: FieldValue.serverTimestamp(),
    lastUsedAt: null,
  });
  // Nicht vertraulicher Spiegel für die Anzeige in den persönlichen Daten (wie webImportPinEnabled)
  await db.collection('users').doc(uid).set({
    shortcutTokenEnabled: true,
    shortcutTokenCreatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});

  return {token: `${TOKEN_PREFIX}.${uid}.${secret}`};
});

/**
 * Cloud Function: revokeShortcutToken
 * Widerruft den persönlichen Schlüssel des eigenen Kontos. Danach gilt für das Konto wieder der
 * gemeinsame Schlüssel, solange er nicht abgeschaltet ist.
 */
exports.revokeShortcutToken = onCall({maxInstances: 10}, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login erforderlich.');
  }
  const uid = request.auth.uid;
  const db = getFirestore();
  await getTokenDocRef(db, uid).delete();
  await db.collection('users').doc(uid).set({
    shortcutTokenEnabled: false,
    shortcutTokenCreatedAt: FieldValue.delete(),
  }, {merge: true});
  return {success: true};
});

/**
 * Prüft einen Schlüssel aus dem Header X-Shortcut-Token.
 * @param {import('firebase-admin/firestore').Firestore} db Firestore-Instanz.
 * @param {*} token Wert des Headers.
 * @return {Promise<string|null>} uid des Kontos oder null, wenn der Schlüssel nicht gilt.
 */
async function verifyShortcutToken(db, token) {
  const match = TOKEN_PATTERN.exec(String(token || '').trim());
  if (!match) return null;
  const [, uid, secret] = match;
  const ref = getTokenDocRef(db, uid);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const expected = Buffer.from(String(snap.data()?.hash || ''), 'hex');
  const candidate = Buffer.from(hashSecret(secret), 'hex');
  if (expected.length !== candidate.length || !crypto.timingSafeEqual(expected, candidate)) {
    return null;
  }

  try {
    await ref.set({lastUsedAt: FieldValue.serverTimestamp()}, {merge: true});
  } catch (err) {
    // Nur zur Anzeige „zuletzt benutzt“; die Anmeldung gilt trotzdem
    console.warn('verifyShortcutToken: lastUsedAt nicht gespeichert:', err.message);
  }
  return uid;
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db Firestore-Instanz.
 * @param {string} uid Firebase-Nutzer-ID.
 * @return {Promise<boolean>} true, wenn das Konto einen persönlichen Schlüssel hat.
 */
async function hasShortcutToken(db, uid) {
  const snap = await getTokenDocRef(db, uid).get();
  return snap.exists;
}

exports.verifyShortcutToken = verifyShortcutToken;
exports.hasShortcutToken = hasShortcutToken;
exports.TOKEN_PATTERN = TOKEN_PATTERN;
