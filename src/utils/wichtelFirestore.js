/**
 * Wichteln: Zugriff ausschließlich über die Callables `wichtelVerwalten` (Organisator)
 * und `wichtelTeilnahme` (persönlicher Link, ohne Login). Die Collection
 * wichtelRunden ist für Clients gesperrt (firestore.rules), damit die Zuordnung und
 * die Geschenkideen nur über die Prüfungen in functions/wichteln.js herausgehen.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { getCallableErrorDetails } from './callableErrors';

const rufeVerwalten = async (aktion, daten = {}) => {
  const fn = httpsCallable(functions, 'wichtelVerwalten');
  const result = await fn({ aktion, ...daten });
  return result?.data;
};

const rufeTeilnahme = async (aktion, rundeId, token, daten = {}) => {
  const fn = httpsCallable(functions, 'wichtelTeilnahme');
  const result = await fn({ aktion, rundeId, token, ...daten });
  return result?.data;
};

// --- Organisator ------------------------------------------------------------

/** @returns {Promise<Array<{id, titel, status, teilnehmerAnzahl, erstelltAm, ausgelostAm}>>} */
export const listeWichtelRunden = async () => (await rufeVerwalten('liste'))?.runden || [];

/** Runde mit Teilnehmern (inkl. Link-Token und Status), nie die Zuordnung. */
export const ladeWichtelRunde = (rundeId) => rufeVerwalten('laden', { rundeId });

export const legeWichtelRundeAn = ({ titel, budget, hinweis, namen = [] }) =>
  rufeVerwalten('anlegen', { titel, budget, hinweis, namen });

export const aendereWichtelRunde = (rundeId, { titel, budget, hinweis }) =>
  rufeVerwalten('aendern', { rundeId, titel, budget, hinweis });

export const fuegeWichtelTeilnehmerHinzu = (rundeId, namen) =>
  rufeVerwalten('teilnehmerHinzufuegen', { rundeId, namen });

export const benenneWichtelTeilnehmerUm = (rundeId, teilnehmerId, name) =>
  rufeVerwalten('teilnehmerUmbenennen', { rundeId, teilnehmerId, name });

export const entferneWichtelTeilnehmer = (rundeId, teilnehmerId) =>
  rufeVerwalten('teilnehmerEntfernen', { rundeId, teilnehmerId });

export const loseWichtelRundeAus = (rundeId) => rufeVerwalten('auslosen', { rundeId });

export const setzeWichtelAuslosungZurueck = (rundeId) => rufeVerwalten('zuruecksetzen', { rundeId });

export const loescheWichtelRunde = (rundeId) => rufeVerwalten('loeschen', { rundeId });

// --- Teilnehmer (persönlicher Link) -------------------------------------------

export const ladeWichtelTeilnahme = (rundeId, token) => rufeTeilnahme('laden', rundeId, token);

export const zieheWichtelLos = (rundeId, token) => rufeTeilnahme('ziehen', rundeId, token);

/**
 * Wunsch (ueberId = eigene ID) oder Geschenkidee für einen anderen Gast. Text oder Link
 * genügt; zum Link holt der Server beim Speichern eine Bildvorschau (dauert bis zu 5 s).
 */
export const fuegeWichtelEintragHinzu = (rundeId, token, ueberId, text, url = '') =>
  rufeTeilnahme('eintragHinzufuegen', rundeId, token, { ueberId, text, url });

export const loescheWichtelEintrag = (rundeId, token, eintragId) =>
  rufeTeilnahme('eintragLoeschen', rundeId, token, { eintragId });

// Diese Codes tragen in functions/wichteln.js eine Meldung für Nutzer.
const NUTZER_MELDUNGEN = new Set([
  'not-found', 'invalid-argument', 'failed-precondition', 'already-exists',
  'permission-denied', 'resource-exhausted', 'unavailable', 'unauthenticated',
]);

/**
 * Text für eine Fehlermeldung in der Oberfläche.
 * @param {Error} error
 * @param {string} [fallback]
 * @returns {string}
 */
export function getWichtelFehlertext(error, fallback = 'Das hat nicht geklappt. Bitte prüfe deine Verbindung und versuche es noch einmal.') {
  const { code, message, lowerMessage } = getCallableErrorDetails(error);
  if (NUTZER_MELDUNGEN.has(code) && message && lowerMessage !== code.replace(/-/g, ' ') && lowerMessage !== code) {
    return message;
  }
  return fallback;
}
