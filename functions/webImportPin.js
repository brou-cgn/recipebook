const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');

const PIN_MIN_LENGTH = 4;
const PIN_MAX_LENGTH = 8;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const SCRYPT_KEYLEN = 64;

/**
 * @param {string} pin Der PIN im Klartext.
 * @param {string} salt Hex-kodierter Salt.
 * @return {string} Hex-kodierter scrypt-Hash von PIN + Salt.
 */
function hashPin(pin, salt) {
  return crypto.scryptSync(pin, salt, SCRYPT_KEYLEN).toString('hex');
}

/**
 * @param {admin.firestore.Firestore} db Firestore-Instanz.
 * @param {string} uid Firebase-Nutzer-ID.
 * @return {admin.firestore.DocumentReference} Referenz auf das gesperrte PIN-Dokument.
 */
function getSecurityDocRef(db, uid) {
  return db.collection('users').doc(uid).collection('security').doc('webImportPin');
}

/**
 * @param {string} code HttpsError-artiger Fehlercode (z.B. 'permission-denied').
 * @param {string} message Für Nutzer bestimmte Fehlermeldung.
 * @return {Error} Error-Objekt mit angehängtem `code`, wie es HttpsError erwartet.
 */
function pinError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Cloud Function: setWebImportPin
 * Sets, changes, or (pin === null/'') clears the caller's own Webimport-PIN.
 * The PIN is never stored in plaintext – only a salted scrypt hash lands in
 * users/{uid}/security/webImportPin, a subcollection with no client read/write
 * access (see firestore.rules). A non-sensitive `webImportPinEnabled` flag is
 * mirrored onto the user's own document so the UI can show PIN status without
 * needing to read the locked-down security doc.
 */
exports.setWebImportPin = onCall({maxInstances: 10}, async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Login erforderlich.');
  }

  const uid = auth.uid;
  const {pin} = request.data || {};
  const db = admin.firestore();
  const docRef = getSecurityDocRef(db, uid);
  const userRef = db.collection('users').doc(uid);

  if (pin === null || pin === undefined || pin === '') {
    await docRef.delete();
    await userRef.set({webImportPinEnabled: false}, {merge: true});
    return {success: true, enabled: false};
  }

  if (
    typeof pin !== 'string' ||
    !/^\d+$/.test(pin) ||
    pin.length < PIN_MIN_LENGTH ||
    pin.length > PIN_MAX_LENGTH
  ) {
    throw new HttpsError(
        'invalid-argument',
        `PIN muss aus ${PIN_MIN_LENGTH} bis ${PIN_MAX_LENGTH} Ziffern bestehen.`,
    );
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPin(pin, salt);

  await docRef.set({
    hash,
    salt,
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await userRef.set({webImportPinEnabled: true}, {merge: true});

  return {success: true, enabled: true};
});

/**
 * Core PIN check used by requireShortcutPin, called inline by the
 * importRecipeShortcut HTTP endpoint on every request (the Apple Shortcut
 * authenticates via a long-lived API key with no session to "stay unlocked",
 * so it must send the PIN with every call instead). Verifies `pin` against
 * the stored hash for `uid`, tracking failed attempts / lockout. Throws an
 * Error with an HttpsError-style `code` property on failure – callers
 * translate that to their own error shape.
 * @param {string} uid Firebase-Nutzer-ID.
 * @param {string} pin Vom Aufrufer übermittelter PIN.
 * @return {Promise<{configured: boolean}>} configured=false, wenn der Nutzer
 *   keinen PIN eingerichtet hat (dann wurde nichts geprüft).
 */
async function verifyPinCore(uid, pin) {
  const db = admin.firestore();
  const docRef = getSecurityDocRef(db, uid);
  const snap = await docRef.get();

  if (!snap.exists) {
    // No PIN configured for this user – nothing to verify against.
    return {configured: false};
  }

  if (typeof pin !== 'string' || !pin) {
    throw pinError('invalid-argument', 'PIN ist erforderlich.');
  }

  const data = snap.data();
  const now = Date.now();

  if (data.lockedUntil && data.lockedUntil.toMillis && data.lockedUntil.toMillis() > now) {
    const minutesLeft = Math.ceil((data.lockedUntil.toMillis() - now) / 60000);
    throw pinError(
        'resource-exhausted',
        `Zu viele Fehlversuche. Bitte in ${minutesLeft} Minute${minutesLeft === 1 ? '' : 'n'} erneut versuchen.`,
    );
  }

  const candidateHash = hashPin(pin, data.salt);
  const expected = Buffer.from(data.hash, 'hex');
  const candidate = Buffer.from(candidateHash, 'hex');
  const matches = expected.length === candidate.length &&
    crypto.timingSafeEqual(expected, candidate);

  if (!matches) {
    const failedAttempts = (data.failedAttempts || 0) + 1;
    const update = {failedAttempts};
    if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
      update.lockedUntil = admin.firestore.Timestamp.fromMillis(now + LOCKOUT_MINUTES * 60000);
      update.failedAttempts = 0;
    }
    await docRef.set(update, {merge: true});
    throw pinError('permission-denied', 'Falscher PIN.');
  }

  await docRef.set({failedAttempts: 0, lockedUntil: null}, {merge: true});

  return {configured: true};
}

/**
 * Called by importRecipeShortcut (functions/index.js) on every request. The
 * Apple Shortcut has no session to stay "unlocked" the way an in-app login
 * does, so it must send the PIN with every call instead – this checks it
 * directly against the stored hash. A no-op when the target user never
 * configured a PIN, so existing Shortcuts keep working unchanged until their
 * owner sets one.
 * @param {string} uid Firebase-Nutzer-ID, für die importiert werden soll.
 * @param {string} pin Vom Kurzbefehl übermittelter PIN.
 * @return {Promise<void>}
 */
async function requireShortcutPin(uid, pin) {
  await verifyPinCore(uid, pin);
}

exports.requireShortcutPin = requireShortcutPin;
