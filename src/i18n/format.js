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

/**
 * Abstand zu einem Tag in Worten: „morgen“, „in 30 Tagen“ / „tomorrow“, „in 30 days“ / „demain“,
 * „dans 30 jours“; ab 60 Tagen in Monaten („in 2 Monaten“). Negative Werte liegen zurück
 * („gestern“, „vor 3 Tagen“).
 * @param {number} tage - ganze Kalendertage ab heute
 * @param {string} sprache - 'de', 'en' oder 'fr'
 * @returns {string} leer, wenn `tage` keine endliche Zahl ist
 */
export function formatiereAbstandInTagen(tage, sprache) {
  if (typeof tage !== 'number' || !Number.isFinite(tage)) return '';
  const locale = localeFuer(sprache);
  if (Math.abs(tage) < 60) return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(tage, 'day');
  return new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(Math.round(tage / 30.44), 'month');
}
