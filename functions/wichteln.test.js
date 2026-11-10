const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const wichteln = require('./wichteln');

class FakeHttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const SERVER_TS = {__serverTimestamp: true};
const fakeAdmin = {firestore: {
  FieldValue: {serverTimestamp: () => SERVER_TS},
  Timestamp: {fromMillis: (ms) => ({toMillis: () => ms})},
}};

/**
 * Firestore-Ersatz mit dem, was wichteln.js braucht: Dokumente nach Pfad, Collection-
 * Abfragen (where == und <=, orderBy, limit), Batches, Transaktionen, recursiveDelete.
 * Server-Zeitstempel werden beim Schreiben wie in Firestore zu Zeitstempeln mit fortlaufender
 * Uhr; stelleUhr(ms) setzt sie vor (für Tests mit Terminen).
 */
const makeDb = (seed = {}) => {
  const store = new Map(Object.entries(seed));
  let uhr = 1000;
  let autoId = 0;
  const resolve = (data) => {
    const out = {};
    Object.entries(data).forEach(([key, value]) => {
      if (value === SERVER_TS) {
        const ms = (uhr += 1);
        out[key] = {toMillis: () => ms};
      } else {
        out[key] = value;
      }
    });
    return out;
  };
  const write = {
    set: (path, data) => store.set(path, resolve(data)),
    update: (path, data) => {
      if (!store.has(path)) throw new Error(`update auf fehlendes Dokument ${path}`);
      store.set(path, {...store.get(path), ...resolve(data)});
    },
    delete: (path) => store.delete(path),
  };
  const snap = (path) => ({
    id: path.split('/').pop(),
    exists: store.has(path),
    data: () => (store.has(path) ? {...store.get(path)} : undefined),
  });
  const docRef = (path) => ({
    path,
    id: path.split('/').pop(),
    get: async () => snap(path),
    set: async (data) => write.set(path, data),
    update: async (data) => write.update(path, data),
    delete: async () => write.delete(path),
  });
  const vergleichswert = (wert) => (wert && typeof wert.toMillis === 'function' ? wert.toMillis() : wert);
  const passt = (data, [field, op, value]) => (op === '==' ?
    data[field] === value :
    data[field] !== undefined && data[field] !== null && vergleichswert(data[field]) <= vergleichswert(value));
  const query = (collPath, filters = [], max = Infinity, sortFeld = null) => ({
    where: (field, op, value) => {
      assert.ok(op === '==' || op === '<=', `Operator ${op}`);
      return query(collPath, [...filters, [field, op, value]], max, sortFeld);
    },
    orderBy: (field) => query(collPath, filters, max, field),
    limit: (n) => query(collPath, filters, n, sortFeld),
    get: async () => {
      const prefix = `${collPath}/`;
      const docs = [...store.keys()]
          .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
          .filter((path) => filters.every((filter) => passt(store.get(path), filter)))
          .sort((a, b) => (sortFeld ?
            vergleichswert(store.get(a)[sortFeld]) - vergleichswert(store.get(b)[sortFeld]) : 0))
          .slice(0, max)
          // Wie in Firestore: data() liefert den Stand zum Zeitpunkt der Abfrage.
          .map((path) => [path, {...store.get(path)}])
          .map(([path, stand]) => ({id: path.split('/').pop(), ref: docRef(path), data: () => ({...stand})}));
      return {docs, empty: docs.length === 0, size: docs.length};
    },
  });
  const db = {
    store,
    reads: 0,
    stelleUhr: (ms) => {
      uhr = Math.max(uhr, ms);
    },
    doc: (path) => docRef(path),
    collection: (path) => ({
      ...query(path),
      doc: (id) => docRef(`${path}/${id || `auto${String(autoId += 1).padStart(8, '0')}`}`),
    }),
    batch: () => {
      const ops = [];
      return {
        set: (ref, data) => ops.push(() => write.set(ref.path, data)),
        update: (ref, data) => ops.push(() => write.update(ref.path, data)),
        delete: (ref) => ops.push(() => write.delete(ref.path)),
        commit: async () => ops.forEach((op) => op()),
      };
    },
    runTransaction: async (handler) => {
      const ops = [];
      const tx = {
        get: async (ref) => snap(ref.path),
        set: (ref, data) => ops.push(() => write.set(ref.path, data)),
        update: (ref, data) => ops.push(() => write.update(ref.path, data)),
        delete: (ref) => ops.push(() => write.delete(ref.path)),
      };
      const result = await handler(tx);
      ops.forEach((op) => op());
      return result;
    },
    recursiveDelete: async (ref) => {
      [...store.keys()]
          .filter((path) => path === ref.path || path.startsWith(`${ref.path}/`))
          .forEach((path) => store.delete(path));
    },
  };
  return db;
};

const baseSeed = () => ({
  'users/orga': {role: 'edit'},
  'users/andere': {role: 'admin'},
  'users/leser': {role: 'read'},
  'users/gast': {role: 'guest'},
});

const auth = (uid, provider = 'password') => ({uid, token: {firebase: {sign_in_provider: provider}}});

// Neue Runden brauchen ein Datum der Feier; weit genug weg, dass es keine Frist berührt.
const FEIER = '2099-12-24';
const verwalten = (db, uid, daten, extra = {}) =>
  wichteln.verwalten(fakeAdmin, db, FakeHttpsError, {auth: uid ? auth(uid) : null, daten, ...extra});
// Ohne eigenen Ersatz darf kein Test eine Seite abrufen.
const keinAbruf = async (url) => assert.fail(`unerwarteter Abruf von ${url}`);
const teilnahme = (db, daten, ladeVorschau = keinAbruf, jetztMs) =>
  wichteln.teilnahme(fakeAdmin, db, FakeHttpsError, {daten, ladeVorschau, jetztMs});

const rejectsWith = (promise, code) => assert.rejects(promise, (err) => {
  assert.equal(err.code, code, err.message);
  return true;
});

/** Legt eine Runde mit Teilnehmern an; liefert Runde, Teilnehmer nach Name und Link-Aufrufer. */
const setupRunde = async (namen = ['Anna', 'Ben', 'Cleo', 'Dana'], {ladeVorschau} = {}) => {
  const db = makeDb(baseSeed());
  const sicht = await verwalten(db, 'orga', {aktion: 'anlegen', datum: FEIER, titel: 'Advent 2026', anlass: 'weihnachten', budget: '20 €', hinweis: 'Bescherung am 13.12.', namen});
  const rundeId = sicht.runde.id;
  const tn = Object.fromEntries(sicht.teilnehmer.map((t) => [t.name, t]));
  const als = (name, aktion, daten = {}) => teilnahme(db, {aktion, rundeId, token: tn[name].token, ...daten}, ladeVorschau);
  return {db, rundeId, sicht, tn, als};
};

/** Zuordnung aus dem Speicher (nur Tests dürfen hineinsehen). */
const zuordnungen = (db, rundeId) => Object.fromEntries([...db.store.entries()]
    .filter(([path]) => path.startsWith(`wichtelRunden/${rundeId}/zuordnungen/`))
    .map(([path, data]) => [path.split('/').pop(), data.empfaengerId]));

/** Organisator legt fest, wen `name` nicht ziehen soll (Namen statt IDs). */
const setzeAusschluesse = (db, rundeId, tn, name, namen) => verwalten(db, 'orga', {
  aktion: 'ausschluesseSetzen', rundeId, teilnehmerId: tn[name].id, ausschluesse: namen.map((n) => tn[n].id),
});

/** Ausschlüsse für zieheKreis: {geber: [empfänger, ...]} als Map. */
const sperren = (objekt) => new Map(Object.entries(objekt));

// ---------------------------------------------------------------------------
// Auslosung
// ---------------------------------------------------------------------------

const pruefeKreis = (ids, zuordnung) => {
  assert.deepEqual(Object.keys(zuordnung).sort(), [...ids].sort(), 'jeder zieht genau einmal');
  assert.deepEqual(Object.values(zuordnung).sort(), [...ids].sort(), 'jeder wird genau einmal gezogen');
  ids.forEach((id) => {
    assert.notEqual(zuordnung[id], id, 'niemand zieht sich selbst');
    assert.notEqual(zuordnung[zuordnung[id]], id, 'keine gegenseitigen Paare');
  });
  // Ein einziger Kreis: vom ersten aus erreicht man alle.
  const besucht = new Set();
  let aktuell = ids[0];
  while (!besucht.has(aktuell)) {
    besucht.add(aktuell);
    aktuell = zuordnung[aktuell];
  }
  assert.equal(besucht.size, ids.length, 'ein einziger Kreis');
};

test('zieheKreis: jeder zieht genau einen anderen, ein Kreis, keine Paare', () => {
  for (let n = 3; n <= 12; n++) {
    const ids = Array.from({length: n}, (_, i) => `id${i}`);
    for (let lauf = 0; lauf < 50; lauf++) pruefeKreis(ids, wichteln.zieheKreis(ids));
  }
});

test('zieheKreis: jeder mögliche Kreis kommt vor (Zufall wird genutzt)', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const gesehen = new Set();
  for (let lauf = 0; lauf < 2000; lauf++) {
    const zuordnung = wichteln.zieheKreis(ids);
    gesehen.add(ids.map((id) => zuordnung[id]).join(','));
  }
  // (4-1)! = 6 verschiedene Kreise
  assert.equal(gesehen.size, 6);
});

test('zieheKreis lehnt weniger als drei oder doppelte IDs ab', () => {
  assert.throws(() => wichteln.zieheKreis(['a', 'b']));
  assert.throws(() => wichteln.zieheKreis(['a', 'a', 'b']));
  assert.throws(() => wichteln.zieheKreis(null));
});

test('zieheKreis mit Ausschlüssen: nie ein ausgeschlossener Empfänger, weiter ein Kreis ohne Paare', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  // Zwei Paare ziehen sich nicht gegenseitig, a soll außerdem c nicht ziehen.
  const ausschluesse = sperren({a: ['b', 'c'], b: ['a'], c: ['d'], d: ['c']});
  for (let lauf = 0; lauf < 300; lauf++) {
    const zuordnung = wichteln.zieheKreis(ids, {ausschluesse});
    pruefeKreis(ids, zuordnung);
    ausschluesse.forEach((gesperrt, geber) => assert.ok(!gesperrt.includes(zuordnung[geber]), `${geber} zieht ${zuordnung[geber]}`));
  }
});

test('zieheKreis mit Ausschlüssen: jeder erlaubte Kreis kommt vor, kein anderer', () => {
  // Fünf Teilnehmer: 4! = 24 Kreise, in 6 davon zieht a den b. Bleiben 18.
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const gesehen = new Set();
  for (let lauf = 0; lauf < 3000; lauf++) {
    const zuordnung = wichteln.zieheKreis(ids, {ausschluesse: sperren({a: ['b']})});
    assert.notEqual(zuordnung.a, 'b');
    gesehen.add(ids.map((id) => zuordnung[id]).join(','));
  }
  assert.equal(gesehen.size, 18);
});

test('zieheKreis sucht gezielt, wenn Ziehen und Verwerfen nichts findet', () => {
  // 13 im Ring, jeder darf nur die nächsten beiden ziehen. Erlaubt sind genau zwei Kreise
  // (alle +1 oder alle +2) von 12! ≈ 479 Mio. – das trifft nur die gezielte Suche, und sie
  // muss dabei zurückgehen.
  const n = 13;
  const ids = Array.from({length: n}, (_, i) => `id${i}`);
  const ausschluesse = new Map(ids.map((id, i) => [
    id, ids.filter((x) => x !== id && x !== ids[(i + 1) % n] && x !== ids[(i + 2) % n]),
  ]));
  const gesehen = new Set();
  for (let lauf = 0; lauf < 40; lauf++) {
    const zuordnung = wichteln.zieheKreis(ids, {ausschluesse});
    pruefeKreis(ids, zuordnung);
    const schritt = ids.indexOf(zuordnung.id0);
    ids.forEach((id, i) => assert.equal(zuordnung[id], ids[(i + schritt) % n]));
    gesehen.add(schritt);
  }
  assert.deepEqual([...gesehen].sort(), [1, 2]);
});

test('zieheKreis: „nicht im eigenen Team“ klappt auch, wenn ein Team die Hälfte stellt', () => {
  // 15 aus einem Team und 15 Einzelne: lösbar nur, wenn sich beide abwechseln. Ziehen und
  // Verwerfen trifft das praktisch nie; die Suche muss es ohne langes Probieren finden.
  const team = Array.from({length: 15}, (_, i) => `team${i}`);
  const solo = Array.from({length: 15}, (_, i) => `solo${i}`);
  const ausschluesse = new Map(team.map((id) => [id, team.filter((x) => x !== id)]));
  for (let lauf = 0; lauf < 10; lauf++) {
    const zuordnung = wichteln.zieheKreis([...team, ...solo], {ausschluesse});
    pruefeKreis([...team, ...solo], zuordnung);
    team.forEach((id) => assert.ok(!team.includes(zuordnung[id]), `${id} zieht ${zuordnung[id]}`));
  }
  // Einer mehr im Team: Die 16 bräuchten 16 verschiedene Empfänger außerhalb, es gibt 14.
  const groesser = [...team, 'team15'];
  const mehr = new Map(groesser.map((id) => [id, groesser.filter((x) => x !== id)]));
  assert.equal(wichteln.zieheKreis([...groesser, ...solo.slice(1)], {ausschluesse: mehr}), null);
});

test('sucheKreis findet genau dann einen Kreis, wenn es einen gibt (Abgleich mit allen Reihenfolgen)', () => {
  const {sucheKreis, sperrPruefung} = wichteln._internal;
  const reihenfolgen = (liste) => (liste.length <= 1 ? [liste] : liste.flatMap((x, i) =>
    reihenfolgen([...liste.slice(0, i), ...liste.slice(i + 1)]).map((rest) => [x, ...rest])));
  for (let lauf = 0; lauf < 400; lauf++) {
    const n = 3 + crypto.randomInt(5);
    const ids = Array.from({length: n}, (_, i) => `x${i}`);
    const dichte = crypto.randomInt(100);
    const ausschluesse = new Map(ids.map((id) => [id, ids.filter((x) => x !== id && crypto.randomInt(100) < dichte)]));
    const gesperrt = sperrPruefung(ausschluesse);
    const gibtEinen = reihenfolgen(ids.slice(1)).some((rest) => {
      const reihe = [ids[0], ...rest];
      return reihe.every((id, i) => !gesperrt(id, reihe[(i + 1) % n]));
    });
    const zuordnung = sucheKreis(ids, gesperrt, crypto.randomInt);
    const fall = JSON.stringify([...ausschluesse]);
    assert.equal(zuordnung !== null, gibtEinen, fall);
    if (zuordnung) {
      pruefeKreis(ids, zuordnung);
      ids.forEach((id) => assert.ok(!gesperrt(id, zuordnung[id]), fall));
    }
  }
});

test('zieheKreis liefert null, wenn die Ausschlüsse keinen Kreis zulassen', () => {
  // Bei dreien gibt es nur a→b→c→a und a→c→b→a; in beiden steckt ein Ausschluss.
  assert.equal(wichteln.zieheKreis(['a', 'b', 'c'], {ausschluesse: sperren({a: ['b'], b: ['a']})}), null);
  // a und b dürften nur einander ziehen – ein Kreis über alle geht so nicht.
  assert.equal(wichteln.zieheKreis(['a', 'b', 'c', 'd'], {ausschluesse: sperren({a: ['c', 'd'], b: ['c', 'd']})}), null);
  // Engpässe: a darf niemanden ziehen; niemand darf d ziehen.
  assert.equal(wichteln.zieheKreis(['a', 'b', 'c', 'd'], {ausschluesse: sperren({a: ['b', 'c', 'd']})}), null);
  assert.equal(wichteln.zieheKreis(['a', 'b', 'c', 'd'], {ausschluesse: sperren({a: ['d'], b: ['d'], c: ['d']})}), null);
});

test('zieheKreis gibt bei aussichtsloser Suche nach begrenzter Zeit auf', {timeout: 10000}, () => {
  // a und b dürfen beide nur c ziehen: unmöglich, aber ohne offensichtlichen Engpass.
  // Ohne Schrittgrenze liefe die Suche über 60 Teilnehmer praktisch endlos.
  const ids = Array.from({length: 60}, (_, i) => `id${i}`);
  const nurC = ids.filter((x) => x !== 'id2');
  const ausschluesse = sperren({id0: nurC.filter((x) => x !== 'id0'), id1: nurC.filter((x) => x !== 'id1')});
  assert.equal(wichteln.zieheKreis(ids, {ausschluesse}), null);
});

