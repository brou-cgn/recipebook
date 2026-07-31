const {
  BASISWERT_LITER_PRO_PERSON_STUNDE,
  TAGESZEIT_KIPPPUNKT_STUNDE,
  DRINK_WEIGHT_CATEGORIES,
} = require('./drinkWeights');

/**
 * Parst "HH:MM" in Dezimalstunden.
 * @param {string} time Uhrzeit im Format "HH:MM".
 * @return {number} Stunden seit Mitternacht (dezimal).
 */
function parseTimeToHours(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours + minutes / 60;
}

/**
 * Teilt die Eventdauer an einem taeglich wiederkehrenden Kipppunkt
 * (z.B. 18 Uhr) in "vorher"- und "nachher"-Stunden auf. Reine
 * Stufenfunktion, kein gradueller Uebergang.
 *
 * Liegt endHours <= startHours, wird das Event als ueber Mitternacht
 * hinausgehend behandelt (Ende + 24h). Bei mehrtaegigen Events wird der
 * Kipppunkt fuer jeden ueberstrichenen Tag erneut angewendet.
 * @param {number} startHours Start in Dezimalstunden.
 * @param {number} endHours Ende in Dezimalstunden (vor Mitternachts-Korrektur).
 * @param {number} tippingHour Taeglicher Kipppunkt in Dezimalstunden.
 * @return {{vorher: number, nachher: number}} Aufsummierte Stunden je Fenster.
 */
function splitHoursByTippingPoint(startHours, endHours, tippingHour) {
  const end = endHours <= startHours ? endHours + 24 : endHours;

  let vorher = 0;
  let nachher = 0;
  let cursor = startHours;
  while (cursor < end) {
    const dayStart = Math.floor(cursor / 24) * 24;
    const tipToday = dayStart + tippingHour;
    if (cursor < tipToday) {
      const segmentEnd = Math.min(end, tipToday);
      vorher += segmentEnd - cursor;
      cursor = segmentEnd;
    } else {
      const segmentEnd = Math.min(end, dayStart + 24);
      nachher += segmentEnd - cursor;
      cursor = segmentEnd;
    }
  }
  return {vorher, nachher};
}

/**
 * Ermittelt das saisonale Delta einer Kategorie.
 * @param {object} entry Eintrag aus DRINK_WEIGHT_CATEGORIES.
 * @param {string} season "winter" | "uebergang" | "sommer".
 * @return {number} Delta.
 */
function seasonDelta(entry, season) {
  if (season === 'winter') return entry.deltaWinter;
  if (season === 'sommer') return entry.deltaSommer;
  return 0; // uebergang: kein Delta
}

/**
 * Berechnet die effektiven Gewichte je Kategorie fuer Nachmittags- und
 * Abendstunden getrennt (Basis + Saison-Delta [+ Nachmittags-Delta]).
 * @param {string} season "winter" | "uebergang" | "sommer".
 * @return {{nachmittag: object, abend: object}} Gewichte je Kategorie.
 */
function computeEffectiveWeights(season) {
  const nachmittag = {};
  const abend = {};
  for (const [kategorie, entry] of Object.entries(DRINK_WEIGHT_CATEGORIES)) {
    const basisPlusSaison = entry.basis + seasonDelta(entry, season);
    abend[kategorie] = basisPlusSaison;
    nachmittag[kategorie] = basisPlusSaison + entry.deltaNachmittag;
  }
  return {nachmittag, abend};
}

/**
 * Verteilt das Gewicht nicht angebotener Kategorien gleichmaessig auf die
 * verbleibenden Kategorien (flat, nicht anteilig gewichtet).
 * @param {object} weights Gewichte je Kategorie (bereits saison-/tageszeitkorrigiert).
 * @param {string[]} excludedCategories Nicht angebotene Kategorien.
 * @return {object} Gewichte der verbleibenden Kategorien nach Redistribution.
 */
function redistributeWeights(weights, excludedCategories) {
  const remaining = Object.keys(weights).filter((k) => !excludedCategories.includes(k));
  if (remaining.length === 0) {
    throw new Error('Mindestens eine Kategorie muss angeboten werden.');
  }

  const excludedSum = Object.keys(weights)
      .filter((k) => excludedCategories.includes(k))
      .reduce((sum, k) => sum + weights[k], 0);
  const zusatzgewicht = excludedSum / remaining.length;

  const result = {};
  for (const kategorie of remaining) {
    result[kategorie] = weights[kategorie] + zusatzgewicht;
  }
  return result;
}

/**
 * Vorab-Schaetzung des Getraenkebedarfs je Kategorie, basierend auf
 * Kategorie-Gewichten mit Saison-/Tageszeit-Korrektur und Redistribution
 * bei Kategorie-Wegfall (siehe drinkWeights.js).
 *
 * Ersetzt NICHT die Kalibrierung aus Realdaten (calculateEventDrinks.js /
 * submitConsumption.js) -- dies ist die Vorab-Schaetzung, auf die jene
 * Kalibrierung aufsetzt.
 * @param {object} params Parameter.
 * @param {number} params.guests Anzahl Gaeste.
 * @param {string} params.startTime Start des Events, "HH:MM".
 * @param {string} params.endTime Ende des Events, "HH:MM".
 * @param {string} params.season "winter" | "uebergang" | "sommer".
 * @param {string[]} [params.excludedCategories] Nicht angebotene Kategorien.
 * @param {number} [params.baseLitersPerHour] Basiswert L/Person/Stunde.
 * @return {object} Menge in Litern je angebotener Kategorie.
 */
function calculateDrinkAmounts({
  guests,
  startTime,
  endTime,
  season,
  excludedCategories = [],
  baseLitersPerHour = BASISWERT_LITER_PRO_PERSON_STUNDE,
}) {
  const startHours = parseTimeToHours(startTime);
  const endHours = parseTimeToHours(endTime);
  const {vorher: nachmittagStunden, nachher: abendStunden} =
      splitHoursByTippingPoint(startHours, endHours, TAGESZEIT_KIPPPUNKT_STUNDE);

  const {nachmittag, abend} = computeEffectiveWeights(season);
  const nachmittagVerteilt = redistributeWeights(nachmittag, excludedCategories);
  const abendVerteilt = redistributeWeights(abend, excludedCategories);

  const ergebnis = {};
  for (const kategorie of Object.keys(abendVerteilt)) {
    const literNachmittag =
        baseLitersPerHour * nachmittagVerteilt[kategorie] * nachmittagStunden * guests;
    const literAbend = baseLitersPerHour * abendVerteilt[kategorie] * abendStunden * guests;
    ergebnis[kategorie] = literNachmittag + literAbend;
  }
  return ergebnis;
}

module.exports = {
  calculateDrinkAmounts,
  _internal: {
    parseTimeToHours,
    splitHoursByTippingPoint,
    computeEffectiveWeights,
    redistributeWeights,
  },
};
