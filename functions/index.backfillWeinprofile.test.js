// backfillWeinprofile: Gericht-Profile der Weinbegleitung für den Bestand nachtragen
// (docs/vorhaben/weinbegleitung.md, PR 5). Geprüft wird: nur Admins, seitenweise mit
// Cursor über die Dokument-ID (Tech-Check F20), Hash-Skip ohne KI-Aufruf, Tageslimit je
// geschätztes Rezept und Fehler, die nur das betroffene Rezept treffen.

const test = require('node:test');
const assert = require('node:assert/strict');
const {weinprofilInputHash} = require('./shared/weinprofil');

const DOC_ID = Symbol('documentId');

let userRoles;
let store;
let quota;
let updates;
let abfragen;
let zaehlenFails;
let handlers;

function loadHandlers() {
  require('./testSupport').purgeFunctionsCache();

  const Module = require('module');
  const originalLoad = Module._load;

  Module._load = function(request, parent, isMain, ...args) {
    if (request === 'firebase-functions/v2/https') {
      class MockHttpsError extends Error {
        constructor(code, message) {
          super(message);
          this.code = code;
        }
      }
      return {
        onCall: (_opts, handler) => handler,
        onRequest: (_opts, handler) => handler,
        HttpsError: MockHttpsError,
      };
    }
    if (request === 'firebase-functions/v2/firestore') {
      return {onDocumentCreated: (_opts, handler) => handler, onDocumentWritten: (_opts, handler) => handler};
    }
    if (request === 'firebase-functions/v2/scheduler') {
      return {onSchedule: (_opts, handler) => handler};
    }
    if (request === 'firebase-functions/params') {
      return {defineSecret: () => ({value: () => 'test-secret'})};
    }
    if (request === 'firebase-admin') {
      const docRef = (name, id) => {
        const ref = {
          id,
          path: `${name}/${id}`,
          get: async () => {
            const data = store[name]?.[id];
            return {exists: data !== undefined, id, ref, data: () => data};
          },
          update: async (patch) => {
            updates.push({path: `${name}/${id}`, patch});
          },
          set: async () => {},
        };
        return ref;
      };
      // Abfrage auf recipes: orderBy(documentId) + limit + startAfter, Reihenfolge nach ID.
      const abfrage = (name, zustand) => ({
        limit: (anzahl) => abfrage(name, {...zustand, limit: anzahl}),
        startAfter: (id) => abfrage(name, {...zustand, startAfter: id}),
        get: async () => {
          abfragen.push(zustand);
          const ids = Object.keys(store[name] || {}).sort();
          const ab = zustand.startAfter == null ? ids : ids.filter((id) => id > zustand.startAfter);
          const docs = ab.slice(0, zustand.limit).map((id) => ({
            id,
            ref: docRef(name, id),
            data: () => store[name][id],
          }));
          return {docs, size: docs.length, empty: docs.length === 0};
        },
      });
      const firestoreFactory = () => ({
        collection: (name) => ({
          doc: (id) => docRef(name, id),
          orderBy: (feld) => abfrage(name, {orderBy: feld, limit: Infinity, startAfter: null}),
          count: () => ({
            get: async () => {
              if (zaehlenFails) throw new Error('aggregation unavailable');
              return {data: () => ({count: Object.keys(store[name] || {}).length})};
            },
          }),
          where: () => ({limit: () => ({get: async () => ({empty: true, docs: []})})}),
        }),
        doc: (path) => ({
          get: async () => {
            const uid = path.replace(/^users\//, '');
            return uid in userRoles
              ? {exists: true, data: () => ({role: userRoles[uid]})}
              : {exists: false, data: () => ({})};
          },
        }),
        runTransaction: async (fn) => fn({
          get: async (ref) => (ref.path in quota
            ? {exists: true, data: () => ({count: quota[ref.path]})}
            : {exists: false, data: () => ({})}),
          set: (ref, data) => {
            quota[ref.path] = data.count;
          },
          update: (ref) => {
            quota[ref.path] += 1;
          },
        }),
      });
      firestoreFactory.FieldValue = {serverTimestamp: () => ({}), increment: (n) => n};
      firestoreFactory.FieldPath = {documentId: () => DOC_ID};
      return {initializeApp: () => {}, firestore: firestoreFactory};
    }
    if (/^\.\.?\/nutritionNormalization$/.test(request)) {
      return {createNutritionNormalizationUtils: () => ({})};
    }
    if (request === '@google/genai') return {GoogleGenAI: class {}};
    if (request === 'nodemailer') return {createTransport: () => ({sendMail: async () => ({})})};
    if (request === 'sharp') {
      const chain = {rotate: () => chain, resize: () => chain, png: () => chain, toBuffer: async () => Buffer.from('')};
      return () => chain;
    }
    return originalLoad.call(this, request, parent, isMain, ...args);
  };

  return require('./index');
}

const auth = (uid) => ({uid, token: {firebase: {sign_in_provider: 'password'}}});
const call = (uid, data) => handlers.backfillWeinprofile({auth: uid ? auth(uid) : null, data});

const heute = () => new Date().toLocaleDateString('sv-SE', {timeZone: 'Europe/Berlin'});
const quotaPfad = (uid) => `aiWeinprofilLimits/${uid}_${heute()}`;

const PROFIL = {
  rolle: 'hauptgericht',
  hauptkomponente: 'rind_lamm',
  zubereitung: 'geschmort',
  sauce: 'rotwein_jus',
  intensitaet: 5,
  komponenten: {saeure: 0, suesse: 0, salz: 2, fett: 2, schaerfe: 0, bitter: 0, umami: 2},
  konfidenz: 0.85,
};

const rezept = (title) => ({
  title,
  ingredients: ['500 g Rinderschulter'],
  steps: ['Schmoren.'],
  speisekategorie: ['Hauptspeisen'],
  authorId: 'jemand',
  isPrivate: true,
  updatedAt: 'unverändert',
});

const mitAktuellemProfil = (daten) => ({
  ...daten,
  weinprofil: {...PROFIL, inputHash: weinprofilInputHash(daten), modell: 'x', schemaVersion: 1, erstelltAm: 1},
});

let fetchCalls;
let geminiAntwort;
const realFetch = global.fetch;

function mockGemini() {
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const prompt = body.contents[0].parts[0].text;
    fetchCalls.push(prompt);
    const {status = 200, text} = geminiAntwort(prompt);
    return {
      ok: status === 200,
      status,
      json: async () => ({candidates: [{content: {parts: [{text}]}}]}),
    };
  };
}

