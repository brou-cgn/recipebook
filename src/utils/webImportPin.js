/**
 * Webimport-PIN
 * Client-side helpers around the setWebImportPin Cloud Function. The PIN
 * itself never lands in Firestore in plaintext or reversible form –
 * functions/webImportPin.js only ever stores a salted hash in a
 * subcollection the client cannot read (see firestore.rules).
 *
 * The PIN protects only the Apple-Shortcut import path (importRecipeShortcut
 * in functions/index.js, checked via requireShortcutPin on every request –
 * the Shortcut authenticates via a long-lived API key with no session to
 * stay "unlocked"). In-app imports through the logged-in web app never need
 * this PIN.
 */
import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { getCallableErrorDetails } from './webImportService';

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
 * Remove the caller's Webimport-PIN entirely (the Kurzbefehl-Import then works unprotected again).
 * @returns {Promise<void>}
 */
export async function clearWebImportPin() {
  await setWebImportPin(null);
}
