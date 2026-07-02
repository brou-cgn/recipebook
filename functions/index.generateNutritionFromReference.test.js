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
  assert.deepEqual(setCalls[0].payload.nutritionSetActual, []);
  assert.deepEqual(setCalls[0].payload.nutritionSetOutdated, []);
  assert.equal(setCalls[0].payload.recalc, false);
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
  assert.deepEqual(setCalls[0].payload.nutritionSetActual, [{
    source: 'manual',
    kalorien: 110,
    protein: 0.8,
    fett: 0.2,
    kohlenhydrate: 3.9,
  }]);
  assert.deepEqual(setCalls[0].payload.nutritionSetOutdated, []);
  assert.equal(setCalls[0].payload.recalc, false);
  assert.equal(result.source, 'manual');

  global.fetch = originalFetch;
});

test('stores ki confidence from Gemini estimate in the confidence field', async () => {
  createUtilsStub = () => ({
    generateSearchTermWithGemini: async () => 'wheat flour',
    estimateNutritionWithGemini: async () => ({
      per100g: {kalorien: 364, protein: 10, fett: 1, kohlenhydrate: 76, zucker: 1, ballaststoffe: 3, salz: 0},
      confidence: 'high',
    }),
  });
  referenceData = {status: 'Prüfung ausstehend', source: 'ai-generiert'};
  loadWrappedFunction();

  const originalFetch = global.fetch;
  global.fetch = async () => ({ok: false});

  await wrappedFunction({auth: {uid: 'u1'}, data: {ingredientID: 'mehl'}});

  assert.ok(setCalls.length > 0);
  assert.deepEqual(setCalls[0].payload.confidence, {ki: 'high'});

  global.fetch = originalFetch;
});

test('stores openFoodFacts confidence based on OFF field completeness', async () => {
  createUtilsStub = () => ({
    generateSearchTermWithGemini: async () => 'tomato',
    estimateNutritionWithGemini: async () => null,
  });
  referenceData = {status: 'Prüfung ausstehend', source: ''};
  loadWrappedFunction();

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      products: [{
        nutriments: {
          'energy-kcal_100g': 20,
          'proteins_100g': 1.1,
          'fat_100g': 0.2,
          'carbohydrates_100g': 3.5,
        },
      }],
    }),
  });

  await wrappedFunction({auth: {uid: 'u1'}, data: {ingredientID: 'tomate'}});

  assert.ok(setCalls.length > 0);
  // 4 of 7 fields present → 4/7 ≈ 0.57
  assert.ok(setCalls[0].payload.confidence?.openFoodFacts != null);
  assert.equal(setCalls[0].payload.confidence.openFoodFacts, 0.57);

  global.fetch = originalFetch;
});

test('stores dual confidence when both OFF and KI are available', async () => {
  createUtilsStub = () => ({
    generateSearchTermWithGemini: async () => 'tomato',
    estimateNutritionWithGemini: async () => ({
      per100g: {kalorien: 18, protein: 0.8, fett: 0.2, kohlenhydrate: 3.9, zucker: 0, ballaststoffe: 0, salz: 0},
      confidence: 'medium',
    }),
  });
  referenceData = {status: 'Prüfung ausstehend', source: ''};
  loadWrappedFunction();

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      products: [{
        nutriments: {
          'energy-kcal_100g': 20,
          'proteins_100g': 1.1,
          'fat_100g': 0.2,
          'carbohydrates_100g': 3.5,
          'sugars_100g': 0.5,
          'fiber_100g': 0.8,
          'salt_100g': 0.01,
        },
      }],
    }),
  });

  await wrappedFunction({auth: {uid: 'u1'}, data: {ingredientID: 'tomate'}});

  assert.ok(setCalls.length > 0);
  assert.deepEqual(setCalls[0].payload.confidence, {openFoodFacts: 1, ki: 'medium'});

  global.fetch = originalFetch;
});

test('does not overwrite existing confidence fields not updated in this call', async () => {
  createUtilsStub = () => ({
    generateSearchTermWithGemini: async () => 'mehl',
    estimateNutritionWithGemini: async () => ({
      per100g: {kalorien: 364, protein: 10, fett: 1, kohlenhydrate: 76, zucker: 1, ballaststoffe: 3, salz: 0},
      confidence: 'low',
    }),
  });
  referenceData = {
    status: 'Prüfung ausstehend',
    source: 'ai-generiert',
    confidence: {openFoodFacts: 0.86},
  };
  loadWrappedFunction();

  const originalFetch = global.fetch;
  global.fetch = async () => ({ok: false});

  await wrappedFunction({auth: {uid: 'u1'}, data: {ingredientID: 'mehl'}});

  assert.ok(setCalls.length > 0);
  assert.deepEqual(setCalls[0].payload.confidence, {openFoodFacts: 0.86, ki: 'low'});

  global.fetch = originalFetch;
});

// ─── Status transition tests ────────────────────────────────────────────────

test('advances status from empty string to Prüfung ausstehend', async () => {
  referenceData = {status: '', source: 'ai-generiert', kalorien_ai: 18};
  loadWrappedFunction();

  const originalFetch = global.fetch;
  global.fetch = async () => ({ok: false});

  await wrappedFunction({auth: {uid: 'u1'}, data: {ingredientID: 'zutat'}});

  assert.ok(setCalls.length > 0);
  assert.equal(setCalls[0].payload.status, 'Prüfung ausstehend');

  global.fetch = originalFetch;
});

