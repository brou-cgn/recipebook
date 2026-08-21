/**
 * Webimport-PIN
 * Client-side helpers around the setWebImportPin/verifyWebImportPin Cloud
 * Functions. The PIN itself never lands in Firestore in plaintext or
 * reversible form – functions/webImportPin.js only ever stores a salted hash
 * in a subcollection the client cannot read (see firestore.rules).
 *
 * A successful verifyWebImportPin() call opens a server-side "unlock window"
 * (see UNLOCK_MINUTES in functions/webImportPin.js) during which the actual
 * import Cloud Functions accept requests without asking for the PIN again.
 * unlockedUntilMs below mirrors that window client-side (slightly shorter)
 * purely so the UI can hide the PIN field once unlocked for this tab – the
 * server-side check is the actual security boundary.
 */
import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { getCallableErrorDetails } from './webImportService';

const CLIENT_UNLOCK_WINDOW_MS = 25 * 60 * 1000;

let unlockedUntilMs = 0;

/**
 * @returns {boolean} Whether this tab has verified the PIN recently enough
 *   that the import Cloud Functions should still accept requests without it.
 */
export function isWebImportUnlocked() {
  return Date.now() < unlockedUntilMs;
}

/**
 * Verify the given PIN against the caller's configured Webimport-PIN.
 * @param {string} pin - The PIN as entered by the user.
 * @returns {Promise<void>} Resolves on success; throws with a German message on failure.
 */
export async function verifyWebImportPin(pin) {
  try {
    await httpsCallable(functions, 'verifyWebImportPin')({ pin });
    unlockedUntilMs = Date.now() + CLIENT_UNLOCK_WINDOW_MS;
  } catch (error) {
    const { code, message } = getCallableErrorDetails(error);
    if (code === 'unauthenticated') {
      throw new Error('Bitte melde dich an, um den Webimport-PIN zu prüfen.');
    } else if (code === 'permission-denied') {
      throw new Error(message || 'Falscher PIN.');
    } else if (code === 'resource-exhausted') {
      throw new Error(message || 'Zu viele Fehlversuche. Bitte später erneut versuchen.');
    } else if (message) {
      throw new Error(message);
    }
    throw new Error('PIN-Prüfung fehlgeschlagen. Bitte versuche es erneut.');
  }
}

/**
 * Set or change the caller's Webimport-PIN.
 * @param {string} pin - 4–8 digit PIN.
 * @returns {Promise<void>}
 */
export async function setWebImportPin(pin) {
  try {
    await httpsCallable(functions, 'setWebImportPin')({ pin });
  } catch (error) {
    const { code, message } = getCallableErrorDetails(error);
    if (code === 'unauthenticated') {
      throw new Error('Bitte melde dich an, um einen Webimport-PIN zu setzen.');
    } else if (code === 'invalid-argument') {
      throw new Error(message || 'Ungültiger PIN.');
    } else if (message) {
      throw new Error(message);
    }
    throw new Error('PIN konnte nicht gespeichert werden. Bitte versuche es erneut.');
  }
}

/**
 * Remove the caller's Webimport-PIN entirely (Webimport then works unprotected again).
 * @returns {Promise<void>}
 */
export async function clearWebImportPin() {
  await setWebImportPin(null);
  unlockedUntilMs = 0;
}
