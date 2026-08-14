const test = require('node:test');
const assert = require('node:assert/strict');

const {DRINK_WEIGHTS, getDrinkWeight, getWeightSubcategoryParents, getParentTotal, BASE_RATE_PER_PERSON_PER_HOUR, CHILDREN_DRINK_WEIGHTS, getChildrenDrinkWeight, CHILDREN_BASE_RATE_PER_PERSON_PER_HOUR} = require('./drinkRates');
const {_internal} = require('./calculateEventDrinks');

// --- getDrinkWeight ---

test('getDrinkWeight gibt 0 fuer unbekannte Kategorie zurueck', () => {
  assert.equal(getDrinkWeight('unbekannt'), 0);
  assert.equal(getDrinkWeight(''), 0);
  assert.equal(getDrinkWeight(undefined), 0);
});

test('getDrinkWeight gibt Basis-Gewicht fuer bekannte Kategorien zurueck', () => {
  assert.equal(getDrinkWeight('bier'), DRINK_WEIGHTS.bier.basis);
  assert.equal(getDrinkWeight('bier_alkoholfrei'), DRINK_WEIGHTS.bier_alkoholfrei.basis);
  assert.equal(getDrinkWeight('wein'), DRINK_WEIGHTS.wein.basis);
  assert.equal(getDrinkWeight('sekt'), DRINK_WEIGHTS.sekt.basis);
  assert.equal(getDrinkWeight('softdrinks'), DRINK_WEIGHTS.softdrinks.basis);
  assert.equal(getDrinkWeight('saft'), DRINK_WEIGHTS.saft.basis);
  assert.equal(getDrinkWeight('spirituosen'), DRINK_WEIGHTS.spirituosen.basis);
  assert.equal(getDrinkWeight('kaffee'), DRINK_WEIGHTS.kaffee.basis);
  assert.equal(getDrinkWeight('tee'), DRINK_WEIGHTS.tee.basis);
  assert.equal(getDrinkWeight('wasser'), DRINK_WEIGHTS.wasser.basis);
});

test('getDrinkWeight wendet das saisonale Delta additiv auf die Basis an', () => {
  assert.equal(getDrinkWeight('bier', 'sommer'), DRINK_WEIGHTS.bier.basis + DRINK_WEIGHTS.bier.sommer);
  assert.equal(getDrinkWeight('bier', 'winter'), DRINK_WEIGHTS.bier.basis + DRINK_WEIGHTS.bier.winter);
  // uebergang und unbekannte/fehlende Saison bekommen kein Delta -> nur Basis.
  assert.equal(getDrinkWeight('bier', 'uebergang'), DRINK_WEIGHTS.bier.basis);
  assert.equal(getDrinkWeight('bier'), DRINK_WEIGHTS.bier.basis);
});

test('getDrinkWeight kappt das Ergebnis bei 0, falls Basis+Delta negativ waere', () => {
  assert.ok(getDrinkWeight('wasser', 'winter') >= 0);
});

test('DRINK_WEIGHTS Basis+Delta ergibt je Saison in Summe weiterhin ~1.0', () => {
  for (const season of ['sommer', 'winter']) {
    const sum = Object.values(DRINK_WEIGHTS)
        .reduce((acc, entry) => acc + Math.max(0, entry.basis + entry[season]), 0);
    assert.ok(
        Math.abs(sum - 1.0) < 0.005,
        `Summe fuer ${season} sollte ~1.0 sein, ist aber ${sum.toFixed(4)}`,
    );
  }
});

test('getDrinkWeight gibt Basis-Gewicht unabhaengig von Tageszeit zurueck', () => {
  // timeOfDay ('nachmittag') ist noch nicht verdrahtet -- keine Aufrufstelle
  // uebergibt ihn derzeit, daher bleibt er ohne Effekt (reserviert).
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
  const expected = ['bier', 'bier_alkoholfrei', 'wein', 'sekt', 'softdrinks', 'saft', 'spirituosen', 'longdrinks', 'kaffee', 'tee', 'wasser'];
  for (const cat of expected) {
    assert.ok(Object.prototype.hasOwnProperty.call(DRINK_WEIGHTS, cat), `${cat} fehlt in DRINK_WEIGHTS`);
  }
});

// --- parent / getWeightSubcategoryParents / getParentTotal ---

test('DRINK_WEIGHTS.parent bildet die Eltern/Kind-Beziehungen ab', () => {
  assert.equal(DRINK_WEIGHTS.bier.parent, null);
  assert.equal(DRINK_WEIGHTS.bier_alkoholfrei.parent, 'bier');
  assert.equal(DRINK_WEIGHTS.wein.parent, null);
  assert.equal(DRINK_WEIGHTS.spirituosen.parent, null);
  assert.equal(DRINK_WEIGHTS.longdrinks.parent, 'spirituosen');
  assert.equal(DRINK_WEIGHTS.wasser.parent, null);
});

test('getWeightSubcategoryParents gibt nur Subkategorien mit eigenem Budget zurueck', () => {
  assert.deepEqual(getWeightSubcategoryParents(), {
    bier_alkoholfrei: 'bier',
    longdrinks: 'spirituosen',
  });
});