test('neuesToken: 32 Zeichen base64url und jedes Mal anders', () => {
  const tokens = new Set(Array.from({length: 200}, () => wichteln.neuesToken()));
  assert.equal(tokens.size, 200);
  tokens.forEach((token) => assert.match(token, wichteln._internal.TOKEN_MUSTER));
});

// ---------------------------------------------------------------------------
// Organisator: Berechtigung
// ---------------------------------------------------------------------------

test('wichtelVerwalten: nur angemeldete Mitglieder ab Rolle edit', async () => {
  const db = makeDb(baseSeed());
  await rejectsWith(verwalten(db, null, {aktion: 'liste'}), 'unauthenticated');
  await rejectsWith(wichteln.verwalten(fakeAdmin, db, FakeHttpsError,
      {auth: auth('orga', 'anonymous'), daten: {aktion: 'liste'}}), 'permission-denied');
  await rejectsWith(verwalten(db, 'leser', {aktion: 'liste'}), 'permission-denied');
  await rejectsWith(verwalten(db, 'gast', {aktion: 'liste'}), 'permission-denied');
  await rejectsWith(verwalten(db, 'unbekannt', {aktion: 'liste'}), 'permission-denied');
  assert.deepEqual(await verwalten(db, 'orga', {aktion: 'liste'}), {runden: []});
});

test('wichtelVerwalten schlägt geschlossen fehl, wenn die Rolle nicht lesbar ist', async () => {
  const db = makeDb(baseSeed());
  db.doc = () => ({get: async () => {
    throw new Error('offline');
  }});
  const originalError = console.error;
  console.error = () => {};
  try {
    await rejectsWith(verwalten(db, 'orga', {aktion: 'liste'}), 'unavailable');
  } finally {
    console.error = originalError;
  }
});

test('wichtelVerwalten: unbekannte Aktion', async () => {
  const db = makeDb(baseSeed());
  await rejectsWith(verwalten(db, 'orga', {aktion: 'gibtsnicht'}), 'invalid-argument');
  await rejectsWith(verwalten(db, 'orga', {aktion: 'toString'}), 'invalid-argument');
  await rejectsWith(verwalten(db, 'orga', null), 'invalid-argument');
});

test('Fremde Runden sind für andere Organisatoren nicht vorhanden', async () => {
  const {db, rundeId} = await setupRunde();
  for (const aktion of ['laden', 'auslosen', 'loeschen', 'aendern', 'teilnehmerHinzufuegen', 'ausschluesseSetzen', 'einladungSenden']) {
    await rejectsWith(verwalten(db, 'andere', {aktion, rundeId, titel: 'x', namen: ['Eve']}), 'not-found');
  }
  await rejectsWith(verwalten(db, 'orga', {aktion: 'laden', rundeId: '../users/orga'}), 'not-found');
  assert.deepEqual(await verwalten(db, 'andere', {aktion: 'liste'}), {runden: []});
});

// ---------------------------------------------------------------------------
// Organisator: Runde und Teilnehmer
// ---------------------------------------------------------------------------

test('anlegen: Runde mit Teilnehmern, eindeutigen Tokens, ohne doppelte Namen', async () => {
  const db = makeDb(baseSeed());
  const sicht = await verwalten(db, 'orga', {
    aktion: 'anlegen', datum: FEIER, titel: '  Advent   2026 ', budget: 'ca. 20 €', namen: ['Anna', ' anna ', 'Ben', '', 'Cleo'],
  });
  assert.equal(sicht.runde.titel, 'Advent 2026');
  assert.equal(sicht.runde.budget, 'ca. 20 €');
  assert.equal(sicht.runde.status, 'offen');
  assert.equal(sicht.runde.teilnehmerAnzahl, 3);
  assert.deepEqual(sicht.teilnehmer.map((t) => t.name), ['Anna', 'Ben', 'Cleo']);
  assert.equal(new Set(sicht.teilnehmer.map((t) => t.token)).size, 3);
  sicht.teilnehmer.forEach((t) => {
    assert.match(t.token, wichteln._internal.TOKEN_MUSTER);
    assert.equal(t.geoeffnet, false);
    assert.equal(t.gezogen, false);
  });
  assert.equal(db.store.get(`wichtelRunden/${sicht.runde.id}`).ownerId, 'orga');

  const liste = await verwalten(db, 'orga', {aktion: 'liste'});
  assert.equal(liste.runden.length, 1);
  assert.equal(liste.runden[0].teilnehmerAnzahl, 3);
});

test('anlegen braucht einen Titel', async () => {
  const db = makeDb(baseSeed());
  await rejectsWith(verwalten(db, 'orga', {aktion: 'anlegen', titel: '   '}), 'invalid-argument');
  await rejectsWith(verwalten(db, 'orga', {aktion: 'anlegen', titel: 'x', namen: 'Anna'}), 'invalid-argument');
});

test('aendern übernimmt Titel, Anlass, Budget und Hinweis', async () => {
  const {db, rundeId, sicht: anfang} = await setupRunde();
  assert.equal(anfang.runde.anlass, 'weihnachten');
  const sicht = await verwalten(db, 'orga', {aktion: 'aendern', rundeId, titel: 'Neu', anlass: 'geburtstag', budget: '', hinweis: 'Bitte einpacken'});
  assert.equal(sicht.runde.anlass, 'geburtstag');
  assert.equal(db.store.get(`wichtelRunden/${rundeId}`).anlass, 'geburtstag');
  assert.equal(sicht.runde.titel, 'Neu');
  assert.equal(sicht.runde.budget, '');
  assert.equal(sicht.runde.hinweis, 'Bitte einpacken');
  assert.equal(db.store.get(`wichtelRunden/${rundeId}`).titel, 'Neu');
});

test('Teilnehmer hinzufügen, umbenennen und doppelte Namen ablehnen', async () => {
  const {db, rundeId, tn} = await setupRunde(['Anna', 'Ben']);
  let sicht = await verwalten(db, 'orga', {aktion: 'teilnehmerHinzufuegen', rundeId, namen: ['Cleo']});
  assert.deepEqual(sicht.teilnehmer.map((t) => t.name), ['Anna', 'Ben', 'Cleo']);
  await rejectsWith(verwalten(db, 'orga', {aktion: 'teilnehmerHinzufuegen', rundeId, namen: ['BEN']}), 'already-exists');
  await rejectsWith(verwalten(db, 'orga', {aktion: 'teilnehmerHinzufuegen', rundeId, namen: ['  ']}), 'invalid-argument');

  sicht = await verwalten(db, 'orga', {aktion: 'teilnehmerUmbenennen', rundeId, teilnehmerId: tn.Anna.id, name: 'Anna M.'});
  assert.equal(sicht.teilnehmer[0].name, 'Anna M.');
  assert.equal(sicht.teilnehmer[0].token, tn.Anna.token, 'Umbenennen behält den Link');
  await rejectsWith(verwalten(db, 'orga', {aktion: 'teilnehmerUmbenennen', rundeId, teilnehmerId: tn.Anna.id, name: 'ben'}), 'already-exists');
  await rejectsWith(verwalten(db, 'orga', {aktion: 'teilnehmerUmbenennen', rundeId, teilnehmerId: 'gibtesnicht1', name: 'X'}), 'not-found');
});

test('Teilnehmer entfernen löscht seine Einträge und die Ideen über ihn', async () => {
  const {db, rundeId, tn, als} = await setupRunde();
  await als('Anna', 'eintragHinzufuegen', {ueberId: tn.Anna.id, text: 'Wunsch von Anna'});
  await als('Anna', 'eintragHinzufuegen', {ueberId: tn.Ben.id, text: 'Idee von Anna für Ben'});
  await als('Cleo', 'eintragHinzufuegen', {ueberId: tn.Anna.id, text: 'Idee von Cleo für Anna'});
  await als('Cleo', 'eintragHinzufuegen', {ueberId: tn.Ben.id, text: 'Idee von Cleo für Ben'});

  const sicht = await verwalten(db, 'orga', {aktion: 'teilnehmerEntfernen', rundeId, teilnehmerId: tn.Anna.id});
  assert.deepEqual(sicht.teilnehmer.map((t) => t.name), ['Ben', 'Cleo', 'Dana']);
  assert.equal(sicht.runde.teilnehmerAnzahl, 3);
  const texte = [...db.store.entries()]
      .filter(([path]) => path.includes('/eintraege/'))
      .map(([, data]) => data.text);
  assert.deepEqual(texte, ['Idee von Cleo für Ben']);
  await rejectsWith(als('Anna', 'laden'), 'not-found');
});

// ---------------------------------------------------------------------------
// Organisator: Auslosen, Zurücksetzen, Löschen
// ---------------------------------------------------------------------------

test('auslosen braucht mindestens drei Teilnehmer', async () => {
  const {db, rundeId} = await setupRunde(['Anna', 'Ben']);
  await rejectsWith(verwalten(db, 'orga', {aktion: 'auslosen', rundeId}), 'failed-precondition');
  assert.deepEqual(zuordnungen(db, rundeId), {});
});

test('auslosen schreibt einen Kreis und verrät dem Organisator nichts davon', async () => {
  const {db, rundeId, tn} = await setupRunde();
  const sicht = await verwalten(db, 'orga', {aktion: 'auslosen', rundeId});
  assert.equal(sicht.runde.status, 'ausgelost');
  pruefeKreis(Object.values(tn).map((t) => t.id), zuordnungen(db, rundeId));

  // Die Antwort an den Organisator enthält keine Zuordnung, auch nicht versteckt.
  const json = JSON.stringify(sicht);
  assert.doesNotMatch(json, /empfaenger|zuordnung/i);
  sicht.teilnehmer.forEach((t) => assert.deepEqual(Object.keys(t).sort(),
      ['ausschluesse', 'gastId', 'gekauft', 'geoeffnet', 'gezogen', 'id', 'mail', 'name', 'token']));

  await rejectsWith(verwalten(db, 'orga', {aktion: 'auslosen', rundeId}), 'failed-precondition');
  await rejectsWith(verwalten(db, 'orga', {aktion: 'teilnehmerHinzufuegen', rundeId, namen: ['Eve']}), 'failed-precondition');
  await rejectsWith(verwalten(db, 'orga', {aktion: 'teilnehmerEntfernen', rundeId, teilnehmerId: tn.Anna.id}), 'failed-precondition');
});

test('Organisator sieht nur den Status: Link geöffnet und Los gezogen', async () => {
  const {db, rundeId, als} = await setupRunde();
  await verwalten(db, 'orga', {aktion: 'auslosen', rundeId});
  await als('Anna', 'laden');
  await als('Ben', 'ziehen');
  const {teilnehmer} = await verwalten(db, 'orga', {aktion: 'laden', rundeId});
  const status = Object.fromEntries(teilnehmer.map((t) => [t.name, [t.geoeffnet, t.gezogen]]));
  assert.deepEqual(status, {Anna: [true, false], Ben: [true, true], Cleo: [false, false], Dana: [false, false]});
});

test('„Geschenk gekauft“: nur nach dem Ziehen, Organisator sieht den Status, Zurücksetzen löscht ihn', async () => {
  const {db, rundeId, als} = await setupRunde();
  await rejectsWith(als('Anna', 'geschenkGekauft', {gekauft: true}), 'failed-precondition');
  await verwalten(db, 'orga', {aktion: 'auslosen', rundeId});
  await rejectsWith(als('Anna', 'geschenkGekauft', {gekauft: true}), 'failed-precondition');
  await als('Anna', 'ziehen');
  await rejectsWith(als('Anna', 'geschenkGekauft', {gekauft: 'ja'}), 'invalid-argument');

  const sicht = await als('Anna', 'geschenkGekauft', {gekauft: true});
  assert.equal(sicht.los.gekauft, true);
  const orga = await verwalten(db, 'orga', {aktion: 'laden', rundeId});
  assert.deepEqual(
      Object.fromEntries(orga.teilnehmer.map((t) => [t.name, t.gekauft])),
      {Anna: true, Ben: false, Cleo: false, Dana: false});
  assert.doesNotMatch(JSON.stringify(orga), /empfaenger/);

  assert.equal((await als('Anna', 'geschenkGekauft', {gekauft: false})).los.gekauft, false);
  await als('Anna', 'geschenkGekauft', {gekauft: true});
  await verwalten(db, 'orga', {aktion: 'zuruecksetzen', rundeId});
  const danach = await verwalten(db, 'orga', {aktion: 'laden', rundeId});
  assert.ok(danach.teilnehmer.every((t) => t.gekauft === false && t.gezogen === false));
});

// ---------------------------------------------------------------------------
// Organisator: Ausschlüsse
// ---------------------------------------------------------------------------

test('Ausschlüsse setzen: nur andere, vorhandene Teilnehmer, ohne Doppelte', async () => {
  const {db, rundeId, tn} = await setupRunde();
  const annaPfad = `wichtelRunden/${rundeId}/teilnehmer/${tn.Anna.id}`;
  let sicht = await verwalten(db, 'orga', {
    aktion: 'ausschluesseSetzen', rundeId, teilnehmerId: tn.Anna.id,
    ausschluesse: [tn.Ben.id, tn.Ben.id, tn.Anna.id, 'gibtesnicht1', tn.Dana.id],
  });
  const von = (name) => sicht.teilnehmer.find((t) => t.name === name).ausschluesse;
  assert.deepEqual(von('Anna'), [tn.Ben.id, tn.Dana.id]);
  assert.deepEqual(db.store.get(annaPfad).ausschluesse, [tn.Ben.id, tn.Dana.id]);
  assert.deepEqual(von('Ben'), []);

  sicht = await setzeAusschluesse(db, rundeId, tn, 'Anna', []);
  assert.deepEqual(von('Anna'), []);

  // Ältere Teilnehmer ohne das Feld haben keine Ausschlüsse.
  const {ausschluesse: _weg, ...ohneFeld} = db.store.get(annaPfad);
  db.store.set(annaPfad, ohneFeld);
  sicht = await verwalten(db, 'orga', {aktion: 'laden', rundeId});
  assert.deepEqual(von('Anna'), []);

  const setze = (daten) => verwalten(db, 'orga', {aktion: 'ausschluesseSetzen', rundeId, teilnehmerId: tn.Anna.id, ...daten});
  await rejectsWith(setze({ausschluesse: tn.Ben.id}), 'invalid-argument');
  await rejectsWith(setze({ausschluesse: ['../x']}), 'invalid-argument');
  await rejectsWith(setze({ausschluesse: [], teilnehmerId: 'gibtesnicht1'}), 'not-found');
});

test('Ausschlüsse ändern geht nur vor dem Auslosen', async () => {
  const {db, rundeId, tn} = await setupRunde();
  await setzeAusschluesse(db, rundeId, tn, 'Anna', ['Ben']);
  await verwalten(db, 'orga', {aktion: 'auslosen', rundeId});
  await rejectsWith(setzeAusschluesse(db, rundeId, tn, 'Anna', []), 'failed-precondition');
  const sicht = await verwalten(db, 'orga', {aktion: 'zuruecksetzen', rundeId});
  assert.deepEqual(sicht.teilnehmer.find((t) => t.name === 'Anna').ausschluesse, [tn.Ben.id], 'Zurücksetzen behält sie');
});

test('auslosen hält die Ausschlüsse ein', async () => {
  const {db, rundeId, tn} = await setupRunde();
  // Anna und Ben sind ein Paar, Cleo soll Dana nicht ziehen.
  await setzeAusschluesse(db, rundeId, tn, 'Anna', ['Ben']);
  await setzeAusschluesse(db, rundeId, tn, 'Ben', ['Anna']);
  await setzeAusschluesse(db, rundeId, tn, 'Cleo', ['Dana']);
  for (let lauf = 0; lauf < 20; lauf++) {
    await verwalten(db, 'orga', {aktion: 'auslosen', rundeId});
    const zuordnung = zuordnungen(db, rundeId);
    pruefeKreis(Object.values(tn).map((t) => t.id), zuordnung);
    assert.notEqual(zuordnung[tn.Anna.id], tn.Ben.id);
    assert.notEqual(zuordnung[tn.Ben.id], tn.Anna.id);
    assert.notEqual(zuordnung[tn.Cleo.id], tn.Dana.id);
    await verwalten(db, 'orga', {aktion: 'zuruecksetzen', rundeId});
  }
});

