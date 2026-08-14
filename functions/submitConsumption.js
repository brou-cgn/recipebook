const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const {DRINK_WEIGHTS} = require('./drinkRates');

/**
 * Rechnet aus "eingekauft minus uebrig" (in Gebinden) den tatsaechlichen
 * Verbrauch in Litern pro Kategorie. Fuer benutzerdefinierte Getraenke gibt es
 * keinen Eintrag in DRINK_WEIGHTS (das ist nur nach den festen Standard-
 * Kategorien indiziert) -- dafuer wird die Gebindegroesse aus der Event-
 * Berechnung (event.berechnung.ergebnis[].gebindeGroesseLiter) verwendet.
 * @param {object} gebinde { kategorie: { eingekauft, uebrig } }
 * @param {object} ratesDb Rate-DB fuer Gebindegroessen.
 * @param {object} event Event-Dokument (fuer Custom-Drink-Gebindegroessen).
 * @return {object} { kategorie: literGemessen }
 */
function gebindeZuLiter(gebinde, ratesDb, event) {
  const gebindeLiterAusBerechnung = {};
  (event?.berechnung?.ergebnis || []).forEach((row) => {
    if (row.kategorie && Number.isFinite(row.gebindeGroesseLiter) && row.gebindeGroesseLiter > 0) {
      gebindeLiterAusBerechnung[row.kategorie] = row.gebindeGroesseLiter;
    }
  });

  const result = {};
  for (const [cat, {eingekauft, uebrig}] of Object.entries(gebinde)) {
    const gebindeLiter = ratesDb[cat]?.gebindeLiter || gebindeLiterAusBerechnung[cat];
    if (!gebindeLiter) continue;
    const verbrauchtGebinde = Math.max((eingekauft || 0) - (uebrig || 0), 0);
    result[cat] = verbrauchtGebinde * gebindeLiter;
  }
  return result;
}

/**
 * Prueft, ob fuer alle Getraenke-Kategorien eines Events die "Verbraucht/Uebrig"-Menge
 * gesperrt (also final erfasst) ist. Nur dann darf der Event-Status auf
 * "verbrauchErfasst" gesetzt werden.
 * @param {object} event Event-Dokument.
 * @param {object} verbrauchGesperrt Aktuelle (bzw. gemergte) Sperren-Map { kategorie: wert }.
 * @return {boolean} true, wenn alle relevanten Kategorien gesperrt sind.
 */
function alleGetraenkeVerbrauchGesperrt(event, verbrauchGesperrt) {
  const kategorien = (event.berechnung?.ergebnis || [])
      .filter((row) => (row.isCustomDrink || row.isPredefinedDrink) && row.gebindeGroesseLiter);
  if (kategorien.length === 0) return false;
  return kategorien.every((row) =>
    Object.prototype.hasOwnProperty.call(verbrauchGesperrt || {}, row.kategorie));
}

/**
 * Callable: submitConsumption({ eventId, gebinde })
 * - eventId: ID des Event-Dokuments (muss existieren und berechnet sein)
 * - gebinde: { kategorie: { eingekauft: <Anzahl>, uebrig: <Anzahl> } }
 *   in Gebinde-Einheiten (Flaschen/Kisten/Tassen je nach Kategorie)
 * Speichert den tatsaechlichen Verbrauch am Event und setzt den Event-Status
 * erst dann auf "verbrauchErfasst", wenn fuer ALLE Getraenke des Events die
 * Verbraucht/Uebrig-Menge gesperrt ist.
 */
exports.submitConsumption = onCall({maxInstances: 10}, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login erforderlich.');
  }
  const uid = request.auth.uid;
  const {eventId, gebinde, verbrauchGesperrtKategorien} = request.data || {};

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

  const literGemessen = gebindeZuLiter(gebinde, DRINK_WEIGHTS, event);

  const batch = db.batch();

  const eventUpdate = {
    istVerbrauch: literGemessen,
    istVerbrauchEingegeben: gebinde,
  };
  // Die vom Client mitgesendeten, gerade gesperrten Kategorien werden mit dem
  // in Firestore gespeicherten Stand vereinigt, damit ein noch nicht
  // durchgeschriebener Sperren-Aufruf (Race Condition beim automatischen
  // Absenden nach dem letzten Sperren) den Status nicht faelschlich blockiert.
  const verbrauchGesperrt = {...(event.verbrauchGesperrt || {})};
  (verbrauchGesperrtKategorien || []).forEach((kategorie) => {
    verbrauchGesperrt[kategorie] = true;
  });
  if (alleGetraenkeVerbrauchGesperrt(event, verbrauchGesperrt)) {
    eventUpdate.status = 'verbrauchErfasst';
  }
  batch.set(eventRef, eventUpdate, {merge: true});

  await batch.commit();

  return {eventId};
});

exports._internal = {gebindeZuLiter, alleGetraenkeVerbrauchGesperrt};