test.beforeEach(() => {
  userRoles = {'edit-1': 'edit', 'mod-1': 'moderator', 'admin-1': 'admin'};
  updates = [];
  quota = {};
  abfragen = [];
  zaehlenFails = false;
  fetchCalls = [];
  store = {
    recipes: {
      a: mitAktuellemProfil(rezept('Rezept A')),
      b: rezept('Rezept B'),
      c: {...mitAktuellemProfil(rezept('Rezept C')), title: 'Rezept C geändert'},
      d: rezept('Rezept D'),
      e: rezept('Rezept E'),
    },
  };
  geminiAntwort = () => ({text: JSON.stringify(PROFIL)});
  mockGemini();
  handlers = loadHandlers();
});

test.afterEach(() => {
  global.fetch = realFetch;
});

test('lehnt Abgemeldete ab', async () => {
  await assert.rejects(() => call(null, {}), (e) => e.code === 'unauthenticated');
});

test('nur für Admins: edit und moderator werden abgelehnt, ohne Lesen, Limit und KI', async () => {
  for (const uid of ['edit-1', 'mod-1', 'ohne-profil']) {
    await assert.rejects(() => call(uid, {}), (e) => e.code === 'permission-denied');
  }
  assert.deepEqual(abfragen, []);
  assert.deepEqual(quota, {});
  assert.equal(fetchCalls.length, 0);
});

test('prüft cursor und anzahl', async () => {
  const ungueltig = [
    {cursor: 5}, {cursor: ''}, {cursor: ' '}, {cursor: 'a/b'}, {cursor: 'x'.repeat(201)},
    {anzahl: 0}, {anzahl: 41}, {anzahl: 1.5}, {anzahl: '20'},
  ];
  for (const data of ungueltig) {
    await assert.rejects(() => call('admin-1', data), (e) => e.code === 'invalid-argument');
  }
  assert.deepEqual(abfragen, []);
});

test('erste Seite: nach Dokument-ID, zählt alle Rezepte, schätzt fehlende und veraltete, überspringt aktuelle', async () => {
  const ergebnis = await call('admin-1', {anzahl: 3});

  assert.deepEqual(abfragen, [{orderBy: DOC_ID, limit: 3, startAfter: null}]);
  assert.equal(fetchCalls.length, 2);
  assert.deepEqual(updates.map((u) => u.path).sort(), ['recipes/b', 'recipes/c']);
  updates.forEach((u) => assert.deepEqual(Object.keys(u.patch), ['weinprofil']));
  const neuesC = updates.find((u) => u.path === 'recipes/c').patch.weinprofil;
  assert.equal(neuesC.inputHash, weinprofilInputHash(store.recipes.c));
  assert.equal(quota[quotaPfad('admin-1')], 2);

  assert.deepEqual(ergebnis, {
    geprueft: 3,
    neu: 2,
    uebersprungen: 1,
    fehlgeschlagen: [],
    fehlerGruende: {},
    naechsterCursor: 'c',
    fertig: false,
    tageslimitErreicht: false,
    gesamt: 5,
    remainingRequests: 4998,
    dailyLimit: 5000,
  });
});

