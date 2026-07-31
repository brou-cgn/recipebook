const test = require('node:test');
const assert = require('node:assert/strict');

const {_internal} = require('./calculateEventDrinks');
const {DEFAULT_RATES} = require('./drinkRates');

test('resolveTopLevelCategory gibt fuer Oberkategorie die ID selbst zurueck', () => {
  assert.equal(_internal.resolveTopLevelCategory('softdrinks'), 'softdrinks');
  assert.equal(_internal.resolveTopLevelCategory('bier'), 'bier');
  assert.equal(_internal.resolveTopLevelCategory('wein'), 'wein');
  assert.equal(_internal.resolveTopLevelCategory('unbekannt'), 'unbekannt');
});

test('resolveTopLevelCategory loest Biervarianten auf "bier" auf', () => {
  assert.equal(_internal.resolveTopLevelCategory('bier_koelsch'), 'bier');
  assert.equal(_internal.resolveTopLevelCategory('bier_pils'), 'bier');
  assert.equal(_internal.resolveTopLevelCategory('bier_weizen'), 'bier');
  assert.equal(_internal.resolveTopLevelCategory('bier_alkoholfrei'), 'bier');
});

test('resolveTopLevelCategory loest Weinvarianten auf "wein" auf', () => {
  assert.equal(_internal.resolveTopLevelCategory('wein_weisswein'), 'wein');
  assert.equal(_internal.resolveTopLevelCategory('wein_rose'), 'wein');
  assert.equal(_internal.resolveTopLevelCategory('wein_rotwein'), 'wein');
});

test('calculate verteilt Softdrink-Kategoriebedarf gleichmaessig auf zwei Getraenke', () => {
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 10, children: 0},
        season: 'sommer',
        eventType: 'familienfeier',
        categories: ['softdrinks'],
        customDrinkIds: ['cola', 'fanta'],
        pufferProzent: 0,
      },
      DEFAULT_RATES,
      {
        cola: {
          name: 'Cola',
          kategorie: 'softdrinks',
          einheiten: [{einheitsgroesse: 0.5, gebindeinheit: 'Flasche', einheitenProGebinde: 1}],
        },
        fanta: {
          name: 'Fanta',
          kategorie: 'softdrinks',
          einheiten: [{einheitsgroesse: 0.5, gebindeinheit: 'Flasche', einheitenProGebinde: 1}],
        },
      },
  );

  const softdrinks = result.ergebnis.find((item) => item.kategorie === 'softdrinks');
  const cola = result.ergebnis.find((item) => item.kategorie === 'cola');
  const fanta = result.ergebnis.find((item) => item.kategorie === 'fanta');

  assert.ok(softdrinks, 'softdrinks Kategorie vorhanden');
  assert.ok(cola, 'Cola vorhanden');
  assert.ok(fanta, 'Fanta vorhanden');

  // Jedes Getraenk erhaelt die Haelfte des Kategoriebedarfs.
  const erwarteteHaelfte = Math.round((softdrinks.literMitPuffer / 2) * 100) / 100;
  assert.equal(cola.literMitPuffer, erwarteteHaelfte);
  assert.equal(fanta.literMitPuffer, erwarteteHaelfte);
  assert.equal(cola.literOhnePuffer, Math.round((softdrinks.literOhnePuffer / 2) * 100) / 100);
  assert.equal(fanta.literOhnePuffer, Math.round((softdrinks.literOhnePuffer / 2) * 100) / 100);
});

test('calculate setzt ratenQuelle auf "kategorie-verteilung" wenn Kategorie bekannt', () => {
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 2,
        guests: {adults: 10, children: 0},
        season: 'sommer',
        eventType: 'familienfeier',
        categories: ['bier'],
        customDrinkIds: ['koelsch'],
        pufferProzent: 0,
      },
      DEFAULT_RATES,
      {
        koelsch: {
          name: 'Kölsch',
          kategorie: 'bier',
          einheiten: [{einheitsgroesse: 0.5, gebindeinheit: 'Flasche'}],
        },
      },
  );

  const koelsch = result.ergebnis.find((item) => item.kategorie === 'koelsch');
  assert.ok(koelsch);
  assert.equal(koelsch.ratenQuelle, 'kategorie-verteilung');
  assert.equal(koelsch.drinkKategorie, 'bier');
});

