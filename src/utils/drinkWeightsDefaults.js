/**
 * Standard-Startwerte fuer die Getraenke-Gewichtungsmatrizen (Erwachsene +
 * Kinder). Spiegelt DRINK_WEIGHTS / CHILDREN_DRINK_WEIGHTS aus
 * functions/drinkRates.js -- das ist die einzige Quelle der Wahrheit fuer
 * diese Werte. Sie dienen hier nur als Vorbelegung, solange fuer eine
 * Kategorie noch kein Firestore-Dokument existiert (siehe drinkWeightsFirestore.js).
 */

export const DEFAULT_DRINK_WEIGHTS = {
  bier: {
    parent: null,
    basis: 0.221, winter: -0.016, sommer: 0.010, nachmittag: -0.040,
  },
  bier_alkoholfrei: {
    parent: 'bier',
    basis: 0.039, winter: -0.002, sommer: 0.004, nachmittag: 0.005,
  },
  wein: {
    parent: null,
    basis: 0.137, winter: 0.042, sommer: -0.053, nachmittag: -0.020,
  },
  sekt: {
    parent: null,
    basis: 0.015, winter: 0.010, sommer: -0.008, nachmittag: -0.006,
  },
  softdrinks: {
    parent: null,
    basis: 0.260, winter: -0.048, sommer: 0.056, nachmittag: 0.020,
  },
  saft: {
    parent: null,
    basis: 0.025, winter: -0.005, sommer: 0.006, nachmittag: 0.002,
  },
  spirituosen: {
    parent: null,
    basis: 0.011, winter: 0.007, sommer: -0.010, nachmittag: -0.010,
  },
  longdrinks: {
    parent: 'spirituosen',
    basis: 0.017, winter: -0.002, sommer: 0.002, nachmittag: -0.005,
  },
  kaffee: {
    parent: null,
    basis: 0.083, winter: 0.046, sommer: -0.039, nachmittag: 0.035,
  },
  tee: {
    parent: null,
    basis: 0.037, winter: 0.025, sommer: -0.021, nachmittag: 0.015,
  },
  wasser: {
    parent: null,
    basis: 0.155, winter: -0.051, sommer: 0.050, nachmittag: 0.000,
  },
};

export const DEFAULT_CHILDREN_DRINK_WEIGHTS = {
  bier: { parent: null, basis: 0.0, winter: 0.0, sommer: 0.0, nachmittag: 0.0 },
  bier_alkoholfrei: { parent: 'bier', basis: 0.0, winter: 0.0, sommer: 0.0, nachmittag: 0.0 },
  wein: { parent: null, basis: 0.0, winter: 0.0, sommer: 0.0, nachmittag: 0.0 },
  sekt: { parent: null, basis: 0.0, winter: 0.0, sommer: 0.0, nachmittag: 0.0 },
  spirituosen: { parent: null, basis: 0.0, winter: 0.0, sommer: 0.0, nachmittag: 0.0 },
  longdrinks: { parent: 'spirituosen', basis: 0.0, winter: 0.0, sommer: 0.0, nachmittag: 0.0 },
  softdrinks: { parent: null, basis: 0.280, winter: -0.040, sommer: 0.050, nachmittag: 0.010 },
  saft: { parent: null, basis: 0.320, winter: 0.010, sommer: 0.030, nachmittag: 0.015 },
  kaffee: { parent: null, basis: 0.0, winter: 0.0, sommer: 0.0, nachmittag: 0.0 },
  tee: { parent: null, basis: 0.030, winter: 0.030, sommer: -0.010, nachmittag: 0.010 },
  wasser: { parent: null, basis: 0.370, winter: -0.020, sommer: 0.060, nachmittag: -0.005 },
};

// Reihenfolge der Kategorien fuer die Anzeige in der Admin-Tabelle -- spiegelt
// die Reihenfolge in functions/drinkRates.js. Die Kategorien selbst sind fest
// (siehe DRINK_CATEGORY_PARENTS in functions/calculateEventDrinks.js) und
// koennen ueber die Admin-Oberflaeche nicht hinzugefuegt oder geloescht werden.
export const DRINK_WEIGHT_CATEGORY_ORDER = Object.keys(DEFAULT_DRINK_WEIGHTS);
