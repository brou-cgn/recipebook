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
