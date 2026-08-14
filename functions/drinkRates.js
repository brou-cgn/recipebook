/**
 * Startwerte, Anpassungsfaktoren und Formel-Bausteine fuer die
 * Getraenkekalkulation fuer Events.
 *
 * Das sind KEINE gemessenen Werte, sondern konservative Startpunkte.
 */

// Gesamter Getraenkebedarf pro Person und Stunde (alle Kategorien zusammen).
// Ergibt z.B. 2 Liter fuer 1 Person bei 4 Stunden Veranstaltung (Uebergangszeit).
const BASE_RATE_PER_PERSON_PER_HOUR = 0.5;

// Gesamter Getraenkebedarf pro Kind und Stunde (alle Kategorien zusammen).
const CHILDREN_BASE_RATE_PER_PERSON_PER_HOUR = 0.35;

const SEASON_FACTORS = {sommer: 1.3, uebergang: 1.0, winter: 0.85};

// Uhrzeit-Grenze: Stunden vor 18 Uhr gelten als "tagsueber" und werden
// geringer gewichtet (weniger Konsum als am Abend).
const TIME_FACTOR_BOUNDARY_HOUR = 18;
const TIME_FACTOR_BEFORE_BOUNDARY = 0.8;

/**
 * Berechnet den Zeitfaktor eines Events aus Startuhrzeit und Dauer.
 * Der SEASON_FACTOR wird zuerst auf den Gesamtbedarf angewendet, danach
 * zusaetzlich dieser Zeitfaktor: Stunden vor 18:00 Uhr zaehlen mit
 * TIME_FACTOR_BEFORE_BOUNDARY (0.8), Stunden ab 18:00 Uhr mit 1.0. Der
 * zurueckgegebene Wert ist der stundengewichtete Mittelwert ueber die
 * gesamte Event-Dauer. Ohne bekannte Startuhrzeit laesst sich der Anteil
 * nicht bestimmen -- dann wird 1.0 (keine Anpassung) zurueckgegeben.
 * @param {string} [startTime] Startuhrzeit im Format "HH:MM".
 * @param {number} hours Dauer des Events in Stunden.
 * @return {number} Multiplikator zwischen TIME_FACTOR_BEFORE_BOUNDARY und 1.0.
 */
function timeFactor(startTime, hours) {
  if (!startTime || !hours || hours <= 0) return 1.0;
  const match = /^(\d{1,2}):(\d{2})$/.exec(startTime);
  if (!match) return 1.0;
  const startHour = Number(match[1]) + Number(match[2]) / 60;
  if (!Number.isFinite(startHour)) return 1.0;

  const hoursBeforeBoundary = Math.min(
      Math.max(TIME_FACTOR_BOUNDARY_HOUR - startHour, 0),
      hours,
  );
  const hoursAfterBoundary = hours - hoursBeforeBoundary;
  return (hoursBeforeBoundary * TIME_FACTOR_BEFORE_BOUNDARY + hoursAfterBoundary * 1.0) / hours;
}

/**
 * Gewichtungsmatrix fuer Getraenkekategorien.
 * Basis-Gewicht bestimmt den proportionalen Anteil einer Kategorie am
 * Gesamtgetraenkebedarf. `winter`/`sommer` sind additive Verschiebungen auf
 * `basis`, die in getDrinkWeight() fuer die jeweilige Saison angewendet
 * werden (uebergang bleibt bei `basis`, ohne Delta). Je Saison summieren
 * sich die Deltas ueber alle Kategorien auf ~0, sodass die Gesamtsumme aller
 * Gewichte weiterhin ~1.0 ergibt. `nachmittag` ist bislang nicht verdrahtet
 * (keine Aufrufstelle uebergibt timeOfDay) und bleibt reserviert.
 *
 * `parent` verweist auf den Key der uebergeordneten Kategorie (oder null bei
 * Top-Level-Kategorien) und ist die Referenz-Quelle fuer alle Eltern/Kind-
 * Beziehungen im Getraenke-Modell (siehe getWeightSubcategoryParents(),
 * getParentTotal() sowie DRINK_CATEGORY_PARENTS in calculateEventDrinks.js).
 * Gebindegroessen fuer Einkauf/Verbrauch kommen ausschliesslich von den
 * einzelnen Getraenken (deren `einheiten`), nicht mehr aus dieser Matrix.
 *
 * bier_alkoholfrei (85/15-Split von "bier") und longdrinks (40/60-Split von
 * "spirituosen") sind beides ungeprueft geschaetzte Aufteilungen ohne
 * Kalibrierungsgrundlage und sollten nachgeschaerft werden, sobald genug
 * Erfahrungswerte aus echten Events vorliegen.
 */
