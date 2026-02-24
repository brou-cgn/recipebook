/**
 * Maps a Firebase callable function error to a user-facing German error message.
 * @param {Error} err - The error thrown by a Firebase httpsCallable call.
 * @returns {string} A descriptive German error message.
 */
export function mapNutritionCalcError(err) {
  switch (err.code) {
    case 'functions/unauthenticated':
      return 'Sie müssen angemeldet sein, um Nährwerte zu berechnen.';
    case 'functions/unavailable':
      return 'Der Berechnungsservice ist momentan nicht verfügbar. Bitte versuchen Sie es später erneut.';
    case 'functions/deadline-exceeded':
      return 'Die Berechnung hat zu lange gedauert. Bitte versuchen Sie es erneut.';
    case 'functions/resource-exhausted':
      return 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.';
    case 'functions/internal':
      return 'Interner Fehler beim Berechnen der Nährwerte. Bitte versuchen Sie es später erneut.';
    default:
      return err.message || 'Fehler beim Berechnen der Nährwerte. Bitte versuchen Sie es erneut.';
  }
}
