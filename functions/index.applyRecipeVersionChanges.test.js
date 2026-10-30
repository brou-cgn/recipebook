// applyRecipeVersionChanges: arbeitet eine diktierte Beschreibung in ein Rezept ein.
// Die Berechtigung "versionDictation" wird serverseitig geprüft, nicht nur im UI.

const test = require('node:test');
const assert = require('node:assert/strict');

let userRoles;
let userLookupFails;
let rolePermissions;
let quotaWrites;
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
      const firestoreFactory = () => ({
        collection: (name) => ({
          doc: (id) => ({
            get: async () => ({exists: false, data: () => ({})}),
            set: async () => {},
            path: `${name}/${id}`,
          }),
          where: () => ({limit: () => ({get: async () => ({empty: true, docs: []})})}),
        }),
        doc: (path) => ({
          get: async () => {
            if (path.startsWith('rolePermissions/')) {
              const flags = rolePermissions[path.replace(/^rolePermissions\//, '')];
              return flags ? {exists: true, data: () => flags} : {exists: false, data: () => ({})};
            }
            if (userLookupFails) throw new Error('firestore unavailable');
            const uid = path.replace(/^users\//, '');
            return uid in userRoles
              ? {exists: true, data: () => ({role: userRoles[uid]})}
              : {exists: false, data: () => ({})};
          },
        }),
        runTransaction: async (fn) => {
          return fn({
            get: async () => ({exists: false, data: () => ({})}),
            set: (ref, data) => {
              quotaWrites.push({collection: ref.path.split('/')[0], count: data.count});
            },
            update: () => {},
          });
        },
      });
      firestoreFactory.FieldValue = {serverTimestamp: () => ({}), increment: (n) => n};
      return {initializeApp: () => {}, firestore: firestoreFactory};
    }
    if (/^\.\.?\/nutritionNormalization$/.test(request)) {
      return {
        createNutritionNormalizationUtils: () => ({
          normalizeIngredientWithGemini: async () => null,
          parseIngredientForNutrition: () => ({amountG: 100}),
          generateSearchTermWithGemini: async () => '',
          estimateNutritionWithGemini: async () => ({
            per100g: {kalorien: 364, protein: 10, fett: 1, kohlenhydrate: 76, zucker: 1, ballaststoffe: 3, salz: 0},
            confidence: 'high',
          }),
        }),
      };
    }
    if (request === '@google/genai') return {GoogleGenAI: class {}};
    if (request === 'nodemailer') return {createTransport: () => ({sendMail: async () => ({})})};
    if (request === 'sharp') {
      const chain = {rotate: () => chain, resize: () => chain, png: () => chain, toBuffer: async () => Buffer.from('')};
      return () => chain;
    }
    return originalLoad.call(this, request, parent, isMain, ...args);
  };

  const mod = require('./index');
  // Stubs bleiben aktiv: Handler laden sharp/nodemailer erst beim Aufruf (testSupport setzt zurück).
  return mod;
}

const auth = (uid) => ({uid, token: {firebase: {sign_in_provider: 'password'}}});


const RECIPE = {
  title: 'Pfannkuchen',
  portionen: 4,
  kochdauer: 20,
  ingredients: [{type: 'ingredient', text: '250 g Mehl'}, {type: 'ingredient', text: '50 g Butter'}],
  steps: [{type: 'step', text: 'Teig anrühren.'}, {type: 'step', text: 'In Butter ausbacken.'}],
};

const AI_REPLY = {
  titel: 'Pfannkuchen',
  portionen: 4,
  kochdauer: 25,
  zutaten: [{typ: 'ingredient', text: '250 g Mehl'}, {typ: 'ingredient', text: '3 Esslöffel Olivenöl'}],
  schritte: [{typ: 'step', text: 'Teig anrühren.'}, {typ: 'step', text: 'In Olivenöl ausbacken.'}],
  zusammenfassung: 'Butter durch Olivenöl ersetzt.',
};

let fetchCalls;
const realFetch = global.fetch;

function mockGemini(reply, status = 200) {
  global.fetch = async (url, init) => {
    fetchCalls.push({url, body: JSON.parse(init.body)});
    return {
      ok: status === 200,
      status,
      statusText: 'err',
      json: async () => (status === 200
        ? {candidates: [{content: {parts: [{text: JSON.stringify(reply)}]}}]}
        : {error: {message: 'boom'}}),
    };
  };
}