test('auslosen erklärt, wenn die Ausschlüsse keinen Kreis zulassen, und lost nicht aus', async () => {
  const {db, rundeId, tn} = await setupRunde(['Anna', 'Ben', 'Cleo']);
  const meldung = async () => {
    let text = '';
    await assert.rejects(verwalten(db, 'orga', {aktion: 'auslosen', rundeId}), (err) => {
      assert.equal(err.code, 'failed-precondition');
      text = err.message;
      return true;
    });
    return text;
  };

  await setzeAusschluesse(db, rundeId, tn, 'Anna', ['Ben', 'Cleo']);
  assert.match(await meldung(), /Für „Anna“ sind alle anderen ausgeschlossen/);

  await setzeAusschluesse(db, rundeId, tn, 'Anna', ['Cleo']);
  await setzeAusschluesse(db, rundeId, tn, 'Ben', ['Cleo']);
  assert.match(await meldung(), /„Cleo“ ist bei allen anderen ausgeschlossen/);

  // Kein einzelner Engpass, aber beide Kreise über drei enthalten einen Ausschluss.
  await setzeAusschluesse(db, rundeId, tn, 'Anna', ['Ben']);
  await setzeAusschluesse(db, rundeId, tn, 'Ben', ['Anna']);
  assert.match(await meldung(), /ließ sich keine Auslosung finden/);

  assert.deepEqual(zuordnungen(db, rundeId), {});
  assert.equal(db.store.get(`wichtelRunden/${rundeId}`).status, 'offen');
});

test('Teilnehmer entfernen nimmt ihn aus den Ausschlüssen der anderen', async () => {
  const {db, rundeId, tn} = await setupRunde();
  await setzeAusschluesse(db, rundeId, tn, 'Anna', ['Ben', 'Cleo']);
  const sicht = await verwalten(db, 'orga', {aktion: 'teilnehmerEntfernen', rundeId, teilnehmerId: tn.Ben.id});
  assert.deepEqual(sicht.teilnehmer.find((t) => t.name === 'Anna').ausschluesse, [tn.Cleo.id]);
  assert.deepEqual(db.store.get(`wichtelRunden/${rundeId}/teilnehmer/${tn.Anna.id}`).ausschluesse, [tn.Cleo.id]);
});

test('Ausschlüsse sieht nur der Organisator, nie ein Teilnehmer', async () => {
  const {db, rundeId, tn, als} = await setupRunde();
  await setzeAusschluesse(db, rundeId, tn, 'Anna', ['Ben']);
  for (const name of Object.keys(tn)) assert.doesNotMatch(JSON.stringify(await als(name, 'laden')), /ausschl/i);
  await verwalten(db, 'orga', {aktion: 'auslosen', rundeId});
  for (const name of Object.keys(tn)) assert.doesNotMatch(JSON.stringify(await als(name, 'ziehen')), /ausschl/i);
});

test('zuruecksetzen löscht die Zuordnung, Links, Wünsche und Ideen bleiben', async () => {
  const {db, rundeId, tn, als} = await setupRunde();
  await als('Anna', 'eintragHinzufuegen', {ueberId: tn.Anna.id, text: 'Buch'});
  await verwalten(db, 'orga', {aktion: 'auslosen', rundeId});
  await als('Anna', 'ziehen');
  const sicht = await verwalten(db, 'orga', {aktion: 'zuruecksetzen', rundeId});
  assert.equal(sicht.runde.status, 'offen');
  assert.equal(sicht.runde.ausgelostAm, null);
  assert.deepEqual(zuordnungen(db, rundeId), {});
  assert.ok(sicht.teilnehmer.every((t) => t.gezogen === false));
  const anna = await als('Anna', 'laden');
  assert.equal(anna.los, null);
  assert.deepEqual(anna.meineWuensche.map((w) => w.text), ['Buch']);
  await rejectsWith(verwalten(db, 'orga', {aktion: 'zuruecksetzen', rundeId}), 'failed-precondition');

  // Neu auslosen: wer schon gezogen hatte, zieht wieder selbst.
  await verwalten(db, 'orga', {aktion: 'auslosen', rundeId});
  assert.deepEqual((await als('Anna', 'laden')).los, {gezogen: false});
});

test('loeschen entfernt die Runde mit allem, die Links sind danach ungültig', async () => {
  const {db, rundeId, tn, als} = await setupRunde();
  await als('Anna', 'eintragHinzufuegen', {ueberId: tn.Anna.id, text: 'Buch'});
  await verwalten(db, 'orga', {aktion: 'auslosen', rundeId});
  assert.deepEqual(await verwalten(db, 'orga', {aktion: 'loeschen', rundeId}), {geloescht: true});
  assert.equal([...db.store.keys()].filter((path) => path.startsWith('wichtelRunden/')).length, 0);
  await rejectsWith(als('Anna', 'laden'), 'not-found');
});

// ---------------------------------------------------------------------------
// Teilnehmer
// ---------------------------------------------------------------------------

test('Teilnahme: ungültige Links sehen alle gleich aus', async () => {
  const {db, rundeId, tn} = await setupRunde();
  const andereRunde = await verwalten(db, 'orga', {aktion: 'anlegen', datum: FEIER, titel: 'Andere', namen: ['Xaver', 'Yuna', 'Zoe']});
  const fremdesToken = andereRunde.teilnehmer[0].token;
  const faelle = [
    {rundeId, token: 'A'.repeat(32)},
    {rundeId, token: fremdesToken},
    {rundeId: 'gibtesnichtxyz', token: tn.Anna.token},
    {rundeId, token: `${tn.Anna.token}x`},
    {rundeId, token: 42},
    {rundeId: '../../users/orga', token: tn.Anna.token},
    {token: tn.Anna.token},
  ];
  for (const fall of faelle) await rejectsWith(teilnahme(db, {aktion: 'laden', ...fall}), 'not-found');
  await rejectsWith(teilnahme(db, {aktion: 'gibtsnicht', rundeId, token: tn.Anna.token}), 'invalid-argument');
});

test('Teilnahme vor der Auslosung: eigene Daten, andere Gäste, kein Los', async () => {
  const {db, rundeId, tn, als} = await setupRunde();
  const sicht = await als('Ben', 'laden');
  assert.deepEqual(sicht.runde, {titel: 'Advent 2026', budget: '20 €', hinweis: 'Bescherung am 13.12.', datum: FEIER, status: 'offen'});
  assert.deepEqual(sicht.ich, {id: tn.Ben.id, name: 'Ben', sprache: null});
  assert.deepEqual(sicht.andere.map((t) => t.name), ['Anna', 'Cleo', 'Dana']);
  assert.equal(sicht.los, null);
  assert.ok(db.store.get(`wichtelRunden/${rundeId}/teilnehmer/${tn.Ben.id}`).geoeffnetAm);
  await rejectsWith(als('Ben', 'ziehen'), 'failed-precondition');
});

test('Los ziehen zeigt den eigenen Empfänger, vorher nicht', async () => {
  const {db, rundeId, tn, als} = await setupRunde();
  await verwalten(db, 'orga', {aktion: 'auslosen', rundeId});
  const zuordnung = zuordnungen(db, rundeId);

  // Vor dem Ziehen nur der Hinweis, dass ein Los bereitliegt (die Gästeliste nennt alle).
  const vorher = await als('Anna', 'laden');
  assert.deepEqual(vorher.los, {gezogen: false});
  assert.doesNotMatch(JSON.stringify(vorher), /empfaenger/);

  const gezogen = await als('Anna', 'ziehen');
  assert.equal(gezogen.los.gezogen, true);
  assert.equal(gezogen.los.empfaenger.id, zuordnung[tn.Anna.id]);
  // Erneut ziehen ändert nichts.
  assert.deepEqual((await als('Anna', 'ziehen')).los.empfaenger, gezogen.los.empfaenger);
  assert.deepEqual((await als('Anna', 'laden')).los.empfaenger, gezogen.los.empfaenger);
});

test('Wünsche und Ideen sieht nur, wer den Gast gezogen hat', async () => {
  const {db, rundeId, tn, als} = await setupRunde();
  await verwalten(db, 'orga', {aktion: 'auslosen', rundeId});
  const zuordnung = zuordnungen(db, rundeId);
  const nameVon = Object.fromEntries(Object.values(tn).map((t) => [t.id, t.name]));
  // Wer hat Anna gezogen? Und ein Dritter, der weder Anna ist noch Anna gezogen hat.
  const ziehender = nameVon[Object.keys(zuordnung).find((geber) => zuordnung[geber] === tn.Anna.id)];
  const dritter = ['Ben', 'Cleo', 'Dana'].find((name) => name !== ziehender);

  await als('Anna', 'eintragHinzufuegen', {ueberId: tn.Anna.id, text: 'WUNSCH-ANNA'});
  await als(dritter, 'eintragHinzufuegen', {ueberId: tn.Anna.id, text: 'IDEE-FUER-ANNA'});

  // Vor dem Ziehen sieht auch der Ziehende nichts.
  assert.doesNotMatch(JSON.stringify(await als(ziehender, 'laden')), /WUNSCH-ANNA|IDEE-FUER-ANNA/);

  const sicht = await als(ziehender, 'ziehen');
  assert.equal(sicht.los.empfaenger.name, 'Anna');
  assert.deepEqual(sicht.los.wuensche.map((w) => w.text), ['WUNSCH-ANNA']);
  assert.deepEqual(sicht.los.ideen.map(({text, von, vonDir}) => ({text, von, vonDir})),
      [{text: 'IDEE-FUER-ANNA', von: dritter, vonDir: false}]);

  // Anna sieht ihren Wunsch, aber nie die Idee über sich.
  const anna = await als('Anna', 'ziehen');
  assert.deepEqual(anna.meineWuensche.map((w) => w.text), ['WUNSCH-ANNA']);
  assert.doesNotMatch(JSON.stringify(anna), /IDEE-FUER-ANNA/);

  // Der Dritte sieht seine eigene Idee, aber nicht Annas Wunsch.
  const drittSicht = await als(dritter, 'ziehen');
  assert.deepEqual(drittSicht.meineIdeen.map((i) => [i.ueberName, i.text]), [['Anna', 'IDEE-FUER-ANNA']]);
  assert.doesNotMatch(JSON.stringify(drittSicht), /WUNSCH-ANNA/);

  // Der Organisator sieht keine Einträge.
  assert.doesNotMatch(JSON.stringify(await verwalten(db, 'orga', {aktion: 'laden', rundeId})), /WUNSCH-ANNA|IDEE-FUER-ANNA/);
});

test('Eine Idee für den eigenen Empfänger erscheint als „von dir“', async () => {
  const {db, rundeId, tn, als} = await setupRunde();
  await verwalten(db, 'orga', {aktion: 'auslosen', rundeId});
  const empfaengerId = zuordnungen(db, rundeId)[tn.Anna.id];
  await als('Anna', 'eintragHinzufuegen', {ueberId: empfaengerId, text: 'Eigene Idee'});
  const sicht = await als('Anna', 'ziehen');
  assert.deepEqual(sicht.los.ideen.map(({text, vonDir}) => ({text, vonDir})), [{text: 'Eigene Idee', vonDir: true}]);
});

test('Teilnahme-Antworten enthalten keine fremden Tokens', async () => {
  const {db, rundeId, tn, als} = await setupRunde();
  await verwalten(db, 'orga', {aktion: 'auslosen', rundeId});
  for (const name of Object.keys(tn)) {
    const json = JSON.stringify(await als(name, 'ziehen'));
    Object.values(tn).forEach((t) => assert.ok(!json.includes(t.token), `${name} sieht ein Token`));
  }
});

/** Verknüpft einen Teilnehmer mit einem Gästeprofil (das Feld setzt sonst der Organisator). */
const verknuepfeGast = (db, rundeId, teilnehmerId, gastId) => {
  const pfad = `wichtelRunden/${rundeId}/teilnehmer/${teilnehmerId}`;
  db.store.set(pfad, {...db.store.get(pfad), gastId});
};

test('Teilnahme: Sprache aus dem verknüpften Gästeprofil des Organisators', async () => {
  const {db, rundeId, tn, als} = await setupRunde();
  db.store.set('guests/orga/profiles/gastAnna00000001', {vorname: 'Anna', email: 'anna@example.org', sprache: 'en'});
  db.store.set('guests/orga/profiles/gastBen000000001', {vorname: 'Ben'}); // vor der Sprachwahl angelegt
  db.store.set('guests/andere/profiles/gastCleo00000001', {vorname: 'Cleo', sprache: 'fr'}); // fremder Organisator
  verknuepfeGast(db, rundeId, tn.Anna.id, 'gastAnna00000001');
  verknuepfeGast(db, rundeId, tn.Ben.id, 'gastBen000000001');
  verknuepfeGast(db, rundeId, tn.Cleo.id, 'gastCleo00000001');
  verknuepfeGast(db, rundeId, tn.Dana.id, '../../users/orga');

  const anna = await als('Anna', 'laden');
  assert.equal(anna.ich.sprache, 'en');
  // Aus dem Profil geht nur die Sprache heraus.
  assert.doesNotMatch(JSON.stringify(anna), /anna@example\.org/);
  // Profile ohne Feld gelten als Deutsch.
  assert.equal((await als('Ben', 'laden')).ich.sprache, 'de');
  // Gelesen wird nur unter den Profilen des Organisators dieser Runde.
  assert.equal((await als('Cleo', 'laden')).ich.sprache, null);
  assert.equal((await als('Dana', 'laden')).ich.sprache, null);

  // Jede Antwort trägt die Sprache, nicht nur laden.
  const nachEintrag = await als('Anna', 'eintragHinzufuegen', {ueberId: tn.Anna.id, text: 'Buch'});
  assert.equal(nachEintrag.ich.sprache, 'en');

  // Gelöschtes Profil: keine Sprache, die Seite wählt selbst.
  db.store.delete('guests/orga/profiles/gastAnna00000001');
  assert.equal((await als('Anna', 'laden')).ich.sprache, null);
});

test('Teilnahme: ein nicht lesbares Gästeprofil lässt die Seite nicht scheitern', async (t) => {
  const {db, rundeId, tn, als} = await setupRunde();
  verknuepfeGast(db, rundeId, tn.Anna.id, 'gastAnna00000001');
  const doc = db.doc;
  db.doc = (path) => (path.startsWith('guests/') ? {get: async () => {
    throw new Error('Firestore nicht erreichbar');
  }} : doc(path));
  const fehler = t.mock.method(console, 'error', () => {});

  const sicht = await als('Anna', 'laden');
  assert.equal(sicht.ich.name, 'Anna');
  assert.equal(sicht.ich.sprache, null);
  assert.equal(fehler.mock.callCount(), 1);
});

test('Einträge: Prüfungen und Obergrenze', async () => {
  const {tn, als} = await setupRunde();
  await rejectsWith(als('Anna', 'eintragHinzufuegen', {ueberId: tn.Ben.id, text: '   '}), 'invalid-argument');
  await rejectsWith(als('Anna', 'eintragHinzufuegen', {ueberId: 'gibtesnicht1', text: 'x'}), 'not-found');
  await rejectsWith(als('Anna', 'eintragHinzufuegen', {ueberId: '../x', text: 'x'}), 'invalid-argument');

  const lang = await als('Anna', 'eintragHinzufuegen', {ueberId: tn.Ben.id, text: 'x'.repeat(500)});
  assert.equal(lang.meineIdeen[0].text.length, wichteln._internal.LAENGE.text);

  for (let i = 1; i < wichteln._internal.MAX_EINTRAEGE_PRO_AUTOR; i++) {
    await als('Anna', 'eintragHinzufuegen', {ueberId: tn.Anna.id, text: `Wunsch ${i}`});
  }
  await rejectsWith(als('Anna', 'eintragHinzufuegen', {ueberId: tn.Anna.id, text: 'einer zu viel'}), 'resource-exhausted');
});

// ---------------------------------------------------------------------------
// Einträge mit Link
// ---------------------------------------------------------------------------

/** Vorschau-Ersatz: merkt sich die Abrufe, liefert eine feste Vorschau (oder null). */
const vorschauErsatz = (ergebnis = (url) => ({bild: 'https://cdn.example.de/bild.jpg', titel: `Titel zu ${url}`, seite: 'example.de'})) => {
  const abrufe = [];
  const ladeVorschau = async (url) => {
    abrufe.push(url);
    return typeof ergebnis === 'function' ? ergebnis(url) : ergebnis;
  };
  return {abrufe, ladeVorschau};
};