test('getParentTotal summiert Elternkategorie und alle Subkategorien', () => {
  assert.equal(getParentTotal({bier: 2.0, bier_alkoholfrei: 0.5}, 'bier'), 2.5);
  assert.equal(getParentTotal({spirituosen: 1.2, longdrinks: 0.8}, 'spirituosen'), 2.0);
});

test('getParentTotal ignoriert fehlende Subkategorien und liefert 0 fuer unbekannte Elternkategorie', () => {
  assert.equal(getParentTotal({bier: 2.0}, 'bier'), 2.0);
  assert.equal(getParentTotal({}, 'bier'), 0);
  assert.equal(getParentTotal({bier: 2.0}, 'unbekannt'), 0);
  assert.equal(getParentTotal(null, 'bier'), 0);
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
      DRINK_WEIGHTS,
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

test('calculate ueberspringt komplett unbekannte Kategorien mit Warnung', () => {
  // Kategorien ohne DRINK_WEIGHTS-Eintrag (z.B. Tippfehler) erhalten keine
  // Ergebniszeile, sondern eine Warnung -- anders als frueher 'sekt'/'saft',
  // die zwar ratenDB-Eintraege hatten, aber kein Gewicht (Bug, jetzt behoben).
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 10, children: 0},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: ['wasser', 'nichtvorhanden'],
        customDrinkIds: [],
        pufferProzent: 0,
      },
      DRINK_WEIGHTS,
      {},
  );

  const wasser = result.ergebnis.find((item) => item.kategorie === 'wasser');
  const unbekannt = result.ergebnis.find((item) => item.kategorie === 'nichtvorhanden');

  assert.ok(wasser, 'wasser vorhanden');
  assert.ok(wasser.literOhnePuffer > 0, 'wasser hat Liter > 0');
  assert.equal(unbekannt, undefined, 'unbekannte Kategorie erhaelt keine Ergebniszeile');
  assert.ok(
      result.warnungen.some((w) => w.includes('nichtvorhanden')),
      'Warnung fuer unbekannte Kategorie vorhanden',
  );
});

test('calculate berechnet fuer sekt und saft nun einen Erwachsenen-Anteil (Bugfix)', () => {
  // sekt/saft fehlten frueher in DRINK_WEIGHTS und bekamen dadurch immer
  // 0 Liter fuer Erwachsene, unabhaengig von der Gaestezahl.
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 10, children: 0},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: ['wasser', 'sekt', 'saft'],
        customDrinkIds: [],
        pufferProzent: 0,
      },
      DRINK_WEIGHTS,
      {},
  );

  const sekt = result.ergebnis.find((item) => item.kategorie === 'sekt');
  const saft = result.ergebnis.find((item) => item.kategorie === 'saft');

  assert.ok(sekt, 'sekt vorhanden');
  assert.ok(saft, 'saft vorhanden');
  assert.ok(sekt.literOhnePuffer > 0, 'sekt bekommt jetzt einen Anteil');
  assert.ok(saft.literOhnePuffer > 0, 'saft bekommt jetzt einen Anteil (Erwachsene)');
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
      DRINK_WEIGHTS,
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
      DRINK_WEIGHTS,
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
      DRINK_WEIGHTS,
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
      DRINK_WEIGHTS,
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

// --- CHILDREN_DRINK_WEIGHTS / getChildrenDrinkWeight ---

test('getChildrenDrinkWeight gibt 0 fuer unbekannte Kategorie zurueck', () => {
  assert.equal(getChildrenDrinkWeight('unbekannt'), 0);
  assert.equal(getChildrenDrinkWeight(''), 0);
  assert.equal(getChildrenDrinkWeight(undefined), 0);
});

test('getChildrenDrinkWeight gibt 0 fuer Alkohol-Kategorien zurueck', () => {
  assert.equal(getChildrenDrinkWeight('bier'), 0);
  assert.equal(getChildrenDrinkWeight('bier_alkoholfrei'), 0);
  assert.equal(getChildrenDrinkWeight('wein'), 0);
  assert.equal(getChildrenDrinkWeight('spirituosen'), 0);
  assert.equal(getChildrenDrinkWeight('kaffee'), 0);
});

test('getChildrenDrinkWeight gibt Basis-Gewicht fuer Kinderkategorien zurueck', () => {
  assert.equal(getChildrenDrinkWeight('softdrinks'), CHILDREN_DRINK_WEIGHTS.softdrinks.basis);
  assert.equal(getChildrenDrinkWeight('saft'), CHILDREN_DRINK_WEIGHTS.saft.basis);
  assert.equal(getChildrenDrinkWeight('tee'), CHILDREN_DRINK_WEIGHTS.tee.basis);
  assert.equal(getChildrenDrinkWeight('wasser'), CHILDREN_DRINK_WEIGHTS.wasser.basis);
});

