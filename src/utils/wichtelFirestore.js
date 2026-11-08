/**
 * Wichteln: Zugriff ausschließlich über die Callables `wichtelVerwalten` (Organisator)
 * und `wichtelTeilnahme` (persönlicher Link, ohne Login). Die Collection
 * wichtelRunden ist für Clients gesperrt (firestore.rules), damit die Zuordnung und
 * die Geschenkideen nur über die Prüfungen in functions/wichteln.js herausgehen.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { getCallableErrorDetails } from './callableErrors';

// Aktionen, die Einladungs-Mails verschicken, dürfen so lange dauern wie die Function
// (120 s, functions/handlers/wichteln.js); Standard im Client wären 70 s.
const MIT_MAILVERSAND = { timeout: 130000 };

const rufeVerwalten = async (aktion, daten = {}, optionen) => {
  const fn = optionen
    ? httpsCallable(functions, 'wichtelVerwalten', optionen)
    : httpsCallable(functions, 'wichtelVerwalten');
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

/**
 * Runde mit Teilnehmern (inkl. Link-Token, Status, verknüpftem Gast und Mailstatus), nie die
 * Zuordnung. Antworten von anlegen, teilnehmerHinzufuegen und einladungSenden tragen zusätzlich
 * `versand: {gesendet, fehlgeschlagen, grund}` (grund: 'nicht-eingerichtet' | 'limit' | 'fehler').
 */
export const ladeWichtelRunde = (rundeId) => rufeVerwalten('laden', { rundeId });

/** namen: wie bei fuegeWichtelTeilnehmerHinzu */
export const legeWichtelRundeAn = ({ titel, budget, hinweis, namen = [] }) =>
  rufeVerwalten('anlegen', { titel, budget, hinweis, namen }, namen.length > 0 ? MIT_MAILVERSAND : undefined);

export const aendereWichtelRunde = (rundeId, { titel, budget, hinweis }) =>
  rufeVerwalten('aendern', { rundeId, titel, budget, hinweis });

/**
 * @param {string} rundeId
 * @param {Array<string|{name: string, gastId: string|null}>} namen - Namen oder Gäste aus der
 *   eigenen Gästeliste; Gästen mit E-Mail-Adresse schickt der Server ihren Link sofort per Mail.
 */
export const fuegeWichtelTeilnehmerHinzu = (rundeId, namen) =>
  rufeVerwalten('teilnehmerHinzufuegen', { rundeId, namen }, MIT_MAILVERSAND);

/** Link (erneut) per Mail; gastId verknüpft den Teilnehmer dabei mit diesem Gast. */
export const sendeWichtelEinladung = (rundeId, teilnehmerId, gastId = null) =>
  rufeVerwalten('einladungSenden', { rundeId, teilnehmerId, gastId }, MIT_MAILVERSAND);

export const benenneWichtelTeilnehmerUm = (rundeId, teilnehmerId, name) =>
  rufeVerwalten('teilnehmerUmbenennen', { rundeId, teilnehmerId, name });

export const entferneWichtelTeilnehmer = (rundeId, teilnehmerId) =>
  rufeVerwalten('teilnehmerEntfernen', { rundeId, teilnehmerId });

/** Wen dieser Teilnehmer nicht ziehen soll (ersetzt die bisherige Liste; nur vor dem Auslosen). */
export const setzeWichtelAusschluesse = (rundeId, teilnehmerId, ausschluesse) =>
  rufeVerwalten('ausschluesseSetzen', { rundeId, teilnehmerId, ausschluesse });

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
