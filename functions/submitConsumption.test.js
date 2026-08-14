const test = require('node:test');
const assert = require('node:assert/strict');

const {_internal} = require('./submitConsumption');

test('gebindeZuLiter berechnet Liter aus der Gebindegroesse der Event-Berechnung', () => {
  const gebinde = {bier: {eingekauft: 10, uebrig: 4}};
  const event = {
    berechnung: {
      ergebnis: [
        {kategorie: 'bier', isCustomDrink: true, drinkLabel: 'Bitburger', gebindeGroesseLiter: 0.5},
      ],
    },
  };
  const result = _internal.gebindeZuLiter(gebinde, event);
  assert.equal(result.bier, 3);
});

test('gebindeZuLiter faellt fuer Custom-Drinks auf die Gebindegroesse aus der Event-Berechnung zurueck', () => {
  const gebinde = {
    customDrink1: {eingekauft: 6, uebrig: 2},
  };
  const event = {
    berechnung: {
      ergebnis: [
        {kategorie: 'customDrink1', isCustomDrink: true, drinkLabel: 'Mineralwasser', gebindeGroesseLiter: 1.5},
      ],
    },
  };
  const result = _internal.gebindeZuLiter(gebinde, event);
  assert.equal(result.customDrink1, 6);
});

test('gebindeZuLiter ueberspringt Kategorien ohne bekannte Gebindegroesse', () => {
  const gebinde = {unbekannt: {eingekauft: 3, uebrig: 1}};
  const result = _internal.gebindeZuLiter(gebinde, {});
  assert.deepEqual(result, {});
});

test('gebindeZuLiter behandelt fehlenden/negativen Verbrauch als 0', () => {
  const gebinde = {bier: {eingekauft: 2, uebrig: 5}};
  const event = {
    berechnung: {
      ergebnis: [
        {kategorie: 'bier', isCustomDrink: true, drinkLabel: 'Bitburger', gebindeGroesseLiter: 0.5},
      ],
    },
  };
  const result = _internal.gebindeZuLiter(gebinde, event);
  assert.equal(result.bier, 0);
});

test('buildKalibrierungsSnapshot liefert null ohne event.berechnung', () => {
  const result = _internal.buildKalibrierungsSnapshot({}, {});
  assert.equal(result, null);
});

test('buildKalibrierungsSnapshot uebernimmt Rahmendaten und Soll-Werte explizit aus event.berechnung', () => {
  const event = {
    guests: {adults: 20, children: 3},
    season: 'sommer',
    startTime: '16:00',
    durationHours: 5,
    eventType: 'grillfest',
    berechnung: {
      saisonFaktor: 1.3,
      zeitFaktor: 0.92,
      dauerFaktor: 1.0,
      gesamtbedarfErwachseneLiter: 65,
      gesamtbedarfKinderLiter: 5.25,
      ergebnis: [
        {
          kategorie: 'bierDrink1', drinkKategorie: 'bier', isCustomDrink: true,
          gebindeGroesseLiter: 0.5, literOhnePuffer: 20,
        },
        // Kategorie-Zeile ohne Gebinde (keine erfasste Ist-Menge) -- darf nicht auftauchen.
        {kategorie: 'wein', literOhnePuffer: 10},
      ],
    },
  };
  const literGemessen = {bierDrink1: 18};

  const result = _internal.buildKalibrierungsSnapshot(event, literGemessen);

  assert.deepEqual(result, {
    adults: 20,
    children: 3,
    season: 'sommer',
    startTime: '16:00',
    hours: 5,
    eventType: 'grillfest',
    seasonFactor: 1.3,
    timeFactor: 0.92,
    durationFactor: 1.0,
    guestPreferencesActive: false,
    totalBeverageCalculated: 65,
    childrenTotalBeverageCalculated: 5.25,
    kategorien: [
      {rowKategorie: 'bierDrink1', drinkKategorie: 'bier', sollLiter: 20, istLiter: 18},
    ],
  });
});

test('buildKalibrierungsSnapshot setzt guestPreferencesActive, wenn Praeferenz-Multiplikatoren aktiv waren', () => {
  const event = {
    guests: {adults: 4, children: 0},
    guestPreferenceMultipliers: {perGuest: [{preferredCategoryIds: ['bier'], preferenceFactor: 0.6}]},
    berechnung: {ergebnis: []},
  };
  const result = _internal.buildKalibrierungsSnapshot(event, {});
  assert.equal(result.guestPreferencesActive, true);
});
