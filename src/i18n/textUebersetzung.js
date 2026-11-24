/**
 * Namen und Beschreibungen von Listen, Menüs und Events in der geltenden Sprache (Vorhaben
 * Mehrsprachigkeit, PR 6u, docs/vorhaben/mehrsprachigkeit.md). Muster: Rezepttitel (src/i18n/rezeptTitel.js).
 *
 * Die Übersetzung schreiben die Cloud Functions uebersetzeListenTexte, uebersetzeMenueTexte und
 * uebersetzeEventTexte in das Feld `textUebersetzung` ({quelle: {name, description}, originalSprache,
 * en: {name, description}, fr: {…}, …}, functions/shared/namenUebersetzung.js). `name` und `description`
 * sind dort die Schlüssel, im Dokument heißt das Feld je nach Art anders (Events: `eventName`, ohne
 * Beschreibung). Angezeigt wird sie je Feld nur, wenn
 *  - Übersetzungen eingeschaltet sind (`aktiv`; in der App die Berechtigung sprachwahl, siehe
 *    `inhalteUebersetzen` im SpracheContext),
 *  - sie zum aktuellen Text passt (`quelle.<feld>` gleich dem getrimmten Feld des Dokuments; nach einer
 *    Änderung zeigt die App bis zur neuen Übersetzung das Original) und
 *  - die Sprache nicht die des Originals ist (immer Deutsch).
 * Sonst bleibt es beim Original. Bearbeitet und gespeichert wird immer das Original.
 * Systemnamen von Listen („Für dich entdeckt“, „Öffentlich“) übersetzt listenAnzeigeName
 * (src/utils/fuerDichEntdeckt.js) über die Wörterbücher, davor.
 */
import { ORIGINAL_SPRACHE, SPRACH_IDS } from './sprachen';

const istText = (wert) => typeof wert === 'string' && wert.trim() !== '';
const getrimmt = (objekt, dokFeld) => (typeof objekt?.[dokFeld] === 'string' ? objekt[dokFeld].trim() : '');

/** @returns {object|null} die Übersetzung, wenn sie zum aktuellen Text des Felds passt */
function passendeUebersetzung(objekt, feld, dokFeld) {
  const uebersetzung = objekt?.textUebersetzung;
  const text = getrimmt(objekt, dokFeld);
  if (!text || !uebersetzung?.quelle || (uebersetzung.quelle[feld] || '') !== text) return null;
  return uebersetzung;
}

/**
 * @param {object} objekt - Liste, Menü oder Event aus Firestore
 * @param {'name'|'description'} feld - Schlüssel in textUebersetzung
 * @param {string} sprache - geltende Sprache
 * @param {boolean} [aktiv] - Übersetzungen anzeigen
 * @param {string} [dokFeld] - Feld im Dokument, wenn es anders heißt (Events: 'eventName')
 * @returns {string} Text für die Anzeige; die Beschreibung getrimmt, der Name wie gespeichert
 */
export function uebersetzterText(objekt, feld, sprache, aktiv = true, dokFeld = feld) {
  const original = feld === 'description' ? getrimmt(objekt, dokFeld) : (objekt?.[dokFeld] || '');
  if (!aktiv || sprache === ORIGINAL_SPRACHE) return original;
  const uebersetzung = passendeUebersetzung(objekt, feld, dokFeld);
  const text = uebersetzung?.[sprache]?.[feld];
  return istText(text) ? text : original;
}

/**
 * Alle Fassungen des Namens für die Suche: das Original und, wenn Übersetzungen eingeschaltet sind,
 * die passenden Übersetzungen (ohne Doppelte).
 * @param {object} objekt
 * @param {boolean} [aktiv]
 * @param {string} [dokFeld] - Feld des Namens im Dokument
 * @returns {string[]}
 */
export function namenFassungen(objekt, aktiv = true, dokFeld = 'name') {
  const original = objekt?.[dokFeld] || '';
  const uebersetzung = aktiv ? passendeUebersetzung(objekt, 'name', dokFeld) : null;
  if (!uebersetzung) return [original];
  const fassungen = SPRACH_IDS.map((sprache) => uebersetzung[sprache]?.name).filter(istText);
  return [...new Set([original, ...fassungen])];
}
