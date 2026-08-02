const test = require('node:test');
const assert = require('node:assert/strict');

const {_internal} = require('./calculateEventDrinks');
const {DEFAULT_RATES, BASE_RATE_PER_PERSON_PER_HOUR, DRINK_WEIGHTS} = require('./drinkRates');

function roundTo2(value) {
  return Math.round(value * 100) / 100;
}

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

test('calculate uses the event-specific puffer percentage instead of a fixed buffer', () => {
  const withTenPercentBuffer = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 2,
        guests: {adults: 10, children: 0},
        season: 'sommer',
        eventType: 'party',
        categories: ['wasser'],
        customDrinkIds: [],
        pufferProzent: 10,
      },
      DEFAULT_RATES,
      {},
  );

  const wasser = withTenPercentBuffer.ergebnis.find((item) => item.kategorie === 'wasser');

  assert.ok(wasser);
  assert.equal(wasser.literMitPuffer, roundTo2(wasser.literOhnePuffer * 1.1));
  assert.equal(withTenPercentBuffer.pufferProzent, 10);
});

test('calculate falls back to 0 percent buffer when no event puffer is configured', () => {
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 2,
        guests: {adults: 10, children: 0},
        season: 'sommer',
        eventType: 'party',
        categories: ['wasser'],
        customDrinkIds: [],
      },
      DEFAULT_RATES,
      {},
  );

  const wasser = result.ergebnis.find((item) => item.kategorie === 'wasser');

  assert.ok(wasser);
  assert.equal(wasser.literMitPuffer, roundTo2(wasser.literOhnePuffer * 1.0));
  assert.equal(result.pufferProzent, 0);
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

test('calculate uses calibrated rates (erfahrungswert) when available', () => {
  const result = _internal.calculate(
      {
        eventName: 'Abendessen',
        durationHours: 3,
        guests: {adults: 10, children: 0},
        season: 'winter',
        eventType: 'familienfeier',
        categories: ['wasser', 'bier'],
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
  const bier = result.ergebnis.find((item) => item.kategorie === 'bier');

  assert.ok(wasser);
  assert.ok(bier);
  assert.equal(wasser.ratenQuelle, 'erfahrungswert');
  assert.equal(bier.ratenQuelle, 'standard-faustwert');
  // bier erhaelt hier auch das bier_af-Gewicht per Fallback, da bier_af nicht angeboten ist.
  // totalRawWeight = wasser + bier + bier_af
  // totalBeverage = 10 * 0.5 (BASE_RATE) * 3 * 0.85 = 12.75
  const totalRawWeight = DRINK_WEIGHTS.wasser.basis + DRINK_WEIGHTS.bier.basis + DRINK_WEIGHTS.bier_af.basis;
  assert.equal(wasser.literOhnePuffer, roundTo2(12.75 * DRINK_WEIGHTS.wasser.basis / totalRawWeight));
  assert.equal(bier.literOhnePuffer, roundTo2(12.75 * (DRINK_WEIGHTS.bier.basis + DRINK_WEIGHTS.bier_af.basis) / totalRawWeight));
  assert.ok(bier.literOhnePuffer > wasser.literOhnePuffer,
      'bier (higher DRINK_WEIGHT) should dominate wasser');
});

test('calculate ergibt realistischen Gesamtgetraenkebedarf: 1 Gast, 4 Stunden = 2 L', () => {
  // Core requirement: total = guests x BASE_RATE x hours x season_factor
  // 1 adult x 0.5 L/h x 4 h x 1.0 (uebergang) = 2.0 L total across all categories
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 1, children: 0},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: [], // all default categories used
        customDrinkIds: [],
        pufferProzent: 0,
      },
      DEFAULT_RATES,
      {},
  );

  const totalLiters = result.ergebnis
      .filter((item) => !item.isCustomDrink)
      .reduce((sum, item) => sum + (item.literOhnePuffer || 0), 0);

  // Due to rounding of individual categories the sum may differ by at most ~0.05 L.
  const expectedTotal = 1 * BASE_RATE_PER_PERSON_PER_HOUR * 4; // 2.0
  assert.ok(
      Math.abs(totalLiters - expectedTotal) < 0.05,
      `Total should be ~${expectedTotal} L, got ${totalLiters.toFixed(4)} L`,
  );
});

test('calculate ergibt doppelten Gesamtgetraenkebedarf fuer 2 Gaeste gegenueber 1 Gast', () => {
  const make = (adults) => _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults, children: 0},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: ['wasser', 'bier'],
        customDrinkIds: [],
        pufferProzent: 0,
      },
      DEFAULT_RATES,
      {},
  );

  const total1 = make(1).ergebnis.reduce((s, i) => s + (i.literOhnePuffer || 0), 0);
  const total2 = make(2).ergebnis.reduce((s, i) => s + (i.literOhnePuffer || 0), 0);

  assert.ok(
      Math.abs(total2 - total1 * 2) < 0.05,
      `2-guest total (${total2}) should be double 1-guest total (${total1})`,
  );
});
