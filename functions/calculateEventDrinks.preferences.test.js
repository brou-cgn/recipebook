const test = require('node:test');
const assert = require('node:assert/strict');

const {_internal} = require('./calculateEventDrinks');
const {DEFAULT_RATES} = require('./drinkRates');

test('calculate applies guest preference multipliers per category', () => {
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 2,
        guests: {adults: 10, children: 0},
        season: 'sommer',
        eventType: 'party',
        categories: ['wein', 'wasser'],
        customDrinkIds: [],
        pufferProzent: 0,
        guestPreferenceMultipliers: {wein: 0.5, wasser: 1},
      },
      DEFAULT_RATES,
      {},
  );

  const wein = result.ergebnis.find((item) => item.kategorie === 'wein');
  const wasser = result.ergebnis.find((item) => item.kategorie === 'wasser');

  assert.ok(wein);
  assert.ok(wasser);
  assert.equal(wein.praeferenzFaktor, 0.5);
  assert.equal(wasser.praeferenzFaktor, null);
  assert.ok(wein.literMitPuffer < wasser.literMitPuffer);
});

test('calculate normalizes configured custom drink unit labels for legacy entries', () => {
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 2,
        guests: {adults: 10, children: 0},
        season: 'sommer',
        eventType: 'party',
        categories: [],
        customDrinkIds: ['drink-1'],
        pufferProzent: 0,
      },
      DEFAULT_RATES,
      {
        'drink-1': {
          name: 'Pittermännchen Kölsch',
          gebindeLiter: 5,
          gebindeName: '5L-Fass',
          erwachsene: 0.25,
          kinder: 0,
          modus: 'stunde',
          anteilTrinker: 1,
        },
      },
  );

  const customDrink = result.ergebnis.find((item) => item.kategorie === 'drink-1');

  assert.ok(customDrink);
  assert.equal(customDrink.gebinde, '5,0 l (Pittermännchen)');
});

test('calculate includes new-model custom drinks with einheiten in results with null liter values', () => {
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 20, children: 5},
        season: 'sommer',
        eventType: 'party',
        categories: [],
        customDrinkIds: ['craft-bier'],
        pufferProzent: 0,
      },
      DEFAULT_RATES,
      {
        'craft-bier': {
          name: 'Craft-Bier',
          einheiten: [
            {einheitsgroesse: 0.5, gebindeinheit: 'Flasche', einheitenProGebinde: 1},
            {einheitsgroesse: 0.5, gebindeinheit: 'Kasten', einheitenProGebinde: 24},
          ],
        },
      },
  );

  const craftBier = result.ergebnis.find((item) => item.kategorie === 'craft-bier');

  assert.ok(craftBier);
  assert.equal(craftBier.drinkLabel, 'Craft-Bier');
  assert.equal(craftBier.isCustomDrink, true);
  assert.equal(craftBier.literOhnePuffer, null);
  assert.equal(craftBier.literMitPuffer, null);
  assert.equal(craftBier.anzahlGebinde, null);
  assert.equal(craftBier.gebinde, 'Flasche');
  assert.equal(craftBier.gebindeGroesseLiter, 0.5);
  assert.deepEqual(craftBier.einheiten, [
    {einheitsgroesse: 0.5, gebindeinheit: 'Flasche', einheitenProGebinde: 1},
    {einheitsgroesse: 0.5, gebindeinheit: 'Kasten', einheitenProGebinde: 24},
  ]);
});

test('calculate uses pre-estimate defaults and exposes them in the result when no categories are selected', () => {
  const result = _internal.calculate(
      {
        eventName: 'Sommerfest',
        durationHours: 4,
        guests: {adults: 10, children: 2},
        season: 'sommer',
        eventType: 'familienfeier',
        categories: [],
        customDrinkIds: [],
        pufferProzent: 0,
      },
      DEFAULT_RATES,
      {},
  );

  assert.deepEqual(result.preEstimate.startTime, '12:00');
  assert.deepEqual(result.preEstimate.endTime, '16:00');
  assert.equal(result.preEstimate.excludedCategories.length, 0);

  const wasser = result.ergebnis.find((item) => item.kategorie === 'wasser');
  const saft = result.ergebnis.find((item) => item.kategorie === 'saft');

  assert.ok(wasser);
  assert.ok(saft);
  assert.equal(wasser.ratenQuelle, 'vorabschaetzung');
  assert.equal(wasser.literOhnePuffer, result.preEstimate.categories.wasser);
  assert.equal(wasser.preEstimateLiter, result.preEstimate.categories.wasser);
  assert.equal(saft.ratenQuelle, 'standard-faustwert');
});

test('calculate derives excluded categories and keeps calibrated rates over pre-estimates', () => {
  const result = _internal.calculate(
      {
        eventName: 'Abendessen',
        durationHours: 3,
        startTime: '17:30',
        guests: {adults: 10, children: 0},
        season: 'winter',
        eventType: 'familienfeier',
        categories: ['wasser', 'sekt'],
        customDrinkIds: [],
        pufferProzent: 0,
      },
      {
        ...DEFAULT_RATES,
        wasser: {
          ...DEFAULT_RATES.wasser,
          erwachsene: 0.5,
          _nEvents: 3,
        },
      },
      {},
  );

  const wasser = result.ergebnis.find((item) => item.kategorie === 'wasser');
  const sekt = result.ergebnis.find((item) => item.kategorie === 'sekt');

  assert.deepEqual(result.preEstimate.startTime, '17:30');
  assert.deepEqual(result.preEstimate.endTime, '20:30');
  assert.deepEqual(result.preEstimate.excludedCategories.sort(), [
    'bier',
    'kaffee',
    'softdrinks',
    'spirituosen',
    'tee',
    'wein',
  ]);
  assert.deepEqual(Object.keys(result.preEstimate.categories), ['wasser']);
  assert.ok(wasser);
  assert.ok(sekt);
  assert.equal(wasser.ratenQuelle, 'erfahrungswert');
  assert.equal(wasser.literOhnePuffer, 12.75);
  assert.notEqual(wasser.literOhnePuffer, result.preEstimate.categories.wasser);
  assert.equal(sekt.ratenQuelle, 'standard-faustwert');
});