const gespeicherteEintraege = (db, rundeId) => [...db.store.entries()]
    .filter(([path]) => path.startsWith(`wichtelRunden/${rundeId}/eintraege/`))
    .map(([, data]) => data);

test('Link zum Wunsch: Vorschau wird beim Speichern geholt, abgelegt und mit ausgeliefert', async () => {
  const {abrufe, ladeVorschau} = vorschauErsatz();
  const {db, rundeId, tn, als} = await setupRunde(undefined, {ladeVorschau});
  const sicht = await als('Anna', 'eintragHinzufuegen', {ueberId: tn.Anna.id, text: 'Ein gutes Messer', url: ' www.example.de/messer '});

  assert.deepEqual(abrufe, ['https://www.example.de/messer']);
  const vorschau = {bild: 'https://cdn.example.de/bild.jpg', titel: 'Titel zu https://www.example.de/messer', seite: 'example.de'};
  assert.deepEqual(sicht.meineWuensche.map(({text, url, vorschau: v}) => ({text, url, vorschau: v})),
      [{text: 'Ein gutes Messer', url: 'https://www.example.de/messer', vorschau}]);
  const [gespeichert] = gespeicherteEintraege(db, rundeId);
  assert.equal(gespeichert.url, 'https://www.example.de/messer');
  assert.deepEqual(gespeichert.vorschau, vorschau);

  // Wer Anna zieht, sieht Link und Vorschau; beim Laden wird nichts erneut abgerufen.
  await verwalten(db, 'orga', {aktion: 'auslosen', rundeId});
  const zuordnung = zuordnungen(db, rundeId);
  const ziehender = Object.values(tn).find((t) => zuordnung[t.id] === tn.Anna.id).name;
  const partner = await als(ziehender, 'ziehen');
  assert.deepEqual(partner.los.wuensche.map(({url, vorschau: v}) => ({url, vorschau: v})),
      [{url: 'https://www.example.de/messer', vorschau}]);
  assert.equal(abrufe.length, 1);
});

test('Link zur Geschenkidee: der Empfänger sieht ihn nie, der Ziehende mit Absender', async () => {
  const {ladeVorschau} = vorschauErsatz();
  const {db, rundeId, tn, als} = await setupRunde(undefined, {ladeVorschau});
  await verwalten(db, 'orga', {aktion: 'auslosen', rundeId});
  const zuordnung = zuordnungen(db, rundeId);
  const nameVon = Object.fromEntries(Object.values(tn).map((t) => [t.id, t.name]));
  const ziehender = nameVon[Object.keys(zuordnung).find((geber) => zuordnung[geber] === tn.Anna.id)];
  const dritter = ['Ben', 'Cleo', 'Dana'].find((name) => name !== ziehender);

  const eigene = await als(dritter, 'eintragHinzufuegen', {ueberId: tn.Anna.id, url: 'https://shop.example.de/IDEE-LINK'});
  assert.deepEqual(eigene.meineIdeen.map(({text, url, ueberName}) => ({text, url, ueberName})),
      [{text: '', url: 'https://shop.example.de/IDEE-LINK', ueberName: 'Anna'}]);

  const partner = await als(ziehender, 'ziehen');
  assert.deepEqual(partner.los.ideen.map(({url, von}) => ({url, von})), [{url: 'https://shop.example.de/IDEE-LINK', von: dritter}]);
  assert.doesNotMatch(JSON.stringify(await als('Anna', 'ziehen')), /IDEE-LINK/);
});

test('Link genügt ohne Text; ein Link am Ende des Textes wird zum Link', async () => {
  const {abrufe, ladeVorschau} = vorschauErsatz();
  const {tn, als} = await setupRunde(undefined, {ladeVorschau});
  const sicht = await als('Anna', 'eintragHinzufuegen', {
    ueberId: tn.Anna.id,
    text: 'Amazon.de: LEGO 75192 Millennium Falcon https://amzn.eu/d/abc123',
  });
  assert.deepEqual(sicht.meineWuensche.map(({text, url}) => ({text, url})),
      [{text: 'Amazon.de: LEGO 75192 Millennium Falcon', url: 'https://amzn.eu/d/abc123'}]);
  assert.deepEqual(abrufe, ['https://amzn.eu/d/abc123']);

  // Ein Link mitten im Text bleibt Text.
  const mitte = await als('Anna', 'eintragHinzufuegen', {ueberId: tn.Ben.id, text: 'So etwas wie https://example.de nur in Blau'});
  assert.deepEqual(mitte.meineIdeen.map(({text, url}) => ({text, url})), [{text: 'So etwas wie https://example.de nur in Blau', url: null}]);
  assert.equal(abrufe.length, 1);
});

test('Ungültige Links und leere Einträge werden abgelehnt, ohne Abruf', async () => {
  const {abrufe, ladeVorschau} = vorschauErsatz();
  const {tn, als} = await setupRunde(undefined, {ladeVorschau});
  for (const url of ['javascript:alert(1)', 'ftp://example.de/x', 'nur Text', 'localhost:3000', 'https://intranet/x']) {
    await rejectsWith(als('Anna', 'eintragHinzufuegen', {ueberId: tn.Anna.id, text: 'Buch', url}), 'invalid-argument');
  }
  await rejectsWith(als('Anna', 'eintragHinzufuegen', {ueberId: tn.Anna.id, text: '  ', url: '  '}), 'invalid-argument');
  await rejectsWith(als('Anna', 'eintragHinzufuegen', {ueberId: tn.Anna.id, text: '', url: 42}), 'invalid-argument');
  assert.deepEqual(abrufe, []);
});

test('Ohne Vorschau wird trotzdem gespeichert; Einträge ohne Link haben weder Link noch Vorschau', async () => {
  const {ladeVorschau} = vorschauErsatz(null);
  const {tn, als} = await setupRunde(undefined, {ladeVorschau});
  await als('Anna', 'eintragHinzufuegen', {ueberId: tn.Anna.id, text: '', url: 'https://example.de/nicht-erreichbar'});
  const sicht = await als('Anna', 'eintragHinzufuegen', {ueberId: tn.Anna.id, text: 'Wollsocken'});
  assert.deepEqual(sicht.meineWuensche.map(({text, url, vorschau}) => ({text, url, vorschau})), [
    {text: '', url: 'https://example.de/nicht-erreichbar', vorschau: null},
    {text: 'Wollsocken', url: null, vorschau: null},
  ]);
});

test('Volles Kontingent: kein Abruf mehr für den Link', async () => {
  const {abrufe, ladeVorschau} = vorschauErsatz();
  const {tn, als} = await setupRunde(undefined, {ladeVorschau});
  for (let i = 0; i < wichteln._internal.MAX_EINTRAEGE_PRO_AUTOR; i++) {
    await als('Anna', 'eintragHinzufuegen', {ueberId: tn.Anna.id, text: `Wunsch ${i}`});
  }
  await rejectsWith(als('Anna', 'eintragHinzufuegen', {ueberId: tn.Anna.id, url: 'https://example.de/x'}), 'resource-exhausted');
  assert.deepEqual(abrufe, []);
});

test('Einträge löschen: nur eigene', async () => {
  const {db, tn, als} = await setupRunde();
  const anna = await als('Anna', 'eintragHinzufuegen', {ueberId: tn.Anna.id, text: 'Buch'});
  const wunschId = anna.meineWuensche[0].id;

  const ben = await als('Ben', 'eintragLoeschen', {eintragId: wunschId});
  assert.ok(ben);
  assert.ok([...db.store.keys()].some((path) => path.endsWith(`/eintraege/${wunschId}`)), 'fremder Eintrag bleibt');

  const nachher = await als('Anna', 'eintragLoeschen', {eintragId: wunschId});
  assert.deepEqual(nachher.meineWuensche, []);
  await rejectsWith(als('Anna', 'eintragLoeschen', {eintragId: 'a/b'}), 'invalid-argument');
});

test('Bereinigung: Leerraum, Länge, Nicht-Strings', () => {
  const {bereinige, leseNamen} = wichteln._internal;
  assert.equal(bereinige('  a \n\t b  ', 10), 'a b');
  assert.equal(bereinige('abcdef', 3), 'abc');
  assert.equal(bereinige(42, 10), '');
  assert.deepEqual(leseNamen(['Lena', 'lena', ' Tom ', 7, ''], FakeHttpsError),
      [{name: 'Lena', gastId: null}, {name: 'Tom', gastId: null}]);
  assert.deepEqual(leseNamen([{name: ' Anna  M. ', gastId: 'gastAnna0001'}, {name: 'Ben', gastId: null}], FakeHttpsError),
      [{name: 'Anna M.', gastId: 'gastAnna0001'}, {name: 'Ben', gastId: null}]);
  // Neuer Gast mit Vor- und Nachname; Adresse nur zu einem Gast (ohne Gast fällt sie weg).
  assert.deepEqual(leseNamen([
    {vorname: ' Lena ', nachname: 'Neu', email: ' Lena@Example.com'},
    {name: 'Ben', gastId: 'gastBen00001', email: 'ben@example.com'},
    {name: 'Tom', email: 'tom@example.com'},
    {vorname: 'lena', nachname: 'NEU'},
  ], FakeHttpsError), [
    {name: 'Lena Neu', gastId: null, email: 'lena@example.com', neuerGast: {vorname: 'Lena', nachname: 'Neu'}},
    {name: 'Ben', gastId: 'gastBen00001', email: 'ben@example.com'},
    {name: 'Tom', gastId: null},
  ]);
  assert.equal(leseNamen([{vorname: 'V'.repeat(50), nachname: 'N'.repeat(50)}], FakeHttpsError)[0].name.length, 60);
  assert.throws(() => leseNamen([{vorname: 'Lena'}], FakeHttpsError));
  assert.throws(() => leseNamen([{name: 'Anna', gastId: 'gastAnna0001', email: 'keine-adresse'}], FakeHttpsError));
  assert.throws(() => leseNamen([{name: 'Anna', gastId: '../x'}], FakeHttpsError));
  assert.throws(() => leseNamen([{name: 'Anna', gastId: 42}], FakeHttpsError));
  assert.throws(() => leseNamen(Array.from({length: 101}, (_, i) => `n${i}`), FakeHttpsError));
});

// ---------------------------------------------------------------------------
// Einladung per Mail
// ---------------------------------------------------------------------------

const {APP_URL, MAX_MAILS_PRO_TAG, berlinerTag} = wichteln._internal;
const JETZT = Date.UTC(2026, 11, 1, 12);

/** Gästelisten: orga hat Anna (Englisch), Ben (ohne Sprache = Deutsch), Cleo (ohne E-Mail). */
const mailSeed = () => ({
  ...baseSeed(),
  'users/orga': {role: 'edit', vorname: 'Olga'},
  'guests/orga/profiles/gastAnna0001': {vorname: 'Anna', nachname: 'Muster', email: 'anna@example.com', sprache: 'en'},
  'guests/orga/profiles/gastBen00001': {vorname: 'Ben', nachname: 'Beispiel', email: 'Ben@Example.com'},
  'guests/orga/profiles/gastCleo0001': {vorname: 'Cleo', nachname: 'Ohne'},
  'guests/andere/profiles/gastFremd001': {vorname: 'Eve', nachname: 'Fremd', email: 'eve@example.com'},
});

/** SMTP-Ersatz: merkt sich Mails; Adressen in `fehlerFuer` lehnt er wie ein Server ab. */
const makeMailer = ({fehlerFuer = []} = {}) => {
  const zustand = {gesendet: [], erstellt: 0, geschlossen: 0};
  zustand.factory = () => {
    zustand.erstellt += 1;
    return {
      senden: async (mail) => {
        if (fehlerFuer.includes(mail.to)) {
          throw Object.assign(new Error(`550 5.1.1 <${mail.to}>: Recipient address rejected`),
              {code: 'EENVELOPE', responseCode: 550, command: 'RCPT TO'});
        }
        zustand.gesendet.push(mail);
        return {};
      },
      schliessen: () => {
        zustand.geschlossen += 1;
      },
    };
  };
  return zustand;
};

const setupMailRunde = async (mailer = makeMailer(), seed = mailSeed(), anlass = undefined) => {
  const db = makeDb(seed);
  const extra = {mailer: mailer.factory, jetztMs: JETZT};
  const sicht = await verwalten(db, 'orga', {aktion: 'anlegen', datum: FEIER, titel: 'Advent 2026', anlass, budget: '20 €', hinweis: 'Bescherung am 13.12.'}, extra);
  const rundeId = sicht.runde.id;
  const orga = (daten) => verwalten(db, 'orga', {rundeId, ...daten}, extra);
  return {db, rundeId, mailer, orga};
};

const nachName = (sicht) => Object.fromEntries(sicht.teilnehmer.map((t) => [t.name, t]));

const mitStillemLog = async (fn) => {
  const zeilen = [];
  const original = console.error;
  console.error = (...args) => zeilen.push(args.map(String).join(' '));
  try {
    return {ergebnis: await fn(), zeilen};
  } finally {
    console.error = original;
  }
};

/** Trägt `namen` ein, füllt mit Namen ohne Gast auf drei auf und lost aus; liefert die Antwort des Auslosens. */
const eintragenUndAuslosen = async (orga, namen) => {
  const auffuellen = ['Xaver', 'Yvonne', 'Zora'].slice(0, Math.max(0, 3 - namen.length));
  await orga({aktion: 'teilnehmerHinzufuegen', namen: [...namen, ...auffuellen]});
  return orga({aktion: 'auslosen'});
};

test('Eintragen verschickt nichts; das Auslosen schickt Gästen mit E-Mail ihren Link, in ihrer Sprache', async () => {
  const {db, rundeId, mailer, orga} = await setupMailRunde();
  const eingetragen = await orga({aktion: 'teilnehmerHinzufuegen', namen: [
    {name: 'Anna Muster', gastId: 'gastAnna0001'},
    {name: 'Ben Beispiel', gastId: 'gastBen00001'},
    {name: 'Cleo Ohne', gastId: 'gastCleo0001'},
    'Dana',
  ]});
  assert.equal(mailer.erstellt, 0, 'vor dem Auslosen geht keine Mail raus');
  assert.equal(eingetragen.versand, undefined);
  assert.ok(eingetragen.teilnehmer.every((t) => t.mail === null));
  assert.ok(![...db.store.keys()].some((pfad) => pfad.startsWith('wichtelErinnerungen/')), 'ohne Einladung keine Erinnerung');

  const sicht = await orga({aktion: 'auslosen'});
  assert.equal(sicht.runde.status, 'ausgelost');
  assert.deepEqual(sicht.versand, {gesendet: 2, fehlgeschlagen: 0, grund: null});
  const tn = nachName(sicht);
  const anna = mailer.gesendet.find((m) => m.to === 'anna@example.com');
  const ben = mailer.gesendet.find((m) => m.to === 'ben@example.com');
  assert.equal(mailer.gesendet.length, 2);
  assert.equal(anna.subject, '🎁 You\'re invited to a gift exchange, Anna!');
  assert.match(anna.text, /^Hi Anna,\n\ngreat to have you on board! Olga has invited you/);
  assert.ok(anna.text.includes(`${APP_URL}/wichteln/${rundeId}/${tn['Anna Muster'].token}`), 'Annas eigener Link');
  assert.equal(ben.subject, '🎁 Du bist zum Wichteln eingeladen, Ben!', 'ohne Sprache im Profil: Deutsch');
  assert.ok(ben.text.includes(`${APP_URL}/wichteln/${rundeId}/${tn['Ben Beispiel'].token}`), 'Bens eigener Link');
  assert.match(ben.text, /Budget: 20,00\s€\n\nHinweis: Bescherung am 13\.12\./);
  assert.equal(mailer.erstellt, 1, 'ein Mailer für alle Mails des Aufrufs');
  assert.equal(mailer.geschlossen, 1);

  assert.deepEqual([tn['Anna Muster'].gastId, tn['Anna Muster'].mail.status], ['gastAnna0001', 'gesendet']);
  assert.equal(typeof tn['Anna Muster'].mail.am, 'number');
  assert.deepEqual([tn['Cleo Ohne'].gastId, tn['Cleo Ohne'].mail], ['gastCleo0001', null], 'ohne Adresse keine Mail');
  assert.deepEqual([tn.Dana.gastId, tn.Dana.mail], [null, null]);

  // Die Adressen bleiben im Gästeprofil, in der Runde stehen sie nirgends.
  const runde = JSON.stringify([...db.store.entries()].filter(([path]) => path.startsWith('wichtelRunden/')));
  assert.doesNotMatch(runde, /@/);
  // Teilnehmer sehen weder Gast-Verknüpfung noch Mailstatus noch Adressen.
  const annaSicht = await teilnahme(db, {aktion: 'laden', rundeId, token: tn['Anna Muster'].token});
  assert.doesNotMatch(JSON.stringify(annaSicht), /gastId|mail|@/i);
});

