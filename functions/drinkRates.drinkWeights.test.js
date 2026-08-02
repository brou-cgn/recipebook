const test = require('node:test');
const assert = require('node:assert/strict');

const {DRINK_WEIGHTS, getDrinkWeight, BASE_RATE_PER_PERSON_PER_HOUR} = require('./drinkRates');
const {_internal} = require('./calculateEventDrinks');

// --- getDrinkWeight ---

test('getDrinkWeight gibt 0 fuer unbekannte Kategorie zurueck', () => {
  assert.equal(getDrinkWeight('unbekannt'), 0);
  assert.equal(getDrinkWeight('sekt'), 0);
  assert.equal(getDrinkWeight('saft'), 0);
  assert.equal(getDrinkWeight(''), 0);
  assert.equal(getDrinkWeight(undefined), 0);
});

test('getDrinkWeight gibt Basis-Gewicht fuer bekannte Kategorien zurueck', () => {
  assert.equal(getDrinkWeight('bier'), DRINK_WEIGHTS.bier.basis);
  assert.equal(getDrinkWeight('bier_alkoholfrei'), DRINK_WEIGHTS.bier_alkoholfrei.basis);
  assert.equal(getDrinkWeight('wein'), DRINK_WEIGHTS.wein.basis);
  assert.equal(getDrinkWeight('softdrinks'), DRINK_WEIGHTS.softdrinks.basis);
  assert.equal(getDrinkWeight('spirituosen'), DRINK_WEIGHTS.spirituosen.basis);
  assert.equal(getDrinkWeight('kaffee'), DRINK_WEIGHTS.kaffee.basis);
  assert.equal(getDrinkWeight('tee'), DRINK_WEIGHTS.tee.basis);
  assert.equal(getDrinkWeight('wasser'), DRINK_WEIGHTS.wasser.basis);
});

test('getDrinkWeight gibt Basis-Gewicht unabhaengig von uebergebener Saison zurueck', () => {
  // Saisonfaktoren werden in separatem Ticket implementiert; Ergebnis ist derzeit
  // immer die Basis-Gewichtung.
  assert.equal(getDrinkWeight('bier', 'sommer'), DRINK_WEIGHTS.bier.basis);
  assert.equal(getDrinkWeight('bier', 'winter'), DRINK_WEIGHTS.bier.basis);
  assert.equal(getDrinkWeight('bier', 'uebergang'), DRINK_WEIGHTS.bier.basis);
});

test('getDrinkWeight gibt Basis-Gewicht unabhaengig von Tageszeit zurueck', () => {
  assert.equal(getDrinkWeight('kaffee', 'uebergang', 'nachmittag'), DRINK_WEIGHTS.kaffee.basis);
  assert.equal(getDrinkWeight('kaffee', undefined, 'nachmittag'), DRINK_WEIGHTS.kaffee.basis);
});

test('DRINK_WEIGHTS Basis-Gewichte ergeben in Summe 1.0', () => {
  const sum = Object.values(DRINK_WEIGHTS).reduce((acc, entry) => acc + entry.basis, 0);
  assert.ok(
      Math.abs(sum - 1.0) < 0.001,
      `Basis-Summe sollte 1.0 sein, ist aber ${sum.toFixed(4)}`,
  );
});

test('DRINK_WEIGHTS enthaelt alle erwarteten Kategorien', () => {
  const expected = ['bier', 'bier_alkoholfrei', 'wein', 'softdrinks', 'spirituosen', 'kaffee', 'tee', 'wasser'];
  for (const cat of expected) {
    assert.ok(Object.prototype.hasOwnProperty.call(DRINK_WEIGHTS, cat), `${cat} fehlt in DRINK_WEIGHTS`);
  }
});

// --- Proportionale Verteilung mit DRINK_WEIGHTS ---

