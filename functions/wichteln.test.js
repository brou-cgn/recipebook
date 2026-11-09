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
const fakeAdmin = {firestore: {FieldValue: {serverTimestamp: () => SERVER_TS}}};

/**
 * Firestore-Ersatz mit dem, was wichteln.js braucht: Dokumente nach Pfad, Collection-
 * Abfragen (where ==, limit), Batches, Transaktionen, recursiveDelete. Server-Zeitstempel
 * werden beim Schreiben wie in Firestore zu Zeitstempeln mit fortlaufender Uhr.
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
  const query = (collPath, filters = [], max = Infinity) => ({
    where: (field, op, value) => {
      assert.equal(op, '==');
      return query(collPath, [...filters, [field, value]], max);
    },
    limit: (n) => query(collPath, filters, n),
    get: async () => {
      const prefix = `${collPath}/`;
      const docs = [...store.keys()]
          .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
          .filter((path) => filters.every(([field, value]) => store.get(path)[field] === value))
          .slice(0, max)
          .map((path) => ({id: path.split('/').pop(), ref: docRef(path), data: () => ({...store.get(path)})}));
      return {docs, empty: docs.length === 0, size: docs.length};
    },
  });
  const db = {
    store,
    reads: 0,
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

const verwalten = (db, uid, daten, extra = {}) =>
  wichteln.verwalten(fakeAdmin, db, FakeHttpsError, {auth: uid ? auth(uid) : null, daten, ...extra});
// Ohne eigenen Ersatz darf kein Test eine Seite abrufen.
const keinAbruf = async (url) => assert.fail(`unerwarteter Abruf von ${url}`);
const teilnahme = (db, daten, ladeVorschau = keinAbruf) =>
  wichteln.teilnahme(fakeAdmin, db, FakeHttpsError, {daten, ladeVorschau});

const rejectsWith = (promise, code) => assert.rejects(promise, (err) => {
  assert.equal(err.code, code, err.message);
  return true;
});

/** Legt eine Runde mit Teilnehmern an; liefert Runde, Teilnehmer nach Name und Link-Aufrufer. */
const setupRunde = async (namen = ['Anna', 'Ben', 'Cleo', 'Dana'], {ladeVorschau} = {}) => {
  const db = makeDb(baseSeed());
  const sicht = await verwalten(db, 'orga', {aktion: 'anlegen', titel: 'Advent 2026', anlass: 'weihnachten', budget: '20 €', hinweis: 'Bescherung am 13.12.', namen});
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
    aktion: 'anlegen', titel: '  Advent   2026 ', budget: 'ca. 20 €', namen: ['Anna', ' anna ', 'Ben', '', 'Cleo'],
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
      ['ausschluesse', 'gastId', 'geoeffnet', 'gezogen', 'id', 'mail', 'name', 'token']));

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
  const andereRunde = await verwalten(db, 'orga', {aktion: 'anlegen', titel: 'Andere', namen: ['Xaver', 'Yuna', 'Zoe']});
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
  assert.deepEqual(sicht.runde, {titel: 'Advent 2026', budget: '20 €', hinweis: 'Bescherung am 13.12.', status: 'offen'});
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
  const sicht = await verwalten(db, 'orga', {aktion: 'anlegen', titel: 'Advent 2026', anlass, budget: '20 €', hinweis: 'Bescherung am 13.12.'}, extra);
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

test('Gäste mit E-Mail bekommen beim Eintragen ihren Link per Mail, in ihrer Sprache', async () => {
  const {db, rundeId, mailer, orga} = await setupMailRunde();
  const sicht = await orga({aktion: 'teilnehmerHinzufuegen', namen: [
    {name: 'Anna Muster', gastId: 'gastAnna0001'},
    {name: 'Ben Beispiel', gastId: 'gastBen00001'},
    {name: 'Cleo Ohne', gastId: 'gastCleo0001'},
    'Dana',
  ]});

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
    await orga({aktion: 'teilnehmerHinzufuegen', namen: [{name: 'Ben Beispiel', gastId: 'gastBen00001'}]});
    assert.match(mailer.gesendet[0].subject, betreff, anlass);
  }
});

test('Ohne Gast mit E-Mail-Adresse wird kein Mailer erzeugt (SMTP-Secrets bleiben ungelesen)', async () => {
  const {mailer, orga} = await setupMailRunde();
  const sicht = await orga({aktion: 'teilnehmerHinzufuegen', namen: ['Anna', {name: 'Cleo Ohne', gastId: 'gastCleo0001'}]});
  assert.deepEqual(sicht.versand, {gesendet: 0, fehlgeschlagen: 0, grund: null});
  assert.equal(mailer.erstellt, 0);
});

test('Verknüpft werden nur Gäste aus der eigenen Gästeliste', async () => {
  const {mailer, orga} = await setupMailRunde();
  const sicht = await orga({aktion: 'teilnehmerHinzufuegen', namen: [
    {name: 'Eve Fremd', gastId: 'gastFremd001'},
    {name: 'Niemand', gastId: 'gibtesnicht1'},
  ]});
  assert.deepEqual(sicht.teilnehmer.map((t) => t.gastId), [null, null]);
  assert.equal(mailer.gesendet.length, 0);
  await rejectsWith(orga({aktion: 'teilnehmerHinzufuegen', namen: [{name: 'X', gastId: '../../users/orga'}]}), 'invalid-argument');
});