test('Folgeaufruf macht nach dem Cursor weiter, zählt nicht erneut und meldet fertig', async () => {
  const ergebnis = await call('admin-1', {cursor: 'c', anzahl: 3});

  assert.deepEqual(abfragen, [{orderBy: DOC_ID, limit: 3, startAfter: 'c'}]);
  assert.deepEqual(updates.map((u) => u.path).sort(), ['recipes/d', 'recipes/e']);
  assert.equal(ergebnis.geprueft, 2);
  assert.equal(ergebnis.neu, 2);
  assert.equal(ergebnis.fertig, true);
  assert.equal(ergebnis.naechsterCursor, null);
  assert.equal(ergebnis.gesamt, null);
});

test('ohne anzahl gilt 20; nach dem letzten Rezept ist die Seite leer und fertig, ohne KI', async () => {
  await call('admin-1', {});
  assert.equal(abfragen[0].limit, 20);

  fetchCalls = [];
  const ergebnis = await call('admin-1', {cursor: 'e'});
  assert.equal(ergebnis.geprueft, 0);
  assert.equal(ergebnis.fertig, true);
  assert.equal(ergebnis.naechsterCursor, null);
  assert.equal(fetchCalls.length, 0);
});

test('ein Durchlauf in Seiten bearbeitet jedes Rezept genau einmal', async () => {
  let cursor = null;
  let geprueft = 0;
  let runden = 0;
  for (;;) {
    const ergebnis = await call('admin-1', {cursor, anzahl: 2});
    geprueft += ergebnis.geprueft;
    runden += 1;
    if (ergebnis.fertig) break;
    cursor = ergebnis.naechsterCursor;
    assert.ok(runden < 10, 'Backfill endet nicht');
  }
  assert.equal(geprueft, 5);
  assert.deepEqual(updates.map((u) => u.path).sort(), ['recipes/b', 'recipes/c', 'recipes/d', 'recipes/e']);
  assert.equal(fetchCalls.length, 4);
});

test('Tageslimit: endet vor dem ersten Rezept ohne Kontingent, der Cursor zeigt auf das letzte bearbeitete', async () => {
  quota[quotaPfad('admin-1')] = 4999;

  const ergebnis = await call('admin-1', {anzahl: 5});

  assert.deepEqual(updates.map((u) => u.path), ['recipes/b']);
  assert.equal(ergebnis.geprueft, 2);
  assert.equal(ergebnis.uebersprungen, 1);
  assert.equal(ergebnis.neu, 1);
  assert.equal(ergebnis.tageslimitErreicht, true);
  assert.equal(ergebnis.fertig, false);
  assert.equal(ergebnis.naechsterCursor, 'b');
  assert.equal(ergebnis.remainingRequests, 0);
});

test('Tageslimit erschöpft vor dem ersten Rezept: resource-exhausted ohne KI', async () => {
  quota[quotaPfad('admin-1')] = 5000;
  await assert.rejects(() => call('admin-1', {cursor: 'a'}), (e) => e.code === 'resource-exhausted');
  assert.equal(fetchCalls.length, 0);
  assert.deepEqual(updates, []);
});

test('Fehler der KI treffen nur das betroffene Rezept, der Cursor geht trotzdem weiter', async () => {
  geminiAntwort = (prompt) => (prompt.includes('Rezept D')
    ? {status: 500, text: ''}
    : (prompt.includes('Rezept E') ? {text: '{"rolle":"irgendwas"}'} : {text: JSON.stringify(PROFIL)}));

  const ergebnis = await call('admin-1', {cursor: 'b', anzahl: 3});

  assert.deepEqual(updates.map((u) => u.path), ['recipes/c']);
  assert.equal(ergebnis.neu, 1);
  assert.deepEqual([...ergebnis.fehlgeschlagen].sort(), ['d', 'e']);
  assert.deepEqual(ergebnis.fehlerGruende, {d: 'kiFehler', e: 'kiUngueltig'});
  assert.equal(ergebnis.naechsterCursor, 'e');
  assert.equal(ergebnis.fertig, false);
});

test('scheitert das Zählen, fehlt nur die Gesamtzahl', async () => {
  zaehlenFails = true;
  const ergebnis = await call('admin-1', {anzahl: 2});
  assert.equal(ergebnis.gesamt, null);
  assert.equal(ergebnis.geprueft, 2);
});
