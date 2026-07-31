const test = require('node:test');
const assert = require('node:assert/strict');

const { _internal } = require('./calculateEventDrinks');
const { DEFAULT_RATES } = require('./drinkRates');

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
