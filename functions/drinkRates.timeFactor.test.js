const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SEASON_FACTORS,
  TIME_FACTOR_BOUNDARY_HOUR,
  TIME_FACTOR_BEFORE_BOUNDARY,
  timeFactor,
  BASE_RATE_PER_PERSON_PER_HOUR,
  DRINK_WEIGHTS,
} = require('./drinkRates');
const {_internal} = require('./calculateEventDrinks');

test('SEASON_FACTORS.sommer ist 1.3', () => {
  assert.equal(SEASON_FACTORS.sommer, 1.3);
});

test('TIME_FACTOR_BOUNDARY_HOUR ist 18, TIME_FACTOR_BEFORE_BOUNDARY ist 0.8', () => {
  assert.equal(TIME_FACTOR_BOUNDARY_HOUR, 18);
  assert.equal(TIME_FACTOR_BEFORE_BOUNDARY, 0.8);
});

test('timeFactor gibt 1.0 zurueck, wenn keine Startuhrzeit bekannt ist', () => {
  assert.equal(timeFactor(undefined, 4), 1.0);
  assert.equal(timeFactor('', 4), 1.0);
  assert.equal(timeFactor(null, 4), 1.0);
});

test('timeFactor gibt 1.0 zurueck, wenn keine Dauer bekannt ist', () => {
  assert.equal(timeFactor('14:00', 0), 1.0);
  assert.equal(timeFactor('14:00', undefined), 1.0);
});

test('timeFactor gibt 0.8 zurueck, wenn das gesamte Event vor 18:00 endet', () => {
  // 14:00 - 17:00 (3h), komplett vor 18 Uhr
  assert.ok(Math.abs(timeFactor('14:00', 3) - TIME_FACTOR_BEFORE_BOUNDARY) < 1e-9);
});

test('timeFactor gibt 1.0 zurueck, wenn das gesamte Event ab 18:00 startet', () => {
  // 19:00 - 22:00 (3h), komplett ab 18 Uhr
  assert.equal(timeFactor('19:00', 3), 1.0);
  // Start genau um 18:00
  assert.equal(timeFactor('18:00', 4), 1.0);
});

test('timeFactor gewichtet Events, die die 18-Uhr-Grenze ueberschreiten, anteilig', () => {
  // 16:00 - 20:00 (4h): 2h vor 18 Uhr (Faktor 0.8), 2h ab 18 Uhr (Faktor 1.0)
  // erwartet: (2*0.8 + 2*1.0) / 4 = 0.9
  const result = timeFactor('16:00', 4);
  assert.ok(Math.abs(result - 0.9) < 1e-9, `erwartet 0.9, erhalten ${result}`);
});

test('calculate wendet SEASON_FACTOR und TIME_FACTOR multiplikativ auf den Gesamtbedarf an', () => {
  // 10 Erwachsene, 4 Stunden, sommer (1.3), Start 14:00 (komplett vor 18 Uhr -> 0.8)
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 10, children: 0},
        season: 'sommer',
        startTime: '14:00',
        eventType: 'familienfeier',
        categories: ['wasser'],
        customDrinkIds: [],
        pufferProzent: 0,
      },
      DRINK_WEIGHTS,
      {},
  );

  const wasser = result.ergebnis.find((item) => item.kategorie === 'wasser');
  const expectedTotal = 10 * BASE_RATE_PER_PERSON_PER_HOUR * 4 *
      SEASON_FACTORS.sommer * TIME_FACTOR_BEFORE_BOUNDARY;

  assert.ok(wasser, 'wasser vorhanden');
  assert.equal(result.zeitFaktor, TIME_FACTOR_BEFORE_BOUNDARY);
  assert.equal(result.saisonFaktor, SEASON_FACTORS.sommer);
  assert.ok(
      Math.abs(wasser.literOhnePuffer - expectedTotal) < 0.05,
      `Gesamtbedarf sollte ~${expectedTotal} L sein, ist ${wasser.literOhnePuffer} L`,
  );
});

test('calculate wendet TIME_FACTOR nicht an, wenn keine Startuhrzeit gesetzt ist', () => {
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 10, children: 0},
        season: 'sommer',
        eventType: 'familienfeier',
        categories: ['wasser'],
        customDrinkIds: [],
        pufferProzent: 0,
      },
      DRINK_WEIGHTS,
      {},
  );

  assert.equal(result.zeitFaktor, 1.0);
});
