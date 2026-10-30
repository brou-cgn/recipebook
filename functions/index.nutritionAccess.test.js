// Access control of the three Gemini-backed nutrition callables (S13): role
// from users/{uid} (edit or higher) and a daily quota in aiNutritionLimits,
// both failing closed.

const test = require('node:test');
const assert = require('node:assert/strict');

let userRoles;
let userLookupFails;
let quotaCount;
let quotaFails;
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
            if (userLookupFails) throw new Error('firestore unavailable');
            const uid = path.replace(/^users\//, '');
            return uid in userRoles
              ? {exists: true, data: () => ({role: userRoles[uid]})}
              : {exists: false, data: () => ({})};
          },
        }),
        runTransaction: async (fn) => {
          if (quotaFails) throw new Error('transaction aborted');
          const snap = quotaCount === null
            ? {exists: false, data: () => ({})}
            : {exists: true, data: () => ({count: quotaCount})};
          return fn({
            get: async () => snap,
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

const auth = (uid, provider = 'password') => ({uid, token: {firebase: {sign_in_provider: provider}}});

// Each callable with input that passes its own validation.
const CALLS = {
  parseIngredientAmountG: {ingredientText: '200 g Mehl'},
  calculateNutritionFromOpenFoodFacts: {ingredients: ['200 g Mehl'], portionen: 2},
  generateNutritionFromReference: {ingredientID: 'mehl'},
};

test.beforeEach(() => {
  // generateNutritionFromReference asks OpenFoodFacts first; keep the tests offline.
  global.fetch = async () => ({ok: false, status: 503, json: async () => ({})});
  userRoles = {'edit-1': 'edit', 'mod-1': 'moderator', 'admin-1': 'admin', 'read-1': 'read', 'comment-1': 'comment'};
  userLookupFails = false;
  quotaCount = null;
  quotaFails = false;
  quotaWrites = [];
  handlers = loadHandlers();
});

for (const [name, data] of Object.entries(CALLS)) {
  test(`${name}: refuses anonymous guests and roles below edit before touching the quota`, async () => {
    userRoles['anon-1'] = 'guest';
    for (const caller of [auth('anon-1', 'anonymous'), auth('nobody', 'anonymous'), auth('read-1'), auth('comment-1')]) {
      await assert.rejects(
          () => handlers[name]({auth: caller, data}),
          (err) => err.code === 'permission-denied',
          `${caller.uid} must be refused`,
      );
    }
    assert.deepEqual(quotaWrites, [], 'a refused caller must not consume quota');
  });

  test(`${name}: lets edit, moderator and admin through and counts the call`, async () => {
    for (const uid of ['edit-1', 'mod-1', 'admin-1']) {
      quotaWrites = [];
      await assert.doesNotReject(() => handlers[name]({auth: auth(uid), data}), `${uid} must be allowed`);
      assert.deepEqual(quotaWrites, [{collection: 'aiNutritionLimits', count: 1}]);
    }
  });

  test(`${name}: refuses when the daily quota is used up`, async () => {
    quotaCount = 500; // authenticated tier
    await assert.rejects(
        () => handlers[name]({auth: auth('edit-1'), data}),
        (err) => err.code === 'resource-exhausted',
    );
  });

  test(`${name}: admin tier is larger than the edit tier`, async () => {
    quotaCount = 500;
    await assert.doesNotReject(() => handlers[name]({auth: auth('admin-1'), data}));
  });

  test(`${name}: fails closed when the role lookup fails`, async () => {
    userLookupFails = true;
    await assert.rejects(
        () => handlers[name]({auth: auth('edit-1'), data}),
        (err) => err.code === 'unavailable',
    );
  });

  test(`${name}: fails closed when the quota cannot be checked`, async () => {
    quotaFails = true;
    await assert.rejects(
        () => handlers[name]({auth: auth('edit-1'), data}),
        (err) => err.code === 'unavailable',
    );
  });

  test(`${name}: still asks for a login first`, async () => {
    await assert.rejects(
        () => handlers[name]({auth: null, data}),
        (err) => err.code === 'unauthenticated',
    );
  });
}

test('invalid input is rejected before it costs quota', async () => {
  await assert.rejects(
      () => handlers.parseIngredientAmountG({auth: auth('edit-1'), data: {ingredientText: '  '}}),
      (err) => err.code === 'invalid-argument',
  );
  await assert.rejects(
      () => handlers.calculateNutritionFromOpenFoodFacts({auth: auth('edit-1'), data: {ingredients: []}}),
      (err) => err.code === 'invalid-argument',
  );
  await assert.rejects(
      () => handlers.generateNutritionFromReference({auth: auth('edit-1'), data: {}}),
      (err) => err.code === 'invalid-argument',
  );
  assert.deepEqual(quotaWrites, []);
});
