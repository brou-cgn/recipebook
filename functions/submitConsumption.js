const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const {DEFAULT_RATES, SEASON_FACTORS, EVENT_TYPE_FACTORS, durationFactor} = require('./drinkRates');

/**
 * Rundet auf 2 Nachkommastellen.
 * @param {number} n Zahl.
 * @return {number} Gerundete Zahl.
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Rundet auf 4 Nachkommastellen.
 * @param {number} n Zahl.
 * @return {number} Gerundete Zahl.
 */
function round4(n) {
  return Math.round(n * 10000) / 10000;
}

/**
 * Rechnet aus "eingekauft minus uebrig" (in Gebinden) den tatsaechlichen
 * Verbrauch in Litern pro Kategorie.
 * @param {object} gebinde { kategorie: { eingekauft, uebrig } }
 * @param {object} ratesDb Rate-DB fuer Gebindegroessen.
 * @return {object} { kategorie: literGemessen }
 */
function gebindeZuLiter(gebinde, ratesDb) {
  const result = {};
  for (const [cat, {eingekauft, uebrig}] of Object.entries(gebinde)) {
    const entry = ratesDb[cat];
    if (!entry || !entry.gebindeLiter) continue;
    const verbrauchtGebinde = Math.max((eingekauft || 0) - (uebrig || 0), 0);
    result[cat] = verbrauchtGebinde * entry.gebindeLiter;
  }
  return result;
}

/**
 * Rechnet aus dem gemessenen Gesamtverbrauch einer Kategorie die implizite
 * Rate (Liter pro trinkendem Erwachsenen pro Stunde bzw. pauschal) zurueck,
 * unter denselben Saison-/Event-Typ-/Dauer-Anpassungen wie bei der
 * Vorwaerts-Berechnung, damit die Rate wieder "roh" gespeichert wird.
 * @param {string} cat Kategorie.
 * @param {number} literGemessen Gemessener Gesamtverbrauch.
 * @param {object} event Event-Dokument.
 * @param {object} ratesDb Aktuelle Rate-DB.
 * @return {?number} Implizite Rate oder null wenn nicht berechenbar.
 */
function impliedRate(cat, literGemessen, event, ratesDb) {
  const adults = event.guests?.adults || 0;
  const children = event.guests?.children || 0;
  const hours = event.durationHours;
  const seasonFactor = SEASON_FACTORS[event.season] ?? 1.0;
  const typeFactor = (EVENT_TYPE_FACTORS[event.eventType] || {})[cat] ?? 1.0;
  const durFactor = durationFactor(hours);
  const entry = ratesDb[cat] || DEFAULT_RATES[cat];
  if (!entry) return null;

  const anteilTrinker = entry.anteilTrinker ?? 1.0;
  const modus = entry.modus || 'stunde';
  const rateKinderAlt = entry.kinder || 0;

  let literKinderGeschaetzt;
  let nenner;
  if (modus === 'pauschal') {
    literKinderGeschaetzt = children * rateKinderAlt * seasonFactor;
    nenner = adults * anteilTrinker * seasonFactor * typeFactor;
  } else {
    literKinderGeschaetzt = children * rateKinderAlt * hours * durFactor;
    nenner = adults * anteilTrinker * hours * seasonFactor * typeFactor * durFactor;
  }

  const literErwachsene = Math.max(literGemessen - literKinderGeschaetzt, 0);
  if (nenner <= 0) return null;
  return literErwachsene / nenner;
}

/**
 * Callable: submitConsumption({ eventId, gebinde })
 * - eventId: ID des Event-Dokuments (muss existieren und berechnet sein)
 * - gebinde: { kategorie: { eingekauft: <Anzahl>, uebrig: <Anzahl> } }
 *   in Gebinde-Einheiten (Flaschen/Kisten/Tassen je nach Kategorie)
 * Aktualisiert users/{uid}/erfahrungswerte/* per gewichtetem Durchschnitt
 * und setzt den Event-Status auf "verbrauchErfasst".
 * Gibt eine Zusammenfassung der Aenderungen zurueck.
 */
exports.submitConsumption = onCall({maxInstances: 10}, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login erforderlich.');
  }
  const uid = request.auth.uid;
  const {eventId, gebinde} = request.data || {};

  if (!eventId || !gebinde) {
    throw new HttpsError('invalid-argument', 'eventId und gebinde sind erforderlich.');
  }

  const db = admin.firestore();
  const eventRef = db.collection('users').doc(uid).collection('events').doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) {
    throw new HttpsError('not-found', 'Event nicht gefunden.');
  }
  const event = eventSnap.data();

  const erfahrungswerteRef = db.collection('users').doc(uid).collection('erfahrungswerte');
  const ratesSnap = await erfahrungswerteRef.get();
  const ratesDb = JSON.parse(JSON.stringify(DEFAULT_RATES));
  ratesSnap.forEach((doc) => {
    ratesDb[doc.id] = {...(ratesDb[doc.id] || {}), ...doc.data()};
  });

  const literGemessen = gebindeZuLiter(gebinde, ratesDb);

  const changes = [];
  const batch = db.batch();

  for (const [cat, liter] of Object.entries(literGemessen)) {
    const alteEntry = ratesDb[cat] || DEFAULT_RATES[cat];
    if (!alteEntry) continue;
    const alteRate = alteEntry.erwachsene;
    const nEvents = alteEntry._nEvents || 0;

    const neueImpliziteRate = impliedRate(cat, liter, event, ratesDb);
    if (neueImpliziteRate === null) continue;

    const neueRate = (alteRate * nEvents + neueImpliziteRate) / (nEvents + 1);

    const docRef = erfahrungswerteRef.doc(cat);
    batch.set(docRef, {
      ...alteEntry,
      erwachsene: round4(neueRate),
      _nEvents: nEvents + 1,
    }, {merge: true});

    changes.push({
      kategorie: cat,
      alteRateProErwStunde: round4(alteRate),
      neueRateProErwStunde: round4(neueRate),
      beobachteteLiter: round2(liter),
      anzahlEventsGesamt: nEvents + 1,
    });
  }

  batch.set(eventRef, {
    status: 'verbrauchErfasst',
    istVerbrauch: literGemessen,
    istVerbrauchEingegeben: gebinde,
  }, {merge: true});

  await batch.commit();

  return {eventId, changes};
});

exports._internal = {gebindeZuLiter, impliedRate};
