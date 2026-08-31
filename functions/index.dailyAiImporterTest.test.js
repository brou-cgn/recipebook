/* eslint-disable require-jsdoc */
/**
 * Tests for the nightly AI-importer self-test (dailyAiImporterTest).
 *
 * The previous version of this test only ever called internal helper
 * functions (callGeminiTextAPI) directly, so it could never detect an
 * auth/IAM misconfiguration on the real public callables (see issue #2611),
 * and its three checks were unconnected — the "fetch" check didn't even
 * touch the recipe-import fetch logic. These tests cover the reworked
 * version: fetchRecipeHtml and processHtmlWithAI are now called as one
 * connected chain through the real (mocked here) public callables, and a
 * new scanRecipeWithAI check exercises the image/OCR path that was
 * previously never covered by this nightly run at all.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

let dailyAiImporterTest;
let settingsData;
let usersData;
let sentMails;
let geminiSecretValue;
let webApiKeySecretValue;
let callableResponses; // { [functionName]: () => ({status, body}) }

function callableResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

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
      return {onSchedule: (_opts, handler) => handler};
    }

    if (request === 'firebase-functions/params') {
      return {
        defineSecret: (name) => ({
          value: () => (name === 'WEB_API_KEY' ? webApiKeySecretValue : geminiSecretValue),
        }),
      };
    }

    if (request === '@google/generative-ai') {
      return {GoogleGenerativeAI: class {}};
    }

    if (request === './nutritionNormalization') {
      return {
        createNutritionNormalizationUtils: () => ({
          parseIngredientForNutrition: () => null,
        }),
      };
    }

    if (request === 'nodemailer') {
      return {
        createTransport: () => ({
          sendMail: async (mail) => {
            sentMails.push(mail);
          },
        }),
      };
    }

    if (request === 'sharp') {
      const chain = {
        jpeg: () => chain,
        toBuffer: async () => Buffer.from('fake-jpeg-bytes'),
      };
      return () => chain;
    }

    if (request === 'firebase-admin') {
      const firestoreFactory = () => ({
        collection: (name) => {
          if (name === 'settings') {
            return {
              doc: (docId) => ({
                get: async () =>
                  settingsData[docId] ?
                    {exists: true, data: () => settingsData[docId]} :
                    {exists: false, data: () => ({})},
              }),
            };
          }
          if (name === 'users') {
            return {
              where: () => ({
                get: async () => ({
                  forEach: (cb) => usersData.forEach((u) => cb({data: () => u})),
                }),
              }),
            };
          }
          return {
            doc: () => ({get: async () => ({exists: false, data: () => ({})})}),
          };
        },
        doc: () => ({get: async () => ({exists: false, data: () => ({})})}),
      });

      return {
        initializeApp: () => {},
        firestore: firestoreFactory,
        auth: () => ({
          createCustomToken: async (uid) => `custom-token-for-${uid}`,
        }),
      };
    }

    return originalLoad.call(this, request, parent, isMain, ...args);
  };

  dailyAiImporterTest = require('./index').dailyAiImporterTest;
  Module._load = originalLoad;
}

test.beforeEach(() => {
  geminiSecretValue = 'test-gemini-api-key';
  webApiKeySecretValue = 'test-web-api-key';
  settingsData = {app: {aiRecipePrompt: 'Extrahiere das Rezept als JSON.'}};
  usersData = [{isAdmin: true, email: 'admin@example.com'}];
  sentMails = [];
  callableResponses = {
    fetchRecipeHtml: () => callableResponse(200, {result: {html:
      '<!DOCTYPE html><html lang="de"><head><title>Testrezept: Rührei</title></head><body>' +
      '<h1>Rührei</h1><h2>Zutaten</h2><ul><li>4 Eier</li><li>2 Esslöffel Butter</li></ul>' +
      '<h2>Zubereitung</h2><ol><li>Eier verquirlen.</li><li>Butter schmelzen.</li></ol></body></html>',
    }}),
    processHtmlWithAI: () => callableResponse(200, {
      result: {title: 'Rührei', ingredients: ['4 Eier', '2 EL Butter'], steps: ['Verquirlen', 'Braten']},
    }),
    scanRecipeWithAI: () => callableResponse(200, {
      result: {title: 'Rührei', ingredients: ['4 Eier', '2 EL Butter'], steps: ['Verquirlen', 'Braten']},
    }),
  };

  global.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('identitytoolkit.googleapis.com')) {
      return callableResponse(200, {idToken: 'test-id-token'});
    }
    for (const [name, responder] of Object.entries(callableResponses)) {
      if (urlStr.endsWith(`/${name}`)) return responder();
    }
    return callableResponse(200, {result: {}});
  };

  loadFunction();
});

test('skips entirely when dailyImporterTestEnabled is false', async () => {
  settingsData.app.dailyImporterTestEnabled = false;
  await dailyAiImporterTest({});
  assert.equal(sentMails.length, 0);
});

test('happy path: sends a summary email reporting all 4 tests passed', async () => {
  await dailyAiImporterTest({});
  assert.equal(sentMails.length, 1);
  const mail = sentMails[0];
  assert.match(mail.subject, /Alle 4 Tests erfolgreich/);
  assert.match(mail.text, /fetchRecipeHtml \(öffentliche Schnittstelle\)/);
  assert.match(mail.text, /processHtmlWithAI \(öffentliche Schnittstelle\)/);
  assert.match(mail.text, /scanRecipeWithAI \(öffentliche Schnittstelle\)/);
});

test('fetch+extraction is a connected chain: a failed fetch also fails the extraction test with a clear reason', async () => {
  callableResponses.fetchRecipeHtml = () => callableResponse(401, {error: {message: 'permission denied'}});
  await dailyAiImporterTest({});
  const mail = sentMails[0];
  assert.match(mail.text, /❌ fetchRecipeHtml/);
  assert.match(mail.text, /❌ processHtmlWithAI/);
  assert.match(mail.text, /Übersprungen: fetchRecipeHtml lieferte kein HTML/);
});

test('missing WEB_API_KEY fails only the three callable-based tests, not the config test', async () => {
  webApiKeySecretValue = undefined;
  await dailyAiImporterTest({});
  const mail = sentMails[0];
  assert.match(mail.text, /✅ Konfiguration/);
  assert.match(mail.text, /❌ fetchRecipeHtml.*\n.*Kein Test-ID-Token/);
  assert.match(mail.subject, /3 von 4 Tests fehlgeschlagen/);
});

test('a recipe missing a title fails validation with a specific message', async () => {
  callableResponses.processHtmlWithAI = () => callableResponse(200, {
    result: {title: '', ingredients: ['4 Eier', '2 EL Butter'], steps: ['Verquirlen', 'Braten']},
  });
  await dailyAiImporterTest({});
  const mail = sentMails[0];
  assert.match(mail.text, /Kein Titel im Ergebnis enthalten/);
});

test('an empty ingredient string fails validation with a specific message', async () => {
  callableResponses.scanRecipeWithAI = () => callableResponse(200, {
    result: {title: 'Rührei', ingredients: ['4 Eier', ''], steps: ['Verquirlen', 'Braten']},
  });
  await dailyAiImporterTest({});
  const mail = sentMails[0];
  assert.match(mail.text, /Mindestens eine Zutat ist leer/);
});

test('a callable HTTP error surfaces the upstream error message', async () => {
  callableResponses.scanRecipeWithAI = () => callableResponse(500, {error: {message: 'Gemini API error: overloaded'}});
  await dailyAiImporterTest({});
  const mail = sentMails[0];
  assert.match(mail.text, /scanRecipeWithAI: Gemini API error: overloaded/);
});
