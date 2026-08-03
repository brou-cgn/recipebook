/**
 * Startwerte, Anpassungsfaktoren und Formel-Bausteine fuer die
 * Getraenkekalkulation fuer Events.
 *
 * Das sind KEINE gemessenen Werte, sondern konservative Startpunkte, die
 * durch die Kalibrierung (submitConsumption) pro Nutzer ueberschrieben
 * werden, sobald echte Event-Daten vorliegen.
 */

// Gesamter Getraenkebedarf pro Person und Stunde (alle Kategorien zusammen).
// Ergibt z.B. 2 Liter fuer 1 Person bei 4 Stunden Veranstaltung (Uebergangszeit).
const BASE_RATE_PER_PERSON_PER_HOUR = 0.5;

// Gesamter Getraenkebedarf pro Kind und Stunde (alle Kategorien zusammen).
const CHILDREN_BASE_RATE_PER_PERSON_PER_HOUR = 0.35;

// Liter pro Person pro Stunde (bzw. pauschal, siehe modus).
const DEFAULT_RATES = {
  wasser: {
    erwachsene: 0.20, kinder: 0.15,
    gebindeLiter: 1.0, gebindeName: '1L-Flasche', modus: 'stunde',
  },
  softdrinks: {
    erwachsene: 0.15, kinder: 0.25,
    gebindeLiter: 1.0, gebindeName: '1L-Flasche', modus: 'stunde',
  },
  saft: {
    erwachsene: 0.10, kinder: 0.20,
    gebindeLiter: 1.0, gebindeName: '1L-Flasche', modus: 'stunde',
  },
  bier: {
    erwachsene: 0.25, kinder: 0.0,
    gebindeLiter: 0.5, gebindeName: '0,5L-Flasche', modus: 'stunde', anteilTrinker: 0.5,
  },
  bier_alkoholfrei: {
    erwachsene: 0.25, kinder: 0.0,
    gebindeLiter: 0.5, gebindeName: '0,5L-Flasche', modus: 'stunde', anteilTrinker: 0.5,
  },
  wein: {
    erwachsene: 0.10, kinder: 0.0,
    gebindeLiter: 0.75, gebindeName: '0,75L-Flasche', modus: 'stunde', anteilTrinker: 0.3,
  },
  sekt: {
    erwachsene: 0.06, kinder: 0.0,
    gebindeLiter: 0.75, gebindeName: '0,75L-Flasche', modus: 'stunde', anteilTrinker: 0.4,
  },
  spirituosen: {
    erwachsene: 0.02, kinder: 0.0,
    gebindeLiter: 0.7, gebindeName: '0,7L-Flasche', modus: 'stunde', anteilTrinker: 0.25,
  },
  kaffee: {
    erwachsene: 0.30, kinder: 0.0,
    gebindeLiter: 0.0625, gebindeName: 'Tasse (125ml)', modus: 'pauschal',
  },
  tee: {
    erwachsene: 0.15, kinder: 0.05,
    gebindeLiter: 0.2, gebindeName: 'Tasse (200ml)', modus: 'pauschal',
  },
};

const SEASON_FACTORS = {sommer: 1.2, uebergang: 1.0, winter: 0.85};

/**
 * Gewichtungsmatrix fuer Getraenkekategorien.
 * Basis-Gewicht bestimmt den proportionalen Anteil einer Kategorie am
 * Gesamtgetraenkebedarf. Saisonale und Tageszeit-Anpassungen folgen in
 * separaten Tickets.
 */
const DRINK_WEIGHTS = {
  bier: {
    basis: 0.221,
    winter: -0.016,
    sommer: 0.010,
    nachmittag: -0.040,
  },
  bier_alkoholfrei: {
    basis: 0.039,
    winter: -0.002,
    sommer: 0.004,
    nachmittag: 0.005,
  },
  wein: {
    basis: 0.150,
    winter: 0.042,
    sommer: -0.053,
    nachmittag: -0.020,
  },
  softdrinks: {
    basis: 0.260,
    winter: -0.048,
    sommer: 0.056,
    nachmittag: 0.020,
  },
  spirituosen: {
    basis: 0.030,
    winter: 0.005,
    sommer: -0.008,
    nachmittag: -0.015,
  },
  kaffee: {
    basis: 0.090,
    winter: 0.046,
    sommer: -0.039,
    nachmittag: 0.035,
  },
  tee: {
    basis: 0.040,
    winter: 0.025,
    sommer: -0.021,
    nachmittag: 0.015,
  },
  wasser: {
    basis: 0.170,
    winter: -0.051,
    sommer: 0.050,
    nachmittag: 0.000,
  },
};

