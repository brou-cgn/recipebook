/**
 * Rezepttitel in der geltenden Sprache (Vorhaben Mehrsprachigkeit, PR 3,
 * docs/vorhaben/mehrsprachigkeit.md).
 *
 * Die Übersetzung schreibt die Cloud Function uebersetzeRezeptTitel in das Feld
 * `titelUebersetzung` ({quelle, originalSprache, de, en, fr, …},
 * functions/shared/titelUebersetzung.js). Angezeigt wird sie nur, wenn
 *  - Übersetzungen eingeschaltet sind (`aktiv`; in der App die Berechtigung sprachwahl,
 *    siehe `inhalteUebersetzen` im SpracheContext),
 *  - sie zum aktuellen Titel passt (`quelle` === `title`; nach einer Änderung zeigt die App
 *    bis zur neuen Übersetzung das Original) und
 *  - die Sprache nicht die des Originals ist. Das Original ist immer deutsch (ORIGINAL_SPRACHE),
 *    auch bei älteren Übersetzungen, für die Gemini einen englischen Titel wie „American
 *    Pancakes“ noch für ein englisches Original hielt und ins Deutsche übersetzte.
 * Sonst bleibt es beim Original. Bearbeitet und gespeichert wird immer `title`.
 */
import { ORIGINAL_SPRACHE, SPRACH_IDS } from './sprachen';

/** @returns {object|null} die Übersetzung, wenn sie zum aktuellen Titel passt */
function passendeUebersetzung(rezept) {
  const uebersetzung = rezept?.titelUebersetzung;
  if (!uebersetzung || typeof rezept.title !== 'string' || uebersetzung.quelle !== rezept.title) return null;
  return uebersetzung;
}

const istText = (wert) => typeof wert === 'string' && wert.trim() !== '';

/**
 * @param {object} rezept
 * @param {string} sprache - geltende Sprache
 * @param {boolean} [aktiv] - Übersetzungen anzeigen
 * @returns {string} Titel für die Anzeige
 */
export function rezeptTitel(rezept, sprache, aktiv = true) {
  const original = rezept?.title || '';
  if (!aktiv || sprache === ORIGINAL_SPRACHE) return original;
  const uebersetzung = passendeUebersetzung(rezept);
  if (!uebersetzung || uebersetzung.originalSprache === sprache) return original;
  return istText(uebersetzung[sprache]) ? uebersetzung[sprache] : original;
}

/**
 * Alle Fassungen des Titels für die Suche: das Original und, wenn Übersetzungen
 * eingeschaltet sind, die passenden Übersetzungen (ohne Doppelte).
 * @param {object} rezept
 * @param {boolean} [aktiv]
 * @returns {string[]}
 */
export function titelFassungen(rezept, aktiv = true) {
  const original = rezept?.title || '';
  const uebersetzung = aktiv ? passendeUebersetzung(rezept) : null;
  if (!uebersetzung) return [original];
  const fassungen = SPRACH_IDS.map((sprache) => uebersetzung[sprache]).filter(istText);
  return [...new Set([original, ...fassungen])];
}
