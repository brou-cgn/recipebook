/**
 * Name und Beschreibung privater Listen in der geltenden Sprache (Vorhaben Mehrsprachigkeit, PR 6u,
 * docs/vorhaben/mehrsprachigkeit.md). Muster: Rezepttitel (src/i18n/rezeptTitel.js).
 *
 * Die Übersetzung schreibt die Cloud Function uebersetzeListenTexte in das Feld `textUebersetzung`
 * der Liste ({quelle: {name, description}, originalSprache, en: {name, description}, fr: {…}, …},
 * functions/shared/listenTextUebersetzung.js). Angezeigt wird sie je Feld nur, wenn
 *  - Übersetzungen eingeschaltet sind (`aktiv`; in der App die Berechtigung sprachwahl, siehe
 *    `inhalteUebersetzen` im SpracheContext),
 *  - sie zum aktuellen Text passt (`quelle.name` bzw. `quelle.description` gleich dem getrimmten Feld;
 *    nach einer Änderung zeigt die App bis zur neuen Übersetzung das Original) und
 *  - die Sprache nicht die des Originals ist (immer Deutsch).
 * Sonst bleibt es beim Original. Bearbeitet und gespeichert werden immer `name` und `description`.
 * Systemnamen („Für dich entdeckt“, „Öffentlich“) übersetzt listenAnzeigeName (src/utils/fuerDichEntdeckt.js)
 * über die Wörterbücher, davor.
 */
import { ORIGINAL_SPRACHE, SPRACH_IDS } from './sprachen';

const istText = (wert) => typeof wert === 'string' && wert.trim() !== '';
const getrimmt = (liste, feld) => (typeof liste?.[feld] === 'string' ? liste[feld].trim() : '');

/** @returns {object|null} die Übersetzung, wenn sie zum aktuellen Text des Felds passt */
function passendeUebersetzung(liste, feld) {
  const uebersetzung = liste?.textUebersetzung;
  const text = getrimmt(liste, feld);
  if (!text || !uebersetzung?.quelle || (uebersetzung.quelle[feld] || '') !== text) return null;
  return uebersetzung;
}

/**
 * @param {object} liste - Liste (Gruppe) aus Firestore
 * @param {'name'|'description'} feld
 * @param {string} sprache - geltende Sprache
 * @param {boolean} [aktiv] - Übersetzungen anzeigen
 * @returns {string} Text für die Anzeige; die Beschreibung getrimmt, der Name wie gespeichert
 */
export function listenText(liste, feld, sprache, aktiv = true) {
  const original = feld === 'description' ? getrimmt(liste, feld) : (liste?.[feld] || '');
  if (!aktiv || sprache === ORIGINAL_SPRACHE) return original;
  const uebersetzung = passendeUebersetzung(liste, feld);
  const text = uebersetzung?.[sprache]?.[feld];
  return istText(text) ? text : original;
}

/**
 * Alle Fassungen des Namens für die Suche: das Original und, wenn Übersetzungen eingeschaltet sind,
 * die passenden Übersetzungen (ohne Doppelte).
 * @param {object} liste
 * @param {boolean} [aktiv]
 * @returns {string[]}
 */
export function listenNamenFassungen(liste, aktiv = true) {
  const original = liste?.name || '';
  const uebersetzung = aktiv ? passendeUebersetzung(liste, 'name') : null;
  if (!uebersetzung) return [original];
  const fassungen = SPRACH_IDS.map((sprache) => uebersetzung[sprache]?.name).filter(istText);
  return [...new Set([original, ...fassungen])];
}
