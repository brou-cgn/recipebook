/* eslint-disable require-jsdoc */

const test = require('node:test');
const assert = require('node:assert/strict');

const API_KEY = 'test-secret';
const PIN_HASH_DOC = {salt: 'abc', hash: 'x', failedAttempts: 0};

// Lädt index.js mit gemocktem Firebase. `userData` ist das Nutzerdokument,
// `pinDoc` das Sicherheitsdokument (null = Nutzer hat keinen PIN gesetzt).
function loadFunctions({userData, pinDoc = null}) {
  delete require.cache[require.resolve('./index')];
  delete require.cache[require.resolve('./webImportPin')];
  const Module = require('module');
  const originalLoad = Module._load;
  const saved = [];

  const db = {
    collection: (name) => ({
      add: async (data) => {
        saved.push({name, id: 'new', data});
        return {id: 'new'};
      },
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
      firestore.FieldValue = {serverTimestamp: () => ({})};
      return {
        initializeApp: () => {},
        firestore,
        auth: () => ({getUserByEmail: async () => ({uid: 'u1'})}),
        storage: () => ({bucket: () => ({file: () => ({})})}),
        messaging: () => ({}),
      };
    }
    if (request === './nutritionNormalization') {
      return {createNutritionNormalizationUtils: () => ({})};
    }
    if (request === '@google/generative-ai') return {GoogleGenerativeAI: class {}};
    if (request === 'nodemailer') return {createTransport: () => ({})};
    if (request === 'sharp') return () => ({});
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

const RECIPE_BODY = {title: 'Test', ingredients: ['1 Ei'], steps: ['Braten']};

test('addRecipeViaAPI: Rezept ohne Speisekategorie -> 400, nichts gespeichert', async () => {
  for (const extra of [{}, {speisekategorie: '  '}, {category: ''}]) {
    const {mod, saved} = loadFunctions({userData: {role: 'edit'}});
    const res = makeRes();
    await mod.addRecipeViaAPI(makeReq({body: {...RECIPE_BODY, ...extra}}), res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /speisekategorie/);
    assert.equal(saved.length, 0, 'es darf kein Rezept gespeichert werden');
  }
});

test('addRecipeViaAPI: Speisekategorie (auch als category/kategorie) wird akzeptiert', async () => {
  for (const extra of [{speisekategorie: 'Hauptgericht'}, {category: 'Dessert'}, {kategorie: 'Snacks'}]) {
    const {mod, saved} = loadFunctions({userData: {role: 'edit'}});
    const res = makeRes();
    await mod.addRecipeViaAPI(makeReq({body: {...RECIPE_BODY, ...extra}}), res);
    assert.notEqual(res.statusCode, 400, JSON.stringify(res.body));
    assert.ok(saved.some((s) => s.name === 'recipes'), 'Rezept wurde gespeichert');
  }
});