test('CHILDREN_DRINK_WEIGHTS Basis-Gewichte ergeben in Summe 1.0', () => {
  const sum = Object.values(CHILDREN_DRINK_WEIGHTS).reduce((acc, entry) => acc + entry.basis, 0);
  assert.ok(
      Math.abs(sum - 1.0) < 0.001,
      `Kinder-Basis-Summe sollte 1.0 sein, ist aber ${sum.toFixed(4)}`,
  );
});

test('CHILDREN_BASE_RATE_PER_PERSON_PER_HOUR ist 0.35', () => {
  assert.equal(CHILDREN_BASE_RATE_PER_PERSON_PER_HOUR, 0.35);
});

test('calculate addiert Kinderbedarf (Wasser/Saft) zu Erwachsenenbedarf', () => {
  // 10 Erwachsene + 10 Kinder, 4 Stunden, uebergang
  // Erwachsene: 10 * 0.5 * 4 = 20 L total
  // Kinder: 10 * 0.35 * 4 = 14 L total
  // Sowohl Erwachsene als auch Kinder haben fuer wasser+saft ein DRINK_WEIGHT
  // (saft bekam frueher faelschlicherweise kein Erwachsenen-Gewicht, siehe Bugfix-Test).
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 10, children: 10},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: ['wasser', 'saft'],
        customDrinkIds: [],
        pufferProzent: 0,
      },
      DRINK_WEIGHTS,
      {},
  );

  const wasser = result.ergebnis.find((item) => item.kategorie === 'wasser');
  const saft = result.ergebnis.find((item) => item.kategorie === 'saft');

  assert.ok(wasser, 'wasser vorhanden');
  assert.ok(saft, 'saft vorhanden');

  const childrenTotal = 10 * CHILDREN_BASE_RATE_PER_PERSON_PER_HOUR * 4;
  const adultsTotal = 10 * BASE_RATE_PER_PERSON_PER_HOUR * 4;
  const childrenWeightSum = CHILDREN_DRINK_WEIGHTS.wasser.basis + CHILDREN_DRINK_WEIGHTS.saft.basis;
  const adultsWeightSum = DRINK_WEIGHTS.wasser.basis + DRINK_WEIGHTS.saft.basis;

  const expectedWasserKinder = childrenTotal * (CHILDREN_DRINK_WEIGHTS.wasser.basis / childrenWeightSum);
  const expectedWasserErwachsene = adultsTotal * (DRINK_WEIGHTS.wasser.basis / adultsWeightSum);
  const expectedWasser = Math.round((expectedWasserErwachsene + expectedWasserKinder) * 100) / 100;

  const expectedSaftKinder = childrenTotal * (CHILDREN_DRINK_WEIGHTS.saft.basis / childrenWeightSum);
  const expectedSaftErwachsene = adultsTotal * (DRINK_WEIGHTS.saft.basis / adultsWeightSum);
  const expectedSaft = Math.round((expectedSaftErwachsene + expectedSaftKinder) * 100) / 100;

  assert.equal(wasser.literOhnePuffer, expectedWasser, 'Wasser: Erwachsene + Kinder');
  assert.equal(saft.literOhnePuffer, expectedSaft, 'Saft: Erwachsene + Kinder');
  assert.ok(saft.literOhnePuffer > 0, 'Saft hat Bedarf');
});

test('calculate berechnet nur Kinderbedarf wenn keine Erwachsenen vorhanden', () => {
  // 0 adults, 20 children, 2 hours, uebergang, categories: [softdrinks, wasser]
  // children total = 20 * 0.35 * 2 = 14 L
  // children weights for [softdrinks, wasser]: 0.280 + 0.370 = 0.650
  const result = _internal.calculate(
      {
        eventName: 'Kinderfeier',
        durationHours: 2,
        guests: {adults: 0, children: 20},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: ['softdrinks', 'wasser'],
        customDrinkIds: [],
        pufferProzent: 0,
      },
      DRINK_WEIGHTS,
      {},
  );

  const softdrinks = result.ergebnis.find((item) => item.kategorie === 'softdrinks');
  const wasser = result.ergebnis.find((item) => item.kategorie === 'wasser');

  assert.ok(softdrinks, 'softdrinks vorhanden');
  assert.ok(wasser, 'wasser vorhanden');

  const childrenTotal = 20 * CHILDREN_BASE_RATE_PER_PERSON_PER_HOUR * 2;
  const weightSum = CHILDREN_DRINK_WEIGHTS.softdrinks.basis + CHILDREN_DRINK_WEIGHTS.wasser.basis;

  const expectedSoftdrinks = Math.round((childrenTotal * CHILDREN_DRINK_WEIGHTS.softdrinks.basis / weightSum) * 100) / 100;
  const expectedWasser = Math.round((childrenTotal * CHILDREN_DRINK_WEIGHTS.wasser.basis / weightSum) * 100) / 100;

  assert.equal(softdrinks.literOhnePuffer, expectedSoftdrinks);
  assert.equal(wasser.literOhnePuffer, expectedWasser);
  assert.ok(wasser.literOhnePuffer > 0);
  assert.ok(softdrinks.literOhnePuffer > 0);
});
