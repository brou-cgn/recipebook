/**
 * Persönlicher Kurzbefehl-Schlüssel (Tech-Check S7, Entscheidung vom 23.11.2026).
 *
 * Bis zum 23.11.2026 erkannten die Kurzbefehl-Endpunkte ein Mitglied an einem für alle gleichen
 * Schlüssel (SHORTCUT_API_KEY) plus der E-Mail-Adresse im Header X-User-Email, abgesichert nur durch
 * einen optionalen Webimport-PIN: Wer den Schlüssel kannte, konnte im Namen jedes Mitglieds ohne PIN
 * importieren. Jetzt erzeugt jedes Mitglied in den persönlichen Daten einen eigenen Schlüssel und
 * schickt ihn im Header X-Shortcut-Token; das ist der einzige Zugang, gemeinsamer Schlüssel und PIN
 * sind entfernt.
 *
 * Aufbau: rbk.<uid>.<geheim>. Die uid dient nur dem Nachschlagen, geheim sind die 32 Zufallsbytes
 * (base64url). Gespeichert wird nur der SHA-256-Fingerabdruck des Geheimnisses in
 * users/{uid}/security/shortcutToken, einer Untersammlung ohne Client-Zugriff (firestore.rules); der
 * Schlüssel selbst geht genau einmal an den Client zurück. SHA-256 statt scrypt wie beim PIN, weil
 * das Geheimnis zufällig und 256 Bit lang ist und nicht erraten werden kann.
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
  // Altbestand des abgeschafften Webimport-PINs mit aufräumen, wenn das Mitglied umstellt
  await db.collection('users').doc(uid).collection('security').doc('webImportPin').delete();
  // Nicht vertraulicher Spiegel für die Anzeige in den persönlichen Daten
  await db.collection('users').doc(uid).set({
    shortcutTokenEnabled: true,
    shortcutTokenCreatedAt: FieldValue.serverTimestamp(),
    webImportPinEnabled: FieldValue.delete(),
  }, {merge: true});

  return {token: `${TOKEN_PREFIX}.${uid}.${secret}`};
});

/**
 * Cloud Function: revokeShortcutToken
 * Widerruft den persönlichen Schlüssel des eigenen Kontos. Danach nimmt der Server für das Konto
 * keinen Kurzbefehl mehr an, bis ein neuer Schlüssel erzeugt ist.
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

exports.verifyShortcutToken = verifyShortcutToken;
exports.TOKEN_PATTERN = TOKEN_PATTERN;