test('calculate verteilt Bier-Kategoriebedarf auch auf Biervarianten (Unterkategorien)', () => {
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 20, children: 0},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: ['bier'],
        customDrinkIds: ['koelsch', 'weizen'],
        pufferProzent: 0,
      },
      DEFAULT_RATES,
      {
        koelsch: {
          name: 'Kölsch',
          kategorie: 'bier_koelsch',
          einheiten: [{einheitsgroesse: 0.5, gebindeinheit: 'Flasche'}],
        },
        weizen: {
          name: 'Weizen',
          kategorie: 'bier_weizen',
          einheiten: [{einheitsgroesse: 0.5, gebindeinheit: 'Flasche'}],
        },
      },
  );

  const bier = result.ergebnis.find((item) => item.kategorie === 'bier');
  const koelsch = result.ergebnis.find((item) => item.kategorie === 'koelsch');
  const weizen = result.ergebnis.find((item) => item.kategorie === 'weizen');

  assert.ok(bier, 'bier Kategorie vorhanden');
  assert.ok(koelsch);
  assert.ok(weizen);

  // Jede Biervariante erhaelt die Haelfte des Bier-Kategoriebedarfs.
  const erwarteteHaelfte = Math.round((bier.literMitPuffer / 2) * 100) / 100;
  assert.equal(koelsch.literMitPuffer, erwarteteHaelfte);
  assert.equal(weizen.literMitPuffer, erwarteteHaelfte);
  assert.equal(koelsch.drinkKategorie, 'bier_koelsch');
  assert.equal(weizen.drinkKategorie, 'bier_weizen');
});

test('calculate berechnet anzahlGebinde fuer Getraenke mit verteiltem Kategoriebedarf', () => {
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 10, children: 0},
        season: 'sommer',
        eventType: 'familienfeier',
        categories: ['wasser'],
        customDrinkIds: ['mineralwasser'],
        pufferProzent: 0,
      },
      DEFAULT_RATES,
      {
        mineralwasser: {
          name: 'Mineralwasser',
          kategorie: 'wasser',
          einheiten: [{einheitsgroesse: 1.5, gebindeinheit: 'PET-Flasche'}],
        },
      },
  );

  const mineralwasser = result.ergebnis.find((item) => item.kategorie === 'mineralwasser');
  assert.ok(mineralwasser);
  assert.ok(mineralwasser.literMitPuffer > 0);
  assert.equal(mineralwasser.anzahlGebinde, Math.ceil(mineralwasser.literMitPuffer / 1.5));
});

test('calculate behaelt null-Liter fuer Getraenke ohne Kategorie-Zuordnung', () => {
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 10, children: 0},
        season: 'sommer',
        eventType: 'familienfeier',
        categories: ['softdrinks'],
        customDrinkIds: ['unbekannt'],
        pufferProzent: 0,
      },
      DEFAULT_RATES,
      {
        unbekannt: {
          name: 'Unbekanntes Getraenk',
          // keine kategorie
          einheiten: [{einheitsgroesse: 0.33, gebindeinheit: 'Dose'}],
        },
      },
  );

  const unbekannt = result.ergebnis.find((item) => item.kategorie === 'unbekannt');
  assert.ok(unbekannt);
  assert.equal(unbekannt.literOhnePuffer, null);
  assert.equal(unbekannt.literMitPuffer, null);
  assert.equal(unbekannt.anzahlGebinde, null);
  assert.equal(unbekannt.ratenQuelle, 'benutzerdefiniert');
  assert.equal(unbekannt.drinkKategorie, null);
});

test('calculate teilt Kategoriebedarf auf drei Getraenke einer Kategorie auf', () => {
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 3,
        guests: {adults: 9, children: 0},
        season: 'sommer',
        eventType: 'familienfeier',
        categories: ['softdrinks'],
        customDrinkIds: ['cola', 'fanta', 'sprite'],
        pufferProzent: 0,
      },
      DEFAULT_RATES,
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
        sprite: {
          name: 'Sprite',
          kategorie: 'softdrinks',
          einheiten: [{einheitsgroesse: 0.5, gebindeinheit: 'Flasche'}],
        },
      },
  );

  const softdrinks = result.ergebnis.find((item) => item.kategorie === 'softdrinks');
  const cola = result.ergebnis.find((item) => item.kategorie === 'cola');
  const fanta = result.ergebnis.find((item) => item.kategorie === 'fanta');
  const sprite = result.ergebnis.find((item) => item.kategorie === 'sprite');

  assert.ok(softdrinks);
  assert.ok(cola);
  assert.ok(fanta);
  assert.ok(sprite);

  const erwartetesDrittel = Math.round((softdrinks.literMitPuffer / 3) * 100) / 100;
  assert.equal(cola.literMitPuffer, erwartetesDrittel);
  assert.equal(fanta.literMitPuffer, erwartetesDrittel);
  assert.equal(sprite.literMitPuffer, erwartetesDrittel);
});
