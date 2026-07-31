/**
 * Kategorie-Gewichte fuer die Getraenke-Vorab-Schaetzung
 * (siehe calculateDrinkAmounts.js).
 *
 * Dies ist ein eigenstaendiges Gewichtungsmodell (Kategorie-Anteil an der
 * Gesamtmenge), unabhaengig von den absoluten L/Person/Stunde-Faustwerten
 * in drinkRates.js. Es dient als schnelle Vorab-Schaetzung, auf die die
 * spaetere Kalibrierung aus Realdaten (siehe submitConsumption.js /
 * calculateEventDrinks.js) aufsetzt -- beide Pfade bleiben getrennt.
 */

// Referenzklima Uebergangszeit (~15-20 Grad), Basiswert siehe calculateDrinkAmounts.js.
const BASISWERT_LITER_PRO_PERSON_STUNDE = 0.5;

// Kipppunkt der Tageszeit-Stufenfunktion (Stunden vor 18 Uhr = "Nachmittag").
const TAGESZEIT_KIPPPUNKT_STUNDE = 18;

/**
 * Basis-Gewicht je Kategorie (Summe = 1,0) sowie Deltas fuer Winter, Sommer
 * und Nachmittagsstunden. Die Delta-Spalten muessen sich jeweils exakt zu
 * 0,000 aufsummieren (Kontrollsumme), damit die effektiven Gewichte nach
 * Korrektur weiterhin 1,0 ergeben.
 *
 * Hinweis: In der Vorlage summierten sich Winter- und Sommer-Spalte auf
 * +0,001 bzw. -0,001 statt 0 (Rundungsfehler der Ausgangsdaten). Das
 * deltaWinter/deltaSommer von "wasser" wurde daher um 0,001 korrigiert
 * (-0,051 -> -0,052 bzw. +0,050 -> +0,051), alle anderen Werte sind
 * unveraendert aus der Vorgabe uebernommen.
 */
const DRINK_WEIGHT_CATEGORIES = {
  bier: {basis: 0.260, deltaWinter: -0.018, deltaSommer: 0.014, deltaNachmittag: -0.035},
  wein: {basis: 0.150, deltaWinter: 0.042, deltaSommer: -0.053, deltaNachmittag: -0.020},
  softdrinks: {basis: 0.260, deltaWinter: -0.048, deltaSommer: 0.056, deltaNachmittag: 0.020},
  spirituosen: {basis: 0.030, deltaWinter: 0.005, deltaSommer: -0.008, deltaNachmittag: -0.015},
  kaffee: {basis: 0.090, deltaWinter: 0.046, deltaSommer: -0.039, deltaNachmittag: 0.035},
  tee: {basis: 0.040, deltaWinter: 0.025, deltaSommer: -0.021, deltaNachmittag: 0.015},
  wasser: {basis: 0.170, deltaWinter: -0.052, deltaSommer: 0.051, deltaNachmittag: 0.000},
};

module.exports = {
  BASISWERT_LITER_PRO_PERSON_STUNDE,
  TAGESZEIT_KIPPPUNKT_STUNDE,
  DRINK_WEIGHT_CATEGORIES,
};
