/**
 * Übersetzter Rezeptinhalt (Zutaten und Schritte) im Client (Vorhaben Mehrsprachigkeit, PR 4,
 * docs/vorhaben/mehrsprachigkeit.md).
 *
 * Die Cloud Function uebersetzeRezeptInhalt schreibt rezeptUebersetzungen/{recipeId}
 * (Aufbau in functions/shared/inhaltUebersetzung.js): je Sprache Listen `zutaten` und
 * `schritte`, Eintrag für Eintrag wie im Rezept, dazu `quellHash` über den übersetzten Inhalt.
 * Die Hash-Eingabe hier muss Zeichen für Zeichen der Function entsprechen (rezeptInhalt.test.js
 * prüft das). Passt der Hash nicht mehr zum Rezept, ist die Übersetzung veraltet, und die App
 * zeigt das Original, bis die Function neu übersetzt hat.
 *
 * Angezeigt wird die Übersetzung nur; bearbeitet, umgerechnet und gerechnet wird mit dem Original.
 */
import { sha256Hex } from '../utils/sha256';

export const SCHEMA_VERSION = 1;
export const HASH_KENNUNG = 'inhalt-v1';

const liste = (wert) => (Array.isArray(wert) ? wert : []);
const eintragText = (eintrag) => {
  if (typeof eintrag === 'string') return eintrag;
  return typeof eintrag?.text === 'string' ? eintrag.text : '';
};
const istUeberschrift = (eintrag) => Boolean(eintrag) && typeof eintrag === 'object' && eintrag.type === 'heading';

/**
 * Eingabe des quellHash: Art und Text jedes Eintrags von Zutaten und Schritten.
 * @param {Object} rezept
 * @returns {string}
 */
export function inhaltHashEingabe(rezept) {
  const teil = (eintraege) => liste(eintraege).map((eintrag) => [istUeberschrift(eintrag) ? 'h' : '', eintragText(eintrag)]);
  return JSON.stringify([HASH_KENNUNG, teil(rezept?.ingredients), teil(rezept?.steps)]);
}

/**
 * @param {Object} rezept
 * @param {{subtle?: SubtleCrypto}} [optionen] - für Tests austauschbar
 * @returns {Promise<string>}
 */
export function inhaltQuellHash(rezept, optionen = {}) {
  return sha256Hex(inhaltHashEingabe(rezept), optionen);
}

/**
 * Ersetzt in den Einträgen des Rezepts nur den Text durch die Übersetzung derselben Position.
 * Objekte behalten alle anderen Felder (type, ingredientID, …), Texte bleiben Texte.
 * @param {Array} eintraege - recipe.ingredients oder recipe.steps
 * @param {string[]} texte - übersetzte Texte in derselben Reihenfolge
 * @returns {Array}
 */
export function mitUebersetztemText(eintraege, texte) {
  return liste(eintraege).map((eintrag, index) => {
    const text = texte[index];
    if (typeof text !== 'string') return eintrag;
    if (eintrag && typeof eintrag === 'object') return { ...eintrag, text };
    return text;
  });
}

/**
 * Die anzeigbare Übersetzung für ein Rezept in einer Sprache, sonst null: wenn das Dokument
 * fehlt, veraltet ist (anderer Hash oder Schema), die Sprache die des Originals ist oder die
 * Listen nicht zum Rezept passen.
 * @param {Object} rezept
 * @param {Object|null} dokument - Daten aus rezeptUebersetzungen
 * @param {string} sprache
 * @param {string|null} quellHash - aktueller Hash des Rezepts
 * @returns {{zutaten: Array, schritte: Array}|null}
 */
export function anzeigbareUebersetzung(rezept, dokument, sprache, quellHash) {
  if (!dokument || !quellHash || dokument.schemaVersion !== SCHEMA_VERSION || dokument.quellHash !== quellHash) return null;
  if (dokument.originalSprache === sprache) return null;
  const teil = dokument[sprache];
  const zutaten = liste(rezept?.ingredients);
  const schritte = liste(rezept?.steps);
  if (!Array.isArray(teil?.zutaten) || !Array.isArray(teil?.schritte)) return null;
  if (teil.zutaten.length !== zutaten.length || teil.schritte.length !== schritte.length) return null;
  return { zutaten: mitUebersetztemText(zutaten, teil.zutaten), schritte: mitUebersetztemText(schritte, teil.schritte) };
}
