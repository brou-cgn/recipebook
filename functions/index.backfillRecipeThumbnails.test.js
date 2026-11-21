// backfillRecipeThumbnails (Tech-Check F20): liest die Rezepte seitenweise mit Cursor über die
// Dokument-ID. Vorher las jeder Aufruf dieselbe erste Seite (limit ohne Reihenfolge und Cursor),
// Rezepte dahinter bekamen nie ein Vorschaubild.

const test = require('node:test');
const assert = require('node:assert/strict');
const {isFirebaseAdminRequest, firebaseAdminModule} = require('./testSupport');

const DOC_ID = Symbol('documentId');

let userRoles;
let store;
let updates;
let abfragen;
let gespeichert;
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
      const docRef = (name, id) => ({
        id,
        path: `${name}/${id}`,
        update: async (patch) => {
          updates.push({id, patch});
        },
      });
      // Abfrage auf recipes: orderBy(documentId) + limit + startAfter, Reihenfolge nach ID.
      const abfrage = (name, zustand) => ({
        limit: (anzahl) => abfrage(name, {...zustand, limit: anzahl}),
        startAfter: (id) => abfrage(name, {...zustand, startAfter: id}),
        get: async () => {
          abfragen.push(zustand);
          const ids = Object.keys(store).sort();
          const ab = zustand.startAfter == null ? ids : ids.filter((id) => id > zustand.startAfter);
          const docs = ab.slice(0, zustand.limit).map((id) => ({id, ref: docRef(name, id), data: () => store[id]}));
          return {docs, size: docs.length, empty: docs.length === 0};
        },
      });
      const firestoreFactory = () => ({
        collection: (name) => ({
          orderBy: (feld) => abfrage(name, {orderBy: feld, limit: Infinity, startAfter: null}),
          // Der alte Weg ohne Reihenfolge darf nicht mehr vorkommen.
          limit: () => assert.fail('recipes ohne orderBy(documentId) gelesen'),
        }),
        doc: (path) => ({
          get: async () => {
            const uid = path.replace(/^users\//, '');
            return uid in userRoles ?
              {exists: true, data: () => ({role: userRoles[uid]})} :
              {exists: false, data: () => ({})};
          },
        }),
      });
      firestoreFactory.FieldValue = {serverTimestamp: () => ({})};
      firestoreFactory.FieldPath = {documentId: () => DOC_ID};
      const storageFactory = () => ({
        bucket: () => ({
          name: 'test-bucket',
          file: (fileName) => ({
            save: async () => {
              gespeichert.push(fileName);
            },
            makePublic: async () => {},
          }),
        }),
      });
      return firebaseAdminModule(request, {initializeApp: () => {}, firestore: firestoreFactory, storage: storageFactory});
    }
    if (/^\.\.?\/nutritionNormalization$/.test(request)) {
      return {createNutritionNormalizationUtils: () => ({})};
    }
    if (request === '@google/genai') return {GoogleGenAI: class {}};
    if (request === 'nodemailer') return {createTransport: () => ({sendMail: async () => ({})})};
    if (request === 'sharp') {
      const chain = {rotate: () => chain, resize: () => chain, jpeg: () => chain, png: () => chain, toBuffer: async () => Buffer.from('thumb')};
      return () => chain;
    }
    return originalLoad.call(this, request, parent, isMain, ...args);
  };

  return require('./index');
}

const auth = (uid) => ({uid, token: {firebase: {sign_in_provider: 'password'}}});
const call = (uid, data) => handlers.backfillRecipeThumbnails({auth: uid ? auth(uid) : null, data});
const rejectsWith = (promise, code) => assert.rejects(promise, (err) => {
  assert.equal(err.code, code, err.message);
  return true;
});

const BILD = 'data:image/png;base64,iVBORw0KGgo=';

test.beforeEach(() => {
  userRoles = {chef: 'admin', koch: 'edit'};
  updates = [];
  abfragen = [];
  gespeichert = [];
  store = {
    r1: {images: [{url: BILD, isDefault: true}]},
    r2: {images: [{url: BILD, isDefault: true, thumbnailUrl: 'https://x/t.jpg'}]},
    r3: {},
    r4: {image: BILD},
    r5: {images: [{url: BILD}, {url: BILD, thumbnailUrl: 'https://x/t2.jpg'}]},
  };
  handlers = loadHandlers();
});

test('nur Admins, angemeldet', async () => {
  await rejectsWith(call(null, {}), 'unauthenticated');
  await rejectsWith(call('koch', {}), 'permission-denied');
  await rejectsWith(call('fremd', {}), 'permission-denied');
});

test('ungültiger Cursor oder batchSize wird abgelehnt', async () => {
  await rejectsWith(call('chef', {cursor: ''}), 'invalid-argument');
  await rejectsWith(call('chef', {cursor: 'a/b'}), 'invalid-argument');
  await rejectsWith(call('chef', {cursor: 7}), 'invalid-argument');
  await rejectsWith(call('chef', {batchSize: 0}), 'invalid-argument');
  await rejectsWith(call('chef', {batchSize: 101}), 'invalid-argument');
  await rejectsWith(call('chef', {batchSize: '5'}), 'invalid-argument');
});

test('läuft seitenweise über alle Rezepte und bearbeitet jedes genau einmal', async () => {
  const seite1 = await call('chef', {batchSize: 2});
  assert.deepEqual({cursor: seite1.naechsterCursor, fertig: seite1.fertig}, {cursor: 'r2', fertig: false});
  const seite2 = await call('chef', {batchSize: 2, cursor: seite1.naechsterCursor});
  assert.deepEqual({cursor: seite2.naechsterCursor, fertig: seite2.fertig}, {cursor: 'r4', fertig: false});
  const seite3 = await call('chef', {batchSize: 2, cursor: seite2.naechsterCursor});
  assert.deepEqual({cursor: seite3.naechsterCursor, fertig: seite3.fertig}, {cursor: null, fertig: true});

  assert.deepEqual(abfragen.map((a) => [a.orderBy, a.limit, a.startAfter]),
      [[DOC_ID, 2, null], [DOC_ID, 2, 'r2'], [DOC_ID, 2, 'r4']]);
  assert.equal(seite1.processed + seite2.processed + seite3.processed, 5);
  // r2 hat schon ein Vorschaubild, r3 kein Bild: übersprungen. r1, r4 und r5 bekommen eins.
  assert.deepEqual(updates.map((u) => u.id), ['r1', 'r4', 'r5']);
  assert.equal(seite1.skipped + seite2.skipped + seite3.skipped, 2);
  assert.deepEqual(gespeichert, [
    'thumbnails/recipe-thumb-r1-0.jpg',
    'thumbnails/recipe-thumb-r4-0.jpg',
    'thumbnails/recipe-thumb-r5-0.jpg',
  ]);
  assert.equal(updates[0].patch.imageThumbnail, 'https://storage.googleapis.com/test-bucket/thumbnails/recipe-thumb-r1-0.jpg');
});

test('ohne Angaben: Standardseite von 50, eine volle Seite meldet einen Cursor', async () => {
  const kurz = await call('chef', {});
  assert.deepEqual([kurz.fertig, kurz.naechsterCursor, abfragen[0].limit], [true, null, 50]);
  store = Object.fromEntries(Array.from({length: 50}, (_, i) => [`r${String(i).padStart(2, '0')}`, {}]));
  const voll = await call('chef', {});
  assert.deepEqual([voll.fertig, voll.naechsterCursor], [false, 'r49']);
});
