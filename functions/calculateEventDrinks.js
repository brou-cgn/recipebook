const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const {DEFAULT_RATES, SEASON_FACTORS, EVENT_TYPE_FACTORS, durationFactor, BASE_RATE_PER_PERSON_PER_HOUR} = require('./drinkRates');

/**
 * Laedt die kalibrierten Erfahrungswerte eines Nutzers und mischt sie mit
 * den Startwerten (Erfahrungswert gewinnt pro Kategorie, wo vorhanden).
 * @param {object} db Firestore-Instanz.
 * @param {string} uid Firebase-Nutzer-ID.
 * @return {Promise<object>} Rate-DB, Kategorie -> Werte.
 */
async function loadRatesDb(db, uid) {
  const ratesDb = JSON.parse(JSON.stringify(DEFAULT_RATES)); // deep copy
  const snap = await db.collection('users').doc(uid).collection('erfahrungswerte').get();
  snap.forEach((doc) => {
    const cat = doc.id;
    ratesDb[cat] = {...(ratesDb[cat] || {}), ...doc.data()};
  });
  return ratesDb;
}

/**
 * Laedt die benutzerdefinierten Getraenke eines Nutzers aus Firestore.
 * @param {object} db Firestore-Instanz.
 * @param {string} uid Firebase-Nutzer-ID.
 * @param {string[]} drinkIds IDs der gewuenschten Getraenke.
 * @return {Promise<object>} Map von drinkId -> Getraenke-Definition.
 */
async function loadCustomDrinks(db, uid, drinkIds) {
  if (!drinkIds || drinkIds.length === 0) return {};
  const result = {};
  await Promise.all(
      drinkIds.map(async (id) => {
        const snap = await db.collection('users').doc(uid).collection('customDrinks').doc(id).get();
        if (snap.exists) {
          result[id] = snap.data();
        }
      }),
  );
  return result;
}

/**
 * Rundet auf 2 Nachkommastellen.
 * @param {number} n Zahl.
 * @return {number} Gerundete Zahl.
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Normalisiert den konfigurierten Pufferwert. Gibt 0 zurueck, wenn kein Wert angegeben ist.
 * @param {number|string|null|undefined} value Konfigurierter Puffer in Prozent.
 * @return {number}
 */