test.beforeEach(() => {
  userRoles = {'edit-1': 'edit', 'mod-1': 'moderator', 'admin-1': 'admin', 'read-1': 'read'};
  userLookupFails = false;
  rolePermissions = {edit: {versionDictation: true}};
  quotaWrites = [];
  fetchCalls = [];
  mockGemini(AI_REPLY);
  handlers = loadHandlers();
});

test.afterEach(() => {
  global.fetch = realFetch;
});

const call = (uid, data) => handlers.applyRecipeVersionChanges({auth: uid ? auth(uid) : null, data});

test('refuses anonymous callers', async () => {
  await assert.rejects(() => call(null, {description: 'Olivenöl', recipe: RECIPE}), (e) => e.code === 'unauthenticated');
});

test('refuses a role without the versionDictation permission and consumes no quota', async () => {
  rolePermissions = {edit: {versionDictation: false}};
  await assert.rejects(
      () => call('edit-1', {description: 'Olivenöl statt Butter', recipe: RECIPE}),
      (e) => e.code === 'permission-denied',
  );
  assert.deepEqual(quotaWrites, []);
  assert.equal(fetchCalls.length, 0);
});

test('refuses roles below edit even if the flag is set', async () => {
  rolePermissions = {read: {versionDictation: true}};
  await assert.rejects(
      () => call('read-1', {description: 'Olivenöl statt Butter', recipe: RECIPE}),
      (e) => e.code === 'permission-denied',
  );
});

test('admins pass without the flag', async () => {
  rolePermissions = {};
  const result = await call('admin-1', {description: 'Olivenöl statt Butter', recipe: RECIPE});
  assert.equal(result.summary, 'Butter durch Olivenöl ersetzt.');
});

test('rejects a too short description and malformed recipes', async () => {
  for (const data of [
    {description: ' ', recipe: RECIPE},
    {description: 'x'.repeat(2001), recipe: RECIPE},
    {description: 'Olivenöl', recipe: null},
    {description: 'Olivenöl', recipe: {...RECIPE, ingredients: 'Mehl'}},
    {description: 'Olivenöl', recipe: {...RECIPE, steps: [{text: 5}]}},
  ]) {
    await assert.rejects(() => call('edit-1', data), (e) => e.code === 'invalid-argument');
  }
  assert.equal(fetchCalls.length, 0);
});

test('returns the changed recipe in client shape and counts against aiVersionLimits', async () => {
  const result = await call('edit-1', {description: 'Ich habe Olivenöl statt Butter genommen und 5 Minuten länger gebacken', recipe: RECIPE});
  assert.deepEqual(result.ingredients, [
    {type: 'ingredient', text: '250 g Mehl'},
    {type: 'ingredient', text: '3 Esslöffel Olivenöl'},
  ]);
  assert.equal(result.steps[1].text, 'In Olivenöl ausbacken.');
  assert.equal(result.kochdauer, 25);
  assert.equal(result.title, 'Pfannkuchen');
  assert.deepEqual(quotaWrites, [{collection: 'aiVersionLimits', count: 1}]);
  assert.match(fetchCalls[0].body.contents[0].parts[0].text, /Olivenöl statt Butter/);
});

test('keeps headings and drops empty entries from the AI reply', async () => {
  mockGemini({
    ...AI_REPLY,
    zutaten: [{typ: 'heading', text: 'Teig'}, {typ: 'ingredient', text: '250 g Mehl'}, {typ: 'ingredient', text: '  '}],
  });
  const result = await call('edit-1', {description: 'Olivenöl statt Butter', recipe: RECIPE});
  assert.deepEqual(result.ingredients, [{type: 'heading', text: 'Teig'}, {type: 'ingredient', text: '250 g Mehl'}]);
});

test('fails with internal when the AI returns no ingredients', async () => {
  mockGemini({...AI_REPLY, zutaten: []});
  await assert.rejects(() => call('edit-1', {description: 'Olivenöl', recipe: RECIPE}), (e) => e.code === 'internal');
});

test('maps Gemini rate limiting to resource-exhausted', async () => {
  mockGemini({}, 429);
  await assert.rejects(() => call('edit-1', {description: 'Olivenöl', recipe: RECIPE}), (e) => e.code === 'resource-exhausted');
});
