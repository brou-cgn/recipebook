/* eslint-disable require-jsdoc */

// S5: the import callables check the rolePermissions features (fotoscan,
// webimport, recipeImport) on the server, not only in the UI. scanRecipeWithAI
// has its own detailed cases in index.scanRecipeWithAI.test.js; this file makes
// sure every import callable carries the same guard.

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

const IMPORT_CALLABLES = [
  'scanRecipeWithAI',
  'scanRecipesWithAI',
  'processHtmlWithAI',
  'scrapeInstagramReel',
  'importRecipeCallable',
  'fetchRecipeHtml',
  'captureWebsiteScreenshot',
];

test.beforeEach(() => {
  userRoles = {'edit-1': 'edit', 'mod-1': 'moderator'};
  userLookupFails = false;
  rolePermissions = {};
  quotaWrites = [];
  handlers = loadHandlers();
});

for (const name of IMPORT_CALLABLES) {
  test(`${name}: refuses edit and moderator without any import feature`, async () => {
    rolePermissions = {edit: {fotoscan: false, webimport: false}, moderator: {recipeImport: false}};
    for (const uid of ['edit-1', 'mod-1']) {
      await assert.rejects(
          () => handlers[name]({auth: auth(uid), data: {}}),
          (err) => err.code === 'permission-denied',
          `${uid} must be refused`,
      );
    }
    assert.deepEqual(quotaWrites, [], 'a refused caller must not consume quota');
  });

  test(`${name}: lets a role with an import feature past the guard`, async () => {
    for (const feature of ['fotoscan', 'webimport', 'recipeImport']) {
      rolePermissions = {edit: {[feature]: true}};
      await assert.rejects(
          () => handlers[name]({auth: auth('edit-1'), data: {}}),
          (err) => err.code !== 'permission-denied' && err.code !== 'unavailable',
          `${feature} must open ${name}`,
      );
    }
  });
}

test('rephraseRecipeSteps needs no import feature', async () => {
  rolePermissions = {};
  await assert.rejects(
      () => handlers.rephraseRecipeSteps({auth: auth('edit-1'), data: {steps: []}}),
      (err) => err.code === 'invalid-argument',
  );
});
