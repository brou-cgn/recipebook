const test = require('node:test');
const assert = require('node:assert/strict');

const {_internal} = require('./calculateEventDrinks');
const {DEFAULT_RATES, BASE_RATE_PER_PERSON_PER_HOUR, DRINK_WEIGHTS} = require('./drinkRates');

function roundTo2(value) {
  return Math.round(value * 100) / 100;
}

test('calculate distributes budget based on per-guest preferences (wein preferred)', () => {
  // 2 adults: guest 1 prefers wein (factor 0.75), guest 2 has no preference.
  // categories: ['wein', 'wasser']
  // Expected: wein gets more than default because one guest strongly prefers it.
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 2,
        guests: {adults: 2, children: 0},
        season: 'sommer',
        eventType: 'party',
        categories: ['wein', 'wasser'],
        customDrinkIds: [],
        pufferProzent: 0,
        guestPreferenceMultipliers: {
          perGuest: [
            {preferredCategoryIds: ['wein'], preferredDrinkIds: [], preferenceFactor: 0.75, allowsAlcohol: true},
            {preferredCategoryIds: [], preferredDrinkIds: [], preferenceFactor: 0, allowsAlcohol: true},
          ],
        },
      },
      DEFAULT_RATES,
      {},
  );

  const wein = result.ergebnis.find((item) => item.kategorie === 'wein');
  const wasser = result.ergebnis.find((item) => item.kategorie === 'wasser');

  assert.ok(wein);
  assert.ok(wasser);

  // Guest 1 prefers wein 75%: wein gets more, wasser gets less than baseline.
  // Without preference both guests: wein would share ~equally.
  // With preference: wein should have more than baseline (wasser dominated by weight).
  // Key: total budget is still the same (2 guests x budget).
  const totalLiters = wein.literOhnePuffer + wasser.literOhnePuffer;
  const expectedTotal = 2 * BASE_RATE_PER_PERSON_PER_HOUR * 2 * 1.3; // 2 adults, 2 hours, sommer 1.3
  assert.ok(Math.abs(totalLiters - expectedTotal) < 0.05,
      `Total should be ~${expectedTotal} L, got ${totalLiters.toFixed(4)} L`);
  // Wein should be higher than it would be for a guest with no preference
  // (preference guest puts 75% into wein, which dominates over weight-based share)
  assert.ok(wein.literOhnePuffer > wasser.literOhnePuffer,
      `wein (preferred by 1 guest with factor 0.75) should dominate wasser`);
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
  assert.equal(customDrink.gebinde, '5,0 l');
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
  // bier erhaelt hier auch das bier_alkoholfrei-Gewicht per Fallback, da bier_alkoholfrei nicht angeboten ist.
  // totalRawWeight = wasser + bier + bier_alkoholfrei
  // totalBeverage = 10 * 0.5 (BASE_RATE) * 3 * 0.85 = 12.75
  const totalRawWeight = DRINK_WEIGHTS.wasser.basis + DRINK_WEIGHTS.bier.basis + DRINK_WEIGHTS.bier_alkoholfrei.basis;
  assert.equal(wasser.literOhnePuffer, roundTo2(12.75 * DRINK_WEIGHTS.wasser.basis / totalRawWeight));
  assert.equal(bier.literOhnePuffer, roundTo2(12.75 * (DRINK_WEIGHTS.bier.basis + DRINK_WEIGHTS.bier_alkoholfrei.basis) / totalRawWeight));
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

test('calculate bier_alkoholfrei-Fallback: bier erhaelt bier_alkoholfrei-Gewicht wenn bier_alkoholfrei nicht in categories', () => {
  // Scenario: ['bier', 'softdrinks'], 1 person, 4 hours, season uebergang.
  // Expected:
  //   bier weight  = DRINK_WEIGHTS.bier.basis + DRINK_WEIGHTS.bier_alkoholfrei.basis = 0.221 + 0.039 = 0.260
  //   softdrinks weight = DRINK_WEIGHTS.softdrinks.basis = 0.260
  //   totalRawWeight = 0.520
  //   totalBeverage = 1 * 0.5 L/h * 4 h * 1.0 (uebergang) = 2.0 L
  //   bier: 2.0 * (0.260 / 0.520) = 1.00 L
  //   softdrinks: 2.0 * (0.260 / 0.520) = 1.00 L
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 1, children: 0},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: ['bier', 'softdrinks'],
        customDrinkIds: [],
        pufferProzent: 0,
      },
      DEFAULT_RATES,
      {},
  );

  const bier = result.ergebnis.find((item) => item.kategorie === 'bier');
  const softdrinks = result.ergebnis.find((item) => item.kategorie === 'softdrinks');

  assert.ok(bier, 'bier Kategorie vorhanden');
  assert.ok(softdrinks, 'softdrinks Kategorie vorhanden');

  const expectedBierWeight = DRINK_WEIGHTS.bier.basis + DRINK_WEIGHTS.bier_alkoholfrei.basis;
  const expectedSoftdrinksWeight = DRINK_WEIGHTS.softdrinks.basis;
  const expectedTotalWeight = expectedBierWeight + expectedSoftdrinksWeight;
  const totalBeverage = 1 * BASE_RATE_PER_PERSON_PER_HOUR * 4; // 2.0 L

  assert.equal(bier.literOhnePuffer, roundTo2(totalBeverage * expectedBierWeight / expectedTotalWeight));
  assert.equal(softdrinks.literOhnePuffer, roundTo2(totalBeverage * expectedSoftdrinksWeight / expectedTotalWeight));

  // Both categories have equal weight, so both receive exactly half of total.
  assert.equal(bier.literOhnePuffer, softdrinks.literOhnePuffer);
  assert.equal(bier.literOhnePuffer, 1.0);
  assert.equal(softdrinks.literOhnePuffer, 1.0);
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