test('Der Anlass der Runde wählt die Mail-Variante: Weihnachten und Nikolaus Nordpol, sonst herzlich', async () => {
  for (const [anlass, betreff] of [['weihnachten', /^📜 Ein Brief vom Nordpol für Ben$/], ['nikolaus', /^📜 /], ['geburtstag', /^🎁 Du bist zum Wichteln eingeladen, Ben!$/]]) {
    const {mailer, orga} = await setupMailRunde(makeMailer(), mailSeed(), anlass);
    await eintragenUndAuslosen(orga, [{name: 'Ben Beispiel', gastId: 'gastBen00001'}]);
    assert.match(mailer.gesendet[0].subject, betreff, anlass);
  }
});

test('Ohne Gast mit E-Mail-Adresse wird kein Mailer erzeugt (SMTP-Secrets bleiben ungelesen)', async () => {
  const {mailer, orga} = await setupMailRunde();
  const sicht = await eintragenUndAuslosen(orga, ['Anna', {name: 'Cleo Ohne', gastId: 'gastCleo0001'}]);
  assert.deepEqual(sicht.versand, {gesendet: 0, fehlgeschlagen: 0, grund: null});
  assert.equal(mailer.erstellt, 0);
});

test('Verknüpft werden nur Gäste aus der eigenen Gästeliste', async () => {
  const {mailer, orga} = await setupMailRunde();
  await rejectsWith(orga({aktion: 'teilnehmerHinzufuegen', namen: [{name: 'X', gastId: '../../users/orga'}]}), 'invalid-argument');
  const sicht = await eintragenUndAuslosen(orga, [
    {name: 'Eve Fremd', gastId: 'gastFremd001'},
    {name: 'Niemand', gastId: 'gibtesnicht1'},
  ]);
  assert.deepEqual(sicht.teilnehmer.map((t) => t.gastId), [null, null, null]);
  assert.equal(mailer.erstellt, 0);
});

test('Anlegen mit Gästen verschickt auch erst beim Auslosen', async () => {
  const mailer = makeMailer();
  const db = makeDb(mailSeed());
  const extra = {mailer: mailer.factory, jetztMs: JETZT};
  const sicht = await verwalten(db, 'orga', {aktion: 'anlegen', datum: FEIER, titel: 'Advent', namen: [{name: 'Anna', gastId: 'gastAnna0001'}, 'Ben', 'Cleo']}, extra);
  assert.equal(sicht.versand, undefined);
  assert.equal(mailer.erstellt, 0);
  const ausgelost = await verwalten(db, 'orga', {aktion: 'auslosen', rundeId: sicht.runde.id}, extra);
  assert.deepEqual(ausgelost.versand, {gesendet: 1, fehlgeschlagen: 0, grund: null});
  assert.equal(mailer.gesendet[0].to, 'anna@example.com');
});

test('Mailversand nicht eingerichtet: ausgelost ist trotzdem, Mail als nicht verschickt markiert', async () => {
  const {orga} = await setupMailRunde({factory: () => null});
  const sicht = await eintragenUndAuslosen(orga, [{name: 'Anna', gastId: 'gastAnna0001'}]);
  assert.equal(sicht.runde.status, 'ausgelost');
  assert.deepEqual(sicht.versand, {gesendet: 0, fehlgeschlagen: 1, grund: 'nicht-eingerichtet'});
  assert.equal(nachName(sicht).Anna.mail.status, 'fehler');
});

test('SMTP-Fehler: Status fehler, im Log nur Codes und IDs, keine Adresse', async () => {
  const {orga} = await setupMailRunde(makeMailer({fehlerFuer: ['anna@example.com']}));
  const {ergebnis: sicht, zeilen} = await mitStillemLog(() => eintragenUndAuslosen(orga, [
    {name: 'Anna', gastId: 'gastAnna0001'},
    {name: 'Ben', gastId: 'gastBen00001'},
  ]));
  assert.deepEqual(sicht.versand, {gesendet: 1, fehlgeschlagen: 1, grund: 'fehler'});
  const tn = nachName(sicht);
  assert.deepEqual([tn.Anna.mail.status, tn.Ben.mail.status], ['fehler', 'gesendet']);
  assert.equal(zeilen.length, 1);
  assert.match(zeilen[0], /EENVELOPE 550 RCPT TO/);
  assert.ok(zeilen[0].includes(tn.Anna.id));
  assert.doesNotMatch(zeilen.join('\n'), /@/);
});

test('Tageslimit je Organisator: was darüber liegt, geht nicht raus', async () => {
  const seed = mailSeed();
  seed[`wichtelMailLimits/orga_${berlinerTag(JETZT)}`] = {uid: 'orga', tag: berlinerTag(JETZT), anzahl: MAX_MAILS_PRO_TAG - 1};
  const {db, mailer, orga} = await setupMailRunde(makeMailer(), seed);
  const sicht = await eintragenUndAuslosen(orga, [
    {name: 'Anna', gastId: 'gastAnna0001'},
    {name: 'Ben', gastId: 'gastBen00001'},
  ]);
  assert.deepEqual(sicht.versand, {gesendet: 1, fehlgeschlagen: 1, grund: 'limit'});
  assert.equal(mailer.gesendet.length, 1);
  assert.equal(db.store.get(`wichtelMailLimits/orga_${berlinerTag(JETZT)}`).anzahl, MAX_MAILS_PRO_TAG);

  // Am nächsten Tag ist wieder Platz.
  const ben = nachName(sicht).Ben;
  const ziel = ben.mail.status === 'fehler' ? ben : nachName(sicht).Anna;
  const morgen = await verwalten(db, 'orga', {aktion: 'einladungSenden', rundeId: sicht.runde.id, teilnehmerId: ziel.id},
      {mailer: mailer.factory, jetztMs: JETZT + 24 * 60 * 60 * 1000});
  assert.deepEqual(morgen.versand, {gesendet: 1, fehlgeschlagen: 0, grund: null});
});

test('Limit nicht prüfbar: keine Mail (schlägt geschlossen fehl), ausgelost ist trotzdem', async () => {
  const {db, mailer, orga} = await setupMailRunde();
  // Nur der Zähler ist nicht lesbar; die Transaktion des Auslosens läuft.
  const transaktion = db.runTransaction;
  db.runTransaction = (handler) => transaktion(async (tx) => handler({...tx, get: async (ref) => {
    if (ref.path.startsWith('wichtelMailLimits/')) throw new Error('offline');
    return tx.get(ref);
  }}));
  const {ergebnis: sicht} = await mitStillemLog(() => eintragenUndAuslosen(orga, [{name: 'Anna', gastId: 'gastAnna0001'}]));
  assert.equal(sicht.runde.status, 'ausgelost');
  assert.deepEqual(sicht.versand, {gesendet: 0, fehlgeschlagen: 1, grund: 'fehler'});
  assert.equal(mailer.gesendet.length, 0);
});

test('Gästeliste beim Auslosen nicht lesbar: ausgelost ist trotzdem, Versand als fehlgeschlagen gemeldet', async () => {
  const {db, mailer, orga} = await setupMailRunde();
  await orga({aktion: 'teilnehmerHinzufuegen', namen: [{name: 'Anna', gastId: 'gastAnna0001'}, {name: 'Cleo', gastId: 'gastCleo0001'}, 'Dana']});
  const doc = db.doc;
  db.doc = (pfad) => (pfad.startsWith('guests/') ? {...doc(pfad), get: async () => {
    throw new Error('offline');
  }} : doc(pfad));
  const {ergebnis: sicht, zeilen} = await mitStillemLog(() => orga({aktion: 'auslosen'}));
  assert.equal(sicht.runde.status, 'ausgelost');
  assert.deepEqual(sicht.versand, {gesendet: 0, fehlgeschlagen: 2, grund: 'fehler'}, 'beide Verknüpften, ob mit Adresse oder nicht');
  assert.equal(mailer.erstellt, 0);
  assert.equal(zeilen.length, 1);
  assert.doesNotMatch(zeilen[0], /@/);
});

test('einladungSenden: erst nach dem Auslosen; erneut senden, Gast nachträglich verknüpfen, Prüfungen', async () => {
  const {mailer, orga} = await setupMailRunde();
  let sicht = await orga({aktion: 'teilnehmerHinzufuegen', namen: ['Anna Muster', 'Ben', {name: 'Cleo', gastId: 'gastCleo0001'}]});
  const tn = nachName(sicht);

  // Vor dem Auslosen geht keine Mail raus, auch nicht von Hand.
  await rejectsWith(orga({aktion: 'einladungSenden', teilnehmerId: tn['Anna Muster'].id, gastId: 'gastAnna0001'}), 'failed-precondition');
  sicht = await orga({aktion: 'auslosen'});
  assert.deepEqual(sicht.versand, {gesendet: 0, fehlgeschlagen: 0, grund: null}, 'Cleo hat keine Adresse');
  assert.equal(mailer.erstellt, 0);

  // Ohne Verknüpfung weiß der Server keine Adresse.
  await rejectsWith(orga({aktion: 'einladungSenden', teilnehmerId: tn['Anna Muster'].id}), 'failed-precondition');
  // Mit Gast-ID: verknüpfen und senden.
  sicht = await orga({aktion: 'einladungSenden', teilnehmerId: tn['Anna Muster'].id, gastId: 'gastAnna0001'});
  assert.deepEqual(sicht.versand, {gesendet: 1, fehlgeschlagen: 0, grund: null});
  assert.equal(nachName(sicht)['Anna Muster'].gastId, 'gastAnna0001');
  assert.equal(mailer.gesendet[0].to, 'anna@example.com');

  // Erneut senden mit der gespeicherten Verknüpfung.
  sicht = await orga({aktion: 'einladungSenden', teilnehmerId: tn['Anna Muster'].id});
  assert.equal(sicht.versand.gesendet, 1);
  assert.equal(mailer.gesendet.length, 2);

  await rejectsWith(orga({aktion: 'einladungSenden', teilnehmerId: tn.Cleo.id}), 'failed-precondition');
  await rejectsWith(orga({aktion: 'einladungSenden', teilnehmerId: tn.Ben.id, gastId: 'gastFremd001'}), 'not-found');
  await rejectsWith(orga({aktion: 'einladungSenden', teilnehmerId: 'gibtesnicht1'}), 'not-found');
  await rejectsWith(orga({aktion: 'einladungSenden', teilnehmerId: tn.Ben.id, gastId: 'a/b'}), 'invalid-argument');
  assert.equal(mailer.gesendet.length, 2);
});

test('Organisator ohne Vorname: neutrale Einladung', async () => {
  const seed = mailSeed();
  seed['users/orga'] = {role: 'edit'};
  const {mailer, orga} = await setupMailRunde(makeMailer(), seed);
  await eintragenUndAuslosen(orga, [{name: 'Ben', gastId: 'gastBen00001'}]);
  assert.match(mailer.gesendet[0].text, /^Hallo Ben,\n\nschön, dass du dabei bist! Du bist beim Wichteln „Advent 2026“ dabei\./);
});

test('Ein Gast ist je Runde nur einmal dabei, auch unter anderem Namen', async () => {
  const {mailer, orga} = await setupMailRunde();
  const sicht = await orga({aktion: 'teilnehmerHinzufuegen', namen: [{name: 'Anna M.', gastId: 'gastAnna0001'}, 'Ben', 'Dora']});
  await rejectsWith(orga({aktion: 'teilnehmerHinzufuegen', namen: [{name: 'Anna Muster', gastId: 'gastAnna0001'}]}), 'already-exists');
  await rejectsWith(orga({aktion: 'teilnehmerHinzufuegen', namen: [
    {name: 'Cleo', gastId: 'gastCleo0001'},
    {name: 'Cleo O.', gastId: 'gastCleo0001'},
  ]}), 'already-exists');
  await orga({aktion: 'auslosen'});
  // Erneut senden darf einen anderen Teilnehmer nicht mit einem schon verknüpften Gast verbinden.
  const ben = nachName(sicht).Ben;
  await rejectsWith(orga({aktion: 'einladungSenden', teilnehmerId: ben.id, gastId: 'gastAnna0001'}), 'already-exists');
  assert.equal(mailer.gesendet.length, 1);
});

// ---------------------------------------------------------------------------
// Neue Gäste aus der Runde (Vorname, Nachname, E-Mail)
// ---------------------------------------------------------------------------

const gaesteProfile = (db, uid = 'orga') => Object.fromEntries([...db.store.entries()]
    .filter(([pfad]) => pfad.startsWith(`guests/${uid}/profiles/`))
    .map(([pfad, daten]) => [pfad.split('/').pop(), daten]));

test('Neuer Gast: Eintragen legt ein Gästeprofil an und verknüpft es, die Mail kommt beim Auslosen', async () => {
  const {db, rundeId, mailer, orga} = await setupMailRunde();
  const vorher = Object.keys(gaesteProfile(db));
  const sicht = await orga({aktion: 'teilnehmerHinzufuegen', namen: [
    {vorname: ' Lena ', nachname: 'Neu  Mann', email: ' Lena.Neu@Example.com '},
    {vorname: 'Tom', nachname: 'Ohne', email: ''},
    'Xaver',
  ]});
  assert.equal(mailer.erstellt, 0, 'beim Eintragen keine Mail');

  const neueIds = Object.keys(gaesteProfile(db)).filter((id) => !vorher.includes(id));
  assert.equal(neueIds.length, 2, 'je neuem Gast ein Profil, für „Xaver“ keins');
  const tn = nachName(sicht);
  assert.deepEqual(Object.keys(tn).sort(), ['Lena Neu Mann', 'Tom Ohne', 'Xaver']);
  const lena = gaesteProfile(db)[tn['Lena Neu Mann'].gastId];
  assert.ok(neueIds.includes(tn['Lena Neu Mann'].gastId) && neueIds.includes(tn['Tom Ohne'].gastId));
  assert.equal(tn.Xaver.gastId, null);
  assert.deepEqual(
      [lena.id, lena.vorname, lena.nachname, lena.email, lena.sprache, lena.erstelltVon],
      [tn['Lena Neu Mann'].gastId, 'Lena', 'Neu Mann', 'lena.neu@example.com', 'de', 'orga'],
  );
  assert.equal(typeof lena.erstellt.toMillis, 'function');
  assert.equal(gaesteProfile(db)[tn['Tom Ohne'].gastId].email, '');
  assert.deepEqual(gaesteProfile(db, 'andere'), {gastFremd001: mailSeed()['guests/andere/profiles/gastFremd001']}, 'nur die eigene Gästeliste');

  // Das Profil sieht aus wie eines aus „Gäste verwalten“: manageGuestProfile.js nimmt es unverändert an.
  const {validateProfile} = require('./manageGuestProfile')._internal;
  const {id: _id, erstellt: _e, aktualisiert: _a, erstelltVon: _v, ...felder} = lena;
  assert.deepEqual(validateProfile(felder, {isCreate: true}), felder);

  const ausgelost = await orga({aktion: 'auslosen'});
  assert.deepEqual(ausgelost.versand, {gesendet: 1, fehlgeschlagen: 0, grund: null});
  assert.equal(mailer.gesendet[0].to, 'lena.neu@example.com');
  assert.equal(mailer.gesendet[0].subject, '🎁 Du bist zum Wichteln eingeladen, Lena!');
  assert.ok(mailer.gesendet[0].text.includes(`${APP_URL}/wichteln/${rundeId}/${tn['Lena Neu Mann'].token}`));
});

