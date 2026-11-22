// Mehrsprachigkeit (docs/vorhaben/mehrsprachigkeit.md, PR 4): Rezeptinhalt übersetzen.
// Geprüft wird: Hash-Eingabe und Anfrage (Verknüpfungen und leere Einträge bleiben), die Prüfung
// der Gemini-Antwort (alle Zielsprachen, jeder Eintrag), das Ausrichten nach Position, der Trigger
// (nur bei geändertem Inhalt, nicht bei Importen, Löschen mit dem Rezept, Tageslimit, überholte
// Stände) und der Backfill (nur Admins, seitenweise, überspringt Aktuelles).

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  inhaltHashEingabe,
  inhaltQuellHash,
  anfrageAusRezept,
  baueInhaltPrompt,
  pruefeInhaltAntwort,
  baueUebersetzungsDokument,
  SCHEMA_VERSION,
} = require('./shared/inhaltUebersetzung');
const {isFirebaseAdminRequest, firebaseAdminModule} = require('./testSupport');

const DOC_ID = Symbol('documentId');

let userRoles;
let daten;
let geloescht;
let gelesen;
let handlers;

const docRef = (pfad) => {
  const [name, id] = pfad.split('/');
  return {
    id,
    path: pfad,
    get: async () => {
      gelesen.push(pfad);
      const wert = daten[pfad];
      return {exists: wert !== undefined, id, ref: docRef(pfad), data: () => wert};
    },
    delete: async () => {
      geloescht.push(pfad);
      delete daten[pfad];
    },
    update: async (patch) => {
      daten[pfad] = {...daten[pfad], ...patch};
    },
    set: async (wert) => {
      daten[pfad] = wert;
    },
    _name: name,
  };
};

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
      const abfrage = (name, zustand) => ({
        limit: (anzahl) => abfrage(name, {...zustand, limit: anzahl}),
        startAfter: (id) => abfrage(name, {...zustand, startAfter: id}),
        get: async () => {
          const ids = Object.keys(daten).filter((pfad) => pfad.startsWith(`${name}/`)).map((pfad) => pfad.split('/')[1]).sort();
          const ab = zustand.startAfter == null ? ids : ids.filter((id) => id > zustand.startAfter);
          const docs = ab.slice(0, zustand.limit).map((id) => ({id, ref: docRef(`${name}/${id}`), data: () => daten[`${name}/${id}`]}));
          return {docs, size: docs.length, empty: docs.length === 0};
        },
      });
      const firestoreFactory = () => ({
        collection: (name) => ({
          doc: (id) => docRef(`${name}/${id}`),
          orderBy: () => abfrage(name, {limit: Infinity, startAfter: null}),
          count: () => ({get: async () => ({data: () => ({count: Object.keys(daten).filter((p) => p.startsWith(`${name}/`)).length})})}),
          where: () => ({limit: () => ({get: async () => ({empty: true, docs: []})})}),
        }),
        doc: (pfad) => ({
          get: async () => {
            const uid = pfad.replace(/^users\//, '');
            return uid in userRoles ?
              {exists: true, data: () => ({role: userRoles[uid]})} :
              {exists: false, data: () => ({})};
          },
        }),
        runTransaction: async (fn) => fn({
          get: async (ref) => ({exists: daten[ref.path] !== undefined, data: () => daten[ref.path]}),
          set: (ref, wert) => {
            daten[ref.path] = wert;
          },
          update: (ref, patch) => {
            const alt = daten[ref.path] || {};
            daten[ref.path] = {...alt, count: (alt.count || 0) + 1, ...Object.fromEntries(Object.entries(patch).filter(([k]) => k !== 'count'))};
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
const quotaPfad = (uid) => `aiInhaltUebersetzungLimits/${uid}_${heute()}`;

let fetchCalls;
let geminiAntwort;
const realFetch = global.fetch;

/** Die Anfrage aus dem Prompt (JSON in der letzten Zeile). */
const anfrageAusPrompt = (prompt) => JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1));
const uebersetzt = (anfrage, sprachen = ['en', 'fr']) => ({
  originalSprache: 'de',
  ...Object.fromEntries(sprachen.map((sprache) => [sprache, {
    zutaten: anfrage.zutaten.map(({nr, text}) => ({nr, text: `${sprache.toUpperCase()} ${text}`})),
    schritte: anfrage.schritte.map(({nr, text}) => ({nr, text: `${sprache.toUpperCase()} ${text}`})),
  }])),
});

function mockGemini() {
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const anfrage = anfrageAusPrompt(body.contents[0].parts[0].text);
    fetchCalls.push(anfrage);
    const {status = 200, json} = geminiAntwort(anfrage);
    return {ok: status === 200, status, json: async () => ({candidates: [{content: {parts: [{text: JSON.stringify(json)}]}}]})};
  };
}

const REZEPT = {
  title: 'Linsensuppe',
  ingredients: [
    {type: 'heading', text: 'Suppe'},
    '200 g Linsen',
    {type: 'ingredient', text: '1,5 l Gemüsebrühe', ingredientID: 'x1'},
    '1 Teil #recipe:abc:Gemüsebrühe',
    '',
  ],
  steps: ['Linsen waschen.', {type: 'heading', text: 'Kochen'}, {type: 'step', text: '20 Minuten köcheln.'}],
};

test.beforeEach(() => {
  userRoles = {'edit-1': 'edit', 'admin-1': 'admin'};
  daten = {};
  geloescht = [];
  gelesen = [];
  fetchCalls = [];
  geminiAntwort = (anfrage) => ({json: uebersetzt(anfrage)});
  mockGemini();
  handlers = loadHandlers();
});

test.afterEach(() => {
  global.fetch = realFetch;
});

// ── Hash, Anfrage, Prüfung ─────────────────────────────────────────────────────

test('Hash-Eingabe: Art und Text je Eintrag, leere Einträge zählen mit, Titel nicht', () => {
  const eingabe = JSON.parse(inhaltHashEingabe(REZEPT));
  assert.equal(eingabe[0], 'inhalt-v1');
  assert.deepEqual(eingabe[1], [['h', 'Suppe'], ['', '200 g Linsen'], ['', '1,5 l Gemüsebrühe'], ['', '1 Teil #recipe:abc:Gemüsebrühe'], ['', '']]);
  assert.equal(inhaltQuellHash(REZEPT), inhaltQuellHash({...REZEPT, title: 'Anders'}));
  assert.notEqual(inhaltQuellHash(REZEPT), inhaltQuellHash({...REZEPT, steps: ['Linsen waschen.']}));
  assert.equal(inhaltHashEingabe({}), JSON.stringify(['inhalt-v1', [], []]));
});

test('Anfrage: nur Einträge mit Text, ohne Rezept-Verknüpfungen, Nummer = Position', () => {
  assert.deepEqual(anfrageAusRezept(REZEPT), {
    zutaten: [
      {nr: 1, text: 'Suppe', ueberschrift: true},
      {nr: 2, text: '200 g Linsen'},
      {nr: 3, text: '1,5 l Gemüsebrühe'},
    ],
    schritte: [
      {nr: 1, text: 'Linsen waschen.'},
      {nr: 2, text: 'Kochen', ueberschrift: true},
      {nr: 3, text: '20 Minuten köcheln.'},
    ],
  });
  assert.equal(anfrageAusRezept({ingredients: ['', '#recipe:a:B'], steps: []}), null);
  assert.equal(anfrageAusRezept({}), null);
});

test('Prompt: Anfrage als JSON am Ende, Regel für die Menge am Zeilenanfang', () => {
  const anfrage = anfrageAusRezept(REZEPT);
  const prompt = baueInhaltPrompt(anfrage);
  assert.deepEqual(anfrageAusPrompt(prompt), anfrage);
  assert.match(prompt, /Menge am Zeilenanfang bleibt genau wie im Original/);
});

test('Prüfung: jede Zielsprache, jeder Eintrag; sonst null', () => {
  const anfrage = anfrageAusRezept(REZEPT);
  const ok = pruefeInhaltAntwort(uebersetzt(anfrage), anfrage);
  assert.equal(ok.originalSprache, 'de');
  assert.deepEqual(Object.keys(ok.sprachen).sort(), ['en', 'fr']);
  assert.equal(ok.sprachen.en.zutaten.get(2), 'EN 200 g Linsen');

  assert.equal(pruefeInhaltAntwort(uebersetzt(anfrage, ['en']), anfrage), null, 'Französisch fehlt');
  const luecke = uebersetzt(anfrage);
  luecke.fr.schritte.pop();
  assert.equal(pruefeInhaltAntwort(luecke, anfrage), null, 'ein Schritt fehlt');
  const zeilenumbruch = uebersetzt(anfrage);
  zeilenumbruch.en.zutaten[1].text = '200 g\nlentils';
  assert.equal(pruefeInhaltAntwort(zeilenumbruch, anfrage), null, 'Zutat mit Zeilenumbruch');
  assert.equal(pruefeInhaltAntwort({...uebersetzt(anfrage), originalSprache: 'it'}, anfrage), null);
  assert.equal(pruefeInhaltAntwort(null, anfrage), null);

  // Englisches Original: Deutsch und Französisch nötig, Englisch nicht
  const englisch = {...uebersetzt(anfrage, ['de', 'fr']), originalSprache: 'en'};
  assert.deepEqual(Object.keys(pruefeInhaltAntwort(englisch, anfrage).sprachen).sort(), ['de', 'fr']);
  // „andere“: alle drei nötig
  const andere = {...uebersetzt(anfrage, ['de', 'en', 'fr']), originalSprache: 'andere'};
  assert.deepEqual(Object.keys(pruefeInhaltAntwort(andere, anfrage).sprachen).sort(), ['de', 'en', 'fr']);
  assert.equal(pruefeInhaltAntwort({...uebersetzt(anfrage), originalSprache: 'andere'}, anfrage), null);
});

test('Dokument: Listen in der Länge des Rezepts, Verknüpfungen und leere Einträge bleiben', () => {
  const anfrage = anfrageAusRezept(REZEPT);
  const ergebnis = pruefeInhaltAntwort(uebersetzt(anfrage), anfrage);
  const dokument = baueUebersetzungsDokument(REZEPT, 'h1', ergebnis, 'modell', 7);
  assert.deepEqual(dokument.en.zutaten, ['EN Suppe', 'EN 200 g Linsen', 'EN 1,5 l Gemüsebrühe', '1 Teil #recipe:abc:Gemüsebrühe', '']);
  assert.deepEqual(dokument.fr.schritte, ['FR Linsen waschen.', 'FR Kochen', 'FR 20 Minuten köcheln.']);
  assert.equal(dokument.de, undefined);
  assert.deepEqual(
      {quellHash: dokument.quellHash, originalSprache: dokument.originalSprache, schemaVersion: dokument.schemaVersion, modell: dokument.modell, erstelltAm: dokument.erstelltAm},
      {quellHash: 'h1', originalSprache: 'de', schemaVersion: SCHEMA_VERSION, modell: 'modell', erstelltAm: 7},
  );
});

// ── Trigger ────────────────────────────────────────────────────────────────────

const snapshot = (pfad, wert) => ({
  exists: wert !== undefined,
  id: pfad.split('/')[1],
  ref: docRef(pfad),
  data: () => wert,
});
const ereignis = (id, vorher, nachher) => ({
  params: {recipeId: id},
  data: {before: snapshot(`recipes/${id}`, vorher), after: snapshot(`recipes/${id}`, nachher)},
});

test('Trigger: übersetzt ein neues Rezept und legt rezeptUebersetzungen an', async () => {
  daten['recipes/r1'] = REZEPT;
  await handlers.uebersetzeRezeptInhalt(ereignis('r1', undefined, REZEPT));
  assert.equal(fetchCalls.length, 1);
  const dokument = daten['rezeptUebersetzungen/r1'];
  assert.equal(dokument.quellHash, inhaltQuellHash(REZEPT));
  assert.deepEqual(dokument.en.zutaten.slice(3), ['1 Teil #recipe:abc:Gemüsebrühe', '']);
  assert.equal(daten[quotaPfad('automatik')].count, 1);
  assert.equal(daten['recipes/r1'].updatedAt, undefined, 'das Rezept selbst bleibt unberührt');
});

test('Trigger: bei unverändertem Inhalt kein Lesezugriff und kein KI-Aufruf', async () => {
  daten['recipes/r1'] = {...REZEPT, ratingAvg: 5};
  await handlers.uebersetzeRezeptInhalt(ereignis('r1', REZEPT, {...REZEPT, ratingAvg: 5, title: 'Neuer Titel'}));
  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(gelesen, []);
});

test('Trigger: eine aktuelle Übersetzung wird nicht neu erzeugt', async () => {
  daten['recipes/r1'] = REZEPT;
  daten['rezeptUebersetzungen/r1'] = {quellHash: inhaltQuellHash(REZEPT), schemaVersion: SCHEMA_VERSION};
  await handlers.uebersetzeRezeptInhalt(ereignis('r1', undefined, REZEPT));
  assert.deepEqual(fetchCalls, []);
});

test('Trigger: geänderter Inhalt wird neu übersetzt, laufende Importe warten', async () => {
  const neu = {...REZEPT, steps: ['Linsen waschen.', 'Würzen.']};
  daten['recipes/r1'] = neu;
  daten['rezeptUebersetzungen/r1'] = {quellHash: inhaltQuellHash(REZEPT), schemaVersion: SCHEMA_VERSION};
  await handlers.uebersetzeRezeptInhalt(ereignis('r1', REZEPT, neu));
  assert.equal(fetchCalls.length, 1);
  assert.equal(daten['rezeptUebersetzungen/r1'].quellHash, inhaltQuellHash(neu));

  await handlers.uebersetzeRezeptInhalt(ereignis('r2', undefined, {...REZEPT, importStatus: 'processing'}));
  assert.equal(fetchCalls.length, 1);
});

test('Trigger: löscht die Übersetzung mit dem Rezept und wenn kein Inhalt mehr da ist', async () => {
  daten['rezeptUebersetzungen/r1'] = {quellHash: 'alt'};
  await handlers.uebersetzeRezeptInhalt(ereignis('r1', REZEPT, undefined));
  assert.deepEqual(geloescht, ['rezeptUebersetzungen/r1']);

  daten['rezeptUebersetzungen/r2'] = {quellHash: 'alt'};
  const leer = {title: 'Leer', ingredients: [], steps: []};
  daten['recipes/r2'] = leer;
  await handlers.uebersetzeRezeptInhalt(ereignis('r2', REZEPT, leer));
  assert.deepEqual(geloescht, ['rezeptUebersetzungen/r1', 'rezeptUebersetzungen/r2']);
  assert.deepEqual(fetchCalls, []);
});

test('Trigger: am Tageslimit, bei ungültiger Antwort oder überholtem Inhalt wird nichts geschrieben', async () => {
  daten['recipes/r1'] = REZEPT;
  daten[quotaPfad('automatik')] = {count: 1000};
  await handlers.uebersetzeRezeptInhalt(ereignis('r1', undefined, REZEPT));
  assert.deepEqual(fetchCalls, []);

  delete daten[quotaPfad('automatik')];
  geminiAntwort = (anfrage) => ({json: uebersetzt(anfrage, ['en'])});
  await handlers.uebersetzeRezeptInhalt(ereignis('r1', undefined, REZEPT));
  assert.equal(daten['rezeptUebersetzungen/r1'], undefined);

  geminiAntwort = (anfrage) => {
    daten['recipes/r1'] = {...REZEPT, steps: ['Inzwischen geändert.']};
    return {json: uebersetzt(anfrage)};
  };
  await handlers.uebersetzeRezeptInhalt(ereignis('r1', undefined, REZEPT));
  assert.equal(daten['rezeptUebersetzungen/r1'], undefined);
});

// ── Backfill ───────────────────────────────────────────────────────────────────

const auth = (uid) => ({uid, token: {firebase: {sign_in_provider: 'password'}}});
const backfill = (uid, data) => handlers.backfillInhaltUebersetzungen({auth: uid ? auth(uid) : null, data});

test('Backfill: nur für Admins, prüft die Eingabe', async () => {
  await assert.rejects(() => backfill(null, {}), (e) => e.code === 'unauthenticated');
  await assert.rejects(() => backfill('edit-1', {}), (e) => e.code === 'permission-denied');
  for (const data of [{cursor: 'a/b'}, {anzahl: 0}, {anzahl: 21}]) {
    await assert.rejects(() => backfill('admin-1', data), (e) => e.code === 'invalid-argument');
  }
  assert.deepEqual(fetchCalls, []);
});

test('Backfill: übersetzt seitenweise, was fehlt oder veraltet ist', async () => {
  daten['recipes/a'] = REZEPT;
  daten['rezeptUebersetzungen/a'] = {quellHash: inhaltQuellHash(REZEPT), schemaVersion: SCHEMA_VERSION};
  daten['recipes/b'] = {...REZEPT, steps: ['B']};
  daten['recipes/c'] = {title: 'Leer'};
  daten['recipes/d'] = {...REZEPT, importStatus: 'queued'};
  daten['recipes/e'] = {...REZEPT, steps: ['E']};
  daten['rezeptUebersetzungen/e'] = {quellHash: 'veraltet', schemaVersion: SCHEMA_VERSION};

  const erste = await backfill('admin-1', {anzahl: 3});
  assert.equal(erste.geprueft, 3);
  assert.equal(erste.neu, 1);
  assert.equal(erste.uebersprungen, 2);
  assert.equal(erste.naechsterCursor, 'c');
  assert.equal(erste.gesamt, 5);
  assert.ok(daten['rezeptUebersetzungen/b']);

  const zweite = await backfill('admin-1', {cursor: 'c', anzahl: 3});
  assert.equal(zweite.neu, 1);
  assert.equal(zweite.uebersprungen, 1);
  assert.equal(zweite.fertig, true);
  assert.equal(daten['rezeptUebersetzungen/e'].quellHash, inhaltQuellHash(daten['recipes/e']));
  assert.equal(daten[quotaPfad('admin-1')].count, 2);
});

test('Backfill: am Tageslimit endet die Seite, KI-Fehler treffen nur das Rezept', async () => {
  daten['recipes/a'] = REZEPT;
  daten['recipes/b'] = {...REZEPT, steps: ['B']};
  daten[quotaPfad('admin-1')] = {count: 2999};
  geminiAntwort = () => ({status: 500, json: {}});
  const ergebnis = await backfill('admin-1', {});
  assert.equal(ergebnis.tageslimitErreicht, true);
  assert.equal(ergebnis.naechsterCursor, 'a');
  assert.deepEqual(ergebnis.fehlgeschlagen, ['a']);
  assert.deepEqual(ergebnis.fehlerGruende, {a: 'ki'});
  await assert.rejects(() => backfill('admin-1', {cursor: 'a'}), (e) => e.code === 'resource-exhausted');
});
