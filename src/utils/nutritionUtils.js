import { erstelleT } from '../i18n/texte';
import { STANDARD_SPRACHE } from '../i18n/sprachen';
import naehrwerteTexte from '../i18n/texte/naehrwerte';

// Meldungen der Berechnung bleiben deutsch, weil sie mit dem Ergebnis gespeichert werden; die Anzeige
// übersetzt sie (findeText, Mehrsprachigkeit PR 6b, src/i18n/texte/naehrwerte.js).
const T_DEUTSCH = erstelleT(naehrwerteTexte, STANDARD_SPRACHE);

/**
 * Extracts a numeric quantity from an ingredient quantity prefix string.
 * Supports formats like "1 Teil", "0.5 Stück", "1/2", "2", "200 ml".
 * @param {string|null} prefix - The quantity prefix string.
 * @returns {number|null} The numeric value, or null if not parseable.
 */
export function extractQuantityFromPrefix(prefix) {
  if (!prefix) return null;
  const match = prefix.match(/^(\d+\/\d+|\d+(?:[.,]\d+)?)/);
  if (match) {
    const num = match[1];
    if (num.includes('/')) {
      const [numerator, denominator] = num.split('/');
      return parseFloat(numerator) / parseFloat(denominator);
    }
    return parseFloat(num.replace(',', '.'));
  }
  return null;
}

/**
 * Maps a Firebase callable function error to a user-facing German error message
 * (texts in src/i18n/texte/naehrwerte.js; shown translated via findeText).
 * @param {Error} err - The error thrown by a Firebase httpsCallable call.
 * @returns {string} A descriptive German error message.
 */
export function mapNutritionCalcError(err) {
  // Network/connectivity errors – check message before the code switch
  const msg = err.message || '';
  const isNetworkError =
    err.code === 'functions/unavailable' ||
    msg.toLowerCase().includes('network') ||
    msg.toLowerCase().includes('failed to fetch') ||
    msg.toLowerCase().includes('fetch failed') ||
    msg.toLowerCase().includes('networkerror');
  if (isNetworkError) {
    return T_DEUTSCH('fehlerNetzwerk');
  }

  switch (err.code) {
    case 'functions/unauthenticated':
      return T_DEUTSCH('fehlerAnmeldung');
    case 'functions/deadline-exceeded':
      return T_DEUTSCH('fehlerZeit');
    case 'functions/resource-exhausted':
      return T_DEUTSCH('fehlerZuViele');
    case 'functions/internal':
      return T_DEUTSCH('fehlerAbruf');
    default:
      return msg || T_DEUTSCH('fehlerBerechnung');
  }
}

/**
 * Converts stored nutrition totals (whole recipe) to per-portion display values.
 * @param {Object} naehrwerte - Stored totals object.
 * @param {number} portionen - Number of portions.
 * @returns {Object} Per-portion values rounded for display.
 */
export function naehrwertePerPortion(naehrwerte, portionen) {
  const p = portionen || 1;
  const n = naehrwerte || {};
  const result = {};
  if (n.kalorien != null) result.kalorien = Math.round(n.kalorien / p);
  if (n.protein != null) result.protein = Math.round(n.protein / p * 10) / 10;
  if (n.fett != null) result.fett = Math.round(n.fett / p * 10) / 10;
  if (n.kohlenhydrate != null) result.kohlenhydrate = Math.round(n.kohlenhydrate / p * 10) / 10;
  if (n.zucker != null) result.zucker = Math.round(n.zucker / p * 10) / 10;
  if (n.ballaststoffe != null) result.ballaststoffe = Math.round(n.ballaststoffe / p * 10) / 10;
  if (n.salz != null) result.salz = Math.round(n.salz / p * 100) / 100;
  return result;
}

/**
 * Converts per-portion display values to totals for storage.
 * @param {Object} perPortion - Per-portion values.
 * @param {number} portionen - Number of portions.
 * @returns {Object} Total values rounded for storage.
 */
export function naehrwerteToTotals(perPortion, portionen) {
  const p = portionen || 1;
  const result = {};
  Object.entries(perPortion).forEach(([key, value]) => {
    if (value != null) {
      if (key === 'kalorien') {
        result[key] = Math.round(value * p);
      } else if (key === 'salz') {
        result[key] = Math.round(value * p * 100) / 100;
      } else {
        result[key] = Math.round(value * p * 10) / 10;
      }
    }
  });
  return result;
}