test('Neuer Gast: Prüfungen; bei einem Fehler entsteht weder Profil noch Teilnehmer', async () => {
  const {db, orga} = await setupMailRunde();
  await orga({aktion: 'teilnehmerHinzufuegen', namen: [{vorname: 'Lena', nachname: 'Neu', email: 'lena@example.com'}]});
  const stand = () => [Object.keys(gaesteProfile(db)).length,
    [...db.store.keys()].filter((pfad) => pfad.includes('/teilnehmer/')).length];
  const vorher = stand();

  await rejectsWith(orga({aktion: 'teilnehmerHinzufuegen', namen: [{vorname: 'Lena', nachname: ''}]}), 'invalid-argument');
  await rejectsWith(orga({aktion: 'teilnehmerHinzufuegen', namen: [{nachname: 'Neu'}]}), 'invalid-argument');
  // Name schon in der Runde (Groß-/Kleinschreibung egal): abgelehnt, bevor ein Profil entsteht.
  await rejectsWith(orga({aktion: 'teilnehmerHinzufuegen', namen: [{vorname: 'LENA', nachname: 'neu'}]}), 'already-exists');
  for (const falsch of ['lena', 'lena@example', 'a,b@example.com', '<lena@example.com>', 'lena @example.com', `${'x'.repeat(250)}@example.com`]) {
    await assert.rejects(
        orga({aktion: 'teilnehmerHinzufuegen', namen: [{vorname: 'Mia', nachname: 'Muster', email: falsch}, 'Tom']}),
        (err) => {
          assert.equal(err.code, 'invalid-argument', falsch);
          assert.equal(err.message, 'Die E-Mail-Adresse für „Mia Muster“ sieht nicht gültig aus.', 'ohne die Adresse');
          return true;
        },
    );
  }
  assert.deepEqual(stand(), vorher);
});

test('Vorhandener Gast: eine mitgeschickte Adresse ergänzt eine fehlende, eine andere wird abgelehnt', async () => {
  const {db, mailer, orga} = await setupMailRunde();
  await rejectsWith(orga({aktion: 'teilnehmerHinzufuegen', namen: [
    {name: 'Cleo Ohne', gastId: 'gastCleo0001', email: 'cleo@example.com'},
    {name: 'Ben Beispiel', gastId: 'gastBen00001', email: 'ben.neu@example.com'},
  ]}), 'failed-precondition');
  assert.equal(gaesteProfile(db).gastCleo0001.email, undefined, 'abgelehnt: auch Cleo bleibt unverändert');
  assert.equal([...db.store.keys()].filter((pfad) => pfad.includes('/teilnehmer/')).length, 0);

  const sicht = await orga({aktion: 'teilnehmerHinzufuegen', namen: [
    {name: 'Cleo Ohne', gastId: 'gastCleo0001', email: 'Cleo@Example.com'},
    {name: 'Ben Beispiel', gastId: 'gastBen00001', email: 'BEN@example.com'},
    {name: 'Anna Muster', gastId: 'gastAnna0001'},
  ]});
  const profile = gaesteProfile(db);
  assert.equal(profile.gastCleo0001.email, 'cleo@example.com', 'fehlende Adresse ergänzt');
  assert.equal(typeof profile.gastCleo0001.aktualisiert.toMillis, 'function');
  assert.deepEqual(profile.gastBen00001, mailSeed()['guests/orga/profiles/gastBen00001'], 'gleiche Adresse: Profil unverändert');
  assert.deepEqual(sicht.teilnehmer.map((t) => t.gastId), ['gastCleo0001', 'gastBen00001', 'gastAnna0001']);

  const ausgelost = await orga({aktion: 'auslosen'});
  assert.deepEqual(ausgelost.versand, {gesendet: 3, fehlgeschlagen: 0, grund: null});
  assert.ok(mailer.gesendet.some((m) => m.to === 'cleo@example.com'));
});

test('Neu auslosen nach dem Zurücksetzen: Mail nur an Teilnehmer ohne zugestellte Einladung', async () => {
  const fehlerFuer = ['anna@example.com'];
  const mailer = makeMailer({fehlerFuer});
  const {orga} = await setupMailRunde(mailer);
  const {ergebnis: erste} = await mitStillemLog(() => eintragenUndAuslosen(orga, [
    {name: 'Anna', gastId: 'gastAnna0001'},
    {name: 'Ben', gastId: 'gastBen00001'},
  ]));
  assert.deepEqual(erste.versand, {gesendet: 1, fehlgeschlagen: 1, grund: 'fehler'});

  await orga({aktion: 'zuruecksetzen'});
  await orga({aktion: 'teilnehmerHinzufuegen', namen: [{vorname: 'Lena', nachname: 'Neu', email: 'lena@example.com'}]});
  fehlerFuer.length = 0; // Annas Postfach nimmt wieder an
  const zweite = await orga({aktion: 'auslosen'});
  assert.deepEqual(zweite.versand, {gesendet: 2, fehlgeschlagen: 0, grund: null});
  assert.deepEqual(mailer.gesendet.map((m) => m.to).sort(), ['anna@example.com', 'ben@example.com', 'lena@example.com'],
      'Ben hat seine Einladung schon; Anna (gescheitert) und Lena (neu) bekommen sie jetzt');
});

test('E-Mail-Prüfung: die App prüft beim Eintragen wie der Server (src/utils/wichtelGaeste.js)', () => {
  const quelle = require('fs').readFileSync(require('path').join(__dirname, '../src/utils/wichtelGaeste.js'), 'utf8');
  const muster = quelle.match(/^const EMAIL_MUSTER = \/(.+)\/;$/m);
  const laenge = quelle.match(/^const EMAIL_MAX = (\d+);$/m);
  assert.ok(muster && laenge, 'EMAIL_MUSTER und EMAIL_MAX in der App gefunden');
  assert.equal(muster[1], wichteln._internal.EMAIL_MUSTER.source);
  assert.equal(Number(laenge[1]), wichteln._internal.LAENGE.email);
});

test('unbekannter Anlass wird zu leer', async () => {
  const {db, rundeId} = await setupRunde();
  const sicht = await verwalten(db, 'orga', {aktion: 'aendern', rundeId, titel: 'Neu', anlass: 'Quatsch', budget: '', hinweis: ''});
  assert.equal(sicht.runde.anlass, '');
});

// ---------------------------------------------------------------------------
// Neuigkeiten per Mail an den Schenker
// ---------------------------------------------------------------------------

const {NEUIGKEITEN_COLLECTION, SAMMELFENSTER_MS, MINDESTABSTAND_MS, NEUER_VERSUCH_MS} = wichteln._internal;
const MINUTE = 60 * 1000;

/** Vier Gäste, alle verknüpft; Dana ohne Adresse, Ben ohne Sprache (= Deutsch). */
const neuigkeitenSeed = () => ({
  ...baseSeed(),
  'users/orga': {role: 'edit', vorname: 'Olga'},
  'guests/orga/profiles/gastAnna0001': {vorname: 'Anna', email: 'anna@example.com', sprache: 'en'},
  'guests/orga/profiles/gastBen00001': {vorname: 'Ben', email: 'ben@example.com'},
  'guests/orga/profiles/gastCleo0001': {vorname: 'Cleo', email: 'cleo@example.com', sprache: 'fr'},
  'guests/orga/profiles/gastDana0001': {vorname: 'Dana'},
});

/**
 * Ausgeloste Runde mit vier verknüpften Gästen. `schenker` ist Ben Beispiel, `empfaenger` sein
 * gezogener Gast, `dritter` ein weiterer Gast, der Ideen für den Empfänger schreibt. Die Uhr
 * (jetztMs und Server-Zeitstempel) stellt `zeit` gemeinsam vor.
 */
const setupNeuigkeiten = async ({anlass = 'weihnachten'} = {}) => {
  const db = makeDb(neuigkeitenSeed());
  let jetzt = JETZT;
  db.stelleUhr(jetzt);
  const einladungen = makeMailer();
  const orga = (daten) => verwalten(db, 'orga', daten, {mailer: einladungen.factory, jetztMs: jetzt});
  const sicht = await orga({aktion: 'anlegen', datum: FEIER, titel: 'Advent 2026', anlass, budget: '20 €', hinweis: '', namen: [
    {name: 'Anna Muster', gastId: 'gastAnna0001'},
    {name: 'Ben Beispiel', gastId: 'gastBen00001'},
    {name: 'Cleo Ohne', gastId: 'gastCleo0001'},
    {name: 'Dana', gastId: 'gastDana0001'},
  ]});
  const rundeId = sicht.runde.id;
  await orga({aktion: 'auslosen', rundeId});
  const tn = nachName(sicht);
  const nameVon = Object.fromEntries(sicht.teilnehmer.map((t) => [t.id, t.name]));
  const empfaengerVon = (geber) => nameVon[db.store.get(`wichtelRunden/${rundeId}/zuordnungen/${tn[geber].id}`).empfaengerId];
  const schenker = 'Ben Beispiel';
  const empfaenger = empfaengerVon(schenker);
  const dritter = Object.keys(tn).find((name) => name !== schenker && name !== empfaenger);
  const versand = makeMailer();
  return {
    db, rundeId, tn, orga, schenker, empfaenger, dritter, empfaengerVon, versand,
    zeit: (ms) => {
      jetzt = ms;
      db.stelleUhr(ms);
    },
    als: (wer, aktion, daten = {}) => teilnahme(db, {aktion, rundeId, token: tn[wer].token, ...daten}, keinAbruf, jetzt),
    wunsch: (wer, text) => teilnahme(db, {aktion: 'eintragHinzufuegen', rundeId, token: tn[wer].token, ueberId: tn[wer].id, text}, keinAbruf, jetzt),
    idee: (wer, fuer, text) => teilnahme(db, {aktion: 'eintragHinzufuegen', rundeId, token: tn[wer].token, ueberId: tn[fuer].id, text}, keinAbruf, jetzt),
    lauf: (mailer = versand) => wichteln.versendeNeuigkeiten(fakeAdmin, db, {mailer: mailer.factory, jetztMs: jetzt}),
    vormerker: (geber = schenker) => db.store.get(`${NEUIGKEITEN_COLLECTION}/${rundeId}_${tn[geber].id}`),
    teilnehmerDoc: (name) => db.store.get(`wichtelRunden/${rundeId}/teilnehmer/${tn[name].id}`),
  };
};

const faelligMs = (vormerker) => vormerker.faelligAm.toMillis();

test('Neuigkeiten: vormerken erst nach dem Ziehen, mehrere Einträge ergeben eine Mail ohne Namen und Inhalte', async () => {
  const r = await setupNeuigkeiten();
  await r.wunsch(r.empfaenger, 'Vor dem Ziehen des Schenkers');
  assert.equal(r.vormerker(), undefined, 'ohne gezogenes Los keine Mail');

  await r.als(r.schenker, 'ziehen');
  r.zeit(JETZT + MINUTE);
  await r.wunsch(r.empfaenger, 'Ein Buch über Pilze');
  const erster = r.vormerker();
  assert.equal(faelligMs(erster), JETZT + MINUTE + SAMMELFENSTER_MS);
  assert.deepEqual([erster.rundeId, erster.geberId, erster.zaehler, erster.fehlversuche], [r.rundeId, r.tn[r.schenker].id, 1, 0]);
  assert.doesNotMatch(JSON.stringify(erster), /empfaenger|ueber/i, 'der Vormerker verrät die Zuordnung nicht');

  r.zeit(JETZT + 2 * MINUTE);
  await r.wunsch(r.empfaenger, 'Wollsocken');
  await r.idee(r.dritter, r.empfaenger, 'Kinogutschein');
  await r.idee(r.schenker, r.empfaenger, 'Eigene Idee des Schenkers');
  await r.wunsch(r.dritter, 'Wunsch eines anderen Gasts für sich selbst');
  assert.equal(r.vormerker().zaehler, 3, 'eigene Idee des Schenkers zählt nicht');
  assert.equal(faelligMs(r.vormerker()), faelligMs(erster), 'der Termin bleibt beim ersten Eintrag');

  r.zeit(JETZT + 10 * MINUTE);
  assert.deepEqual(await r.lauf(), {gesendet: 0, verworfen: 0, verschoben: 0});
  assert.equal(r.versand.gesendet.length, 0);

  r.zeit(JETZT + 32 * MINUTE);
  assert.deepEqual(await r.lauf(), {gesendet: 1, verworfen: 0, verschoben: 0});
  assert.equal(r.versand.gesendet.length, 1);
  const mail = r.versand.gesendet[0];
  assert.equal(mail.to, 'ben@example.com');
  assert.equal(mail.subject, '📜 Neue Hinweise vom Nordpol für Ben');
  assert.match(mail.text, /Dein Schützling hat 2 neue Wünsche auf den Wunschzettel geschrieben, und aus der Wichtelrunde gibt es eine neue Geschenkidee\./);
  const link = `${APP_URL}/wichteln/${r.rundeId}/${r.tn[r.schenker].token}`;
  assert.ok(mail.text.includes(`: ${link}\n`) && mail.text.includes(`: ${link}?gekauft=1\n`), 'beide Links im Text');
  assert.ok(mail.html.includes(`href="${link}?gekauft=1"`), 'Button „Geschenk gekauft“');
  const ganz = `${mail.subject}\n${mail.text}\n${mail.html}`;
  const vorname = r.empfaenger.split(' ')[0];
  assert.ok(!ganz.includes(vorname), `der Empfänger (${vorname}) steht nicht in der Mail`);
  for (const inhalt of ['Pilze', 'Wollsocken', 'Kinogutschein']) assert.ok(!ganz.includes(inhalt), inhalt);
  assert.equal(r.versand.geschlossen, 1);

  assert.equal(r.vormerker(), undefined, 'nach dem Versand gelöscht');
  const geber = r.teilnehmerDoc(r.schenker);
  assert.ok(geber.neuigkeitenMailAm.toMillis() >= JETZT + 32 * MINUTE);
  assert.ok(geber.neuigkeitenBis.toMillis() < JETZT + 32 * MINUTE);
  const limit = r.db.store.get(`wichtelMailLimits/orga_${berlinerTag(JETZT)}`);
  assert.equal(limit.anzahl, 4, 'drei Einladungen und eine Neuigkeiten-Mail im Tageslimit des Organisators');
});

test('Neuigkeiten: höchstens eine Mail am Tag, die nächste nennt nur, was danach kam', async () => {
  const r = await setupNeuigkeiten({anlass: 'geburtstag'});
  await r.als(r.schenker, 'ziehen');
  await r.wunsch(r.empfaenger, 'Erster Wunsch');
  r.zeit(JETZT + SAMMELFENSTER_MS);
  await r.lauf();
  assert.equal(r.versand.gesendet.length, 1);
  const mailAm = r.teilnehmerDoc(r.schenker).neuigkeitenMailAm.toMillis();

  r.zeit(JETZT + 2 * 60 * MINUTE);
  await r.idee(r.dritter, r.empfaenger, 'Idee am selben Tag');
  await r.idee(r.dritter, r.empfaenger, 'Noch eine Idee');
  assert.equal(faelligMs(r.vormerker()), mailAm + MINDESTABSTAND_MS);
  r.zeit(JETZT + 5 * 60 * MINUTE);
  await r.lauf();
  assert.equal(r.versand.gesendet.length, 1, 'noch keine zweite Mail am selben Tag');

  r.zeit(mailAm + MINDESTABSTAND_MS);
  assert.deepEqual(await r.lauf(), {gesendet: 1, verworfen: 0, verschoben: 0});
  const zweite = r.versand.gesendet[1];
  assert.equal(zweite.subject, '🎁 Neuigkeiten für dein Wichtelgeschenk, Ben');
  assert.match(zweite.text, /\n\nFür die Person, die du beschenkst, gibt es 2 neue Geschenkideen aus der Runde\.\n\n/);
});

