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
  assert.equal(_internal.resolveTopLevelCategory('bier_alkoholfrei'), 'bier');
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

test('calculate verteilt Softdrink-Kategoriebedarf auf einzelnes Getraenk ohne Bier-Umverteilung', () => {
  // Neue Semantik: Jede Kategorie behaelt ihr eigenes Budget.
  // bier hat keine Getraenke und behaelt sein Budget; cola bekommt nur den softdrinks-Anteil.
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 10, children: 0},
        season: 'sommer',
        eventType: 'familienfeier',
        categories: ['softdrinks', 'bier'],
        customDrinkIds: ['cola'],
        pufferProzent: 0,
      },
      DEFAULT_RATES,
      {
        cola: {
          name: 'Cola',
          kategorie: 'softdrinks',
          einheiten: [{einheitsgroesse: 0.5, gebindeinheit: 'Flasche', einheitenProGebinde: 1}],
        },
      },
  );

  const softdrinks = result.ergebnis.find((item) => item.kategorie === 'softdrinks');
  const bier = result.ergebnis.find((item) => item.kategorie === 'bier');
  const cola = result.ergebnis.find((item) => item.kategorie === 'cola');

  assert.ok(softdrinks, 'softdrinks Kategorie vorhanden');
  assert.ok(bier, 'bier Kategorie vorhanden');
  assert.ok(cola, 'cola Getraenk vorhanden');

  // cola erhaelt nur den softdrinks-Bedarf (NICHT den bier-Bedarf).
  assert.equal(cola.literMitPuffer, softdrinks.literMitPuffer);
  assert.equal(cola.ratenQuelle, 'kategorie-verteilung');
});

test('calculate gibt jedem Getraenk nur den Bedarf seiner eigenen Kategorie', () => {
  // Neue Semantik: Kategorien ohne Getraenke behalten ihr Budget und werden nicht umverteilt.
  // bier und wein haben keine Getraenke; softdrinks hat cola, wasser hat mineralwasser.
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 10, children: 0},
        season: 'sommer',
        eventType: 'familienfeier',
        categories: ['softdrinks', 'wasser', 'bier', 'wein'],
        customDrinkIds: ['cola', 'mineralwasser'],
        pufferProzent: 0,
      },
      DEFAULT_RATES,
      {
        cola: {
          name: 'Cola',
          kategorie: 'softdrinks',
          einheiten: [{einheitsgroesse: 0.5, gebindeinheit: 'Flasche', einheitenProGebinde: 1}],
        },
        mineralwasser: {
          name: 'Mineralwasser',
          kategorie: 'wasser',
          einheiten: [{einheitsgroesse: 1.5, gebindeinheit: 'PET-Flasche', einheitenProGebinde: 1}],
        },
      },
  );

  const softdrinks = result.ergebnis.find((item) => item.kategorie === 'softdrinks');
  const wasser = result.ergebnis.find((item) => item.kategorie === 'wasser');
  const cola = result.ergebnis.find((item) => item.kategorie === 'cola');
  const mw = result.ergebnis.find((item) => item.kategorie === 'mineralwasser');

  assert.ok(cola, 'cola vorhanden');
  assert.ok(mw, 'mineralwasser vorhanden');

  // cola bekommt nur softdrinks-Budget, mineralwasser nur wasser-Budget (keine Umverteilung von bier/wein).
  assert.equal(cola.literMitPuffer, softdrinks.literMitPuffer);
  assert.equal(mw.literMitPuffer, wasser.literMitPuffer);
});

test('calculate 1 Person 4 Stunden bier+softdrinks mit 2 Softdrinks: jeder Drink bekommt 0,50 L', () => {
  // Fehlerszenario: categories: ['bier', 'softdrinks'], 1 Person, 4h, 2 Softdrinks.
  // bier erhaelt 0,260 Gewicht (0,221 + 0,039 bier_alkoholfrei-Fallback), softdrinks 0,260.
  // totalRawWeight = 0,520 -> bier = 1,00 L, softdrinks = 1,00 L.
  // Jeder der 2 Softdrinks bekommt 1,00 / 2 = 0,50 L (kein Umverteilen des Bier-Budgets).
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 1, children: 0},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: ['bier', 'softdrinks'],
        customDrinkIds: ['cola', 'fanta'],
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
      },
  );

  const bier = result.ergebnis.find((item) => item.kategorie === 'bier');
  const softdrinks = result.ergebnis.find((item) => item.kategorie === 'softdrinks');
  const cola = result.ergebnis.find((item) => item.kategorie === 'cola');
  const fanta = result.ergebnis.find((item) => item.kategorie === 'fanta');

  assert.ok(bier, 'bier Kategorie vorhanden');
  assert.ok(softdrinks, 'softdrinks Kategorie vorhanden');
  assert.ok(cola, 'cola vorhanden');
  assert.ok(fanta, 'fanta vorhanden');

  assert.equal(bier.literOhnePuffer, 1.0, 'bier = 1,00 L');
  assert.equal(softdrinks.literOhnePuffer, 1.0, 'softdrinks = 1,00 L');
  assert.equal(cola.literOhnePuffer, 0.5, 'cola = 0,50 L');
  assert.equal(fanta.literOhnePuffer, 0.5, 'fanta = 0,50 L');
});

