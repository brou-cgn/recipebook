/* eslint-disable require-jsdoc */
/**
 * Smoke tests for the scanRecipeWithAI callable Cloud Function.
 *
 * These tests cover the client → callable auth/invoker boundary that the
 * existing dailyAiImporterTest deliberately does NOT exercise:
 *
 *  - Unauthenticated callers must be rejected with code "unauthenticated".
 *  - Authenticated callers with valid input must receive a structured recipe.
 *  - Rate-limit exhaustion must be signalled with code "resource-exhausted".
 *  - Invalid image data must be rejected with code "invalid-argument".
 *  - An unsupported language must be rejected with code "invalid-argument".
 *  - A missing Gemini API key must be signalled with code "failed-precondition".
 *
 * Rationale (see issue #2611): the daily self-test only validates the
 * server-side Gemini pipeline (config, HTML extraction, HTTP fetch).  It
 * cannot detect an IAM / Cloud-Run-Invoker mis-configuration that causes
 * every client call to `httpsCallable(functions, 'scanRecipeWithAI')` to
 * fail with HTTP 401 "access token could not be verified".  The present file
 * adds a complementary unit-level check that exercises the auth guard and
 * the full handler path so such regressions are caught before they reach
 * production.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// Minimal valid JPEG base64 string (length > 100 chars, JPEG MIME type)
const VALID_IMAGE = 'data:image/jpeg;base64,' + 'A'.repeat(200);

// A recipe prompt that satisfies the placeholder/migration checks in
// getRecipeExtractionPrompt() without needing the real 2 KB default prompt.
const TEST_PROMPT =
  'Extrahiere Rezept. {{CUISINE_TYPES}} {{MEAL_CATEGORIES}} imperiale Einheiten.';

// Gemini API response that parses to a valid German-locale recipe.
const GEMINI_JSON = JSON.stringify({
  titel: 'Rührei',
  portionen: 2,
  zubereitungszeit: 10,
  schwierigkeit: 1,
  kulinarik: 'Deutsch',
  kategorie: 'Frühstück',
  tags: [],
  zutaten: ['4 Eier', '2 Esslöffel Butter', '1 Prise Salz'],
  zubereitung: ['Eier verquirlen.', 'Butter schmelzen.', 'Eier stocken lassen.'],
  notizen: '',
});

const GEMINI_SUCCESS_BODY = {
  candidates: [{content: {parts: [{text: GEMINI_JSON}]}}],
};

// ---------------------------------------------------------------------------
// Per-test state
// ---------------------------------------------------------------------------

let scanRecipeWithAI;
// null  → no scan recorded today (allows the request)
// number → scan count for today (>= limit blocks the request)
let rateLimitCount;
let settingsData;
let geminiSecretValue;
let fetchResponses; // stack of Response-like objects popped by the mock fetch

// ---------------------------------------------------------------------------
// Module loader with stubbed dependencies
// ---------------------------------------------------------------------------

function loadFunction() {
  delete require.cache[require.resolve('./index')];

  const Module = require('module');
  const originalLoad = Module._load;

  Module._load = function(request, parent, isMain, ...args) {
    // ── Firebase Functions v2 ──────────────────────────────────────────────
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
      return {onSchedule: (_opts, handler) => handler};
    }

    if (request === 'firebase-functions/params') {
      return {
        defineSecret: () => ({value: () => geminiSecretValue}),
      };
    }

    // ── Google Generative AI SDK (not used by scanRecipeWithAI directly) ───
    if (request === '@google/generative-ai') {
      return {GoogleGenerativeAI: class {}};
    }

    // ── Internal helpers ───────────────────────────────────────────────────
    if (request === './nutritionNormalization') {
      return {
        createNutritionNormalizationUtils: () => ({
          parseIngredientForNutrition: () => null,
        }),
      };
    }

    if (request === 'nodemailer') {
      return {createTransport: () => ({sendMail: async () => ({})})};
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

    // ── Firebase Admin ─────────────────────────────────────────────────────
    if (request === 'firebase-admin') {
      const firestoreFactory = () => ({
        collection: (name) => {
          if (name === 'settings') {
            return {
              doc: (docId) => ({
                get: async () =>
                  settingsData[docId]
                    ? {exists: true, data: () => settingsData[docId]}
                    : {exists: false, data: () => ({})},
                update: async () => {},
              }),
            };
          }

          // aiScanLimits – only accessed via runTransaction
          if (name === 'aiScanLimits') {
            return {doc: (_key) => ({})};
          }

          // Fallback for all other collections (users, recipes, …)
          return {
            where: () => ({
              limit: () => ({get: async () => ({empty: true, docs: []})}),
              get: async () => ({forEach: () => {}, docs: []}),
            }),
            get: async () => ({docs: []}),
            doc: () => ({
              get: async () => ({exists: false, data: () => ({})}),
              set: async () => {},
              update: async () => {},
            }),
          };
        },
        doc: () => ({
          get: async () => ({exists: false, data: () => ({})}),
        }),
        // Transaction used exclusively by checkRateLimit
        runTransaction: async (fn) => {
          const snap =
            rateLimitCount === null
              ? {exists: false, data: () => ({})}
              : {exists: true, data: () => ({count: rateLimitCount})};

          return fn({
            get: async (_ref) => snap,
            set: (_ref, data) => {
              rateLimitCount = data.count;
            },
            update: (_ref, _data) => {},
          });
        },
      });

      firestoreFactory.FieldValue = {
        serverTimestamp: () => ({seconds: 0, nanos: 0}),
        increment: (n) => n,
      };

      return {
        initializeApp: () => {},
        firestore: firestoreFactory,
      };
    }

    return originalLoad.call(this, request, parent, isMain, ...args);
  };

  scanRecipeWithAI = require('./index').scanRecipeWithAI;
  Module._load = originalLoad;
}

// ---------------------------------------------------------------------------
// Helper to build a minimal fake fetch response
// ---------------------------------------------------------------------------

function okResponse(body) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function errorResponse(status, body) {
  return {
    ok: false,
    status,
    statusText: String(status),
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

test.beforeEach(() => {
  geminiSecretValue = 'test-gemini-api-key';
  rateLimitCount = null; // no scans today → first scan allowed
  settingsData = {app: {aiRecipePrompt: TEST_PROMPT}};
  fetchResponses = [];

  // Default mock fetch: returns a successful Gemini response
  global.fetch = async (url) => {
    if (fetchResponses.length > 0) {
      return fetchResponses.shift();
    }
    if (url && url.includes('generativelanguage.googleapis.com')) {
      return okResponse(GEMINI_SUCCESS_BODY);
    }
    return okResponse({});
  };

  loadFunction();
});

// ---------------------------------------------------------------------------
// Auth / callable boundary tests (core of this smoke suite)
// ---------------------------------------------------------------------------

test('rejects unauthenticated request with code "unauthenticated"', async () => {
  // This mirrors the HTTP 401 scenario seen in production when the Cloud Run
  // Invoker / IAM configuration is wrong and Firebase cannot verify the token.
  await assert.rejects(
    () => scanRecipeWithAI({auth: null, data: {imageBase64: VALID_IMAGE}}),
    (err) => err.code === 'unauthenticated',
  );
});

test('rejects request with missing auth field', async () => {
  await assert.rejects(
    () => scanRecipeWithAI({data: {imageBase64: VALID_IMAGE}}),
    (err) => err.code === 'unauthenticated',
  );
});

// ---------------------------------------------------------------------------
// Happy path – authenticated user receives a structured recipe
// ---------------------------------------------------------------------------

test('returns structured recipe for authenticated user with valid image', async () => {
  const result = await scanRecipeWithAI({
    auth: {
      uid: 'user-123',
      token: {firebase: {sign_in_provider: 'password'}, admin: false},
    },
    data: {imageBase64: VALID_IMAGE, language: 'de'},
  });

  assert.equal(result.title, 'Rührei');
  assert.ok(Array.isArray(result.ingredients), 'ingredients should be an array');
  assert.ok(result.ingredients.length >= 1, 'at least one ingredient expected');
  assert.ok(Array.isArray(result.steps), 'steps should be an array');
  assert.ok(result.steps.length >= 1, 'at least one step expected');
  assert.ok(typeof result.remainingScans === 'number', 'remainingScans should be a number');
  assert.ok(typeof result.dailyLimit === 'number', 'dailyLimit should be a number');
});

test('returns structured recipe for admin user', async () => {
  const result = await scanRecipeWithAI({
    auth: {
      uid: 'admin-1',
      token: {firebase: {sign_in_provider: 'password'}, admin: true},
    },
    data: {imageBase64: VALID_IMAGE, language: 'de'},
  });

  assert.equal(result.title, 'Rührei');
  assert.equal(result.dailyLimit, 1000);
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

test('rejects request when daily scan limit is exhausted', async () => {
  // Authenticated users are capped at 20 scans per day
  rateLimitCount = 20;

  await assert.rejects(
    () =>
      scanRecipeWithAI({
        auth: {
          uid: 'user-456',
          token: {firebase: {sign_in_provider: 'password'}, admin: false},
        },
        data: {imageBase64: VALID_IMAGE},
      }),
    (err) => err.code === 'resource-exhausted',
  );
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

test('rejects image data that is too short', async () => {
  await assert.rejects(
    () =>
      scanRecipeWithAI({
        auth: {
          uid: 'user-123',
          token: {firebase: {sign_in_provider: 'password'}, admin: false},
        },
        data: {imageBase64: 'data:image/jpeg;base64,short'},
      }),
    (err) => err.code === 'invalid-argument',
  );
});

test('rejects unsupported image MIME type', async () => {
  const gifImage = 'data:image/gif;base64,' + 'A'.repeat(200);

  await assert.rejects(
    () =>
      scanRecipeWithAI({
        auth: {
          uid: 'user-123',
          token: {firebase: {sign_in_provider: 'password'}, admin: false},
        },
        data: {imageBase64: gifImage},
      }),
    (err) => err.code === 'invalid-argument',
  );
});

test('rejects unsupported language code', async () => {
  await assert.rejects(
    () =>
      scanRecipeWithAI({
        auth: {
          uid: 'user-123',
          token: {firebase: {sign_in_provider: 'password'}, admin: false},
        },
        data: {imageBase64: VALID_IMAGE, language: 'fr'},
      }),
    (err) => err.code === 'invalid-argument',
  );
});

// ---------------------------------------------------------------------------
// Configuration checks
// ---------------------------------------------------------------------------

test('reports failed-precondition when Gemini API key is missing', async () => {
  geminiSecretValue = ''; // simulate unconfigured secret
  loadFunction(); // reload with empty secret

  await assert.rejects(
    () =>
      scanRecipeWithAI({
        auth: {
          uid: 'user-123',
          token: {firebase: {sign_in_provider: 'password'}, admin: false},
        },
        data: {imageBase64: VALID_IMAGE},
      }),
    (err) => err.code === 'failed-precondition',
  );
});
