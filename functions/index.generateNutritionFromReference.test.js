/* eslint-disable require-jsdoc */

const test = require('node:test');
const assert = require('node:assert/strict');

let wrappedFunction;
let referenceData;
let setCalls;
let estimateCalls;
let createUtilsStub;

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
        defineSecret: () => ({
          value: () => 'test-secret',
        }),
      };
    }

    if (request === 'firebase-admin') {
      const firestoreFactory = () => ({
        collection: () => ({
          doc: () => ({
            get: async () => ({
              exists: true,
              data: () => ({...referenceData}),
            }),
            set: async (payload, options) => {
              setCalls.push({payload, options});
            },
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
      return {createNutritionNormalizationUtils: createUtilsStub};
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

  wrappedFunction = require('./index').generateNutritionFromReference;
  Module._load = originalLoad;
}

test.beforeEach(() => {
  setCalls = [];
  estimateCalls = 0;
  referenceData = {
    status: 'Prüfung ausstehend',
    source: 'ai-generiert',
    kalorien_manual: 91,
    protein_manual: 1.2,
  };
  createUtilsStub = () => ({
    generateSearchTermWithGemini: async () => 'tomato',
    estimateNutritionWithGemini: async () => {
      estimateCalls += 1;
      return {
        per100g: {
          kalorien: 18,
          protein: 0.8,
          fett: 0.2,
          kohlenhydrate: 3.9,
        },
      };
    },
  });
  loadWrappedFunction();
});

test('fills OFF and AI fields when missing and keeps manual source priority in check status', async () => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      json: async () => ({
        products: [{
          product_name: 'Tomato',
          nutriments: {
            'energy-kcal_100g': 20,
            'proteins_100g': 1.1,
            'fat_100g': 0.2,
            'carbohydrates_100g': 3.5,
          },
        }],
      }),
    };
  };

  const result = await wrappedFunction({
    auth: {uid: 'u1'},
    data: {ingredientID: 'tomate'},
  });

  assert.equal(fetchCalls, 1);
  assert.equal(estimateCalls, 1);
  assert.equal(setCalls.length, 1);
  assert.equal(setCalls[0].payload.source, 'manual');
  assert.equal(setCalls[0].payload.kalorien_openfoodfacts, 20);
  assert.equal(setCalls[0].payload.kalorien_ai, 18);
  assert.equal(setCalls[0].payload.kalorien, 91);
  assert.equal(result.source, 'manual');
  assert.equal(result.values.kalorien, 91);
  assert.deepEqual(setCalls[0].options, {merge: true});

  global.fetch = originalFetch;
});

test('never changes source for approved status', async () => {
  referenceData = {
    status: 'Freigegeben',
    source: 'manual',
    kalorien_manual: 110,
  };
  loadWrappedFunction();

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      products: [{
        nutriments: {'energy-kcal_100g': 30},
      }],
    }),
  });

  const result = await wrappedFunction({
    auth: {uid: 'u1'},
    data: {ingredientID: 'zutat'},
  });

  assert.equal(estimateCalls, 1);
  assert.equal(setCalls.length, 1);
  assert.equal(Object.hasOwn(setCalls[0].payload, 'source'), false);
  assert.equal(result.source, 'manual');

  global.fetch = originalFetch;
});
