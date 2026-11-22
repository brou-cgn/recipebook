/**
 * Datum und Zahl in der Schreibweise der gewählten Sprache (Vorhaben Mehrsprachigkeit).
 * Die Locale je Sprache steht in src/i18n/sprachen.js (SPRACHEN).
 */
import { localeFuer } from './sprachen';

/**
 * @param {number} zahl
 * @param {string} sprache - 'de', 'en' oder 'fr'
 * @param {Intl.NumberFormatOptions} [optionen]
 * @returns {string} leer, wenn `zahl` keine endliche Zahl ist
 */
export function formatiereZahl(zahl, sprache, optionen) {
  if (typeof zahl !== 'number' || !Number.isFinite(zahl)) return '';
  return new Intl.NumberFormat(localeFuer(sprache), optionen).format(zahl);
}

/**
 * @param {Date|number|string|{toDate: Function}} datum - auch ein Firestore-Timestamp
 * @param {string} sprache - 'de', 'en' oder 'fr'
 * @param {Intl.DateTimeFormatOptions} [optionen] - Standard: Tag, Monat ausgeschrieben, Jahr
 * @returns {string} leer ohne gültiges Datum
 */
export function formatiereDatum(datum, sprache, optionen = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (datum === null || datum === undefined || datum === '') return '';
  const wert = typeof datum?.toDate === 'function' ? datum.toDate() : new Date(datum);
  if (!(wert instanceof Date) || Number.isNaN(wert.getTime())) return '';
  return new Intl.DateTimeFormat(localeFuer(sprache), optionen).format(wert);
}
