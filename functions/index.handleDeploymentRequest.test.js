/* eslint-disable require-jsdoc */

const test = require('node:test');
const assert = require('node:assert/strict');

let wrappedFunction;
let usersById;
let requestUpdates;

function createFirestoreMock() {
  const firestore = () => ({
    collection: (name) => ({
      doc: (id) => {
        if (name === 'users') {
          return {
            get: async () => {
              const user = usersById[id];
              return {
                exists: Boolean(user),
                data: () => user || {},
              };
            },
          };
        }

        if (name === 'developmentDeployRequests') {
          return {
            update: async (data) => {
              requestUpdates.push(data);
            },
            get: async () => ({exists: false, data: () => ({})}),
          };
        }

        return {
          get: async () => ({exists: false, data: () => ({})}),
          update: async () => {},
          set: async () => {},
        };
      },
      where: () => ({
        get: async () => ({empty: true, docs: []}),
        limit: () => ({
          get: async () => ({empty: true, docs: []}),
        }),
      }),
      limit: () => ({
        get: async () => ({empty: true, docs: []}),
      }),
      get: async () => ({empty: true, docs: []}),
    }),
    runTransaction: async () => ({allowed: true}),
    batch: () => ({
      set: () => {},
      update: () => {},
      delete: () => {},
      commit: async () => {},
    }),
  });

  firestore.FieldValue = {
    serverTimestamp: () => ({seconds: 0, nanos: 0}),
  };

  return firestore;
}

function loadWrappedFunction() {
  delete require.cache[require.resolve('./index')];

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
      return {
        onDocumentCreated: (_opts, handler) => handler,
        onDocumentWritten: (_opts, handler) => handler,
      };
    }

    if (request === 'firebase-functions/v2/scheduler') {
      return {
        onSchedule: (_opts, handler) => handler,
      };
    }

    if (request === 'firebase-functions/params') {
      return {
        defineSecret: (name) => ({
          value: () => (name === 'GITHUB_TOKEN' ? 'gh-test-token' : 'secret'),
        }),
      };
    }

    if (request === 'firebase-admin') {
      return {
        initializeApp: () => {},
        firestore: createFirestoreMock(),
      };
    }

    if (request === './nutritionNormalization') {
      return {
        createNutritionNormalizationUtils: () => ({
          parseIngredientForNutrition: () => ({amountG: 100, name: 'Test'}),
          normalizeIngredientWithGemini: async () => ({amountG: 100, name: 'Test'}),
          estimateNutritionWithGemini: async () => null,
        }),
      };
    }

    if (request === '@google/generative-ai') {
      return {
        GoogleGenerativeAI: class {},
      };
    }

    if (request === 'nodemailer') {
      return {
        createTransport: () => ({
          sendMail: async () => ({}),
        }),
      };
    }

    if (request === 'sharp') {
      const chain = {
        rotate: () => chain,
        resize: () => chain,
        png: () => chain,
        toBuffer: async () => Buffer.from(''),
      };
      return () => chain;
    }

    return originalLoad.call(this, request, parent, isMain, ...args);
  };

  wrappedFunction = require('./index').handleDeploymentRequest;
  Module._load = originalLoad;
}

test.beforeEach(() => {
  usersById = {
    'user-1': {role: 'moderator', isAdmin: false},
  };
  requestUpdates = [];
  loadWrappedFunction();
});

test('creates GitHub PR and marks request completed', async () => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    fetchCalls.push({url, options});

    if (url.includes('/git/ref/heads/main')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({object: {sha: 'base-sha'}}),
      };
    }

    if (url.includes('/contents/src%2Fconfig%2FingredientMatching.json?ref=main')) {
      return {
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      };
    }

    if (url.endsWith('/git/refs')) {
      return {
        ok: true,
        status: 201,
        json: async () => ({ref: 'refs/heads/auto'}),
      };
    }

    if (url.includes('/contents/src%2Fconfig%2FingredientMatching.json')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({content: {sha: 'file-sha'}}),
      };
    }

    if (url.endsWith('/pulls')) {
      return {
        ok: true,
        status: 201,
        json: async () => ({html_url: 'https://github.com/brou-cgn/recipebook/pull/123'}),
      };
    }

    throw new Error(`Unexpected fetch call: ${url}`);
  };

  await wrappedFunction({
    params: {requestId: 'req-1'},
    data: {
      data: () => ({
        kind: 'ingredient-id-matching',
        requestedBy: 'user-1',
        payload: {
          customUnits: ['Päckchen'],
          customIngredientAdjectives: ['gehackt'],
        },
      }),
    },
  });

  assert.equal(requestUpdates[0].status, 'processing');
  assert.equal(requestUpdates[1].status, 'completed');
  assert.equal(
      requestUpdates[1].pullRequestUrl,
      'https://github.com/brou-cgn/recipebook/pull/123',
  );
  assert.equal(fetchCalls.some((call) => call.url.endsWith('/pulls')), true);

  global.fetch = originalFetch;
});

test('rejects request from non-moderator user and marks failed', async () => {
  usersById = {
    'user-2': {role: 'read', isAdmin: false},
  };
  loadWrappedFunction();

  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('Fetch should not be called for unauthorized requests');
  };

  await wrappedFunction({
    params: {requestId: 'req-2'},
    data: {
      data: () => ({
        kind: 'ingredient-id-matching',
        requestedBy: 'user-2',
        payload: {
          customUnits: ['Päckchen'],
          customIngredientAdjectives: ['gehackt'],
        },
      }),
    },
  });

  assert.equal(requestUpdates.length, 1);
  assert.equal(requestUpdates[0].status, 'failed');
  assert.match(requestUpdates[0].error, /not allowed/i);

  global.fetch = originalFetch;
});
