const test = require('node:test');
const assert = require('node:assert/strict');
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
  const sicht = await verwalten(db, 'orga', {aktion: 'anlegen', titel: 'Advent 2026', budget: '20 €', hinweis: 'Bescherung am 13.12.', namen});
  const rundeId = sicht.runde.id;
  const tn = Object.fromEntries(sicht.teilnehmer.map((t) => [t.name, t]));
  const als = (name, aktion, daten = {}) => teilnahme(db, {aktion, rundeId, token: tn[name].token, ...daten}, ladeVorschau);
  return {db, rundeId, sicht, tn, als};
};

/** Zuordnung aus dem Speicher (nur Tests dürfen hineinsehen). */
const zuordnungen = (db, rundeId) => Object.fromEntries([...db.store.entries()]
    .filter(([path]) => path.startsWith(`wichtelRunden/${rundeId}/zuordnungen/`))
    .map(([path, data]) => [path.split('/').pop(), data.empfaengerId]));

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
  for (const aktion of ['laden', 'auslosen', 'loeschen', 'aendern', 'teilnehmerHinzufuegen']) {
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

test('aendern übernimmt Titel, Budget und Hinweis', async () => {
  const {db, rundeId} = await setupRunde();
  const sicht = await verwalten(db, 'orga', {aktion: 'aendern', rundeId, titel: 'Neu', budget: '', hinweis: 'Bitte einpacken'});
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
  sicht.teilnehmer.forEach((t) => assert.deepEqual(Object.keys(t).sort(), ['geoeffnet', 'gezogen', 'id', 'name', 'token']));

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
  assert.deepEqual(sicht.ich, {id: tn.Ben.id, name: 'Ben'});
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
  assert.deepEqual(leseNamen(['Lena', 'lena', ' Tom ', 7, ''], FakeHttpsError), ['Lena', 'Tom']);
  assert.throws(() => leseNamen(Array.from({length: 101}, (_, i) => `n${i}`), FakeHttpsError));
});