test('calculate addiert Kinderbedarf zum Erwachsenenbedarf (Standardkalkulation)', () => {
  // After the children matrix was introduced, children contribute their own budget.
  // With categories ['wasser', 'bier']:
  //   children weights: wasser=0.370, bier=0.0 -> all children budget goes to wasser
  //   adults weights: wasser gets its share, bier gets its share
  // -> wasser increases with children; bier stays constant.
  const makeResult = (children) => _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 10, children},
        season: 'sommer',
        eventType: 'party',
        categories: ['wasser', 'bier'],
        customDrinkIds: [],
        pufferProzent: 0,
      },
      DEFAULT_RATES,
      {},
  );

  const withoutChildren = makeResult(0);
  const withChildren = makeResult(25);

  const wasserOhne = withoutChildren.ergebnis.find((item) => item.kategorie === 'wasser');
  const wasserMit = withChildren.ergebnis.find((item) => item.kategorie === 'wasser');
  const bierOhne = withoutChildren.ergebnis.find((item) => item.kategorie === 'bier');
  const bierMit = withChildren.ergebnis.find((item) => item.kategorie === 'bier');

  assert.ok(wasserMit.literOhnePuffer > wasserOhne.literOhnePuffer,
      'wasser soll mit Kindern mehr sein (Kinder trinken Wasser)');
  assert.equal(bierMit.literOhnePuffer, bierOhne.literOhnePuffer,
      'bier bleibt gleich, da Kinder kein Bier bekommen');
});

test('calculate ignoriert Kinder bei Legacy-Custom-Drink-Mengenkalkulation', () => {
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 3,
        guests: {adults: 0, children: 12},
        season: 'sommer',
        eventType: 'party',
        categories: [],
        customDrinkIds: ['kinderdrink'],
        pufferProzent: 0,
      },
      DEFAULT_RATES,
      {
        kinderdrink: {
          name: 'Kinderdrink',
          gebindeLiter: 1,
          gebindeName: '1L-Flasche',
          erwachsene: 0,
          kinder: 0.3,
          modus: 'stunde',
          anteilTrinker: 1,
        },
      },
  );

  const customDrink = result.ergebnis.find((item) => item.kategorie === 'kinderdrink');
  assert.ok(customDrink);
  assert.equal(customDrink.literOhnePuffer, 0);
  assert.equal(customDrink.literMitPuffer, 0);
  assert.equal(customDrink.anzahlGebinde, 0);
});

// --- Per-guest preference distribution tests ---

test('calculate: Gast ohne Präferenz erhält normale Gewichtsverteilung', () => {
  // 1 guest, no preferences -> normal weight distribution
  // categories: bier, softdrinks (bier_alkoholfrei fallback included)
  // totalBeverage = 1 * 0.5 * 4 * 1.0 = 2.0 L
  // bierWeight = 0.221 + 0.039 = 0.26, softdrinksWeight = 0.26, total = 0.52
  // bier = 2.0 * 0.26 / 0.52 = 1.0 L, softdrinks = 1.0 L
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 1, children: 0},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: ['bier', 'softdrinks'],
        customDrinkIds: [],
        pufferProzent: 0,
        guestPreferenceMultipliers: {
          perGuest: [
            {preferredCategoryIds: [], preferredDrinkIds: [], preferenceFactor: 0, allowsAlcohol: true},
          ],
        },
      },
      DEFAULT_RATES,
      {},
  );

  const bier = result.ergebnis.find((item) => item.kategorie === 'bier');
  const softdrinks = result.ergebnis.find((item) => item.kategorie === 'softdrinks');
  assert.ok(bier);
  assert.ok(softdrinks);
  assert.equal(bier.literOhnePuffer, 1.0);
  assert.equal(softdrinks.literOhnePuffer, 1.0);
});