const DRINK_WEIGHTS = {
  bier: {
    parent: null,
    basis: 0.221,
    winter: -0.016,
    sommer: 0.010,
    nachmittag: -0.040,
  },
  bier_alkoholfrei: {
    parent: 'bier',
    basis: 0.039,
    winter: -0.002,
    sommer: 0.004,
    nachmittag: 0.005,
  },
  wein: {
    parent: null,
    basis: 0.137,
    winter: 0.042,
    sommer: -0.053,
    nachmittag: -0.020,
  },
  sekt: {
    parent: null,
    basis: 0.015,
    winter: 0.010,
    sommer: -0.008,
    nachmittag: -0.006,
  },
  softdrinks: {
    parent: null,
    basis: 0.260,
    winter: -0.048,
    sommer: 0.056,
    nachmittag: 0.020,
  },
  saft: {
    parent: null,
    basis: 0.025,
    winter: -0.005,
    sommer: 0.006,
    nachmittag: 0.002,
  },
  spirituosen: {
    parent: null,
    basis: 0.011,
    winter: 0.007,
    sommer: -0.010,
    nachmittag: -0.010,
  },
  longdrinks: {
    parent: 'spirituosen',
    basis: 0.017,
    winter: -0.002,
    sommer: 0.002,
    nachmittag: -0.005,
  },
  kaffee: {
    parent: null,
    basis: 0.083,
    winter: 0.046,
    sommer: -0.039,
    nachmittag: 0.035,
  },
  tee: {
    parent: null,
    basis: 0.037,
    winter: 0.025,
    sommer: -0.021,
    nachmittag: 0.015,
  },
  wasser: {
    parent: null,
    basis: 0.155,
    winter: -0.051,
    sommer: 0.050,
    nachmittag: 0.000,
  },
};

/**
 * Leitet aus DRINK_WEIGHTS eine Map von Subkategorie-Key auf Elternkategorie-Key ab.
 * Einzige Quelle der Wahrheit fuer Eltern/Kind-Beziehungen mit eigenem Budget
 * (Kategorien mit parent: null werden nicht aufgenommen).
 * @return {object} Subkategorie-Key -> Elternkategorie-Key.
 */
function getWeightSubcategoryParents() {
  const result = {};
  for (const [key, entry] of Object.entries(DRINK_WEIGHTS)) {
    if (entry.parent) result[key] = entry.parent;
  }
  return result;
}

/**
 * Summiert fuer eine Elternkategorie deren eigenen Betrag plus die Betraege
 * aller Subkategorien (basierend auf DRINK_WEIGHTS.parent). Fuer Ansichten,
 * die keine Subkategorie-Granularitaet benoetigen (z.B. Einkaufslisten:
 * "wie viel Bier insgesamt", alkoholisch + alkoholfrei).
 * @param {object} categoryAmounts Map von Kategorie-Key -> Betrag (z.B. Liter).
 * @param {string} parentKey Key der Elternkategorie.
 * @return {number} Summe aus Elternkategorie-Betrag und allen Subkategorie-Betraegen.
 */
function getParentTotal(categoryAmounts, parentKey) {
  if (!categoryAmounts || !parentKey) return 0;
  let total = Number(categoryAmounts[parentKey]) || 0;
  for (const [key, entry] of Object.entries(DRINK_WEIGHTS)) {
    if (entry.parent === parentKey && categoryAmounts[key] !== undefined) {
      total += Number(categoryAmounts[key]) || 0;
    }
  }
  return total;
}

/**
 * Gibt das Gewicht einer Getraenkekategorie zurueck.
 * Bei season 'sommer'/'winter' wird das jeweilige Delta additiv auf die
 * Basis-Gewichtung angewendet (uebergang/unbekannt -> nur Basis). Das
 * Ergebnis wird bei 0 gekappt, falls ein Delta die Basis rechnerisch
 * unterschreiten wuerde. Tageszeitanpassungen (timeOfDay) sind noch nicht
 * verdrahtet -- keine Aufrufstelle uebergibt sie derzeit -- und bleiben
 * fuer ein separates Ticket reserviert.
 * @param {string} category Getraenkekategorie-ID.
 * @param {string} [season] Jahreszeit (sommer/winter/uebergang).
 * @param {string} [timeOfDay] Tageszeit (nachmittag) -- reserviert fuer spaeteren Einsatz.
 * @return {number} Gewicht fuer die Kategorie (0 wenn nicht bekannt).
 */
function getDrinkWeight(category, season, timeOfDay, weightsTable = DRINK_WEIGHTS) { // eslint-disable-line no-unused-vars
  const entry = weightsTable[category];
  if (!entry) return 0;
  const seasonDelta = (season === 'sommer' || season === 'winter') ? entry[season] : 0;
  return Math.max(0, entry.basis + seasonDelta);
}

/**
 * Gewichtungsmatrix fuer Getraenkekategorien fuer Kinder.
 * Alkohol-Kategorien erhalten Gewicht 0.
 * Die Basis-Gewichte ergeben in Summe 1.0.
 */
