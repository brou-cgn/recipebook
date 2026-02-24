/**
 * Maps a Firebase callable function error to a user-facing German error message.
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
    return 'Netzwerkfehler. Bitte Internetverbindung prüfen und erneut versuchen.';
  }

  switch (err.code) {
    case 'functions/unauthenticated':
      return 'Sie müssen angemeldet sein, um Nährwerte zu berechnen.';
    case 'functions/deadline-exceeded':
      return 'Die Berechnung hat zu lange gedauert. Bitte versuchen Sie es erneut.';
    case 'functions/resource-exhausted':
      return 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.';
    case 'functions/internal':
      return 'Fehler beim Abrufen der Nährwertdaten. Bitte versuchen Sie es erneut.';
    default:
      return msg || 'Fehler beim Berechnen der Nährwerte. Bitte versuchen Sie es erneut.';
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
