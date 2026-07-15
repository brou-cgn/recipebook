/**
 * Startwerte, Anpassungsfaktoren und Formel-Bausteine fuer die
 * Getraenkekalkulation fuer Events.
 *
 * Das sind KEINE gemessenen Werte, sondern konservative Startpunkte, die
 * durch die Kalibrierung (submitConsumption) pro Nutzer ueberschrieben
 * werden, sobald echte Event-Daten vorliegen.
 */

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

module.exports = {DEFAULT_RATES, SEASON_FACTORS, EVENT_TYPE_FACTORS, durationFactor};