test('advances status from Datenerfassung ausstehend to Prüfung ausstehend', async () => {
  referenceData = {
    status: 'Datenerfassung ausstehend',
    source: 'ai-generiert',
    kalorien_ai: 364,
    protein_ai: 10,
    fett_ai: 1,
    kohlenhydrate_ai: 76,
  };
  loadWrappedFunction();

  const originalFetch = global.fetch;
  global.fetch = async () => ({ok: false});

  await wrappedFunction({auth: {uid: 'u1'}, data: {ingredientID: 'zutat'}});

  assert.ok(setCalls.length > 0);
  assert.equal(setCalls[0].payload.status, 'Prüfung ausstehend');

  global.fetch = originalFetch;
});

test('keeps status as Neu when current status is Neu', async () => {
  referenceData = {
    status: 'Neu',
    source: 'ai-generiert',
    kalorien_ai: 18,
  };
  loadWrappedFunction();

  const originalFetch = global.fetch;
  global.fetch = async () => ({ok: false});

  await wrappedFunction({auth: {uid: 'u1'}, data: {ingredientID: 'zutat'}});

  assert.ok(setCalls.length > 0);
  // 'Neu' entries are left untouched: status key must not be present in the
  // update payload so Firestore's merge preserves the existing 'Neu' value.
  assert.equal(Object.hasOwn(setCalls[0].payload, 'status'), false);

  global.fetch = originalFetch;
});

test('does not change status for Freigegeben entries', async () => {
  referenceData = {
    status: 'Freigegeben',
    source: 'manual',
    kalorien_manual: 110,
  };
  loadWrappedFunction();

  const originalFetch = global.fetch;
  global.fetch = async () => ({ok: false});

  await wrappedFunction({auth: {uid: 'u1'}, data: {ingredientID: 'zutat'}});

  assert.ok(setCalls.length > 0);
  assert.equal(Object.hasOwn(setCalls[0].payload, 'status'), false);

  global.fetch = originalFetch;
});

test('keeps status as Prüfung ausstehend when already in that state', async () => {
  referenceData = {
    status: 'Prüfung ausstehend',
    source: 'ai-generiert',
    kalorien_ai: 18,
  };
  loadWrappedFunction();

  const originalFetch = global.fetch;
  global.fetch = async () => ({ok: false});

  await wrappedFunction({auth: {uid: 'u1'}, data: {ingredientID: 'zutat'}});

  assert.ok(setCalls.length > 0);
  assert.equal(setCalls[0].payload.status, 'Prüfung ausstehend');

  global.fetch = originalFetch;
});

// ─── CORS / invoker configuration test ──────────────────────────────────────

test('generateNutritionFromReference is registered with cors and invoker:public options', () => {
  delete require.cache[require.resolve('./index')];

  const Module = require('module');
  const originalLoad = Module._load;

  let capturedOpts = null;

  Module._load = function(request, parent, isMain, ...args) {
    if (request === 'firebase-functions/v2/https') {
      class MockHttpsError extends Error {
        constructor(code, message) {
          super(message);
          this.code = code;
        }
      }
      return {
        onCall: (opts, handler) => {
          if (typeof opts === 'object' && opts !== null && typeof handler === 'function') {
            // Capture the opts of the LAST onCall registration that has cors defined
            // (generateNutritionFromReference is the one we care about for this test)
            if (opts.cors !== undefined) {
              capturedOpts = opts;
            }
          }
          return handler;
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
      const ff = () => ({collection: () => ({doc: () => ({get: async () => ({exists: false, data: () => ({})})})})});
      ff.FieldValue = {serverTimestamp: () => ({})};
      return {initializeApp: () => {}, firestore: ff};
    }

    if (request === './nutritionNormalization') {
      return {createNutritionNormalizationUtils: () => ({
        generateSearchTermWithGemini: async () => '',
        estimateNutritionWithGemini: async () => null,
      })};
    }

    if (request === '@google/generative-ai') return {GoogleGenerativeAI: class {}};
    if (request === 'nodemailer') return {createTransport: () => ({sendMail: async () => ({})})};
    if (request === 'sharp') {
      const chain = {rotate: () => chain, resize: () => chain, png: () => chain, toBuffer: async () => Buffer.from('')};
      return () => chain;
    }

    return originalLoad.call(this, request, parent, isMain, ...args);
  };

  require('./index');
  Module._load = originalLoad;

  assert.ok(capturedOpts !== null, 'onCall with cors option was not registered');
  assert.ok(
      Array.isArray(capturedOpts.cors) && capturedOpts.cors.length > 0,
      'cors option should be a non-empty array of allowed origins'
  );
  assert.ok(
      capturedOpts.cors.some((o) => o === 'https://broubook.web.app'),
      'cors should contain https://broubook.web.app as an exact entry'
  );
  assert.ok(
      capturedOpts.cors.some((o) => o === 'http://localhost:3000' || o === 'http://127.0.0.1:3000'),
      'cors should contain http://localhost:3000 or http://127.0.0.1:3000 for local development'
  );
  assert.equal(capturedOpts.invoker, 'public', 'invoker should be public');
});