function normalizePufferProzent(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

/**
 * Clamp value to [0, 1], fallback 1 for invalid values.
 * @param {number} value Candidate multiplier.
 * @return {number}
 */
function normalizeMultiplier(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Map von Unterkategorie-ID auf uebergeordnete Kategorie-ID.
 * Spiegelt die Hierarchie aus drinkCategories.js (src) wider.
 */
const DRINK_CATEGORY_PARENTS = {
  bier_koelsch: 'bier',
  bier_pils: 'bier',
  bier_weizen: 'bier',
  bier_alkoholfrei: 'bier',
  wein_weisswein: 'wein',
  wein_rose: 'wein',
  wein_rotwein: 'wein',
};

/**
 * Liefert die uebergeordnete Kategorie-ID, falls vorhanden; sonst die ID selbst.
 * @param {string} kategorieId Getränke-Kategorie-ID.
 * @return {string}
 */
function resolveTopLevelCategory(kategorieId) {
  return DRINK_CATEGORY_PARENTS[kategorieId] || kategorieId;
}

/**
 * Liefert die vereinheitlichte Gebindebezeichnung fuer pflegbare Standardgroessen.
 * @param {number} liters Gebindegroesse in Litern.
 * @return {string|null}
 */
function getConfiguredUnitLabel(liters) {
  const value = Number(liters);
  if (!Number.isFinite(value) || value <= 0) return null;

  if (value === 0.2) return '200 ml';
  if (value === 0.33) return '330 ml';
  if (value === 0.5) return '500 ml';
  if (value === 0.75) return '750 ml';
  if (value === 1) return '1,0 l';
  if (value === 1.5) return '1,5 l';
  if (value === 2) return '2,0 l';
  if (value === 5) return '5,0 l (Pittermännchen)';
  if (value === 10) return '10,0 l (Fässchen)';
  return null;
}

/**
 * Reine Berechnungsfunktion, kein Firestore-Zugriff -- leicht testbar.
 * @param {object} event Event-Parameter (eventName, durationHours, guests, season,
 *   eventType, categories, customDrinkIds, pufferProzent).
 * @param {object} ratesDb Rate-Datenbank (Default + ggf. Erfahrungswerte).
 * @param {object} [customDrinksMap] Map von drinkId -> Getraenke-Definition.
 * @return {object} Ergebnis pro Kategorie + Warnungen.
 */
function calculate(event, ratesDb, customDrinksMap) {
  const adults = event.guests?.adults || 0;
  const children = event.guests?.children || 0;
  const hours = event.durationHours;
  const seasonFactor = SEASON_FACTORS[event.season] ?? 1.0;
  const typeFactors = EVENT_TYPE_FACTORS[event.eventType] || {};
  const pufferProzent = normalizePufferProzent(event.pufferProzent);
  const puffer = pufferProzent / 100;
  const durFactor = durationFactor(hours);
  const categories = Array.isArray(event.categories) && event.categories.length > 0 ?
    event.categories :
    Object.keys(DEFAULT_RATES);
  const customDrinkIds = event.customDrinkIds || [];
  const allCustomDrinks = customDrinksMap || {};
  const guestPreferenceMultipliers = event.guestPreferenceMultipliers || {};

  const ergebnis = [];
  const warnungen = [];

  // --- Step 1: Compute total beverage requirement for the event ---
  // Total = guests x base_rate x hours x season_factor x duration_factor.
  // This single budget is then distributed across selected categories proportionally.
  const totalBeverage =
      (adults + children) * BASE_RATE_PER_PERSON_PER_HOUR * hours * seasonFactor * durFactor;

  // --- Step 2: Compute raw category weights for proportional distribution ---
  // Each category's weight is its expected amount based on the standard/calibrated rate,
  // adjusted by the event-type factor and any guest preference multiplier.
  // The existing rates (erwachsene, anteilTrinker, modus) serve as relative weights only;
  // the absolute total is fixed by BASE_RATE_PER_PERSON_PER_HOUR above.
  const categoryRawWeights = {};
  let totalRawWeight = 0;

  for (const cat of categories) {
    const entry = ratesDb[cat];
    if (!entry) continue;

    const anteilTrinker = entry.anteilTrinker ?? 1.0;
    const typeFactor = typeFactors[cat] ?? 1.0;
    const modus = entry.modus || 'stunde';
    const prefMult = normalizeMultiplier(guestPreferenceMultipliers[cat]);

    let rawAdult;
    let rawChild;
    if (modus === 'pauschal') {
      rawAdult = adults * anteilTrinker * entry.erwachsene * seasonFactor * typeFactor;
      rawChild = children * (entry.kinder || 0) * seasonFactor;
    } else {
      rawAdult =
          adults * anteilTrinker * entry.erwachsene * hours * seasonFactor * typeFactor * durFactor;
      rawChild = children * (entry.kinder || 0) * hours * durFactor;
    }

    const rawWeight = (rawAdult + rawChild) * prefMult;
    categoryRawWeights[cat] = rawWeight;
    totalRawWeight += rawWeight;
  }

  // --- Step 3: Distribute total across selected categories ---
  for (const cat of categories) {
    const entry = ratesDb[cat];
    if (!entry) {
      warnungen.push(
          `Kategorie '${cat}' ist unbekannt -- keine Faustwerte hinterlegt. ` +
          `Bitte manuell schaetzen oder in erfahrungswerte ergaenzen.`,
      );
      continue;
    }

    const anteilTrinker = entry.anteilTrinker ?? 1.0;
    const prefMult = normalizeMultiplier(guestPreferenceMultipliers[cat]);

    const literGesamt = totalRawWeight > 0 ?
        totalBeverage * (categoryRawWeights[cat] / totalRawWeight) :
        0;
    const literMitPuffer = literGesamt * (1 + puffer);
    const anzahlGebinde =
        entry.gebindeLiter ? Math.ceil(literMitPuffer / entry.gebindeLiter) : null;

    ergebnis.push({
      kategorie: cat,
      literOhnePuffer: round2(literGesamt),
      literMitPuffer: round2(literMitPuffer),
      gebinde: entry.gebindeName,
      gebindeGroesseLiter: entry.gebindeLiter,
      anzahlGebinde,
      ratenQuelle: entry._nEvents ? 'erfahrungswert' : 'standard-faustwert',
      anteilTrinkerAngenommen: anteilTrinker !== 1.0 ? anteilTrinker : null,
      praeferenzFaktor: prefMult !== 1 ? prefMult : null,
    });
  }

  // Aufbau der Kategorie-Liter-Map fuer die Verteilung auf Einzelgetraenke.
  const categoryLitersMap = {};
  for (const item of ergebnis) {
    if (!item.isCustomDrink && item.literOhnePuffer !== null) {
      categoryLitersMap[item.kategorie] = {
        literOhnePuffer: item.literOhnePuffer,
        literMitPuffer: item.literMitPuffer,
      };
    }
  }

  // Anzahl der neuen Modell-Getraenke (mit einheiten) pro uebergeordneter Kategorie zaehlen.
  const drinkCountByTopLevelCategory = {};
  for (const drinkId of customDrinkIds) {
    const entry = allCustomDrinks[drinkId];
    if (entry && Array.isArray(entry.einheiten) && entry.einheiten.length > 0 && entry.kategorie) {
      const topCat = resolveTopLevelCategory(entry.kategorie);
      drinkCountByTopLevelCategory[topCat] = (drinkCountByTopLevelCategory[topCat] || 0) + 1;
    }
  }

  // Mengen von Kategorien ohne Getraenke linear auf Kategorien mit Getraenken verteilen.
  const categoriesWithDrinksInMap = Object.keys(drinkCountByTopLevelCategory).filter(
      (cat) => !!categoryLitersMap[cat],
  );
  const categoriesWithoutDrinks = Object.keys(categoryLitersMap).filter(
      (cat) => !drinkCountByTopLevelCategory[cat],
  );
  if (categoriesWithoutDrinks.length > 0 && categoriesWithDrinksInMap.length > 0) {
    const totalOhnePuffer = categoriesWithoutDrinks.reduce(
        (sum, cat) => sum + categoryLitersMap[cat].literOhnePuffer, 0,
    );
    const totalMitPuffer = categoriesWithoutDrinks.reduce(
        (sum, cat) => sum + categoryLitersMap[cat].literMitPuffer, 0,
    );
    const n = categoriesWithDrinksInMap.length;
    const addOhnePuffer = totalOhnePuffer / n;
    const addMitPuffer = totalMitPuffer / n;
    for (const cat of categoriesWithDrinksInMap) {
      categoryLitersMap[cat] = {
        literOhnePuffer: round2(categoryLitersMap[cat].literOhnePuffer + addOhnePuffer),
        literMitPuffer: round2(categoryLitersMap[cat].literMitPuffer + addMitPuffer),
      };
    }
  }

  // --- Custom drinks ---
  for (const drinkId of customDrinkIds) {
    const entry = allCustomDrinks[drinkId];
    if (!entry) {
      warnungen.push(
          `Benutzerdefiniertes Getraenk '${drinkId}' nicht gefunden -- wird uebersprungen.`,
      );
      continue;
    }

    // New model: einheiten array (no rate fields)
    if (Array.isArray(entry.einheiten) && entry.einheiten.length > 0) {
      const firstEinheit = entry.einheiten[0];
      const gebindeLiter = Number(firstEinheit.einheitsgroesse) || null;
      const gebindeName = firstEinheit.gebindeinheit || null;

      // Kategoriebedarfe auf einzelne Getraenke verteilen, falls Kategorie bekannt.
      let literOhnePuffer = null;
      let literMitPuffer = null;
      let anzahlGebinde = null;
      const topCat = entry.kategorie ? resolveTopLevelCategory(entry.kategorie) : null;
      const catLiters = topCat ? categoryLitersMap[topCat] : null;
      if (catLiters) {
        const count = drinkCountByTopLevelCategory[topCat] || 1;
        literOhnePuffer = round2(catLiters.literOhnePuffer / count);
        literMitPuffer = round2(catLiters.literMitPuffer / count);
        if (gebindeLiter) {
          anzahlGebinde = Math.ceil(literMitPuffer / gebindeLiter);
        }
      }

      ergebnis.push({
        kategorie: drinkId,
        drinkLabel: entry.name,
        drinkKategorie: entry.kategorie || null,
        isCustomDrink: true,
        literOhnePuffer,
        literMitPuffer,
        gebinde: gebindeName,
        gebindeGroesseLiter: gebindeLiter,
        anzahlGebinde,
        ratenQuelle: catLiters ? 'kategorie-verteilung' : 'benutzerdefiniert',
        anteilTrinkerAngenommen: null,
        praeferenzFaktor: null,
        einheiten: entry.einheiten,
      });
      continue;
    }

    // Legacy model: rate-based calculation
    const anteilTrinker = entry.anteilTrinker ?? 1.0;
    const modus = entry.modus || 'stunde';

    let literErwachsene;
    let literKinder;
    if (modus === 'pauschal') {
      literErwachsene = adults * anteilTrinker * (entry.erwachsene || 0) * seasonFactor;
      literKinder = children * (entry.kinder || 0) * seasonFactor;
    } else {
      literErwachsene =
          adults * anteilTrinker * (entry.erwachsene || 0) * hours * seasonFactor * durFactor;
      literKinder = children * (entry.kinder || 0) * hours * durFactor;
    }

    const preferenceMultiplier = normalizeMultiplier(guestPreferenceMultipliers[drinkId]);
    const literGesamt = (literErwachsene + literKinder) * preferenceMultiplier;
    const literMitPuffer = literGesamt * (1 + puffer);
    const anzahlGebinde =
        entry.gebindeLiter ? Math.ceil(literMitPuffer / entry.gebindeLiter) : null;

    ergebnis.push({
      kategorie: drinkId,
      drinkLabel: entry.name,
      isCustomDrink: true,
      literOhnePuffer: round2(literGesamt),
      literMitPuffer: round2(literMitPuffer),
      gebinde: getConfiguredUnitLabel(entry.gebindeLiter) || entry.gebindeName,
      gebindeGroesseLiter: entry.gebindeLiter,
      anzahlGebinde,
      ratenQuelle: 'benutzerdefiniert',
      anteilTrinkerAngenommen: anteilTrinker !== 1.0 ? anteilTrinker : null,
      praeferenzFaktor: preferenceMultiplier !== 1 ? preferenceMultiplier : null,
    });
  }

  return {
    eventName: event.eventName || 'Event',
    gaeste: {erwachsene: adults, kinder: children},
    dauerStunden: hours,
    saisonFaktor: seasonFactor,
    eventTyp: event.eventType,
    pufferProzent,
    ergebnis,
    warnungen,
  };
}

/**
 * Callable: calculateEventDrinks({ eventId?, event })
 * - event: Parameter-Objekt (eventName, date, durationHours, guests, season,
 *   eventType, categories, customDrinkIds, pufferProzent)
 * - eventId: falls gesetzt, wird das bestehende Event-Dokument mit dem
 *   Ergebnis aktualisiert (status -> "berechnet"). Sonst wird ein neues
 *   Event-Dokument angelegt.
 * Gibt { eventId, ...Berechnungsergebnis } zurueck.
 */
exports.calculateEventDrinks = onCall({maxInstances: 10}, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login erforderlich.');
  }
  const uid = request.auth.uid;
  const {event, eventId} = request.data || {};

  if (!event || !event.durationHours || !event.guests) {
    throw new HttpsError('invalid-argument', 'event mit durationHours und guests ist erforderlich.');
  }

  const db = admin.firestore();
  const [ratesDb, customDrinksMap] = await Promise.all([
    loadRatesDb(db, uid),
    loadCustomDrinks(db, uid, event.customDrinkIds),
  ]);
  const result = calculate(event, ratesDb, customDrinksMap);

  const eventsRef = db.collection('users').doc(uid).collection('events');
  let docRef;
  if (eventId) {
    docRef = eventsRef.doc(eventId);
    await docRef.set({...event, berechnung: result, status: 'berechnet'}, {merge: true});
  } else {
    docRef = await eventsRef.add({...event, berechnung: result, status: 'berechnet'});
  }

  return {eventId: docRef.id, ...result};
});

// Fuer Unit-Tests (z.B. mit firebase-functions-test) ohne Firestore-Zugriff.
exports._internal = {
  calculate,
  loadCustomDrinks,
  getConfiguredUnitLabel,
  resolveTopLevelCategory,
};
