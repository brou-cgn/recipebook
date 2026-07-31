const test = require('node:test');
const assert = require('node:assert/strict');

const {calculateDrinkAmounts, _internal} = require('./calculateDrinkAmounts');
const {DRINK_WEIGHT_CATEGORIES} = require('./drinkWeights');

const KATEGORIEN = Object.keys(DRINK_WEIGHT_CATEGORIES);

/**
 * Summiert die Werte eines Gewichte-Objekts.
 * @param {object} weights Gewichte je Kategorie.
 * @return {number} Summe.
 */
function sum(weights) {
  return Object.values(weights).reduce((a, b) => a + b, 0);
}

test('effektive Gewichte (Saison + Nachmittag, vor Redistribution) summieren auf 1,0', () => {
  for (const season of ['winter', 'uebergang', 'sommer']) {
    const {nachmittag, abend} = _internal.computeEffectiveWeights(season);
    assert.ok(Math.abs(sum(nachmittag) - 1) < 1e-9, `nachmittag/${season}`);
    assert.ok(Math.abs(sum(abend) - 1) < 1e-9, `abend/${season}`);
  }
});

test('Gewichte summieren nach Redistribution weiterhin auf 1,0', () => {
  const {nachmittag} = _internal.computeEffectiveWeights('sommer');
  const verteilt = _internal.redistributeWeights(nachmittag, ['wein', 'tee']);
  assert.equal(Object.keys(verteilt).length, KATEGORIEN.length - 2);
  assert.ok(Math.abs(sum(verteilt) - 1) < 1e-9);
});

test('Rechenbeispiel 15-21 Uhr: 3h Nachmittag, 3h Abend', () => {
  const {vorher, nachher} = _internal.splitHoursByTippingPoint(15, 21, 18);
  assert.equal(vorher, 3);
  assert.equal(nachher, 3);
});

test('Event komplett vor 18 Uhr: nur Nachmittagsstunden', () => {
  const {vorher, nachher} = _internal.splitHoursByTippingPoint(10, 14, 18);
  assert.equal(vorher, 4);
  assert.equal(nachher, 0);
});

test('Event komplett nach 18 Uhr: nur Abendstunden', () => {
  const {vorher, nachher} = _internal.splitHoursByTippingPoint(19, 23, 18);
  assert.equal(vorher, 0);
  assert.equal(nachher, 4);
});

test('Event ueber Mitternacht hinaus: Stunden werden ueber beide Tage korrekt aufgeteilt', () => {
  // 22:00 - 02:00 -> 22-24 Uhr (abend, 2h) + 00-02 Uhr naechster Tag (vor 18 Uhr, 2h)
  const {vorher, nachher} = _internal.splitHoursByTippingPoint(22, 2, 18);
  assert.equal(vorher, 2);
  assert.equal(nachher, 2);
});

test('Redistribution: eine Kategorie ausschliessen, Gewicht gleichmaessig auf die restlichen 6 verteilt', () => {
  const {abend} = _internal.computeEffectiveWeights('uebergang');
  const bierGewichtVorher = abend.bier;
  const verteilt = _internal.redistributeWeights(abend, ['bier']);
  const erwarteteZusatz = bierGewichtVorher / (KATEGORIEN.length - 1);
  for (const kategorie of KATEGORIEN.filter((k) => k !== 'bier')) {
    assert.ok(Math.abs(verteilt[kategorie] - (abend[kategorie] + erwarteteZusatz)) < 1e-9);
  }
  assert.equal(verteilt.bier, undefined);
});

test('Grenzfall: alle Kategorien bis auf eine ausgeschlossen -> verbleibende bekommt Gewicht 1,0', () => {
  const {abend} = _internal.computeEffectiveWeights('winter');
  const ausgeschlossen = KATEGORIEN.filter((k) => k !== 'wasser');
  const verteilt = _internal.redistributeWeights(abend, ausgeschlossen);
  assert.deepEqual(Object.keys(verteilt), ['wasser']);
  assert.ok(Math.abs(verteilt.wasser - 1) < 1e-9);
});

test('Leere excludedCategories: keine Redistribution noetig, Gewichte unveraendert', () => {
  const {nachmittag} = _internal.computeEffectiveWeights('sommer');
  const verteilt = _internal.redistributeWeights(nachmittag, []);
  assert.deepEqual(verteilt, nachmittag);
});

test('calculateDrinkAmounts: liefert fuer jede angebotene Kategorie eine Literangabe', () => {
  const ergebnis = calculateDrinkAmounts({
    guests: 20,
    startTime: '15:00',
    endTime: '21:00',
    season: 'sommer',
  });

  assert.equal(Object.keys(ergebnis).length, KATEGORIEN.length);
  for (const kategorie of KATEGORIEN) {
    assert.ok(ergebnis[kategorie] > 0, kategorie);
  }

  // Kontrolle Gesamtmenge: Basiswert * Gesamtgewicht(1.0 je Fenster) * Stunden * Gaeste,
  // aufgeteilt auf 3h Nachmittag + 3h Abend.
  const gesamt = Object.values(ergebnis).reduce((a, b) => a + b, 0);
  const erwartet = 0.5 * 1 * 3 * 20 + 0.5 * 1 * 3 * 20;
  assert.ok(Math.abs(gesamt - erwartet) < 1e-9);
});

test('calculateDrinkAmounts: ausgeschlossene Kategorien tauchen nicht im Ergebnis auf', () => {
  const ergebnis = calculateDrinkAmounts({
    guests: 10,
    startTime: '18:00',
    endTime: '22:00',
    season: 'winter',
    excludedCategories: ['spirituosen', 'tee'],
  });

  assert.equal(Object.keys(ergebnis).length, KATEGORIEN.length - 2);
  assert.equal(ergebnis.spirituosen, undefined);
  assert.equal(ergebnis.tee, undefined);
});
