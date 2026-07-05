/* eslint-disable require-jsdoc */

const test = require('node:test');
const assert = require('node:assert/strict');

function loadFunctionsModule(state = {}) {
  delete require.cache[require.resolve('./index')];

  const Module = require('module');
  const originalLoad = Module._load;

  class MockHttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }

  const recipesByShareId = state.recipesByShareId || new Map();
  const menusByShareId = state.menusByShareId || new Map();
  const recipesById = state.recipesById || new Map();

  const db = {
    collection: (name) => ({
      where: (field, _op, value) => ({
        limit: () => ({
          get: async () => {
            if (field !== 'shareId') return {empty: true, docs: []};
            if (name === 'recipes') {
              const entry = recipesByShareId.get(value);
              if (!entry) return {empty: true, docs: []};
              return {
                empty: false,
                docs: [{id: entry.id, data: () => entry.data}],
              };
            }
            if (name === 'menus') {
              const entry = menusByShareId.get(value);
              if (!entry) return {empty: true, docs: []};
              return {
                empty: false,
                docs: [{id: entry.id, data: () => entry.data}],
              };
            }
            return {empty: true, docs: []};
          },
        }),
      }),
      doc: (id) => ({
        get: async () => {
          const data = recipesById.get(id);
          return {
            exists: Boolean(data),
            id,
            data: () => data,
          };
        },
      }),
    }),
    doc: () => ({
      get: async () => ({exists: false, data: () => ({})}),
    }),
    runTransaction: async (handler) => handler({
      get: async () => ({exists: false, data: () => ({})}),
      set: () => {},
    }),
  };

  Module._load = function(request, parent, isMain, ...args) {
    if (request === 'firebase-functions/v2/https') {
      return {
        onCall: (opts, handler) => {
          const wrapped = async (request) => handler(request);
          wrapped.__opts = opts;
          return wrapped;
        },
        onRequest: (_opts, handler) => handler,
        HttpsError: MockHttpsError,
      };
    }

    if (request === 'firebase-functions/v2/firestore') {
      return {
        onDocumentCreated: (_opts, handler) => handler,
        onDocumentWritten: (_opts, handler) => handler,
      };
    }

    if (request === 'firebase-functions/v2/scheduler') {
      return {onSchedule: (_opts, handler) => handler};
    }

    if (request === 'firebase-functions/params') {
      return {defineSecret: () => ({value: () => 'test-secret'})};
    }

    if (request === 'firebase-admin') {
      const firestore = () => db;
      firestore.FieldValue = {serverTimestamp: () => ({})};
      return {
        initializeApp: () => {},
        firestore,
        auth: () => ({getUser: async () => ({uid: 'u1'})}),
        storage: () => ({bucket: () => ({file: () => ({})})}),
        messaging: () => ({sendEachForMulticast: async () => ({successCount: 0})}),
      };
    }

    if (request === './nutritionNormalization') {
      return {
        createNutritionNormalizationUtils: () => ({
          normalizeIngredientWithGemini: async () => null,
          parseIngredientForNutrition: () => null,
          generateSearchTermWithGemini: async () => '',
          estimateNutritionWithGemini: async () => null,
        }),
      };
    }

    if (request === '@google/generative-ai') return {GoogleGenerativeAI: class {}};
    if (request === 'nodemailer') return {createTransport: () => ({sendMail: async () => ({})})};
    if (request === 'sharp') {
      const chain = {
        rotate: () => chain,
        resize: () => chain,
        png: () => chain,
        jpeg: () => chain,
        toBuffer: async () => Buffer.from(''),
      };
      return () => chain;
    }

    return originalLoad.call(this, request, parent, isMain, ...args);
  };

  const mod = require('./index');
  Module._load = originalLoad;

  return {mod, MockHttpsError};
}

test('shared callable functions are public and have CORS', () => {
  const {mod} = loadFunctionsModule();

  const functionNames = [
    'getSharedRecipeByShareId',
    'getSharedMenuByShareId',
    'getSharedRecipesByIds',
  ];

  functionNames.forEach((name) => {
    assert.equal(mod[name].__opts.invoker, 'public');
    assert.equal(mod[name].__opts.region, 'us-central1');
    assert.ok(Array.isArray(mod[name].__opts.cors));
    assert.ok(mod[name].__opts.cors.some((origin) => origin === 'https://broubook.web.app'));
  });
});

test('getSharedRecipeByShareId returns recipe for valid shareId', async () => {
  const shareId = '81a9ba26-c6e0-4fde-8501-340c248ae246';
  const {mod} = loadFunctionsModule({
    recipesByShareId: new Map([[shareId, {id: 'r1', data: {title: 'Shared'}}]]),
  });

  const result = await mod.getSharedRecipeByShareId({data: {shareId}});

  assert.deepEqual(result, {recipe: {id: 'r1', title: 'Shared'}});
});

test('getSharedMenuByShareId throws not-found when menu does not exist', async () => {
  const shareId = '81a9ba26-c6e0-4fde-8501-340c248ae246';
  const {mod, MockHttpsError} = loadFunctionsModule();

  await assert.rejects(
      () => mod.getSharedMenuByShareId({data: {shareId}}),
      (err) => err instanceof MockHttpsError && err.code === 'not-found',
  );
});

test('getSharedRecipesByIds only returns recipes referenced by shared menu', async () => {
  const shareId = '81a9ba26-c6e0-4fde-8501-340c248ae246';
  const {mod} = loadFunctionsModule({
    menusByShareId: new Map([[shareId, {
      id: 'm1',
      data: {
        sections: [{recipeIds: ['r1', 'r2']}],
        recipeIds: ['r3'],
      },
    }]]),
    recipesById: new Map([
      ['r1', {title: 'One'}],
      ['r3', {title: 'Three'}],
      ['r9', {title: 'Nine'}],
    ]),
  });

  const result = await mod.getSharedRecipesByIds({
    data: {shareId, recipeIds: ['r9', 'r1', 'r3']},
  });

  assert.deepEqual(result, {
    recipes: [
      {id: 'r1', title: 'One'},
      {id: 'r3', title: 'Three'},
    ],
  });
});
