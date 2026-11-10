/**
 * Wichteln: Zugriff ausschließlich über die Callables `wichtelVerwalten` (Organisator)
 * und `wichtelTeilnahme` (persönlicher Link, ohne Login). Die Collection
 * wichtelRunden ist für Clients gesperrt (firestore.rules), damit die Zuordnung und
 * die Geschenkideen nur über die Prüfungen in functions/wichteln.js herausgehen.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { getCallableErrorDetails } from './callableErrors';

// Aktionen, die Einladungs-Mails verschicken (auslosen, einladungSenden), dürfen so lange dauern
// wie die Function (120 s, functions/handlers/wichteln.js); Standard im Client wären 70 s.
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

/** @returns {Promise<Array<{id, titel, datum, status, teilnehmerAnzahl, erstelltAm, ausgelostAm}>>} */
export const listeWichtelRunden = async () => (await rufeVerwalten('liste'))?.runden || [];

/**
 * Runde mit Teilnehmern (inkl. Link-Token, Status, verknüpftem Gast und Mailstatus), nie die
 * Zuordnung. Antworten von auslosen und einladungSenden tragen zusätzlich
 * `versand: {gesendet, fehlgeschlagen, grund}` (grund: 'nicht-eingerichtet' | 'limit' | 'fehler').
 */
export const ladeWichtelRunde = (rundeId) => rufeVerwalten('laden', { rundeId });

/**
 * datum: Tag der Feier 'JJJJ-MM-TT' oder '' (keins). namen: wie bei fuegeWichtelTeilnehmerHinzu.
 */
export const legeWichtelRundeAn = ({ titel, anlass, budget, hinweis, datum = '', namen = [] }) =>
  rufeVerwalten('anlegen', { titel, anlass, budget, hinweis, datum, namen });

/** Auch nach dem Auslosen; datum '' löscht das Datum der Feier. */
export const aendereWichtelRunde = (rundeId, { titel, anlass, budget, hinweis, datum = '' }) =>
  rufeVerwalten('aendern', { rundeId, titel, anlass, budget, hinweis, datum });

/**
 * Teilnehmer eintragen. Je Eintrag:
 *  - {name, gastId, email?}: Gast aus der eigenen Gästeliste; `email` ergänzt eine dort fehlende Adresse
 *    (eine andere gespeicherte lehnt der Server ab)
 *  - {vorname, nachname, email?}: neuer Gast – der Server legt ihn zugleich in der Gästeliste an
 *  - ein Name (ältere App-Versionen)
 * Mails gehen dabei keine raus, die Einladung folgt beim Auslosen.
 */
export const fuegeWichtelTeilnehmerHinzu = (rundeId, namen) =>
  rufeVerwalten('teilnehmerHinzufuegen', { rundeId, namen });

/** Link erneut per Mail, erst nach dem Auslosen; gastId verknüpft den Teilnehmer dabei mit diesem Gast. */
export const sendeWichtelEinladung = (rundeId, teilnehmerId, gastId = null) =>
  rufeVerwalten('einladungSenden', { rundeId, teilnehmerId, gastId }, MIT_MAILVERSAND);

export const benenneWichtelTeilnehmerUm = (rundeId, teilnehmerId, name) =>
  rufeVerwalten('teilnehmerUmbenennen', { rundeId, teilnehmerId, name });

export const entferneWichtelTeilnehmer = (rundeId, teilnehmerId) =>
  rufeVerwalten('teilnehmerEntfernen', { rundeId, teilnehmerId });

/** Wen dieser Teilnehmer nicht ziehen soll (ersetzt die bisherige Liste; nur vor dem Auslosen). */
export const setzeWichtelAusschluesse = (rundeId, teilnehmerId, ausschluesse) =>
  rufeVerwalten('ausschluesseSetzen', { rundeId, teilnehmerId, ausschluesse });

/** Lost aus und schickt allen Gästen mit E-Mail-Adresse ihren Link (Antwort mit `versand`). */
export const loseWichtelRundeAus = (rundeId) => rufeVerwalten('auslosen', { rundeId }, MIT_MAILVERSAND);

export const setzeWichtelAuslosungZurueck = (rundeId) => rufeVerwalten('zuruecksetzen', { rundeId });

export const loescheWichtelRunde = (rundeId) => rufeVerwalten('loeschen', { rundeId });

// --- Teilnehmer (persönlicher Link) -------------------------------------------

export const ladeWichtelTeilnahme = (rundeId, token) => rufeTeilnahme('laden', rundeId, token);

export const zieheWichtelLos = (rundeId, token) => rufeTeilnahme('ziehen', rundeId, token);

/** „Geschenk gekauft“ setzen (true) oder zurücknehmen (false); nur nach dem Ziehen. */
export const setzeWichtelGeschenkGekauft = (rundeId, token, gekauft) =>
  rufeTeilnahme('geschenkGekauft', rundeId, token, { gekauft: Boolean(gekauft) });

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
