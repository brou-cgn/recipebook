/**
 * Zugriff auf die statische Wissensbasis der Weinbegleitung
 * (src/data/weinbegleitung/). Bewusst keine Firestore-Collection: Stile, Regeln
 * und Quellen sind versioniert im Repo, Änderungen erhöhen RULES_VERSION.
 */
import stileDaten from '../../data/weinbegleitung/stile.json';
import regelnDaten from '../../data/weinbegleitung/regeln.json';
import quellenDaten from '../../data/weinbegleitung/quellen.json';

const STILE = Object.freeze(stileDaten.map((stil) => Object.freeze(stil)));
const REGELN = Object.freeze(regelnDaten.map((regel) => Object.freeze(regel)));
const QUELLEN = Object.freeze(quellenDaten.map((quelle) => Object.freeze(quelle)));

const STIL_NACH_ID = new Map(STILE.map((stil) => [stil.id, stil]));
const STIL_REIHENFOLGE = new Map(STILE.map((stil, index) => [stil.id, index]));
const REGEL_NACH_ID = new Map(REGELN.map((regel) => [regel.id, regel]));
const QUELLE_NACH_ID = new Map(QUELLEN.map((quelle) => [quelle.id, quelle]));

/** @returns {Array<Object>} alle Weinstile in der Reihenfolge der Wissensbasis */
export const alleStile = () => STILE;

/** @returns {Array<Object>} alle Regeln (R1 bis R11) */
export const alleRegeln = () => REGELN;

/** @returns {Array<Object>} alle Quellen */
export const alleQuellen = () => QUELLEN;

/** @param {string} id @returns {Object|null} */
export const getStil = (id) => STIL_NACH_ID.get(id) || null;

/** @param {string} id @returns {Object|null} */
export const getRegel = (id) => REGEL_NACH_ID.get(id) || null;

/** @param {string} id @returns {Object|null} */
export const getQuelle = (id) => QUELLE_NACH_ID.get(id) || null;

/**
 * Position eines Stils in der Wissensbasis, für eine stabile Reihenfolge bei Gleichstand.
 * @param {string} id
 * @returns {number}
 */
export const stilReihenfolge = (id) => (STIL_REIHENFOLGE.has(id) ? STIL_REIHENFOLGE.get(id) : STILE.length);

/**
 * Quellen einer Regel, für die Links unter „Warum passt das?“.
 * @param {string} regelId
 * @returns {Array<Object>}
 */
export const quellenFuerRegel = (regelId) => {
  const regel = getRegel(regelId);
  if (!regel) return [];
  return regel.quellenIds.map(getQuelle).filter(Boolean);
};

/**
 * Trinktemperatur zur Anzeige, z. B. „16–18 °C“ (geschütztes Leerzeichen vor °C).
 * @param {Object} stil
 * @returns {string}
 */
export const formatTemperatur = (stil) => {
  const temperatur = stil?.temperatur;
  if (!temperatur) return '';
  return `${temperatur.min}–${temperatur.max}\u00a0°C`;
};

/**
 * Die ersten Rebsorten- bzw. Stilbeispiele zur Anzeige.
 * @param {Object} stil
 * @param {number} [anzahl=2]
 * @returns {Array<string>}
 */
export const beispieleKurz = (stil, anzahl = 2) => (Array.isArray(stil?.beispiele) ? stil.beispiele.slice(0, anzahl) : []);
