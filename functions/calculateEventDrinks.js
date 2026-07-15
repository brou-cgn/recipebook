const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const {DEFAULT_RATES, SEASON_FACTORS, EVENT_TYPE_FACTORS, durationFactor} = require('./drinkRates');

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
 * Rundet auf 2 Nachkommastellen.
 * @param {number} n Zahl.
 * @return {number} Gerundete Zahl.
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Reine Berechnungsfunktion, kein Firestore-Zugriff -- leicht testbar.
 * @param {object} event Event-Parameter (eventName, durationHours, guests, season,
 *   eventType, categories, pufferProzent).
 * @param {object} ratesDb Rate-Datenbank (Default + ggf. Erfahrungswerte).
 * @return {object} Ergebnis pro Kategorie + Warnungen.
 */
function calculate(event, ratesDb) {
  const adults = event.guests?.adults || 0;
  const children = event.guests?.children || 0;
  const hours = event.durationHours;
  const seasonFactor = SEASON_FACTORS[event.season] ?? 1.0;
  const typeFactors = EVENT_TYPE_FACTORS[event.eventType] || {};
  const puffer = (event.pufferProzent ?? 12) / 100;
  const durFactor = durationFactor(hours);
  const categories = event.categories || Object.keys(DEFAULT_RATES);

  const ergebnis = [];
  const warnungen = [];

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
    const typeFactor = typeFactors[cat] ?? 1.0;
    const modus = entry.modus || 'stunde';

    let literErwachsene;
    let literKinder;
    if (modus === 'pauschal') {
      literErwachsene = adults * anteilTrinker * entry.erwachsene * seasonFactor * typeFactor;
      literKinder = children * (entry.kinder || 0) * seasonFactor;
    } else {
      literErwachsene =
          adults * anteilTrinker * entry.erwachsene * hours * seasonFactor * typeFactor * durFactor;
      literKinder = children * (entry.kinder || 0) * hours * durFactor;
    }

    const literGesamt = literErwachsene + literKinder;
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
    });
  }

  return {
    eventName: event.eventName || 'Event',
    gaeste: {erwachsene: adults, kinder: children},
    dauerStunden: hours,
    saisonFaktor: seasonFactor,
    eventTyp: event.eventType,
    pufferProzent: event.pufferProzent ?? 12,
    ergebnis,
    warnungen,
  };
}

/**
 * Callable: calculateEventDrinks({ eventId?, event })
 * - event: Parameter-Objekt (eventName, date, durationHours, guests, season,
 *   eventType, categories, pufferProzent)
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
  const ratesDb = await loadRatesDb(db, uid);
  const result = calculate(event, ratesDb);

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
exports._internal = {calculate};
