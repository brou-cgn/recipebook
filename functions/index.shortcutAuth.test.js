/* eslint-disable require-jsdoc */

const test = require('node:test');
const assert = require('node:assert/strict');

const API_KEY = 'test-secret';
const PIN_HASH_DOC = {salt: 'abc', hash: 'x', failedAttempts: 0};

// Lädt index.js mit gemocktem Firebase. `userData` ist das Nutzerdokument,
// `pinDoc` das Sicherheitsdokument (null = Nutzer hat keinen PIN gesetzt),
// `scanCount` der heutige Stand des KI-Tageszählers (null = noch kein Scan heute),
// `limitCheckFails` lässt die Transaktion des Tageszählers scheitern.
function loadFunctions({userData, pinDoc = null, scanCount = null, limitCheckFails = false}) {
  require('./testSupport').purgeFunctionsCache();
  const Module = require('module');
  const originalLoad = Module._load;
  const saved = [];

  const db = {
    runTransaction: async (fn) => {
      if (limitCheckFails) throw new Error('firestore down');
      return fn({
        get: async () => ({exists: scanCount !== null, data: () => ({count: scanCount})}),
        set: () => {},
        update: () => {},
      });
    },
    collection: (name) => ({
      doc: (id) => ({
        get: async () => ({exists: name === 'users', data: () => userData}),
        set: async (data) => saved.push({name, id, data}),
        collection: () => ({
          doc: () => ({
            get: async () => ({exists: !!pinDoc, data: () => pinDoc}),
            set: async () => {},
            update: async () => {},
          }),
        }),
      }),
    }),
  };

  Module._load = function(request, parent, isMain, ...args) {
    if (request === 'firebase-functions/v2/https') {
      return {
        onCall: (_o, h) => h,
        onRequest: (_o, h) => h,
        HttpsError: class extends Error {},
      };
    }
    if (request === 'firebase-functions/v2/firestore') {
      return {onDocumentCreated: (_o, h) => h, onDocumentWritten: (_o, h) => h};
    }
    if (request === 'firebase-functions/v2/scheduler') return {onSchedule: (_o, h) => h};
    if (request === 'firebase-functions/params') {
      return {defineSecret: () => ({value: () => API_KEY})};
    }
    if (request === 'firebase-admin') {
      const firestore = () => db;
      firestore.FieldValue = {serverTimestamp: () => ({}), increment: (n) => n};
      return {
        initializeApp: () => {},
        firestore,
        auth: () => ({getUserByEmail: async () => ({uid: 'u1'})}),
        storage: () => ({bucket: () => ({file: () => ({getSignedUrl: async () => ['https://upload.example/signed']})})}),
        messaging: () => ({}),
      };
    }
    if (/^\.\.?\/nutritionNormalization$/.test(request)) {
      return {createNutritionNormalizationUtils: () => ({})};
    }
    if (request === '@google/genai') return {GoogleGenAI: class {}};
    if (request === 'nodemailer') return {createTransport: () => ({})};
    if (request === 'sharp') {
      const chain = {resize: () => chain, jpeg: () => chain, toBuffer: async () => Buffer.from('jpeg')};
      return () => chain;
    }
    return originalLoad.call(this, request, parent, isMain, ...args);
  };

  let mod;
  try {
    mod = require('./index');
  } finally {
    Module._load = originalLoad;
  }
  return {mod, saved};
}

function makeRes() {
  const res = {statusCode: null, body: null};
  res.set = () => res;
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b) => {
    res.body = b;
    return res;
  };
  res.send = () => res;
  return res;
}

function makeReq(overrides = {}) {
  return {
    method: 'POST',
    headers: {'x-api-key': API_KEY, 'x-user-email': 'a@b.de'},
    body: {rawText: 'Rezept'},
    query: {},
    protocol: 'https',
    get: () => 'host',
    ...overrides,
  };
}

test('createRecipeImportFromText: lehnt Aufruf ohne PIN ab, wenn der Nutzer einen PIN gesetzt hat', async () => {
  const {mod, saved} = loadFunctions({userData: {role: 'edit'}, pinDoc: PIN_HASH_DOC});
  const res = makeRes();
  await mod.createRecipeImportFromText(makeReq(), res);
  assert.equal(res.statusCode, 400, 'fehlender PIN -> invalid-argument');
  assert.equal(saved.length, 0, 'es darf kein Import gespeichert werden');
});

