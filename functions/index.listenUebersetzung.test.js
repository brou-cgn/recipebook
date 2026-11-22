// Mehrsprachigkeit (docs/vorhaben/mehrsprachigkeit.md, PR 5): Übersetzungsvorschläge für
// Auswahllisten. Geprüft wird: Prüfung von Anfrage und Antwort, nur Admins, Tageslimit, Fehler
// des KI-Dienstes. Die Callable schreibt nichts.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  pruefeListenEingabe,
  baueListenPrompt,
  pruefeListenAntwort,
} = require('./shared/listenUebersetzung');
const {isFirebaseAdminRequest, firebaseAdminModule} = require('./testSupport');

let userRoles;
let quota;
let geschrieben;
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
      const docRef = (pfad) => ({
        path: pfad,
        get: async () => ({exists: false, data: () => undefined}),
        set: async () => geschrieben.push(pfad),
        update: async () => geschrieben.push(pfad),
      });
      const firestoreFactory = () => ({
        collection: (name) => ({doc: (id) => docRef(`${name}/${id}`)}),
        doc: (pfad) => ({
          get: async () => {
            const uid = pfad.replace(/^users\//, '');
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
      firestoreFactory.FieldPath = {documentId: () => '__id__'};
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
const quotaPfad = (uid) => `aiListenUebersetzungLimits/${uid}_${heute()}`;

let fetchCalls;
let geminiAntwort;
const realFetch = global.fetch;

const datenAusPrompt = (prompt) => JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1));
const antworte = (daten) => ({
  eintraege: daten.map((eintrag) => (eintrag.einheit ?
    {nr: eintrag.nr, en_einzahl: 'serving', en_mehrzahl: 'servings', fr_einzahl: 'portion', fr_mehrzahl: 'portions'} :
    {nr: eintrag.nr, en: `EN ${eintrag.text}`, fr: `FR ${eintrag.text}`})),
});

function mockGemini() {
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const daten = datenAusPrompt(body.contents[0].parts[0].text);
    fetchCalls.push(daten);
    const {status = 200, json} = geminiAntwort(daten);
    return {ok: status === 200, status, json: async () => ({candidates: [{content: {parts: [{text: JSON.stringify(json)}]}}]})};
  };
}

const EINTRAEGE = [
  {liste: 'cuisineTypes', wert: 'Italienische Küche'},
  {liste: 'mealCategories', wert: 'Hauptspeisen', text: 'Hauptspeisen'},
  {liste: 'portionUnits', wert: 'portion', einzahl: 'Portion', mehrzahl: 'Portionen'},
];

test.beforeEach(() => {
  userRoles = {'edit-1': 'edit', 'mod-1': 'moderator', 'admin-1': 'admin'};
  quota = {};
  geschrieben = [];
  fetchCalls = [];
  geminiAntwort = (daten) => ({json: antworte(daten)});
  mockGemini();
  handlers = loadHandlers();
});

test.afterEach(() => {
  global.fetch = realFetch;
});

test('pruefeListenEingabe: Texte und Einheiten, Nummern in Reihenfolge, Fehler bei Ungültigem', () => {
  assert.deepEqual(pruefeListenEingabe(EINTRAEGE), [
    {nr: 1, liste: 'cuisineTypes', wert: 'Italienische Küche', einheit: false, text: 'Italienische Küche'},
    {nr: 2, liste: 'mealCategories', wert: 'Hauptspeisen', einheit: false, text: 'Hauptspeisen'},
    {nr: 3, liste: 'portionUnits', wert: 'portion', einheit: true, einzahl: 'Portion', mehrzahl: 'Portionen'},
  ]);
  assert.throws(() => pruefeListenEingabe([]), /1 bis 100/);
  assert.throws(() => pruefeListenEingabe(Array.from({length: 101}, () => EINTRAEGE[0])), /1 bis 100/);
  assert.throws(() => pruefeListenEingabe([{liste: 'adjektive', wert: 'frisch'}]), /ungültig/);
  assert.throws(() => pruefeListenEingabe([{liste: 'portionUnits', wert: 'x'}]), /einzahl/);
  assert.throws(() => pruefeListenEingabe([{liste: 'units', wert: 'a\nb'}]), /ungültig/);
});

test('baueListenPrompt: Einträge als JSON am Ende, Einheiten mit Einzahl und Mehrzahl', () => {
  const daten = datenAusPrompt(baueListenPrompt(pruefeListenEingabe(EINTRAEGE)));
  assert.deepEqual(daten[2], {nr: 3, liste: 'portionUnits', einheit: true, einzahl: 'Portion', mehrzahl: 'Portionen'});
  assert.deepEqual(daten[0], {nr: 1, liste: 'cuisineTypes', text: 'Italienische Küche'});
});

test('pruefeListenAntwort: ordnet nach Nummer zu und verwirft Unvollständiges', () => {
  const eintraege = pruefeListenEingabe(EINTRAEGE);
  const vorschlaege = pruefeListenAntwort({
    eintraege: [
      {nr: 1, en: 'Italian cuisine', fr: 'Cuisine italienne'},
      {nr: 2, en: 'Main courses'},
      {nr: 3, en_einzahl: 'serving', en_mehrzahl: 'servings', fr_einzahl: 'portion', fr_mehrzahl: 'portions'},
      {nr: 9, en: 'x', fr: 'y'},
    ],
  }, eintraege);
  assert.deepEqual(vorschlaege, [
    {liste: 'cuisineTypes', wert: 'Italienische Küche', en: 'Italian cuisine', fr: 'Cuisine italienne'},
    {liste: 'portionUnits', wert: 'portion', en: {einzahl: 'serving', mehrzahl: 'servings'}, fr: {einzahl: 'portion', mehrzahl: 'portions'}},
  ]);
  assert.deepEqual(pruefeListenAntwort(null, eintraege), []);
});

const auth = (uid) => ({uid, token: {firebase: {sign_in_provider: 'password'}}});
const aufruf = (uid, data) => handlers.uebersetzeListenwerte({auth: uid ? auth(uid) : null, data});

test('Callable: liefert Vorschläge für Admins und schreibt nichts außer dem Zähler', async () => {
  const ergebnis = await aufruf('admin-1', {eintraege: EINTRAEGE});
  assert.equal(fetchCalls.length, 1);
  assert.equal(ergebnis.vorschlaege.length, 3);
  assert.deepEqual(ergebnis.vorschlaege[0], {liste: 'cuisineTypes', wert: 'Italienische Küche', en: 'EN Italienische Küche', fr: 'FR Italienische Küche'});
  assert.equal(ergebnis.dailyLimit, 100);
  assert.equal(quota[quotaPfad('admin-1')], 1);
  assert.deepEqual(geschrieben, []);
});

test('Callable: lehnt Abgemeldete, ungültige Anfragen und Nicht-Admins ab, ohne KI und Zähler', async () => {
  await assert.rejects(() => aufruf(null, {eintraege: EINTRAEGE}), (e) => e.code === 'unauthenticated');
  await assert.rejects(() => aufruf('admin-1', {eintraege: []}), (e) => e.code === 'invalid-argument');
  for (const uid of ['edit-1', 'mod-1']) {
    await assert.rejects(() => aufruf(uid, {eintraege: EINTRAEGE}), (e) => e.code === 'permission-denied');
  }
  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(quota, {});
});

test('Callable: am Tageslimit kein KI-Aufruf, bei Fehler des KI-Dienstes unavailable', async () => {
  quota[quotaPfad('admin-1')] = 100;
  await assert.rejects(() => aufruf('admin-1', {eintraege: EINTRAEGE}), (e) => e.code === 'resource-exhausted');
  assert.deepEqual(fetchCalls, []);

  delete quota[quotaPfad('admin-1')];
  geminiAntwort = () => ({status: 503, json: {}});
  await assert.rejects(() => aufruf('admin-1', {eintraege: EINTRAEGE}), (e) => e.code === 'unavailable');
});