test('Neuigkeiten: Sprache aus dem Gästeprofil des Schenkers', async () => {
  const r = await setupNeuigkeiten({anlass: 'geburtstag'});
  const anna = 'Anna Muster';
  const ihrEmpfaenger = r.empfaengerVon(anna);
  await r.als(anna, 'ziehen');
  await r.wunsch(ihrEmpfaenger, 'Tee');
  r.zeit(JETZT + SAMMELFENSTER_MS);
  await r.lauf();
  const mail = r.versand.gesendet.find((m) => m.to === 'anna@example.com');
  assert.equal(mail.subject, '🎁 There\'s news on your gift exchange, Anna');
  assert.match(mail.text, /The person you're giving a gift to has added a new wish\./);
});

test('Neuigkeiten: „Geschenk gekauft“ stoppt die Mails, Zurücknehmen startet sie wieder', async () => {
  const r = await setupNeuigkeiten();
  await r.als(r.schenker, 'ziehen');
  await r.wunsch(r.empfaenger, 'Wunsch 1');
  assert.ok(r.vormerker());
  await r.als(r.schenker, 'geschenkGekauft', {gekauft: true});
  await r.wunsch(r.empfaenger, 'Wunsch 2');
  assert.equal(r.vormerker().zaehler, 1, 'nach „gekauft“ zählt kein Eintrag mehr');

  r.zeit(JETZT + SAMMELFENSTER_MS);
  assert.deepEqual(await r.lauf(), {gesendet: 0, verworfen: 1, verschoben: 0});
  assert.equal(r.vormerker(), undefined);
  await r.wunsch(r.empfaenger, 'Wunsch 3');
  assert.equal(r.vormerker(), undefined);

  await r.als(r.schenker, 'geschenkGekauft', {gekauft: false});
  await r.wunsch(r.empfaenger, 'Wunsch 4');
  r.zeit(JETZT + 2 * SAMMELFENSTER_MS);
  assert.deepEqual(await r.lauf(), {gesendet: 1, verworfen: 0, verschoben: 0});
  assert.match(r.versand.gesendet[0].text, /hat 4 neue Wünsche/, 'auch die nie gemeldeten Wünsche zählen');
});

test('Neuigkeiten: kein Vormerker ohne Adresse oder vor dem Auslosen; gelöschter Eintrag ergibt keine Mail', async () => {
  const r = await setupNeuigkeiten();
  const dana = 'Dana';
  await r.als(dana, 'ziehen');
  await r.wunsch(r.empfaengerVon(dana), 'Für Danas Empfänger');
  assert.equal(r.vormerker(dana), undefined, 'Danas Gästeprofil hat keine Adresse');

  await r.als(r.schenker, 'ziehen');
  const sicht = await r.wunsch(r.empfaenger, 'Gleich wieder weg');
  assert.ok(r.vormerker());
  await r.als(r.empfaenger, 'eintragLoeschen', {eintragId: sicht.meineWuensche.find((w) => w.text === 'Gleich wieder weg').id});
  r.zeit(JETZT + SAMMELFENSTER_MS);
  assert.deepEqual(await r.lauf(), {gesendet: 0, verworfen: 1, verschoben: 0});
  assert.equal(r.versand.gesendet.length, 0);
  assert.equal(r.versand.erstellt, 1);

  const offen = await setupRunde();
  await offen.als('Anna', 'eintragHinzufuegen', {ueberId: offen.tn.Anna.id, text: 'Vor dem Auslosen'});
  assert.ok(![...offen.db.store.keys()].some((pfad) => pfad.startsWith(`${NEUIGKEITEN_COLLECTION}/`)));
});

test('Neuigkeiten: Einträge während des Versands gehen mit der nächsten Mail raus', async () => {
  const r = await setupNeuigkeiten();
  await r.als(r.schenker, 'ziehen');
  await r.wunsch(r.empfaenger, 'Vor dem Versand');
  r.zeit(JETZT + SAMMELFENSTER_MS);
  const mailer = makeMailer();
  const factory = mailer.factory;
  mailer.factory = () => {
    const transport = factory();
    return {
      ...transport,
      senden: async (mail) => {
        await r.wunsch(r.empfaenger, 'Während des Versands');
        return transport.senden(mail);
      },
    };
  };
  assert.deepEqual(await r.lauf(mailer), {gesendet: 1, verworfen: 0, verschoben: 0});
  assert.match(mailer.gesendet[0].text, /hat einen neuen Wunsch/);
  const bleibt = r.vormerker();
  assert.ok(bleibt, 'der Vormerker bleibt für den späten Eintrag');
  assert.equal(faelligMs(bleibt), JETZT + SAMMELFENSTER_MS + MINDESTABSTAND_MS);

  r.zeit(faelligMs(bleibt));
  assert.deepEqual(await r.lauf(), {gesendet: 1, verworfen: 0, verschoben: 0});
  assert.match(r.versand.gesendet[0].text, /hat einen neuen Wunsch/);
  assert.equal(r.vormerker(), undefined);
});

test('Neuigkeiten: Tageslimit, fehlender Mailversand und Fehler verschieben, nach drei Fehlversuchen verworfen', async () => {
  const r = await setupNeuigkeiten();
  await r.als(r.schenker, 'ziehen');
  await r.wunsch(r.empfaenger, 'Wunsch');
  let jetzt = JETZT + SAMMELFENSTER_MS;
  r.zeit(jetzt);

  const limitPfad = `wichtelMailLimits/orga_${berlinerTag(jetzt)}`;
  const vorher = r.db.store.get(limitPfad);
  r.db.store.set(limitPfad, {...vorher, anzahl: MAX_MAILS_PRO_TAG});
  assert.deepEqual(await r.lauf(), {gesendet: 0, verworfen: 0, verschoben: 1});
  assert.equal(faelligMs(r.vormerker()), jetzt + NEUER_VERSUCH_MS);
  assert.equal(r.vormerker().fehlversuche, 0, 'Tageslimit ist kein Fehlversuch');
  r.db.store.set(limitPfad, vorher);

  jetzt += NEUER_VERSUCH_MS;
  r.zeit(jetzt);
  assert.deepEqual(await r.lauf({factory: () => null}), {gesendet: 0, verworfen: 0, verschoben: 1}, 'ohne SMTP');
  assert.equal(r.vormerker().fehlversuche, 0);

  const kaputt = makeMailer({fehlerFuer: ['ben@example.com']});
  const {zeilen} = await mitStillemLog(async () => {
    for (const erwartet of [{verschoben: 1, fehlversuche: 1}, {verschoben: 1, fehlversuche: 2}, {verworfen: 1}]) {
      jetzt += NEUER_VERSUCH_MS;
      r.zeit(jetzt);
      const ergebnis = await r.lauf(kaputt);
      assert.equal(ergebnis.verschoben, erwartet.verschoben || 0);
      assert.equal(ergebnis.verworfen, erwartet.verworfen || 0);
      if (erwartet.fehlversuche) assert.equal(r.vormerker().fehlversuche, erwartet.fehlversuche);
    }
  });
  assert.equal(r.vormerker(), undefined);
  assert.equal(kaputt.gesendet.length, 0);
  assert.ok(zeilen.length >= 3);
  for (const zeile of zeilen) assert.doesNotMatch(zeile, /@/, 'keine Adresse im Log');
});

test('Neuigkeiten: Zurücksetzen und Löschen der Runde räumen Vormerker ab; ohne Fälliges keine Verbindung', async () => {
  const r = await setupNeuigkeiten();
  await r.als(r.schenker, 'ziehen');
  await r.wunsch(r.empfaenger, 'Wunsch');
  assert.ok(r.vormerker());
  await r.orga({aktion: 'zuruecksetzen', rundeId: r.rundeId});
  assert.equal(r.vormerker(), undefined);

  await r.orga({aktion: 'auslosen', rundeId: r.rundeId});
  const neuerSchenker = Object.keys(r.tn).find((name) => name !== 'Dana' && r.empfaengerVon(name) !== 'Dana');
  await r.als(neuerSchenker, 'ziehen');
  await r.wunsch(r.empfaengerVon(neuerSchenker), 'Nach dem neuen Auslosen');
  assert.ok(r.vormerker(neuerSchenker));
  await r.orga({aktion: 'loeschen', rundeId: r.rundeId});
  assert.ok(![...r.db.store.keys()].some((pfad) => pfad.startsWith(`${NEUIGKEITEN_COLLECTION}/`)));

  r.zeit(JETZT + MINDESTABSTAND_MS);
  assert.deepEqual(await r.lauf(), {gesendet: 0, verworfen: 0, verschoben: 0});
  assert.equal(r.versand.erstellt, 0, 'ohne fällige Vormerker wird kein Mailer erzeugt');
});

// ---------------------------------------------------------------------------
// Erinnerung per Mail an Gäste ohne Wünsche
// ---------------------------------------------------------------------------

const {ERINNERUNGEN_COLLECTION, ERINNERUNG_NACH_MS, ERINNERUNG_ABSTAND_MS, MAX_ERINNERUNGEN} = wichteln._internal;
const TAG = 24 * 60 * MINUTE;

/**
 * Ausgeloste Runde mit vier verknüpften Gästen (Dana ohne Adresse, Anna Englisch, Cleo
 * Französisch). Anna, Ben und Cleo bekommen ihre Einladung mit dem Auslosen zu JETZT; gezogen hat
 * noch niemand. Die Uhr (jetztMs und Server-Zeitstempel) stellt `zeit` gemeinsam vor.
 */
const setupErinnerung = async ({anlass = 'weihnachten'} = {}) => {
  const db = makeDb(neuigkeitenSeed());
  let jetzt = JETZT;
  db.stelleUhr(jetzt);
  const einladungen = makeMailer();
  let rundeId = null;
  const orga = (daten) => verwalten(db, 'orga', {rundeId, ...daten}, {mailer: einladungen.factory, jetztMs: jetzt});
  const sicht = await orga({aktion: 'anlegen', datum: FEIER, titel: 'Advent 2026', anlass, budget: '20 €', hinweis: '', namen: [
    {name: 'Anna Muster', gastId: 'gastAnna0001'},
    {name: 'Ben Beispiel', gastId: 'gastBen00001'},
    {name: 'Cleo Ohne', gastId: 'gastCleo0001'},
    {name: 'Dana', gastId: 'gastDana0001'},
  ]});
  rundeId = sicht.runde.id;
  await orga({aktion: 'auslosen'});
  const tn = nachName(sicht);
  const versand = makeMailer();
  return {
    db, rundeId, tn, orga, einladungen, versand,
    zeit: (ms) => {
      jetzt = ms;
      db.stelleUhr(ms);
    },
    als: (wer, aktion, daten = {}) => teilnahme(db, {aktion, rundeId, token: tn[wer].token, ...daten}, keinAbruf, jetzt),
    wunsch: (wer, text) => teilnahme(db, {aktion: 'eintragHinzufuegen', rundeId, token: tn[wer].token, ueberId: tn[wer].id, text}, keinAbruf, jetzt),
    lauf: (mailer = versand) => wichteln.versendeErinnerungen(fakeAdmin, db, {mailer: mailer.factory, jetztMs: jetzt}),
    vormerker: (wer) => db.store.get(`${ERINNERUNGEN_COLLECTION}/${rundeId}_${tn[wer].id}`),
    teilnehmerPfad: (wer) => `wichtelRunden/${rundeId}/teilnehmer/${tn[wer].id}`,
    teilnehmerDoc: (wer) => db.store.get(`wichtelRunden/${rundeId}/teilnehmer/${tn[wer].id}`),
    an: (adresse) => versand.gesendet.filter((m) => m.to === adresse),
  };
};

test('Erinnerung: die zugestellte Einladung merkt sie vor, nach drei Tagen geht sie an Gäste ohne Wunsch', async () => {
  const r = await setupErinnerung();
  for (const wer of ['Anna Muster', 'Ben Beispiel', 'Cleo Ohne']) {
    const v = r.vormerker(wer);
    assert.deepEqual([v.rundeId, v.teilnehmerId, faelligMs(v), v.fehlversuche], [r.rundeId, r.tn[wer].id, JETZT + ERINNERUNG_NACH_MS, 0], wer);
    assert.doesNotMatch(JSON.stringify(v), /@|empfaenger/, 'ohne Adresse und ohne Zuordnung');
    assert.equal(r.teilnehmerDoc(wer).erinnerungen, 0);
  }
  assert.equal(r.vormerker('Dana'), undefined, 'ohne Adresse keine Einladung und keine Erinnerung');

  await r.wunsch('Ben Beispiel', 'Ein Buch über Pilze');
  r.zeit(JETZT + ERINNERUNG_NACH_MS - MINUTE);
  assert.deepEqual(await r.lauf(), {gesendet: 0, verworfen: 0, verschoben: 0});
  assert.equal(r.versand.erstellt, 0, 'ohne Fälliges wird kein Mailer erzeugt');

  const jetzt = JETZT + ERINNERUNG_NACH_MS;
  r.zeit(jetzt);
  assert.deepEqual(await r.lauf(), {gesendet: 2, verworfen: 1, verschoben: 0});
  assert.deepEqual(r.versand.gesendet.map((m) => m.to).sort(), ['anna@example.com', 'cleo@example.com']);
  const [anna] = r.an('anna@example.com');
  const link = `${APP_URL}/wichteln/${r.rundeId}/${r.tn['Anna Muster'].token}`;
  assert.equal(anna.subject, '📜 The elves are waiting for your wish list, Anna');
  assert.ok(anna.text.includes(`\n${link}\n`), 'Annas eigener Link');
  const ohneLink = [anna.subject, anna.text, anna.html].join('\n').split(link).join('');
  assert.doesNotMatch(ohneLink, /Ben|Cleo|Dana|Pilze/, 'nennt niemanden sonst aus der Runde');
  assert.equal(r.an('cleo@example.com')[0].subject, '📜 Les lutins attendent ta liste de souhaits, Cleo');
  assert.equal(r.versand.geschlossen, 1);

  assert.equal(r.vormerker('Ben Beispiel'), undefined, 'mit Wunsch verworfen');
  assert.equal(r.teilnehmerDoc('Ben Beispiel').erinnerungen, 0);
  assert.equal(faelligMs(r.vormerker('Anna Muster')), jetzt + ERINNERUNG_ABSTAND_MS, 'die nächste eine Woche später');
  assert.equal(r.teilnehmerDoc('Anna Muster').erinnerungen, 1);
  assert.equal(r.teilnehmerDoc('Anna Muster').erinnerungAm.toMillis(), jetzt);
  assert.equal(r.db.store.get(`wichtelMailLimits/orga_${berlinerTag(jetzt)}`).anzahl, 2, 'zählt zum Tageslimit des Organisators');

  // Weder der Organisator noch Teilnehmer sehen etwas von den Erinnerungen.
  const orgaSicht = await r.orga({aktion: 'laden'});
  const annaSicht = await r.als('Anna Muster', 'laden');
  assert.doesNotMatch(JSON.stringify([orgaSicht, annaSicht]), /erinnerung/i);
});

test('Erinnerung: wöchentlich, höchstens dreimal; ein eigener Wunsch beendet sie, eine Idee für andere nicht', async () => {
  const r = await setupErinnerung({anlass: 'geburtstag'});
  await r.als('Anna Muster', 'eintragHinzufuegen', {ueberId: r.tn['Ben Beispiel'].id, text: 'Idee für Ben'});

  r.zeit(JETZT + ERINNERUNG_NACH_MS);
  assert.deepEqual(await r.lauf(), {gesendet: 3, verworfen: 0, verschoben: 0});
  await r.wunsch('Cleo Ohne', 'Tee');
  r.zeit(JETZT + ERINNERUNG_NACH_MS + ERINNERUNG_ABSTAND_MS);
  assert.deepEqual(await r.lauf(), {gesendet: 2, verworfen: 1, verschoben: 0});
  r.zeit(JETZT + ERINNERUNG_NACH_MS + 2 * ERINNERUNG_ABSTAND_MS);
  assert.deepEqual(await r.lauf(), {gesendet: 2, verworfen: 0, verschoben: 0});
  assert.equal(r.vormerker('Anna Muster'), undefined, `nach der ${MAX_ERINNERUNGEN}. Erinnerung ist Schluss`);
  r.zeit(JETZT + ERINNERUNG_NACH_MS + 3 * ERINNERUNG_ABSTAND_MS);
  assert.deepEqual(await r.lauf(), {gesendet: 0, verworfen: 0, verschoben: 0});

  assert.equal(r.an('anna@example.com').length, MAX_ERINNERUNGEN, 'Annas Idee für Ben ist kein eigener Wunsch');
  assert.equal(r.an('ben@example.com').length, MAX_ERINNERUNGEN, 'eine Idee über Ben ist kein Wunsch von Ben');
  assert.equal(r.an('cleo@example.com').length, 1);
  assert.equal(r.teilnehmerDoc('Anna Muster').erinnerungen, MAX_ERINNERUNGEN);
  assert.equal(r.an('ben@example.com')[0].subject, '🎁 Noch keine Wünsche eingetragen, Ben?');

  // Erneutes Senden der Einladung startet keine neue Reihe.
  await r.orga({aktion: 'einladungSenden', teilnehmerId: r.tn['Anna Muster'].id});
  r.zeit(JETZT + ERINNERUNG_NACH_MS + 4 * ERINNERUNG_ABSTAND_MS);
  assert.deepEqual(await r.lauf(), {gesendet: 0, verworfen: 1, verschoben: 0});
  assert.equal(r.an('anna@example.com').length, MAX_ERINNERUNGEN);
});

test('Erinnerung: entfällt, sobald der Schenker des Gasts das Geschenk als gekauft markiert hat', async () => {
  const r = await setupErinnerung();
  const nameVon = Object.fromEntries(Object.entries(r.tn).map(([name, t]) => [t.id, name]));
  const schenker = Object.keys(r.tn).find((geber) =>
    nameVon[r.db.store.get(`wichtelRunden/${r.rundeId}/zuordnungen/${r.tn[geber].id}`).empfaengerId] === 'Anna Muster');
  await r.als(schenker, 'ziehen');
  await r.als(schenker, 'geschenkGekauft', {gekauft: true});

  r.zeit(JETZT + ERINNERUNG_NACH_MS);
  assert.deepEqual(await r.lauf(), {gesendet: 2, verworfen: 1, verschoben: 0});
  assert.equal(r.an('anna@example.com').length, 0);
  assert.equal(r.vormerker('Anna Muster'), undefined);
});

test('Erinnerung: erneutes Senden plant neu, hält aber eine Woche Abstand zur letzten Erinnerung; der Zähler bleibt', async () => {
  const r = await setupErinnerung();
  const anna = 'Anna Muster';
  r.zeit(JETZT + ERINNERUNG_NACH_MS);
  await r.lauf();
  assert.equal(r.an('anna@example.com').length, 1);

  const erneut = JETZT + ERINNERUNG_NACH_MS + TAG;
  r.zeit(erneut);
  await r.orga({aktion: 'einladungSenden', teilnehmerId: r.tn[anna].id});
  assert.equal(faelligMs(r.vormerker(anna)), erneut + ERINNERUNG_NACH_MS, 'drei Tage nach der neuen Einladung');

  r.zeit(erneut + ERINNERUNG_NACH_MS);
  assert.deepEqual(await r.lauf(), {gesendet: 0, verworfen: 0, verschoben: 1});
  const wochenfrist = JETZT + ERINNERUNG_NACH_MS + ERINNERUNG_ABSTAND_MS;
  assert.equal(faelligMs(r.vormerker(anna)), wochenfrist, 'eine Woche nach der letzten Erinnerung');

  r.zeit(wochenfrist);
  assert.deepEqual(await r.lauf(), {gesendet: 3, verworfen: 0, verschoben: 0});
  assert.equal(r.teilnehmerDoc(anna).erinnerungen, 2, 'erneutes Senden setzt den Zähler nicht zurück');
});

test('Erinnerung: Tageslimit und fehlender Mailversand verschieben, nach drei Fehlversuchen verworfen, keine Adresse im Log', async () => {
  const r = await setupErinnerung();
  await r.wunsch('Anna Muster', 'Wunsch');
  await r.wunsch('Cleo Ohne', 'Wunsch');
  const ben = 'Ben Beispiel';
  let jetzt = JETZT + ERINNERUNG_NACH_MS;
  r.zeit(jetzt);

  const limitPfad = `wichtelMailLimits/orga_${berlinerTag(jetzt)}`;
  r.db.store.set(limitPfad, {uid: 'orga', tag: berlinerTag(jetzt), anzahl: MAX_MAILS_PRO_TAG});
  assert.deepEqual(await r.lauf(), {gesendet: 0, verworfen: 2, verschoben: 1});
  assert.equal(faelligMs(r.vormerker(ben)), jetzt + NEUER_VERSUCH_MS);
  assert.equal(r.vormerker(ben).fehlversuche, 0, 'Tageslimit ist kein Fehlversuch');
  r.db.store.delete(limitPfad);

  jetzt += NEUER_VERSUCH_MS;
  r.zeit(jetzt);
  assert.deepEqual(await r.lauf({factory: () => null}), {gesendet: 0, verworfen: 0, verschoben: 1}, 'ohne SMTP');
  assert.equal(r.vormerker(ben).fehlversuche, 0);

  const kaputt = makeMailer({fehlerFuer: ['ben@example.com']});
  const {zeilen} = await mitStillemLog(async () => {
    for (const erwartet of [{verschoben: 1, fehlversuche: 1}, {verschoben: 1, fehlversuche: 2}, {verworfen: 1}]) {
      jetzt += NEUER_VERSUCH_MS;
      r.zeit(jetzt);
      const ergebnis = await r.lauf(kaputt);
      assert.deepEqual(ergebnis, {gesendet: 0, verworfen: erwartet.verworfen || 0, verschoben: erwartet.verschoben || 0});
      if (erwartet.fehlversuche) assert.equal(r.vormerker(ben).fehlversuche, erwartet.fehlversuche);
    }
  });
  assert.equal(r.vormerker(ben), undefined);
  assert.equal(kaputt.gesendet.length, 0);
  assert.equal(r.teilnehmerDoc(ben).erinnerungen, 0, 'nicht Zugestelltes zählt nicht');
  assert.ok(zeilen.some((zeile) => zeile.startsWith('wichtelErinnerungenVersenden:') && zeile.includes(r.tn[ben].id)));
  for (const zeile of zeilen) assert.doesNotMatch(zeile, /@/, 'keine Adresse im Log');
});

test('Erinnerung: Entfernen und Löschen räumen Vormerker ab, Zurücksetzen nicht; ohne Adresse entfällt sie', async () => {
  const r = await setupErinnerung();
  await r.orga({aktion: 'zuruecksetzen'});
  assert.ok(r.vormerker('Anna Muster'), 'Zurücksetzen behält die Erinnerung, wie die Wünsche');
  await r.orga({aktion: 'teilnehmerEntfernen', teilnehmerId: r.tn['Cleo Ohne'].id});
  assert.equal(r.vormerker('Cleo Ohne'), undefined);

  // Adresse aus dem Gästeprofil entfernt: die Erinnerung entfällt beim Versand.
  r.db.store.set('guests/orga/profiles/gastBen00001', {vorname: 'Ben'});
  r.zeit(JETZT + ERINNERUNG_NACH_MS);
  assert.deepEqual(await r.lauf(), {gesendet: 1, verworfen: 1, verschoben: 0});
  assert.equal(r.vormerker('Ben Beispiel'), undefined);

  await r.orga({aktion: 'loeschen'});
  assert.ok(![...r.db.store.keys()].some((pfad) => pfad.startsWith(`${ERINNERUNGEN_COLLECTION}/`)));
});

test('Erinnerung: Einladungen von vor dem Update werden beim Öffnen der Runde einmal vorgemerkt', async () => {
  const r = await setupErinnerung();
  // Stand vor dem Update: kein Zähler an den Teilnehmern, keine Vormerker.
  for (const [pfad, daten] of [...r.db.store.entries()]) {
    if (pfad.startsWith(`${ERINNERUNGEN_COLLECTION}/`)) {
      r.db.store.delete(pfad);
    } else if (pfad.startsWith(`wichtelRunden/${r.rundeId}/teilnehmer/`)) {
      const {erinnerungen: _weg, ...rest} = daten;
      r.db.store.set(pfad, rest);
    }
  }
  // Annas Einladung ist fünf Tage alt, Cleos ist nie angekommen.
  r.db.store.set(r.teilnehmerPfad('Anna Muster'), {...r.teilnehmerDoc('Anna Muster'), mailAm: {toMillis: () => JETZT - 5 * TAG}});
  r.db.store.set(r.teilnehmerPfad('Cleo Ohne'), {...r.teilnehmerDoc('Cleo Ohne'), mailStatus: 'fehler'});

  const jetzt = JETZT + TAG;
  r.zeit(jetzt);
  await r.orga({aktion: 'laden'});
  assert.equal(faelligMs(r.vormerker('Anna Muster')), jetzt, 'überfällig: beim nächsten Lauf');
  assert.equal(faelligMs(r.vormerker('Ben Beispiel')), r.teilnehmerDoc('Ben Beispiel').mailAm.toMillis() + ERINNERUNG_NACH_MS);
  assert.equal(r.vormerker('Cleo Ohne'), undefined, 'Einladung nicht zugestellt');
  assert.equal(r.vormerker('Dana'), undefined, 'nie per Mail eingeladen');
  assert.equal(r.teilnehmerDoc('Anna Muster').erinnerungen, 0);
  assert.equal(r.teilnehmerDoc('Cleo Ohne').erinnerungen, undefined);

  // Nur einmal: späteres Öffnen plant nichts neu.
  r.zeit(jetzt + TAG);
  await r.orga({aktion: 'laden'});
  assert.equal(faelligMs(r.vormerker('Anna Muster')), jetzt);

  assert.deepEqual(await r.lauf(), {gesendet: 1, verworfen: 0, verschoben: 0});
  assert.equal(r.an('anna@example.com').length, 1);
});

// ---------------------------------------------------------------------------
// Datum der Feier
// ---------------------------------------------------------------------------

const {ERINNERUNG_VORLAUF_TAGE, istDatum, verschiebeTag} = wichteln._internal;

test('Datum der Feier: anlegen, ändern – auch nach dem Auslosen –, löschen; ohne Feld bleibt es', async () => {
  const db = makeDb(baseSeed());
  // Neue Runden brauchen ein Datum.
  await rejectsWith(verwalten(db, 'orga', {aktion: 'anlegen', titel: 'Ohne Datum'}), 'invalid-argument');
  await rejectsWith(verwalten(db, 'orga', {aktion: 'anlegen', titel: 'Ohne Datum', datum: ''}), 'invalid-argument');
  // Ältere Runden haben keins.
  const ohne = await verwalten(db, 'orga', {aktion: 'anlegen', titel: 'Ohne Datum', datum: FEIER, namen: ['Anna', 'Ben', 'Cleo']});
  delete db.store.get(`wichtelRunden/${ohne.runde.id}`).datum;
  const sicht = await verwalten(db, 'orga', {aktion: 'anlegen', titel: 'Advent 2026', datum: '2026-12-13', namen: ['Anna', 'Ben', 'Cleo']});
  const rundeId = sicht.runde.id;
  assert.equal(sicht.runde.datum, '2026-12-13');
  assert.equal(db.store.get(`wichtelRunden/${rundeId}`).datum, '2026-12-13');
  const liste = await verwalten(db, 'orga', {aktion: 'liste'});
  assert.deepEqual(liste.runden.map((r) => r.datum).sort(), ['', '2026-12-13']);

  await verwalten(db, 'orga', {aktion: 'auslosen', rundeId});
  const felder = {aktion: 'aendern', rundeId, titel: 'Advent 2026', anlass: '', budget: '', hinweis: ''};
  let neu = await verwalten(db, 'orga', {...felder, datum: '2026-12-20'});
  assert.equal(neu.runde.datum, '2026-12-20', 'nach dem Auslosen änderbar');
  neu = await verwalten(db, 'orga', felder);
  assert.equal(neu.runde.datum, '2026-12-20', 'eine ältere App ohne Feld löscht das Datum nicht');
  const anna = neu.teilnehmer.find((t) => t.name === 'Anna');
  const teilnehmerSicht = await teilnahme(db, {aktion: 'laden', rundeId, token: anna.token});
  assert.equal(teilnehmerSicht.runde.datum, '2026-12-20');
  neu = await verwalten(db, 'orga', {...felder, datum: ''});
  assert.equal(neu.runde.datum, '');
  assert.equal(db.store.get(`wichtelRunden/${rundeId}`).datum, '');

  for (const falsch of ['2026-02-30', '13.12.2026', '2026-12-1', 'morgen', 20261213, '1999-12-24', '2026-12-13T18:00']) {
    await rejectsWith(verwalten(db, 'orga', {...felder, datum: falsch}), 'invalid-argument');
  }
  assert.equal(db.store.get(`wichtelRunden/${rundeId}`).datum, '');
});

test('Hinweis behält Zeilenumbrüche, aber keine Leerzeilen-Stapel und keine doppelten Leerzeichen', async () => {
  const db = makeDb(baseSeed());
  const sicht = await verwalten(db, 'orga', {
    aktion: 'anlegen', datum: FEIER, titel: 'Advent',
    hinweis: '  Bescherung   nach dem Essen.\r\n\n\n\nBitte  nichts Selbstgebackenes. \n',
  });
  assert.equal(sicht.runde.hinweis, 'Bescherung nach dem Essen.\n\nBitte nichts Selbstgebackenes.');
});

test('Datum der Feier: Hilfsfunktionen für Kalendertage', () => {
  assert.ok(istDatum('2028-02-29'));
  assert.ok(!istDatum('2027-02-29'));
  assert.ok(!istDatum(undefined));
  assert.equal(verschiebeTag('2027-01-02', -ERINNERUNG_VORLAUF_TAGE), '2026-12-30');
  assert.equal(verschiebeTag('2026-03-29', 1), '2026-03-30', 'Zeitumstellung verschiebt keinen Tag');
});

test('Erinnerung: die letzte kommt spätestens drei Tage vor der Feier; ein späteres Datum plant neu', async () => {
  const r = await setupErinnerung();
  const felder = {aktion: 'aendern', titel: 'Advent 2026', anlass: 'weihnachten', budget: '20 €', hinweis: ''};
  // JETZT ist der 1.12. – die erste Erinnerung am 4.12. liegt genau drei Tage vor dem 7.12.
  await r.orga({...felder, datum: '2026-12-07'});

  r.zeit(JETZT + ERINNERUNG_NACH_MS);
  assert.deepEqual(await r.lauf(), {gesendet: 3, verworfen: 0, verschoben: 0});
  assert.match(r.an('anna@example.com')[0].text, /\n\n📅 Gift exchange: Monday,? 7 December 2026\n🎁 Budget: €20\.00\n\n/);
  assert.match(r.an('ben@example.com')[0].text, /📅 Bescherung: Montag, 7\. Dezember 2026/);

  const woche = JETZT + ERINNERUNG_NACH_MS + ERINNERUNG_ABSTAND_MS;
  r.zeit(woche);
  assert.deepEqual(await r.lauf(), {gesendet: 0, verworfen: 3, verschoben: 0}, 'am 11.12. ist die Feier vorbei');
  assert.equal(r.vormerker('Anna Muster'), undefined);

  // Die Feier wird auf den 24.12. verschoben: die Erinnerungen laufen weiter.
  await r.orga({...felder, datum: '2026-12-24'});
  assert.equal(faelligMs(r.vormerker('Anna Muster')), woche);
  assert.equal(r.vormerker('Dana'), undefined, 'ohne zugestellte Einladung nichts');
  assert.deepEqual(await r.lauf(), {gesendet: 3, verworfen: 0, verschoben: 0});
  assert.equal(r.teilnehmerDoc('Anna Muster').erinnerungen, 2);

  // Ein früheres Datum plant nichts neu; das prüft der Versand.
  const vorher = faelligMs(r.vormerker('Anna Muster'));
  await r.orga({...felder, datum: '2026-12-20'});
  assert.equal(faelligMs(r.vormerker('Anna Muster')), vorher);
});

test('Erinnerung: liegt die Feier schon bei der ersten zu nah, kommt keine', async () => {
  const r = await setupErinnerung();
  await r.orga({aktion: 'aendern', titel: 'Advent 2026', anlass: '', budget: '', hinweis: '', datum: '2026-12-06'});
  r.zeit(JETZT + ERINNERUNG_NACH_MS);
  assert.deepEqual(await r.lauf(), {gesendet: 0, verworfen: 3, verschoben: 0});
  assert.equal(r.versand.gesendet.length, 0);
});

test('Neuigkeiten: ab dem Tag der Feier keine mehr, vorher mit Datum in der Mail', async () => {
  const r = await setupNeuigkeiten();
  await r.orga({aktion: 'aendern', rundeId: r.rundeId, titel: 'Advent 2026', anlass: 'weihnachten', budget: '20 €', hinweis: '', datum: '2026-12-02'});
  await r.als(r.schenker, 'ziehen');
  await r.wunsch(r.empfaenger, 'Am Tag davor');
  r.zeit(JETZT + SAMMELFENSTER_MS);
  assert.deepEqual(await r.lauf(), {gesendet: 1, verworfen: 0, verschoben: 0});
  assert.match(r.versand.gesendet[0].text, /\n\n📅 Bescherung: Mittwoch, 2\. Dezember 2026\n🎁 Budget: 20,00\s€\n\n/u);

  // Vorgemerkt am 1.12., fällig erst am 2.12. (eine Mail am Tag): dann ist Feier, sie entfällt.
  r.zeit(JETZT + 2 * 60 * MINUTE);
  await r.idee(r.dritter, r.empfaenger, 'Noch eine Idee');
  const faellig = faelligMs(r.vormerker());
  assert.equal(berlinerTag(faellig), '2026-12-02');
  r.zeit(faellig);
  assert.deepEqual(await r.lauf(), {gesendet: 0, verworfen: 1, verschoben: 0});

  await r.wunsch(r.empfaenger, 'Am Tag der Feier');
  assert.equal(r.vormerker(), undefined, 'am Tag der Feier wird nichts mehr vorgemerkt');
});
