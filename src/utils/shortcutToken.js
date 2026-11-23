/**
 * Persönlicher Kurzbefehl-Schlüssel (Tech-Check S7): Client-Seite der Cloud Functions
 * createShortcutToken und revokeShortcutToken (functions/shortcutToken.js). Der Schlüssel kommt nur
 * beim Erzeugen einmal zurück; Firestore speichert nur seinen Fingerabdruck in einer Untersammlung,
 * die der Client nicht lesen kann (firestore.rules).
 */
import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';

/**
 * Erzeugt einen neuen Schlüssel für das eigene Konto; ein vorhandener gilt danach nicht mehr.
 * @returns {Promise<string>} der Schlüssel (rbk.<uid>.<geheim>)
 */
export async function createShortcutToken() {
  const result = await httpsCallable(functions, 'createShortcutToken')({});
  return result.data.token;
}

/**
 * Widerruft den Schlüssel des eigenen Kontos.
 * @returns {Promise<void>}
 */
export async function revokeShortcutToken() {
  await httpsCallable(functions, 'revokeShortcutToken')({});
}