test('calculate addiert bier_alkoholfrei Gewicht NICHT zu bier, wenn bier_alkoholfrei angeboten wird', () => {
  // Wenn bier_alkoholfrei explizit angeboten wird, deckt es die alkoholfreie Bier-Gruppe ab.
  // bier_alkoholfrei-Fallback darf dann NICHT ausgeloest werden.
  // bier-Gewicht: 0,221, bier_alkoholfrei: 0,039, softdrinks: 0,260
  // totalRawWeight = 0,221 + 0,039 + 0,260 = 0,520
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 1, children: 0},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: ['bier', 'bier_alkoholfrei', 'softdrinks'],
        pufferProzent: 0,
      },
      DEFAULT_RATES,
      {},
  );

  const bier = result.ergebnis.find((item) => item.kategorie === 'bier');
  const bierAlkoholfrei = result.ergebnis.find((item) => item.kategorie === 'bier_alkoholfrei');
  const softdrinks = result.ergebnis.find((item) => item.kategorie === 'softdrinks');

  assert.ok(bier, 'bier Kategorie vorhanden');
  assert.ok(bierAlkoholfrei, 'bier_alkoholfrei Kategorie vorhanden');
  assert.ok(softdrinks, 'softdrinks Kategorie vorhanden');

  // bier_alkoholfrei ist direktes Kind von bier -> kein Fallback, eigene Gewichtung 0,039
  // totalRawWeight = 0,221 + 0,039 + 0,260 = 0,520
  // bier: 2,0 * (0,221 / 0,520) = 0,85
  // bier_alkoholfrei: 2,0 * (0,039 / 0,520) = 0,15
  // softdrinks: 2,0 * (0,260 / 0,520) = 1,00
  assert.equal(bier.literOhnePuffer, 0.85, 'bier = 0,85 L (kein bier_alkoholfrei-Fallback)');
  assert.equal(bierAlkoholfrei.literOhnePuffer, 0.15, 'bier_alkoholfrei = 0,15 L (eigene Gewichtung)');
  assert.equal(softdrinks.literOhnePuffer, 1.00, 'softdrinks = 1,00 L');
});

test('calculate leitet Kategorien aus custom drinks ab, wenn event.categories leer ist', () => {
  const result = _internal.calculate(
      {
        eventName: 'Test',
        durationHours: 4,
        guests: {adults: 10, children: 0},
        season: 'uebergang',
        eventType: 'familienfeier',
        categories: [],
        customDrinkIds: ['bitburger-0-0'],
        pufferProzent: 0,
      },
      DEFAULT_RATES,
      {
        'bitburger-0-0': {
          name: 'Bitburger 0,0%',
          kategorie: 'bier_alkoholfrei',
          einheiten: [{einheitsgroesse: 0.5, gebindeinheit: 'Flasche'}],
        },
      },
  );

  const standardCategories = result.ergebnis.filter((item) => !item.isCustomDrink);
  const bier = result.ergebnis.find((item) => item.kategorie === 'bier');
  const bitburger = result.ergebnis.find((item) => item.kategorie === 'bitburger-0-0');

  assert.equal(standardCategories.length, 1, 'nur eine Standardkategorie wird berechnet');
  assert.ok(bier, 'bier ist als abgeleitete Oberkategorie vorhanden');
  assert.ok(bitburger, 'custom drink vorhanden');
  assert.equal(bitburger.drinkKategorie, 'bier_alkoholfrei');
  assert.equal(bitburger.literOhnePuffer, bier.literOhnePuffer);
  assert.equal(bitburger.literMitPuffer, bier.literMitPuffer);
});
