/* eslint-disable require-jsdoc */

const test = require('node:test');
const assert = require('node:assert/strict');

let createUtilsStub;
let firestoreDocGetStub;
let firestoreDocSetStub;
let wrappedFunction;

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
            get: firestoreDocGetStub,
            set: firestoreDocSetStub,
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
        createNutritionNormalizationUtils: createUtilsStub,
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

  wrappedFunction = require('./index').calculateNutritionFromOpenFoodFacts;
  Module._load = originalLoad;
}

test.beforeEach(() => {
  firestoreDocGetStub = async () => ({
    exists: false,
    data: () => ({}),
  });
  firestoreDocSetStub = async () => {};
  createUtilsStub = () => ({
    parseIngredientForNutrition: () => ({amountG: 100, name: 'Rice', searchName: 'rice'}),
    normalizeIngredientWithGemini: async () => ({amountG: 100, name: 'Rice', searchName: 'rice'}),
    estimateNutritionWithGemini: async () => null,
  });
  loadWrappedFunction();
});

test('continues to next search term after non-404 HTTP errors', async () => {
  const originalFetch = global.fetch;
  const fetchCalls = [];

  global.fetch = async (url) => {
    fetchCalls.push(url);

    if (url.includes('search_terms=rice')) {
      return {
        ok: false,
        status: 500,
        json: async () => ({products: []}),
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        products: [
          {
            product_name: 'Rice',
            nutriments: {
              'energy-kcal_100g': 130,
              'proteins_100g': 2.7,
              'fat_100g': 0.3,
              'carbohydrates_100g': 28,
              'sugars_100g': 0.1,
              'fiber_100g': 0.4,
              'salt_100g': 0,
            },
          },
        ],
      }),
    };
  };

  const response = await wrappedFunction({
    auth: {uid: 'user-1'},
    data: {
      ingredients: ['1 EL Reis'],
      portionen: 1,
    },
  });

  assert.equal(response.foundCount, 1);
  assert.equal(response.totalCount, 1);
  assert.equal(response.details[0].found, true);
  assert.equal(response.details[0].searchTerm, 'Rice');
  assert.equal(response.naehrwerte.kalorien, 130);

  assert.equal(fetchCalls.some((url) => url.includes('search_terms=rice')), true);
  assert.equal(fetchCalls.some((url) => url.includes('search_terms=Rice')), true);

  global.fetch = originalFetch;
});

test('uses Gemini fallback from catch block with extended timeout', async () => {
  const originalFetch = global.fetch;
  const estimateTimeouts = [];

  createUtilsStub = () => ({
    parseIngredientForNutrition: () => ({amountG: 100, name: 'Rice', searchName: 'rice'}),
    normalizeIngredientWithGemini: async () => ({amountG: 100, name: 'Rice', searchName: 'rice'}),
    estimateNutritionWithGemini: async (_ingredient, parsed, options = {}) => {
      estimateTimeouts.push(options.timeoutMs);
      return {
        per100g: {
          kalorien: 130,
          protein: 2.7,
          fett: 0.3,
          kohlenhydrate: 28,
          zucker: 0.1,
          ballaststoffe: 0.4,
          salz: 0,
        },
        amountG: parsed.amountG,
        name: parsed.name,
      };
    },
  });
  loadWrappedFunction();

  global.fetch = async () => {
    throw new Error('OpenFoodFacts exploded');
  };

  const response = await wrappedFunction({
    auth: {uid: 'user-1'},
    data: {
      ingredients: ['1 EL Reis'],
      portionen: 1,
    },
  });

  assert.equal(response.foundCount, 1);
  assert.equal(response.totalCount, 1);
  assert.equal(response.details[0].found, true);
  assert.equal(response.details[0].aiEstimated, true);
  assert.equal(response.naehrwerte.kalorien, 130);
  assert.deepEqual(estimateTimeouts, [20000]);

  global.fetch = originalFetch;
});

test('uses extended timeout for Gemini fallback after empty OpenFoodFacts results', async () => {
  const originalFetch = global.fetch;
  const estimateTimeouts = [];

  createUtilsStub = () => ({
    parseIngredientForNutrition: () => ({amountG: 100, name: 'Rice', searchName: 'rice'}),
    normalizeIngredientWithGemini: async () => ({amountG: 100, name: 'Rice', searchName: 'rice'}),
    estimateNutritionWithGemini: async (_ingredient, parsed, options = {}) => {
      estimateTimeouts.push(options.timeoutMs);
      return {
        per100g: {
          kalorien: 130,
          protein: 2.7,
          fett: 0.3,
          kohlenhydrate: 28,
          zucker: 0.1,
          ballaststoffe: 0.4,
          salz: 0,
        },
        amountG: parsed.amountG,
        name: parsed.name,
      };
    },
  });
  loadWrappedFunction();

  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({products: []}),
  });

  const response = await wrappedFunction({
    auth: {uid: 'user-1'},
    data: {
      ingredients: ['1 EL Reis'],
      portionen: 1,
    },
  });

  assert.equal(response.foundCount, 1);
  assert.equal(response.details[0].found, true);
  assert.equal(response.details[0].aiEstimated, true);
  assert.deepEqual(estimateTimeouts, [20000]);

  global.fetch = originalFetch;
});

test('cleans parenthetical text from OpenFoodFacts search terms', async () => {
  const originalFetch = global.fetch;
  const fetchCalls = [];

  createUtilsStub = () => ({
    parseIngredientForNutrition: () => ({amountG: 15, name: 'Currypulver (nach Geschmack mehr)'}),
    normalizeIngredientWithGemini: async () => ({amountG: 15, name: 'Currypulver (nach Geschmack mehr)'}),
    estimateNutritionWithGemini: async () => null,
  });
  loadWrappedFunction();

  global.fetch = async (url) => {
    fetchCalls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        products: [
          {
            product_name: 'Currypulver',
            nutriments: {
              'energy-kcal_100g': 325,
              'proteins_100g': 14,
              'fat_100g': 14,
              'carbohydrates_100g': 58,
              'sugars_100g': 2,
              'fiber_100g': 33,
              'salt_100g': 0.1,
            },
          },
        ],
      }),
    };
  };

  const response = await wrappedFunction({
    auth: {uid: 'user-1'},
    data: {
      ingredients: ['1 EL Currypulver (nach Geschmack mehr)'],
      portionen: 1,
    },
  });

  assert.equal(response.foundCount, 1);
  assert.equal(response.details[0].found, true);
  assert.equal(response.details[0].searchTerm, 'Currypulver');
  assert.equal(fetchCalls.some((url) => url.includes('search_terms=Currypulver')), true);
  assert.equal(
      fetchCalls.some((url) => url.includes('search_terms=Currypulver%20%28nach%20Geschmack%20mehr%29')),
      false,
  );

  global.fetch = originalFetch;
});
