/* eslint-disable require-jsdoc */

const test = require('node:test');
const assert = require('node:assert/strict');

// ─── CORS / invoker configuration test ──────────────────────────────────────

test('parseIngredientAmountG is registered with cors and invoker:public options', () => {
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
            // Capture the FIRST onCall registration that has cors defined —
            // parseIngredientAmountG is the first nutrition onCall with cors.
            if (opts.cors !== undefined && capturedOpts === null) {
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
      const chain = {rotate: () => chain, resize: () => chain, png: () => chain, toBuffer: async () => Buffer.from('')};
      return () => chain;
    }

    return originalLoad.call(this, request, parent, isMain, ...args);
  };

  require('./index');
  Module._load = originalLoad;

  assert.ok(capturedOpts !== null, 'onCall with cors option was not registered for parseIngredientAmountG');
  assert.ok(
      Array.isArray(capturedOpts.cors) && capturedOpts.cors.length > 0,
      'cors option should be a non-empty array of allowed origins',
  );
  assert.ok(
      capturedOpts.cors.some((o) => o === 'https://broubook.web.app'),
      'cors should contain https://broubook.web.app as an exact entry',
  );
  assert.ok(
      capturedOpts.cors.some((o) => o === 'http://localhost:3000' || o === 'http://127.0.0.1:3000'),
      'cors should contain http://localhost:3000 or http://127.0.0.1:3000 for local development',
  );
  assert.equal(capturedOpts.invoker, 'public', 'invoker should be public');
});