/**
 * Gibt das Gewicht einer Getraenkekategorie zurueck.
 * Aktuell wird nur die Basis-Gewichtung verwendet; Saison- und Tageszeitanpassungen
 * folgen in einem separaten Ticket.
 * @param {string} category Getraenkekategorie-ID.
 * @param {string} [season] Jahreszeit (sommer/winter/uebergang) -- reserviert fuer spaeteren Einsatz.
 * @param {string} [timeOfDay] Tageszeit (nachmittag) -- reserviert fuer spaeteren Einsatz.
 * @return {number} Gewicht fuer die Kategorie (0 wenn nicht bekannt).
 */
function getDrinkWeight(category, season, timeOfDay) { // eslint-disable-line no-unused-vars
  const entry = DRINK_WEIGHTS[category];
  if (!entry) return 0;
  return entry.basis;
}

/**
 * Gewichtungsmatrix fuer Getraenkekategorien fuer Kinder.
 * Alkohol-Kategorien erhalten Gewicht 0.
 * Die Basis-Gewichte ergeben in Summe 1.0.
 */
const CHILDREN_DRINK_WEIGHTS = {
  bier: {basis: 0.0, winter: 0.0, sommer: 0.0, nachmittag: 0.0},
  bier_alkoholfrei: {basis: 0.0, winter: 0.0, sommer: 0.0, nachmittag: 0.0},
  wein: {basis: 0.0, winter: 0.0, sommer: 0.0, nachmittag: 0.0},
  spirituosen: {basis: 0.0, winter: 0.0, sommer: 0.0, nachmittag: 0.0},
  softdrinks: {basis: 0.280, winter: -0.040, sommer: 0.050, nachmittag: 0.010},
  saft: {basis: 0.320, winter: 0.010, sommer: 0.030, nachmittag: 0.015},
  kaffee: {basis: 0.0, winter: 0.0, sommer: 0.0, nachmittag: 0.0},
  tee: {basis: 0.030, winter: 0.030, sommer: -0.010, nachmittag: 0.010},
  wasser: {basis: 0.370, winter: -0.020, sommer: 0.060, nachmittag: -0.005},
};

/**
 * Gibt das Kinder-Gewicht einer Getraenkekategorie zurueck.
 * Aktuell wird nur die Basis-Gewichtung verwendet; Saison- und Tageszeitanpassungen
 * folgen in einem separaten Ticket.
 * @param {string} category Getraenkekategorie-ID.
 * @param {string} [season] Jahreszeit (sommer/winter/uebergang) -- reserviert fuer spaeteren Einsatz.
 * @param {string} [timeOfDay] Tageszeit (nachmittag) -- reserviert fuer spaeteren Einsatz.
 * @return {number} Kinder-Gewicht fuer die Kategorie (0 wenn nicht bekannt).
 */
function getChildrenDrinkWeight(category, season, timeOfDay) { // eslint-disable-line no-unused-vars
  const entry = CHILDREN_DRINK_WEIGHTS[category];
  if (!entry) return 0;
  return entry.basis;
}

const EVENT_TYPE_FACTORS = {
  familienfeier: {},
  party: {bier: 1.3, wein: 1.15, sekt: 1.2, spirituosen: 1.5, wasser: 1.1},
  kaffeeundkuchen: {kaffee: 1.6, tee: 1.4, wasser: 0.8, bier: 0.5, wein: 0.6},
  grillfest: {bier: 1.25, wasser: 1.15, softdrinks: 1.15},
  sportuebertragung: {bier: 1.4, softdrinks: 1.1, spirituosen: 1.2},
};

/**
 * Bei Events > 6h sinkt die Rate pro Stunde leicht (Saettigungseffekt),
 * min. Faktor 0.75.
 * @param {number} hours Dauer des Events in Stunden.
 * @return {number} Multiplikator.
 */
function durationFactor(hours) {
  if (hours <= 6) return 1.0;
  const extra = hours - 6;
  return Math.max(0.75, 1.0 - 0.03 * extra);
}

module.exports = {DEFAULT_RATES, SEASON_FACTORS, EVENT_TYPE_FACTORS, durationFactor, BASE_RATE_PER_PERSON_PER_HOUR, DRINK_WEIGHTS, getDrinkWeight, CHILDREN_BASE_RATE_PER_PERSON_PER_HOUR, CHILDREN_DRINK_WEIGHTS, getChildrenDrinkWeight};
