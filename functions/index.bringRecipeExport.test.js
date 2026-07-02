/* eslint-disable require-jsdoc */

const test = require('node:test');
const assert = require('node:assert/strict');

let bringRecipeExport;

function loadFunction() {
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
        defineSecret: () => ({
          value: () => 'test-secret',
        }),
      };
    }

    if (request === 'firebase-admin') {
      const firestoreFactory = () => ({
        collection: () => ({
          where: () => ({
            limit: () => ({
              get: async () => ({empty: true, docs: []}),
            }),
          }),
          doc: () => ({
            get: async () => ({exists: false, data: () => ({})}),
            set: async () => {},
          }),
        }),
      });
      firestoreFactory.FieldValue = {
        serverTimestamp: () => ({seconds: 0, nanos: 0}),
      };
      return {
        initializeApp: () => {},
        firestore: firestoreFactory,
      };
    }

    if (request === './nutritionNormalization') {
      return {
        createNutritionNormalizationUtils: () => ({
          parseIngredientForNutrition: () => null,
        }),
      };
    }

    if (request === '@google/generative-ai') {
      return {GoogleGenerativeAI: class {}};
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

  bringRecipeExport = require('./index').bringRecipeExport;
  Module._load = originalLoad;
}

function createRes() {
  return {
    headers: {},
    statusCode: null,
    body: undefined,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test.beforeEach(() => {
  loadFunction();
});

test(
    'allows preflight for allowed origin and returns strict CORS headers',
    async () => {
      const req = {
        method: 'OPTIONS',
        headers: {origin: 'https://brou-cgn.github.io'},
      };
      const res = createRes();

      await bringRecipeExport(req, res);

      assert.equal(res.statusCode, 204);
      assert.equal(
          res.headers['Access-Control-Allow-Origin'],
          'https://brou-cgn.github.io',
      );
      assert.equal(
          res.headers['Access-Control-Allow-Methods'],
          'GET, POST, OPTIONS',
      );
      assert.equal(res.headers['Access-Control-Allow-Headers'], 'Content-Type');
      assert.equal(res.headers.Vary, 'Origin');
    },
);

test('rejects preflight for disallowed origin', async () => {
  const req = {
    method: 'OPTIONS',
    headers: {origin: 'https://evil.example'},
  };
  const res = createRes();

  await bringRecipeExport(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body, 'Forbidden origin');
});

test('allows preflight without origin header', async () => {
  const req = {
    method: 'OPTIONS',
    headers: {},
  };
  const res = createRes();

  await bringRecipeExport(req, res);

  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], undefined);
});

test('rejects non-preflight request for disallowed origin', async () => {
  const req = {
    method: 'POST',
    headers: {origin: 'https://evil.example'},
    body: {},
    rawBody: Buffer.from('{}'),
  };
  const res = createRes();

  await bringRecipeExport(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body, 'Forbidden origin');
});

test('allows request without origin header', async () => {
  const req = {
    method: 'POST',
    headers: {},
    body: {},
    rawBody: Buffer.from('{}'),
  };
  const res = createRes();

  await bringRecipeExport(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body, 'Missing shareId or items');
});
