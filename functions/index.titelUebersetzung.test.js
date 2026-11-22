// Mehrsprachigkeit (docs/vorhaben/mehrsprachigkeit.md, PR 3): Rezepttitel übersetzen.
// Geprüft wird: Prüfung der Gemini-Antwort, der Trigger (nur bei neuem oder geändertem Titel,
// nicht bei laufenden Importen, Tageslimit, Vorbedingung gegen überholte Stände) und der
// Backfill (nur Admins, seitenweise mit Cursor, mehrere Titel je Gemini-Aufruf).

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  pruefeTitelAntwort,
  baueTitelPrompt,
  brauchtTitelUebersetzung,
  baueTitelUebersetzung,
} = require('./shared/titelUebersetzung');
const {isFirebaseAdminRequest, firebaseAdminModule} = require('./testSupport');

const DOC_ID = Symbol('documentId');

let userRoles;
let store;
let quota;
let updates;
let abfragen;
let ueberholt;
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
      return {onCall: (_opts, handler) => handler, onRequest: (_opts, handler) => handler, HttpsError: MockHttpsError};
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
    if (isFirebaseAdminRequest(request, parent)) {
      const docRef = (name, id) => {
        const ref = {
          id,
          path: `${name}/${id}`,
          get: async () => {
            const data = store[name]?.[id];
            return {exists: data !== undefined, id, ref, data: () => data};
          },
          update: async (patch, vorbedingung) => {
            if (ueberholt.has(id)) {
              const error = new Error('9 FAILED_PRECONDITION: geändert');
              error.code = 9;
              throw error;
            }
            updates.push({path: `${name}/${id}`, patch, vorbedingung});
            store[name][id] = {...store[name][id], ...patch};
          },
          set: async () => {},
        };
        return ref;
      };
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
            updateTime: `stand-${id}`,
            data: () => store[name][id],
          }));
          return {docs, size: docs.length, empty: docs.length === 0};
        },
      });
      const firestoreFactory = () => ({
        collection: (name) => ({
          doc: (id) => docRef(name, id),
          orderBy: (feld) => abfrage(name, {orderBy: feld, limit: Infinity, startAfter: null}),
          count: () => ({get: async () => ({data: () => ({count: Object.keys(store[name] || {}).length})})}),
          where: () => ({limit: () => ({get: async () => ({empty: true, docs: []})})}),
        }),
        doc: (path) => ({
          get: async () => {
            const uid = path.replace(/^users\//, '');
            return uid in userRoles ?
              {exists: true, data: () => ({role: userRoles[uid]})} :
              {exists: false, data: () => ({})};
          },
        }),
        runTransaction: async (fn) => fn({
          get: async (ref) => (ref.path in quota ?
            {exists: true, data: () => ({count: quota[ref.path]})} :
            {exists: false, data: () => ({})}),
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
      return firebaseAdminModule(request, {initializeApp: () => {}, firestore: firestoreFactory});
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

const heute = () => new Date().toLocaleDateString('sv-SE', {timeZone: 'Europe/Berlin'});
const quotaPfad = (uid) => `aiTitelUebersetzungLimits/${uid}_${heute()}`;

let fetchCalls;
let geminiAntwort;
const realFetch = global.fetch;

/** Titel aus dem Prompt (die JSON-Liste am Ende). */
const titelAusPrompt = (prompt) => JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1));

const uebersetzt = (liste) => ({
  titel: liste.map(({nr, text}) => ({nr, originalSprache: 'de', de: text, en: `EN ${text}`, fr: `FR ${text}`})),
});

function mockGemini() {
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const prompt = body.contents[0].parts[0].text;
    const liste = titelAusPrompt(prompt);
    fetchCalls.push(liste.map((eintrag) => eintrag.text));
    const {status = 200, json} = geminiAntwort(liste);
    return {ok: status === 200, status, json: async () => ({candidates: [{content: {parts: [{text: JSON.stringify(json)}]}}]})};
  };
}

const mitUebersetzung = (title) => ({
  title,
  titelUebersetzung: {quelle: title, originalSprache: 'de', de: title, en: `EN ${title}`, fr: `FR ${title}`},
});

test.beforeEach(() => {
  userRoles = {'edit-1': 'edit', 'admin-1': 'admin'};
  updates = [];
  quota = {};
  abfragen = [];
  ueberholt = new Set();
  fetchCalls = [];
  store = {recipes: {}};
  geminiAntwort = (liste) => ({json: uebersetzt(liste)});
  mockGemini();
  handlers = loadHandlers();
});

test.afterEach(() => {
  global.fetch = realFetch;
});

// ── Prüfung und Prompt ─────────────────────────────────────────────────────────

test('pruefeTitelAntwort: übernimmt gültige Einträge nach Nummer, verwirft ungültige', () => {
  const ergebnis = pruefeTitelAntwort({
    titel: [
      {nr: 2, originalSprache: 'en', de: ' Pfannkuchen ', en: 'Pancakes', fr: 'Crêpes épaisses'},
      {nr: 1, originalSprache: 'de', de: 'Apfelkuchen', en: '', fr: 'Gâteau aux pommes'},
      {nr: 3, originalSprache: 'it', de: 'a', en: 'b', fr: 'c'},
      {nr: 4, originalSprache: 'de', de: 'Zeile\nUmbruch', en: 'b', fr: 'c'},
      {nr: 5, originalSprache: 'andere', de: 'Pasta alla Norma', en: 'Pasta alla Norma', fr: 'Pâtes alla Norma'},
      {nr: 5, originalSprache: 'de', de: 'doppelt', en: 'doppelt', fr: 'doppelt'},
      {nr: 9, originalSprache: 'de', de: 'zu weit', en: 'x', fr: 'y'},
    ],
  }, 6);
  assert.deepEqual(ergebnis, [
    null,
    {originalSprache: 'en', de: 'Pfannkuchen', en: 'Pancakes', fr: 'Crêpes épaisses'},
    null,
    null,
    {originalSprache: 'andere', de: 'Pasta alla Norma', en: 'Pasta alla Norma', fr: 'Pâtes alla Norma'},
    null,
  ]);
  assert.deepEqual(pruefeTitelAntwort({titel: 'kaputt'}, 2), [null, null]);
  assert.deepEqual(pruefeTitelAntwort(null, 1), [null]);
});

test('baueTitelPrompt: Titel stehen als JSON am Ende, auch mit Anführungszeichen', () => {
  const prompt = baueTitelPrompt(['Omas "beste" Torte', 'Chili sin carne']);
  assert.deepEqual(titelAusPrompt(prompt), [
    {nr: 1, text: 'Omas "beste" Torte'},
    {nr: 2, text: 'Chili sin carne'},
  ]);
});

test('brauchtTitelUebersetzung: nur mit Titel, ohne laufenden Import und wenn die Quelle nicht passt', () => {
  assert.equal(brauchtTitelUebersetzung({title: 'Suppe'}), true);
  assert.equal(brauchtTitelUebersetzung({...mitUebersetzung('Suppe'), title: 'Suppe neu'}), true);
  assert.equal(brauchtTitelUebersetzung(mitUebersetzung('Suppe')), false);
  assert.equal(brauchtTitelUebersetzung({title: 'Suppe', importStatus: 'processing'}), false);
  assert.equal(brauchtTitelUebersetzung({title: '   '}), false);
  assert.equal(brauchtTitelUebersetzung({title: 'x'.repeat(201)}), false);
  assert.equal(brauchtTitelUebersetzung(null), false);
});

test('baueTitelUebersetzung: Quelle, Originalsprache, alle Sprachen, Modell und Zeit', () => {
  const feld = baueTitelUebersetzung('Suppe', {originalSprache: 'de', de: 'Suppe', en: 'Soup', fr: 'Soupe'}, 'm', 42);
  assert.deepEqual(feld, {quelle: 'Suppe', originalSprache: 'de', de: 'Suppe', en: 'Soup', fr: 'Soupe', modell: 'm', erstelltAm: 42});
});

// ── Trigger ────────────────────────────────────────────────────────────────────

const ereignis = (id, {updateTime = 'stand-1'} = {}) => ({
  params: {recipeId: id},
  data: {
    after: {
      exists: store.recipes[id] !== undefined,
      id,
      ref: {
        id,
        update: async (patch, vorbedingung) => {
          if (ueberholt.has(id)) {
            const error = new Error('9 FAILED_PRECONDITION: geändert');
            error.code = 9;
            throw error;
          }
          updates.push({path: `recipes/${id}`, patch, vorbedingung});
        },
      },
      updateTime,
      data: () => store.recipes[id],
    },
  },
});

test('Trigger: übersetzt den Titel eines neuen Rezepts und schreibt nur titelUebersetzung', async () => {
  store.recipes.r1 = {title: 'Omas Apfelkuchen', updatedAt: 'unverändert'};
  await handlers.uebersetzeRezeptTitel(ereignis('r1'));
  assert.deepEqual(fetchCalls, [['Omas Apfelkuchen']]);
  assert.equal(updates.length, 1);
  const {patch, vorbedingung} = updates[0];
  assert.deepEqual(Object.keys(patch), ['titelUebersetzung']);
  assert.equal(patch.titelUebersetzung.quelle, 'Omas Apfelkuchen');
  assert.equal(patch.titelUebersetzung.en, 'EN Omas Apfelkuchen');
  assert.equal(patch.titelUebersetzung.fr, 'FR Omas Apfelkuchen');
  assert.equal(patch.titelUebersetzung.originalSprache, 'de');
  assert.equal(typeof patch.titelUebersetzung.modell, 'string');
  assert.deepEqual(vorbedingung, {lastUpdateTime: 'stand-1'});
  assert.equal(quota[quotaPfad('automatik')], 1);
});

test('Trigger: tut nichts bei passender Übersetzung, laufendem Import, ohne Titel oder nach dem Löschen', async () => {
  store.recipes.aktuell = mitUebersetzung('Suppe');
  store.recipes.import = {title: 'Wird importiert …', importStatus: 'queued'};
  store.recipes.leer = {title: ''};
  for (const id of ['aktuell', 'import', 'leer', 'geloescht']) {
    await handlers.uebersetzeRezeptTitel(ereignis(id));
  }
  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(updates, []);
  assert.deepEqual(quota, {});
});

test('Trigger: ein geänderter Titel wird neu übersetzt', async () => {
  store.recipes.r1 = {...mitUebersetzung('Suppe'), title: 'Kürbissuppe'};
  await handlers.uebersetzeRezeptTitel(ereignis('r1'));
  assert.deepEqual(fetchCalls, [['Kürbissuppe']]);
  assert.equal(updates[0].patch.titelUebersetzung.quelle, 'Kürbissuppe');
});

test('Trigger: am Tageslimit kein KI-Aufruf und nichts geschrieben', async () => {
  store.recipes.r1 = {title: 'Suppe'};
  quota[quotaPfad('automatik')] = 3000;
  await handlers.uebersetzeRezeptTitel(ereignis('r1'));
  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(updates, []);
});

test('Trigger: ungültige oder fehlende KI-Antwort schreibt nichts und wirft nicht', async () => {
  store.recipes.r1 = {title: 'Suppe'};
  geminiAntwort = () => ({json: {titel: [{nr: 1, originalSprache: 'de', de: 'Suppe', en: '', fr: 'Soupe'}]}});
  await handlers.uebersetzeRezeptTitel(ereignis('r1'));
  geminiAntwort = () => ({status: 500, json: {}});
  await handlers.uebersetzeRezeptTitel(ereignis('r1'));
  assert.deepEqual(updates, []);
  assert.equal(fetchCalls.length, 2);
});

test('Trigger: wurde das Rezept inzwischen geändert, bleibt es beim neueren Stand', async () => {
  store.recipes.r1 = {title: 'Suppe'};
  ueberholt.add('r1');
  await assert.doesNotReject(() => handlers.uebersetzeRezeptTitel(ereignis('r1')));
  assert.deepEqual(updates, []);
});

// ── Backfill ───────────────────────────────────────────────────────────────────

const auth = (uid) => ({uid, token: {firebase: {sign_in_provider: 'password'}}});
const backfill = (uid, data) => handlers.backfillTitelUebersetzungen({auth: uid ? auth(uid) : null, data});

test('Backfill: lehnt Abgemeldete und Nicht-Admins ab, ohne zu lesen', async () => {
  await assert.rejects(() => backfill(null, {}), (e) => e.code === 'unauthenticated');
  for (const uid of ['edit-1', 'ohne-profil']) {
    await assert.rejects(() => backfill(uid, {}), (e) => e.code === 'permission-denied');
  }
  assert.deepEqual(abfragen, []);
  assert.deepEqual(fetchCalls, []);
});

test('Backfill: prüft cursor und anzahl', async () => {
  for (const data of [{cursor: ''}, {cursor: 'a/b'}, {anzahl: 0}, {anzahl: 51}, {anzahl: 2.5}]) {
    await assert.rejects(() => backfill('admin-1', data), (e) => e.code === 'invalid-argument');
  }
});

test('Backfill: übersetzt seitenweise nur, was fehlt, mit einem Gemini-Aufruf je Block', async () => {
  store.recipes = {
    a: mitUebersetzung('Suppe'),
    b: {title: 'Brot'},
    c: {title: 'Wird importiert …', importStatus: 'processing'},
    d: {title: 'Dal'},
    e: {title: 'Eintopf'},
  };
  const erste = await backfill('admin-1', {anzahl: 4});
  assert.deepEqual(fetchCalls, [['Brot', 'Dal']]);
  assert.equal(erste.geprueft, 4);
  assert.equal(erste.neu, 2);
  assert.equal(erste.uebersprungen, 2);
  assert.deepEqual(erste.fehlgeschlagen, []);
  assert.equal(erste.naechsterCursor, 'd');
  assert.equal(erste.fertig, false);
  assert.equal(erste.gesamt, 5);
  assert.deepEqual(updates.map((u) => [u.path, u.vorbedingung.lastUpdateTime]), [
    ['recipes/b', 'stand-b'],
    ['recipes/d', 'stand-d'],
  ]);

  const zweite = await backfill('admin-1', {cursor: erste.naechsterCursor, anzahl: 4});
  assert.deepEqual(fetchCalls[1], ['Eintopf']);
  assert.equal(zweite.neu, 1);
  assert.equal(zweite.fertig, true);
  assert.equal(zweite.naechsterCursor, null);
  assert.equal(zweite.gesamt, null);
  assert.equal(quota[quotaPfad('admin-1')], 3);
});

test('Backfill: KI-Fehler und überholte Rezepte treffen nur diese Rezepte', async () => {
  store.recipes = {a: {title: 'Brot'}, b: {title: 'Dal'}, c: {title: 'Eintopf'}};
  geminiAntwort = (liste) => ({json: uebersetzt(liste.filter((eintrag) => eintrag.text !== 'Dal'))});
  ueberholt.add('c');
  const ergebnis = await backfill('admin-1', {});
  assert.equal(ergebnis.neu, 1);
  assert.deepEqual(ergebnis.fehlgeschlagen, ['b']);
  assert.deepEqual(ergebnis.fehlerGruende, {b: 'ki'});
  assert.equal(ergebnis.uebersprungen, 1);
  assert.equal(ergebnis.fertig, true);
});

test('Backfill: am Tageslimit endet die Seite vor dem ersten nicht mehr erlaubten Rezept', async () => {
  store.recipes = {a: {title: 'Brot'}, b: {title: 'Dal'}};
  quota[quotaPfad('admin-1')] = 9999;
  const ergebnis = await backfill('admin-1', {});
  assert.equal(ergebnis.neu, 1);
  assert.equal(ergebnis.tageslimitErreicht, true);
  assert.equal(ergebnis.naechsterCursor, 'a');
  assert.equal(ergebnis.fertig, false);

  await assert.rejects(() => backfill('admin-1', {cursor: 'a'}), (e) => e.code === 'resource-exhausted');
});