test('calculate: alle Präferenzen angeboten - Szenario aus Issue #2772', () => {
  // Event: 4 Stunden, 2 Gaeste, Season uebergang
  // Gast 1: keine Präferenzen
  // Gast 2: Vorliebe softdrinks, Faktor 0.75
  // Verfügbar: bier, softdrinks (kein bier_alkoholfrei separat)
  //
  // totalBeverage = 2 * 0.5 * 4 * 1.0 = 4.0 L, perGuestBudget = 2.0 L
  // bierWeight = 0.221 + 0.039 = 0.26, softdrinksWeight = 0.26, total = 0.52
  //
  // Gast 1 (keine Präferenz): 2.0 L -> bier: 1.0 L, softdrinks: 1.0 L
  // Gast 2 (softdrinks, 0.75): 75% = 1.5 L -> softdrinks, 25% = 0.5 L -> bier (only non-preferred)
  //
  // Gesamt: bier = 1.0 + 0.5 = 1.5 L, softdrinks = 1.0 + 1.5 = 2.5 L
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 2, children: 0},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: ['bier', 'softdrinks'],
        customDrinkIds: [],
        pufferProzent: 0,
        guestPreferenceMultipliers: {
          perGuest: [
            {preferredCategoryIds: [], preferredDrinkIds: [], preferenceFactor: 0, allowsAlcohol: true},
            {preferredCategoryIds: ['softdrinks'], preferredDrinkIds: [], preferenceFactor: 0.75, allowsAlcohol: true},
          ],
        },
      },
      DEFAULT_RATES,
      {},
  );

  const bier = result.ergebnis.find((item) => item.kategorie === 'bier');
  const softdrinks = result.ergebnis.find((item) => item.kategorie === 'softdrinks');
  assert.ok(bier);
  assert.ok(softdrinks);
  assert.equal(bier.literOhnePuffer, 1.5, `bier expected 1.5 L, got ${bier.literOhnePuffer}`);
  assert.equal(softdrinks.literOhnePuffer, 2.5, `softdrinks expected 2.5 L, got ${softdrinks.literOhnePuffer}`);

  // Total should still be 4.0 L
  const total = bier.literOhnePuffer + softdrinks.literOhnePuffer;
  assert.ok(Math.abs(total - 4.0) < 0.05, `Total expected 4.0 L, got ${total}`);
});

test('calculate: keine Präferenz angeboten - Vorliebe wird ignoriert', () => {
  // Gast hat Vorliebe "bier_alkoholfrei" (Faktor 0.75), aber bier_alkoholfrei wird nicht angeboten.
  // Ergebnis: Vorliebe ignoriert, normale Verteilung.
  // categories: bier, softdrinks
  // totalBeverage = 1 * 0.5 * 4 * 1.0 = 2.0 L
  // bierWeight = 0.260, softdrinksWeight = 0.260, total = 0.520
  // bier = 2.0 * 0.26/0.52 = 1.0, softdrinks = 1.0
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 1, children: 0},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: ['bier', 'softdrinks'],
        customDrinkIds: [],
        pufferProzent: 0,
        guestPreferenceMultipliers: {
          perGuest: [
            {preferredCategoryIds: ['bier_alkoholfrei'], preferredDrinkIds: [], preferenceFactor: 0.75, allowsAlcohol: true},
          ],
        },
      },
      DEFAULT_RATES,
      {},
  );

  const bier = result.ergebnis.find((item) => item.kategorie === 'bier');
  const softdrinks = result.ergebnis.find((item) => item.kategorie === 'softdrinks');
  assert.ok(bier);
  assert.ok(softdrinks);
  // bier_alkoholfrei not offered -> preference ignored -> normal distribution
  assert.equal(bier.literOhnePuffer, 1.0, `bier expected 1.0 L (no fallback), got ${bier.literOhnePuffer}`);
  assert.equal(softdrinks.literOhnePuffer, 1.0, `softdrinks expected 1.0 L, got ${softdrinks.literOhnePuffer}`);
});

test('calculate: gesamtbudget bleibt gleich mit und ohne Präferenzen', () => {
  // Total budget should be identical with or without preferences.
  const makeResult = (withPreference) => _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 2, children: 0},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: ['bier', 'softdrinks'],
        customDrinkIds: [],
        pufferProzent: 0,
        guestPreferenceMultipliers: withPreference ? {
          perGuest: [
            {preferredCategoryIds: ['softdrinks'], preferredDrinkIds: [], preferenceFactor: 0.75, allowsAlcohol: true},
            {preferredCategoryIds: [], preferredDrinkIds: [], preferenceFactor: 0, allowsAlcohol: true},
          ],
        } : {perGuest: []},
      },
      DEFAULT_RATES,
      {},
  );

  const withPref = makeResult(true);
  const withoutPref = makeResult(false);

  const totalWith = withPref.ergebnis.reduce((s, i) => s + (i.literOhnePuffer || 0), 0);
  const totalWithout = withoutPref.ergebnis.reduce((s, i) => s + (i.literOhnePuffer || 0), 0);

  assert.ok(Math.abs(totalWith - totalWithout) < 0.05,
      `Total with preference (${totalWith.toFixed(3)}) should equal total without (${totalWithout.toFixed(3)})`);
});