test('calculate verteilt Gesamtgetraenkebedarf proportional per DRINK_WEIGHTS (Issue-Beispiel)', () => {
  // Beispiel aus dem Issue: 1 Person, 4 Stunden → 2 Liter Gesamtbedarf
  // Kategorien: bier (inkl. bier_alkoholfrei-Fallback), softdrinks (2x Drinks), wein
  // Summe = 0.67
  // Bierbedarf: 2 / 0.67 * 0.26 ≈ 0.78 L
  // Softdrinks: 2 / 0.67 * 0.26 ≈ 0.78 L (je Drink: ~0.39 L)
  // Weinbedarf: 2 / 0.67 * 0.15 ≈ 0.45 L
  const result = _internal.calculate(
      {
        eventName: 'Test-Issue-Beispiel',
        durationHours: 4,
        guests: {adults: 1, children: 0},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: ['bier', 'softdrinks', 'wein'],
        customDrinkIds: ['cola', 'fanta'],
        pufferProzent: 0,
      },
      require('./drinkRates').DEFAULT_RATES,
      {
        cola: {
          name: 'Cola',
          kategorie: 'softdrinks',
          einheiten: [{einheitsgroesse: 0.5, gebindeinheit: 'Flasche'}],
        },
        fanta: {
          name: 'Fanta',
          kategorie: 'softdrinks',
          einheiten: [{einheitsgroesse: 0.5, gebindeinheit: 'Flasche'}],
        },
      },
  );

  const totalBeverage = 1 * BASE_RATE_PER_PERSON_PER_HOUR * 4 * 1.0; // 2.0 L
  const effectiveBierWeight = DRINK_WEIGHTS.bier.basis + DRINK_WEIGHTS.bier_alkoholfrei.basis;
  const sumWeights = effectiveBierWeight + DRINK_WEIGHTS.softdrinks.basis + DRINK_WEIGHTS.wein.basis;

  const bier = result.ergebnis.find((item) => item.kategorie === 'bier');
  const softdrinks = result.ergebnis.find((item) => item.kategorie === 'softdrinks');
  const wein = result.ergebnis.find((item) => item.kategorie === 'wein');

  assert.ok(bier, 'bier vorhanden');
  assert.ok(softdrinks, 'softdrinks vorhanden');
  assert.ok(wein, 'wein vorhanden');

  const expectedBier = Math.round((totalBeverage * effectiveBierWeight / sumWeights) * 100) / 100;
  const expectedSoftdrinks = Math.round((totalBeverage * DRINK_WEIGHTS.softdrinks.basis / sumWeights) * 100) / 100;
  const expectedWein = Math.round((totalBeverage * DRINK_WEIGHTS.wein.basis / sumWeights) * 100) / 100;

  assert.equal(bier.literOhnePuffer, expectedBier, 'Bierbedarf stimmt nicht');
  assert.equal(softdrinks.literOhnePuffer, expectedSoftdrinks, 'Softdrinks-Bedarf stimmt nicht');
  assert.equal(wein.literOhnePuffer, expectedWein, 'Weinbedarf stimmt nicht');
});

test('calculate vergibt Null-Liter fuer Kategorien ohne DRINK_WEIGHTS-Eintrag', () => {
  // 'sekt' ist nicht in DRINK_WEIGHTS → bekommt 0 Liter
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 10, children: 0},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: ['wasser', 'sekt'],
        customDrinkIds: [],
        pufferProzent: 0,
      },
      require('./drinkRates').DEFAULT_RATES,
      {},
  );

  const wasser = result.ergebnis.find((item) => item.kategorie === 'wasser');
  const sekt = result.ergebnis.find((item) => item.kategorie === 'sekt');

  assert.ok(wasser, 'wasser vorhanden');
  assert.ok(sekt, 'sekt vorhanden');
  assert.ok(wasser.literOhnePuffer > 0, 'wasser hat Liter > 0');
  assert.equal(sekt.literOhnePuffer, 0, 'sekt bekommt 0 Liter (kein DRINK_WEIGHT)');
});

test('calculate liefert Gesamtgetraenkebedarf = totalBeverage fuer alle DRINK_WEIGHTS-Kategorien', () => {
  // Mit allen DRINK_WEIGHTS-Kategorien sollte die Summe = totalBeverage sein.
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 1, children: 0},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: ['bier', 'bier_alkoholfrei', 'wein', 'softdrinks', 'spirituosen', 'kaffee', 'tee', 'wasser'],
        customDrinkIds: [],
        pufferProzent: 0,
      },
      require('./drinkRates').DEFAULT_RATES,
      {},
  );

  const totalLiters = result.ergebnis
      .filter((item) => !item.isCustomDrink)
      .reduce((sum, item) => sum + (item.literOhnePuffer || 0), 0);

  const expectedTotal = 1 * BASE_RATE_PER_PERSON_PER_HOUR * 4; // 2.0
  assert.ok(
      Math.abs(totalLiters - expectedTotal) < 0.05,
      `Gesamtbedarf sollte ~${expectedTotal} L sein, ist ${totalLiters.toFixed(4)} L`,
  );
});