test('Anlegen mit Gästen verschickt ebenfalls', async () => {
  const mailer = makeMailer();
  const db = makeDb(mailSeed());
  const sicht = await verwalten(db, 'orga', {aktion: 'anlegen', titel: 'Advent', namen: [{name: 'Anna', gastId: 'gastAnna0001'}, 'Ben', 'Cleo']},
      {mailer: mailer.factory, jetztMs: JETZT});
  assert.deepEqual(sicht.versand, {gesendet: 1, fehlgeschlagen: 0, grund: null});
  assert.equal(mailer.gesendet[0].to, 'anna@example.com');
});

test('Mailversand nicht eingerichtet: Teilnehmer ist angelegt, Mail als nicht verschickt markiert', async () => {
  const {orga} = await setupMailRunde({factory: () => null});
  const sicht = await orga({aktion: 'teilnehmerHinzufuegen', namen: [{name: 'Anna', gastId: 'gastAnna0001'}]});
  assert.deepEqual(sicht.versand, {gesendet: 0, fehlgeschlagen: 1, grund: 'nicht-eingerichtet'});
  assert.equal(sicht.teilnehmer[0].mail.status, 'fehler');
});

test('SMTP-Fehler: Status fehler, im Log nur Codes und IDs, keine Adresse', async () => {
  const {orga} = await setupMailRunde(makeMailer({fehlerFuer: ['anna@example.com']}));
  const {ergebnis: sicht, zeilen} = await mitStillemLog(() => orga({aktion: 'teilnehmerHinzufuegen', namen: [
    {name: 'Anna', gastId: 'gastAnna0001'},
    {name: 'Ben', gastId: 'gastBen00001'},
  ]}));
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
  const sicht = await orga({aktion: 'teilnehmerHinzufuegen', namen: [
    {name: 'Anna', gastId: 'gastAnna0001'},
    {name: 'Ben', gastId: 'gastBen00001'},
  ]});
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

test('Limit nicht prüfbar: keine Mail (schlägt geschlossen fehl)', async () => {
  const {db, mailer, orga} = await setupMailRunde();
  db.runTransaction = async () => {
    throw new Error('offline');
  };
  const {ergebnis: sicht} = await mitStillemLog(() => orga({aktion: 'teilnehmerHinzufuegen', namen: [{name: 'Anna', gastId: 'gastAnna0001'}]}));
  assert.deepEqual(sicht.versand, {gesendet: 0, fehlgeschlagen: 1, grund: 'fehler'});
  assert.equal(mailer.gesendet.length, 0);
});

test('einladungSenden: erneut senden, Gast nachträglich verknüpfen, Prüfungen', async () => {
  const {mailer, orga} = await setupMailRunde();
  let sicht = await orga({aktion: 'teilnehmerHinzufuegen', namen: ['Anna Muster', 'Ben', {name: 'Cleo', gastId: 'gastCleo0001'}]});
  const tn = nachName(sicht);
  assert.equal(mailer.gesendet.length, 0);

  // Ohne Verknüpfung weiß der Server keine Adresse.
  await rejectsWith(orga({aktion: 'einladungSenden', teilnehmerId: tn['Anna Muster'].id}), 'failed-precondition');
  // Mit Gast-ID: verknüpfen und senden.
  sicht = await orga({aktion: 'einladungSenden', teilnehmerId: tn['Anna Muster'].id, gastId: 'gastAnna0001'});
  assert.deepEqual(sicht.versand, {gesendet: 1, fehlgeschlagen: 0, grund: null});
  assert.equal(nachName(sicht)['Anna Muster'].gastId, 'gastAnna0001');
  assert.equal(mailer.gesendet[0].to, 'anna@example.com');

  // Erneut senden geht auch nach dem Auslosen, mit der gespeicherten Verknüpfung.
  await orga({aktion: 'auslosen'});
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
  await orga({aktion: 'teilnehmerHinzufuegen', namen: [{name: 'Ben', gastId: 'gastBen00001'}]});
  assert.match(mailer.gesendet[0].text, /^Hallo Ben,\n\nschön, dass du dabei bist! Du bist beim Wichteln „Advent 2026“ dabei\./);
});

test('Ein Gast ist je Runde nur einmal dabei, auch unter anderem Namen', async () => {
  const {mailer, orga} = await setupMailRunde();
  const sicht = await orga({aktion: 'teilnehmerHinzufuegen', namen: [{name: 'Anna M.', gastId: 'gastAnna0001'}, 'Ben']});
  await rejectsWith(orga({aktion: 'teilnehmerHinzufuegen', namen: [{name: 'Anna Muster', gastId: 'gastAnna0001'}]}), 'already-exists');
  await rejectsWith(orga({aktion: 'teilnehmerHinzufuegen', namen: [
    {name: 'Cleo', gastId: 'gastCleo0001'},
    {name: 'Cleo O.', gastId: 'gastCleo0001'},
  ]}), 'already-exists');
  // Erneut senden darf einen anderen Teilnehmer nicht mit einem schon verknüpften Gast verbinden.
  const ben = nachName(sicht).Ben;
  await rejectsWith(orga({aktion: 'einladungSenden', teilnehmerId: ben.id, gastId: 'gastAnna0001'}), 'already-exists');
  assert.equal(mailer.gesendet.length, 1);
});

test('unbekannter Anlass wird zu leer', async () => {
  const {db, rundeId} = await setupRunde();
  const sicht = await verwalten(db, 'orga', {aktion: 'aendern', rundeId, titel: 'Neu', anlass: 'Quatsch', budget: '', hinweis: ''});
  assert.equal(sicht.runde.anlass, '');
});