const CHILDREN_DRINK_WEIGHTS = {
  bier: {parent: null, basis: 0.0, winter: 0.0, sommer: 0.0, nachmittag: 0.0},
  bier_alkoholfrei: {parent: 'bier', basis: 0.0, winter: 0.0, sommer: 0.0, nachmittag: 0.0},
  wein: {parent: null, basis: 0.0, winter: 0.0, sommer: 0.0, nachmittag: 0.0},
  sekt: {parent: null, basis: 0.0, winter: 0.0, sommer: 0.0, nachmittag: 0.0},
  spirituosen: {parent: null, basis: 0.0, winter: 0.0, sommer: 0.0, nachmittag: 0.0},
  longdrinks: {parent: 'spirituosen', basis: 0.0, winter: 0.0, sommer: 0.0, nachmittag: 0.0},
  softdrinks: {parent: null, basis: 0.280, winter: -0.040, sommer: 0.050, nachmittag: 0.010},
  saft: {parent: null, basis: 0.320, winter: 0.010, sommer: 0.030, nachmittag: 0.015},
  kaffee: {parent: null, basis: 0.0, winter: 0.0, sommer: 0.0, nachmittag: 0.0},
  tee: {parent: null, basis: 0.030, winter: 0.030, sommer: -0.010, nachmittag: 0.010},
  wasser: {parent: null, basis: 0.370, winter: -0.020, sommer: 0.060, nachmittag: -0.005},
};

/**
 * Gibt das Kinder-Gewicht einer Getraenkekategorie zurueck.
 * Wendet wie getDrinkWeight() das saisonale Delta additiv auf die
 * Basis-Gewichtung an (uebergang/unbekannt -> nur Basis), gekappt bei 0.
 * Tageszeitanpassungen (timeOfDay) sind noch nicht verdrahtet.
 * @param {string} category Getraenkekategorie-ID.
 * @param {string} [season] Jahreszeit (sommer/winter/uebergang).
 * @param {string} [timeOfDay] Tageszeit (nachmittag) -- reserviert fuer spaeteren Einsatz.
 * @return {number} Kinder-Gewicht fuer die Kategorie (0 wenn nicht bekannt).
 */
function getChildrenDrinkWeight(category, season, timeOfDay, weightsTable = CHILDREN_DRINK_WEIGHTS) { // eslint-disable-line no-unused-vars
  const entry = weightsTable[category];
  if (!entry) return 0;
  const seasonDelta = (season === 'sommer' || season === 'winter') ? entry[season] : 0;
  return Math.max(0, entry.basis + seasonDelta);
}

/**
 * Laedt die admin-editierbare Erwachsenen-Gewichtungsmatrix aus Firestore
 * (Collection 'drinkWeights', Dokument-ID = Kategorie) und mischt sie ueber
 * die hartcodierten Startwerte aus DRINK_WEIGHTS (Firestore-Feld gewinnt pro
 * Kategorie, wo vorhanden). Unbekannte Dokument-IDs (keine Entsprechung in
 * DRINK_WEIGHTS) werden ignoriert, da Kategorien strukturell fest sind.
 * @param {object} db Firestore-Instanz.
 * @return {Promise<object>} Gewichtungsmatrix, Kategorie -> Werte.
 */
async function loadDrinkWeightsFromFirestore(db) {
  const weights = JSON.parse(JSON.stringify(DRINK_WEIGHTS)); // deep copy
  const snap = await db.collection('drinkWeights').get();
  snap.forEach((doc) => {
    const cat = doc.id;
    if (weights[cat]) weights[cat] = {...weights[cat], ...doc.data()};
  });
  return weights;
}

/**
 * Laedt die admin-editierbare Kinder-Gewichtungsmatrix aus Firestore
 * (Collection 'drinkWeightsChildren'), analog zu loadDrinkWeightsFromFirestore().
 * @param {object} db Firestore-Instanz.
 * @return {Promise<object>} Kinder-Gewichtungsmatrix, Kategorie -> Werte.
 */
async function loadChildrenDrinkWeightsFromFirestore(db) {
  const weights = JSON.parse(JSON.stringify(CHILDREN_DRINK_WEIGHTS)); // deep copy
  const snap = await db.collection('drinkWeightsChildren').get();
  snap.forEach((doc) => {
    const cat = doc.id;
    if (weights[cat]) weights[cat] = {...weights[cat], ...doc.data()};
  });
  return weights;
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

module.exports = {SEASON_FACTORS, EVENT_TYPE_FACTORS, durationFactor, TIME_FACTOR_BOUNDARY_HOUR, TIME_FACTOR_BEFORE_BOUNDARY, timeFactor, BASE_RATE_PER_PERSON_PER_HOUR, DRINK_WEIGHTS, getDrinkWeight, getWeightSubcategoryParents, getParentTotal, CHILDREN_BASE_RATE_PER_PERSON_PER_HOUR, CHILDREN_DRINK_WEIGHTS, getChildrenDrinkWeight, loadDrinkWeightsFromFirestore, loadChildrenDrinkWeightsFromFirestore};