test('createRecipeImportFromText: ohne gesetzten PIN weiterhin erlaubt', async () => {
  const {mod, saved} = loadFunctions({userData: {role: 'edit'}});
  const res = makeRes();
  await mod.createRecipeImportFromText(makeReq(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(saved.length, 1);
});

test('Shortcut-Auth: falscher API-Key -> 401', async () => {
  const {mod} = loadFunctions({userData: {role: 'edit'}});
  const res = makeRes();
  const req = makeReq();
  req.headers['x-api-key'] = 'falsch';
  await mod.createRecipeImportFromText(req, res);
  assert.equal(res.statusCode, 401);
});

test('Shortcut-Auth: Rolle read -> 403', async () => {
  const {mod} = loadFunctions({userData: {role: 'read'}});
  const res = makeRes();
  await mod.createRecipeImportFromText(makeReq(), res);
  assert.equal(res.statusCode, 403);
});

test('Shortcut-Auth: createRecipeImportFromText akzeptiert isShortcutUser und Rolle admin', async () => {
  for (const userData of [{role: 'read', isShortcutUser: true}, {role: 'admin'}]) {
    const {mod} = loadFunctions({userData});
    const res = makeRes();
    await mod.createRecipeImportFromText(makeReq(), res);
    assert.equal(res.statusCode, 200);
  }
});

test('Shortcut-Auth: addRecipeViaAPI akzeptiert isShortcutUser nicht', async () => {
  const {mod} = loadFunctions({userData: {role: 'read', isShortcutUser: true}});
  const res = makeRes();
  await mod.addRecipeViaAPI(makeReq({body: {}}), res);
  assert.equal(res.statusCode, 403);
});

const IMPORT_BODY = {url: 'https://example.com/rezept'};
const REEL_BODY = {url: 'https://www.instagram.com/reel/abc123/'};

test('KI-Limit: importRecipeShortcut legt Job an, solange das Tageslimit nicht erreicht ist', async () => {
  const {mod, saved} = loadFunctions({userData: {role: 'edit'}, scanCount: 19});
  const res = makeRes();
  await mod.importRecipeShortcut(makeReq({body: IMPORT_BODY}), res);
  assert.equal(res.statusCode, 200);
  assert.equal(saved.length, 1);
});

test('KI-Limit: importRecipeShortcut -> 429 bei erreichtem Tageslimit, kein Job', async () => {
  const {mod, saved} = loadFunctions({userData: {role: 'edit'}, scanCount: 20});
  const res = makeRes();
  await mod.importRecipeShortcut(makeReq({body: IMPORT_BODY}), res);
  assert.equal(res.statusCode, 429);
  assert.equal(saved.length, 0, 'es darf kein Import gespeichert werden');
});

test('KI-Limit: Admin hat ein höheres Tageslimit als edit', async () => {
  const {mod} = loadFunctions({userData: {role: 'admin'}, scanCount: 20});
  const res = makeRes();
  await mod.importRecipeShortcut(makeReq({body: IMPORT_BODY}), res);
  assert.equal(res.statusCode, 200);
});

test('KI-Limit: scrapeInstagramReelShortcut -> 429 bei erreichtem Tageslimit, ohne zu scrapen', async () => {
  const {mod, saved} = loadFunctions({userData: {role: 'edit'}, scanCount: 20});
  const res = makeRes();
  await mod.scrapeInstagramReelShortcut(makeReq({body: REEL_BODY}), res);
  assert.equal(res.statusCode, 429);
  assert.equal(saved.length, 0);
});

test('KI-Limit: Zähler nicht prüfbar -> 503 (fail closed), kein Job', async () => {
  const {mod, saved} = loadFunctions({userData: {role: 'edit'}, limitCheckFails: true});
  const res = makeRes();
  await mod.importRecipeShortcut(makeReq({body: IMPORT_BODY}), res);
  assert.equal(res.statusCode, 503);
  assert.equal(saved.length, 0);
});

test('KI-Limit: falscher API-Key verbraucht kein Kontingent (401 vor Limit-Prüfung)', async () => {
  const {mod} = loadFunctions({userData: {role: 'edit'}, scanCount: 20});
  const res = makeRes();
  const req = makeReq({body: IMPORT_BODY});
  req.headers['x-api-key'] = 'falsch';
  await mod.importRecipeShortcut(req, res);
  assert.equal(res.statusCode, 401);
});

const PHOTO_BODY = {images: ['data:image/jpeg;base64,' + 'A'.repeat(200)]};

test('KI-Limit: scanRecipePhotoShortcut legt Job an, solange das Tageslimit nicht erreicht ist', async () => {
  const {mod, saved} = loadFunctions({userData: {role: 'edit'}, scanCount: 19});
  const res = makeRes();
  await mod.scanRecipePhotoShortcut(makeReq({body: PHOTO_BODY}), res);
  assert.equal(res.statusCode, 200);
  assert.equal(saved.length, 1);
});

test('KI-Limit: scanRecipePhotoShortcut -> 429 bei erreichtem Tageslimit, kein Job', async () => {
  const {mod, saved} = loadFunctions({userData: {role: 'edit'}, scanCount: 20});
  const res = makeRes();
  await mod.scanRecipePhotoShortcut(makeReq({body: PHOTO_BODY}), res);
  assert.equal(res.statusCode, 429);
  assert.equal(saved.length, 0, 'es darf kein Import gespeichert werden');
});

test('KI-Limit: getVideoUploadUrl legt Job an und gibt URL aus, solange das Tageslimit nicht erreicht ist', async () => {
  const {mod, saved} = loadFunctions({userData: {role: 'edit'}, scanCount: 19});
  const res = makeRes();
  await mod.getVideoUploadUrl(makeReq({body: {}}), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.uploadUrl, 'https://upload.example/signed');
  assert.equal(saved.length, 1);
});

test('KI-Limit: getVideoUploadUrl -> 429 bei erreichtem Tageslimit, kein Job und keine Upload-URL', async () => {
  const {mod, saved} = loadFunctions({userData: {role: 'edit'}, scanCount: 20});
  const res = makeRes();
  await mod.getVideoUploadUrl(makeReq({body: {}}), res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.uploadUrl, undefined);
  assert.equal(saved.length, 0);
});

test('KI-Limit: getVideoUploadUrl -> 503 (fail closed), wenn der Zähler nicht prüfbar ist', async () => {
  const {mod, saved} = loadFunctions({userData: {role: 'edit'}, limitCheckFails: true});
  const res = makeRes();
  await mod.getVideoUploadUrl(makeReq({body: {}}), res);
  assert.equal(res.statusCode, 503);
  assert.equal(saved.length, 0);
});
