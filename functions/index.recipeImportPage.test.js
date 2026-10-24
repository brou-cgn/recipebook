/* eslint-disable require-jsdoc */

const test = require('node:test');
const assert = require('node:assert/strict');

function loadHandler(rawText) {
  require('./testSupport').purgeFunctionsCache();
  const Module = require('module');
  const originalLoad = Module._load;

  const db = {
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists: true,
          data: () => ({rawText, expiresAt: Date.now() + 60000}),
        }),
      }),
    }),
  };

  Module._load = function(request, parent, isMain, ...args) {
    if (request === 'firebase-functions/v2/https') {
      return {
        onCall: (_opts, handler) => handler,
        onRequest: (_opts, handler) => handler,
        HttpsError: class extends Error {},
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
        auth: () => ({}),
        storage: () => ({bucket: () => ({file: () => ({})})}),
        messaging: () => ({}),
      };
    }
    if (request === './nutritionNormalization') {
      return {createNutritionNormalizationUtils: () => ({})};
    }
    if (request === '@google/genai') return {GoogleGenAI: class {}};
    if (request === 'nodemailer') return {createTransport: () => ({})};
    if (request === 'sharp') return () => ({});
    return originalLoad.call(this, request, parent, isMain, ...args);
  };

  try {
    return require('./index').recipeImportPage;
  } finally {
    Module._load = originalLoad;
  }
}

async function render(rawText) {
  const handler = loadHandler(rawText);
  const out = {headers: {}};
  const res = {
    set: (k, v) => {
      out.headers[k] = v;
    },
    status: (code) => {
      out.status = code;
      return res;
    },
    send: (body) => {
      out.body = body;
    },
  };
  await handler({method: 'GET', query: {token: 't1'}}, res);
  return out;
}

test('recipeImportPage: </script> im Text bricht nicht aus dem JSON-LD aus', async () => {
  const text = 'Pasta\n</script><script>alert(1)</script>';
  const {status, body} = await render(text);
  assert.equal(status, 200);

  const start = body.indexOf('<script type="application/ld+json">');
  const end = body.indexOf('</script>', start);
  const jsonLd = body.slice(start + '<script type="application/ld+json">'.length, end);

  assert.ok(!jsonLd.includes('<'), 'JSON-LD enthält ein rohes <');
  assert.ok(!body.includes('<script>alert(1)'), 'eingeschleustes Script im HTML');
  // Für JSON-Parser bleibt der Text identisch.
  assert.equal(JSON.parse(jsonLd).description, text);
});

test('recipeImportPage: U+2028/U+2029 werden im JSON-LD escaped', async () => {
  const text = 'A\u2028B\u2029C';
  const {body} = await render(text);
  const m = body.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  assert.ok(!/[\u2028\u2029]/.test(m[1]), 'rohes Zeilentrennzeichen im JSON-LD');
  assert.equal(JSON.parse(m[1]).description, text);
});
