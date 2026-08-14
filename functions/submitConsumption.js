const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

/**
 * Rechnet aus "eingekauft minus uebrig" (in Gebinden) den tatsaechlichen
 * Verbrauch in Litern pro Kategorie. Die Gebindegroesse je Kategorie kommt
 * aus der Event-Berechnung (event.berechnung.ergebnis[].gebindeGroesseLiter),
 * die wiederum von der eigenen Einheit des jeweiligen Getraenks stammt.
 * @param {object} gebinde { kategorie: { eingekauft, uebrig } }
 * @param {object} event Event-Dokument (fuer Custom-Drink-Gebindegroessen).
 * @return {object} { kategorie: literGemessen }
 */
function gebindeZuLiter(gebinde, event) {
  const gebindeLiterAusBerechnung = {};
  (event?.berechnung?.ergebnis || []).forEach((row) => {
    if (row.kategorie && Number.isFinite(row.gebindeGroesseLiter) && row.gebindeGroesseLiter > 0) {
      gebindeLiterAusBerechnung[row.kategorie] = row.gebindeGroesseLiter;
    }
  });

  const result = {};
  for (const [cat, {eingekauft, uebrig}] of Object.entries(gebinde)) {
    const gebindeLiter = gebindeLiterAusBerechnung[cat];
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
 * Baut den Ist-Bedarfs-Snapshot fuer die spaetere Kalibrierung von
 * DRINK_WEIGHTS/BASE_RATE_PER_PERSON_PER_HOUR (Phase 1: reines Sammeln, siehe
 * Konzept "Sammlung von Ist-Bedarfsdaten fuer spaetere Kalibrierung"). Rahmendaten
 * und Soll-Werte werden explizit aus dem zum Berechnungszeitpunkt gespeicherten
 * event.berechnung uebernommen (nicht aus den *aktuellen* Konstanten neu
 * abgeleitet), damit der Snapshot auch nach spaeteren Aenderungen an den
 * Kalkulationskonstanten unabhaengig auswertbar bleibt.
 * @param {object} event Event-Dokument (inkl. berechnung).
 * @param {object} literGemessen Ist-Verbrauch pro Getraenke-Zeile in Litern (siehe gebindeZuLiter).
 * @return {object|null} Snapshot-Dokument, oder null, wenn keine Berechnung vorliegt.
 */
function buildKalibrierungsSnapshot(event, literGemessen) {
  const berechnung = event.berechnung;
  if (!berechnung) return null;

  const kategorien = (berechnung.ergebnis || [])
      .filter((row) => (row.isCustomDrink || row.isPredefinedDrink) && row.gebindeGroesseLiter)
      .map((row) => ({
        rowKategorie: row.kategorie,
        drinkKategorie: row.drinkKategorie || null,
        sollLiter: row.literOhnePuffer ?? null,
        istLiter: literGemessen[row.kategorie] ?? null,
      }));

  const guestPreferencesActive = Array.isArray(event.guestPreferenceMultipliers?.perGuest) &&
      event.guestPreferenceMultipliers.perGuest.length > 0;

  return {
    adults: event.guests?.adults ?? null,
    children: event.guests?.children ?? null,
    season: event.season ?? null,
    startTime: event.startTime ?? null,
    hours: event.durationHours ?? null,
    eventType: event.eventType ?? null,
    seasonFactor: berechnung.saisonFaktor ?? null,
    timeFactor: berechnung.zeitFaktor ?? null,
    durationFactor: berechnung.dauerFaktor ?? null,
    guestPreferencesActive,
    totalBeverageCalculated: berechnung.gesamtbedarfErwachseneLiter ?? null,
    childrenTotalBeverageCalculated: berechnung.gesamtbedarfKinderLiter ?? null,
    kategorien,
  };
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

  const literGemessen = gebindeZuLiter(gebinde, event);

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

    // Phase 1 der Kalibrierung (siehe Konzept): reines Sammeln von
    // Ist-Bedarfsdaten, keine Rueckwirkung auf DRINK_WEIGHTS/BASE_RATE_PER_PERSON_PER_HOUR.
    const snapshot = buildKalibrierungsSnapshot({...event, ...eventUpdate}, literGemessen);
    if (snapshot) {
      const snapshotRef = db.collection('kalibrierungsSnapshots').doc(eventId);
      batch.set(snapshotRef, {
        ...snapshot,
        eventId,
        uid,
        erstelltAm: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
  batch.set(eventRef, eventUpdate, {merge: true});

  await batch.commit();

  return {eventId};
});

exports._internal = {gebindeZuLiter, alleGetraenkeVerbrauchGesperrt, buildKalibrierungsSnapshot};