test('calculate speichert guestPreferenceMultipliers in praeferenzFaktor, beeinflusst aber nicht die Verteilung', () => {
  // Neue Logik (5-Schritt): guestPreferenceMultipliers werden im praeferenzFaktor-Feld
  // gespeichert, beeinflussen aber die proportionale Verteilung nicht mehr.
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 10, children: 0},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: ['bier', 'wasser'],
        customDrinkIds: [],
        pufferProzent: 0,
        guestPreferenceMultipliers: {bier: 0},
      },
      require('./drinkRates').DEFAULT_RATES,
      {},
  );

  const bier = result.ergebnis.find((item) => item.kategorie === 'bier');
  const wasser = result.ergebnis.find((item) => item.kategorie === 'wasser');
  const totalBeverage = 10 * BASE_RATE_PER_PERSON_PER_HOUR * 4; // 20.0 L
  const bierEffWeight = DRINK_WEIGHTS.bier.basis + DRINK_WEIGHTS.bier_alkoholfrei.basis;
  const sumWeights = bierEffWeight + DRINK_WEIGHTS.wasser.basis;
  const expectedBier = Math.round(totalBeverage * bierEffWeight / sumWeights * 100) / 100;

  assert.ok(bier, 'bier vorhanden');
  assert.ok(wasser, 'wasser vorhanden');
  // praeferenzFaktor wird weiterhin im Ergebnis gespeichert
  assert.equal(bier.praeferenzFaktor, 0, 'bier praeferenzFaktor ist 0');
  // Die Verteilung basiert nur auf DRINK_WEIGHTS -- prefMult=0 aendert nichts am Budget
  assert.equal(
      bier.literOhnePuffer,
      expectedBier,
      'bier bekommt proportionalen Anteil (DRINK_WEIGHTS), nicht beeinflusst durch prefMult',
  );
  assert.ok(wasser.literOhnePuffer > 0, 'wasser bekommt Liter');
});

test('calculate vererbt bier_alkoholfrei-Gewicht auf bier, wenn bier_alkoholfrei nicht angeboten wird', () => {
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 10, children: 0},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: ['bier', 'wasser'],
        customDrinkIds: [],
        pufferProzent: 0,
      },
      require('./drinkRates').DEFAULT_RATES,
      {},
  );

  const bier = result.ergebnis.find((item) => item.kategorie === 'bier');
  const wasser = result.ergebnis.find((item) => item.kategorie === 'wasser');
  const totalBeverage = 10 * BASE_RATE_PER_PERSON_PER_HOUR * 4;
  const sumWeights = DRINK_WEIGHTS.bier.basis + DRINK_WEIGHTS.bier_alkoholfrei.basis + DRINK_WEIGHTS.wasser.basis;

  assert.ok(bier);
  assert.ok(wasser);
  assert.equal(
      bier.literOhnePuffer,
      Math.round((totalBeverage * (DRINK_WEIGHTS.bier.basis + DRINK_WEIGHTS.bier_alkoholfrei.basis) / sumWeights) * 100) / 100,
  );
  assert.equal(
      wasser.literOhnePuffer,
      Math.round((totalBeverage * DRINK_WEIGHTS.wasser.basis / sumWeights) * 100) / 100,
  );
});

test('calculate behandelt bier_alkoholfrei als eigene Kategorie, wenn angeboten', () => {
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 10, children: 0},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: ['bier', 'bier_alkoholfrei', 'wasser'],
        customDrinkIds: [],
        pufferProzent: 0,
      },
      require('./drinkRates').DEFAULT_RATES,
      {},
  );

  const bier = result.ergebnis.find((item) => item.kategorie === 'bier');
  const bierAf = result.ergebnis.find((item) => item.kategorie === 'bier_alkoholfrei');
  const wasser = result.ergebnis.find((item) => item.kategorie === 'wasser');
  const totalBeverage = 10 * BASE_RATE_PER_PERSON_PER_HOUR * 4;
  const sumWeights = DRINK_WEIGHTS.bier.basis + DRINK_WEIGHTS.bier_alkoholfrei.basis + DRINK_WEIGHTS.wasser.basis;

  assert.ok(bier);
  assert.ok(bierAf);
  assert.ok(wasser);
  assert.equal(
      bier.literOhnePuffer,
      Math.round((totalBeverage * DRINK_WEIGHTS.bier.basis / sumWeights) * 100) / 100,
  );
  assert.equal(
      bierAf.literOhnePuffer,
      Math.round((totalBeverage * DRINK_WEIGHTS.bier_alkoholfrei.basis / sumWeights) * 100) / 100,
  );
});
