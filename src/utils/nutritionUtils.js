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
