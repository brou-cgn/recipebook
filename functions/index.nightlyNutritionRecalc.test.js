/* eslint-disable require-jsdoc */

const test = require('node:test');
const assert = require('node:assert/strict');

let manualHandler;
let mockDbState;
let sentMails;

function createDocSnapshot(id, data, onSet) {
  return {
    id,
    exists: true,
    data: () => data,
    ref: {
      set: async (payload, options) => onSet(payload, options),
    },
  };
}

function loadHandlers() {
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

    if (request === '@google/generative-ai') {
      return { GoogleGenerativeAI: class {} };
    }

    if (request === './nutritionNormalization') {
      return {
        createNutritionNormalizationUtils: () => ({
          parseIngredientForNutrition: (text) => ({
            amountG: 100,
            name: String(text || '').replace(/^\d+\s*g\s*/i, '').trim().toLowerCase(),
            searchName: 'tomato',
          }),
          normalizeIngredientWithGemini: async () => null,
          estimateNutritionWithGemini: async () => null,
          generateSearchTermWithGemini: async () => 'tomato',
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
        rotate: () => chain,
        resize: () => chain,
        png: () => chain,
        toBuffer: async () => Buffer.from(''),
      };
      return () => chain;
    }

    if (request === 'firebase-admin') {
      const firestoreFactory = () => ({
        collection: (name) => {
          if (name === 'nutritionReferences') {
            return {
              where: (field, op, value) => ({
                get: async () => ({
                  docs: Object.entries(mockDbState.nutritionReferences)
                    .filter(([, entry]) => field === 'recalc' && op === '==' && entry.recalc === value)
                    .map(([id, entry]) => ({
                      id,
                      data: () => entry,
                      ref: { update: async (payload) => Object.assign(entry, payload) },
                    })),
                }),
              }),
              doc: (id) => ({
                get: async () => {
                  const entry = mockDbState.nutritionReferences[id];
                  return {
                    exists: Boolean(entry),
                    data: () => entry || {},
                  };
                },
              }),
            };
          }
          if (name === 'recipes') {
            return {
              get: async () => ({
                docs: Object.entries(mockDbState.recipes).map(([id, recipe]) => createDocSnapshot(
                  id,
                  recipe,
                  async (payload) => {
                    if (payload.naehrwerte) {
                      recipe.naehrwerte = payload.naehrwerte;
                    }
                  }
                )),
              }),
            };
          }
          if (name === 'users') {
            return {
              where: () => ({
                get: async () => ({
                  forEach: (cb) => {
                    mockDbState.adminUsers.forEach((entry, index) => {
                      cb({ id: `admin-${index}`, data: () => entry });
                    });
                  },
                }),
              }),
            };
          }
          return { get: async () => ({ docs: [] }) };
        },
        doc: (path) => ({
          get: async () => {
            const uid = path.split('/')[1];
            const user = mockDbState.userById[uid];
            return {
              exists: Boolean(user),
              data: () => user || {},
            };
          },
        }),
        batch: () => {
          const updates = [];
          return {
            update: (ref, payload) => updates.push({ ref, payload }),
            commit: async () => {
              updates.forEach(({ ref, payload }) => ref.update(payload));
            },
          };
        },
      });
      firestoreFactory.FieldValue = {
        serverTimestamp: () => ({ seconds: 0, nanos: 0 }),
      };
      return {
        initializeApp: () => {},
        firestore: firestoreFactory,
      };
    }

    return originalLoad.call(this, request, parent, isMain, ...args);
  };

  manualHandler = require('./index').runNutritionRecalcForFlaggedRecipes;
  Module._load = originalLoad;
}

test.beforeEach(() => {
  sentMails = [];
  mockDbState = {
    nutritionReferences: {
      tomate: { ingredientID: 'tomate', recalc: true, source: 'openfoodfacts', kalorien: 18 },
    },
    recipes: {
      r1: {
        title: 'Tomatensuppe',
        portionen: 2,
        zutaten: [{ type: 'ingredient', text: '100 g tomate', ingredientID: 'tomate' }],
        naehrwerte: {},
      },
    },
    adminUsers: [{ email: 'admin@example.com', isAdmin: true }],
    userById: {
      'admin-1': { role: 'admin', isAdmin: true },
      'user-1': { role: 'user', isAdmin: false },
    },
  };

  loadHandlers();
});

test('manual recalc job updates impacted recipes, resets recalc flags and sends report mail', async () => {
  const result = await manualHandler({
    auth: { uid: 'admin-1' },
    data: {},
  });

  assert.deepEqual(result, {
    started: true,
    message: 'Recalc-Job gestartet. Ergebnis wird per E-Mail gesendet.',
  });

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(mockDbState.nutritionReferences.tomate.recalc, false);
  assert.equal(mockDbState.recipes.r1.naehrwerte.calcFoundCount, 1);
  assert.equal(sentMails.length, 1);
});

test('manual recalc job requires admin privileges', async () => {
  await assert.rejects(
    manualHandler({
      auth: { uid: 'user-1' },
      data: {},
    }),
    (error) => error && error.code === 'permission-denied'
  );
});
