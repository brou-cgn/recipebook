/* eslint-disable require-jsdoc */

const test = require('node:test');
const assert = require('node:assert/strict');

let manualHandler;
let lowCarbHandler;
let mockDbState;
let sentMails;

function createDocSnapshot(id, data, onSet) {
  return {
    id,
    exists: true,
    data: () => data,
    ref: {
      set: async (payload, options) => onSet(payload, options),
      update: async (payload) => onSet(payload, { merge: true }),
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
                    if (Object.prototype.hasOwnProperty.call(payload, 'kulinarik')) {
                      recipe.kulinarik = payload.kulinarik;
                    }
                    if (payload.naehrwerte) {
                      recipe.naehrwerte = payload.naehrwerte;
                      if (recipe.failCalculationWrite) {
                        throw new Error('Simulierter Schreibfehler');
                      }
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
  lowCarbHandler = require('./index').runLowCarbFullTagging;
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
        naehrwerte: { calcCompletedAt: 1700000000000 },
      },
    },
    adminUsers: [{ email: 'admin@example.com', isAdmin: true }],
    userById: {
      'admin-1': { role: 'admin', isAdmin: true },
      'moderator-1': { role: 'moderator', isAdmin: false },
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

test('manual recalc job keeps recalc flag when recalculation fails', async () => {
  mockDbState.recipes.r1.failCalculationWrite = true;

  const result = await manualHandler({
    auth: { uid: 'admin-1' },
    data: {},
  });

  assert.deepEqual(result, {
    started: true,
    message: 'Recalc-Job gestartet. Ergebnis wird per E-Mail gesendet.',
  });

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(mockDbState.nutritionReferences.tomate.recalc, true);
  assert.equal(mockDbState.recipes.r1.naehrwerte.calcError, 'Simulierter Schreibfehler');
  assert.equal(sentMails.length, 1);
});

test('manual recalc job allows moderator privileges', async () => {
  const result = await manualHandler({
    auth: { uid: 'moderator-1' },
    data: {},
  });

  assert.deepEqual(result, {
    started: true,
    message: 'Recalc-Job gestartet. Ergebnis wird per E-Mail gesendet.',
  });
});

test('manual recalc job rejects users without required role', async () => {
  await assert.rejects(
    manualHandler({
      auth: { uid: 'user-1' },
      data: {},
    }),
    (error) => error && error.code === 'permission-denied'
  );
});

test('manual recalc job skips recipe whose calcCompletedAt is after recalcDate', async () => {
  const recalcDate = 1700000000000;
  const calcCompletedAt = 1800000000000; // after recalcDate → already recalculated
  mockDbState.nutritionReferences.tomate.recalcDate = recalcDate;
  mockDbState.recipes.r1.naehrwerte = { calcCompletedAt };

  await manualHandler({ auth: { uid: 'admin-1' }, data: {} });
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Recipe was not affected because calcCompletedAt > recalcDate
  assert.equal(mockDbState.recipes.r1.naehrwerte.calcFoundCount, undefined);
  assert.equal(sentMails.length, 1);
});

test('manual recalc job recalculates recipe whose calcCompletedAt is before recalcDate', async () => {
  const recalcDate = 1800000000000;
  const calcCompletedAt = 1700000000000; // before recalcDate → needs recalculation
  mockDbState.nutritionReferences.tomate.recalcDate = recalcDate;
  mockDbState.recipes.r1.naehrwerte = { calcCompletedAt };

  await manualHandler({ auth: { uid: 'admin-1' }, data: {} });
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(mockDbState.recipes.r1.naehrwerte.calcFoundCount, 1);
  assert.equal(sentMails.length, 1);
});

test('manual recalc job skips recipe with no calcCompletedAt', async () => {
  mockDbState.nutritionReferences.tomate.recalcDate = 1700000000000;
  mockDbState.recipes.r1.naehrwerte = {}; // no calcCompletedAt

  await manualHandler({ auth: { uid: 'admin-1' }, data: {} });
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(mockDbState.recipes.r1.naehrwerte.calcFoundCount, undefined);
  assert.equal(sentMails.length, 1);
});

test('manual recalc job preserves yield fields and stores per-100g values', async () => {
  mockDbState.recipes.r1.naehrwerte = {
    calcCompletedAt: 1700000000000,
    calcYieldGrams: 80,
  };

  await manualHandler({ auth: { uid: 'admin-1' }, data: {} });
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(mockDbState.recipes.r1.naehrwerte.calcYieldGrams, 80);
  assert.equal(mockDbState.recipes.r1.naehrwerte.calcFinalWeightGrams, 80);
  assert.deepEqual(mockDbState.recipes.r1.naehrwerte.calcPer100g, {
    kalorien: 23,
    protein: 0,
    fett: 0,
    kohlenhydrate: 0,
    zucker: 0,
    ballaststoffe: 0,
    salz: 0,
  });
});

test('manual recalc job tags a qualifying recipe as low carb', async () => {
  mockDbState.recipes.r1.kulinarik = ['Italienische Küche'];

  await manualHandler({ auth: { uid: 'admin-1' }, data: {} });
  await new Promise((resolve) => setTimeout(resolve, 50));

  // The tag is appended; the cuisine type that was already there survives.
  assert.deepEqual(mockDbState.recipes.r1.kulinarik, ['Italienische Küche', 'Low Carb']);
});

test('manual recalc job drops the tag once a recipe stops qualifying', async () => {
  mockDbState.nutritionReferences.tomate.kalorien = 100;
  mockDbState.nutritionReferences.tomate.kohlenhydrate = 50;
  mockDbState.recipes.r1.kulinarik = ['Italienische Küche', 'Low Carb'];

  await manualHandler({ auth: { uid: 'admin-1' }, data: {} });
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.deepEqual(mockDbState.recipes.r1.kulinarik, ['Italienische Küche']);
});

test('manual recalc job leaves kulinarik alone when the verdict has not changed', async () => {
  mockDbState.recipes.r1.kulinarik = ['Italienische Küche', 'Low Carb'];

  await manualHandler({ auth: { uid: 'admin-1' }, data: {} });
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Still qualifying and already tagged - no duplicate, no rewrite.
  assert.deepEqual(mockDbState.recipes.r1.kulinarik, ['Italienische Küche', 'Low Carb']);
});

test('manual recalc job leaves an unreadable recipe alone instead of untagging it', async () => {
  // Zero calories means the verdict cannot be reached at all. Such a recipe is
  // skipped - which has to be visibly different from "does not qualify", so the
  // tag it already carries must survive.
  mockDbState.nutritionReferences.tomate.kalorien = 0;
  mockDbState.recipes.r1.kulinarik = ['Italienische Küche', 'Low Carb'];

  await manualHandler({ auth: { uid: 'admin-1' }, data: {} });
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.deepEqual(mockDbState.recipes.r1.kulinarik, ['Italienische Küche', 'Low Carb']);
  // And the run really did reach this recipe, rather than filtering it out earlier.
  assert.equal(mockDbState.recipes.r1.naehrwerte.calcFoundCount, 1);
});

test('summary mail reports the low carb changes, not just the recalc', async () => {
  mockDbState.recipes.r1.kulinarik = ['Italienische Küche'];

  await manualHandler({ auth: { uid: 'admin-1' }, data: {} });
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(sentMails.length, 1);
  const { text, html } = sentMails[0];

  // The counters an admin skims first.
  assert.match(text, /Low Carb ergänzt: 1/);
  assert.match(text, /Low Carb entfernt: 0/);
  assert.match(html, /<strong>Low Carb ergänzt:<\/strong> 1/);

  // And the recipe itself is named with what happened to it.
  assert.match(text, /- Tomatensuppe \(r1\) – Low Carb ergänzt/);
  assert.match(html, /Tomatensuppe \(r1\).*Low Carb ergänzt/);
});

test('summary mail names a recipe that lost the tag', async () => {
  mockDbState.nutritionReferences.tomate.kalorien = 100;
  mockDbState.nutritionReferences.tomate.kohlenhydrate = 50;
  mockDbState.recipes.r1.kulinarik = ['Italienische Küche', 'Low Carb'];

  await manualHandler({ auth: { uid: 'admin-1' }, data: {} });
  await new Promise((resolve) => setTimeout(resolve, 50));

  const { text } = sentMails[0];
  assert.match(text, /Low Carb ergänzt: 0/);
  assert.match(text, /Low Carb entfernt: 1/);
  assert.match(text, /- Tomatensuppe \(r1\) – Low Carb entfernt/);
});

test('summary mail stays quiet about recipes whose tag did not move', async () => {
  mockDbState.recipes.r1.kulinarik = ['Italienische Küche', 'Low Carb'];

  await manualHandler({ auth: { uid: 'admin-1' }, data: {} });
  await new Promise((resolve) => setTimeout(resolve, 50));

  const { text } = sentMails[0];
  assert.match(text, /Low Carb ergänzt: 0/);
  assert.match(text, /Low Carb entfernt: 0/);
  // The recipe is still listed as recalculated, just without a tag note.
  assert.match(text, /- Tomatensuppe \(r1\)\n/);
});

test('low-carb full tagging adds, removes and skips, and reports the counters', async () => {
  mockDbState.recipes.lowcarb = {
    title: 'Brokkoli mit Butter',
    portionen: 2,
    kulinarik: ['Deutsch'],
    naehrwerte: { kalorien: 400, kohlenhydrate: 10, ballaststoffe: 4 },
  };
  mockDbState.recipes.highcarb = {
    title: 'Nudelauflauf',
    portionen: 2,
    kulinarik: ['Italienisch', 'Low Carb'],
    naehrwerte: { kalorien: 500, kohlenhydrate: 80 },
  };

  const result = await lowCarbHandler({ auth: { uid: 'admin-1' }, data: {} });

  assert.equal(result.completed, true);
  assert.equal(result.total, 3);
  assert.equal(result.added, 1);
  assert.equal(result.removed, 1);
  // r1 carries no kcal/carbs at all, so it is skipped rather than guessed at.
  assert.equal(result.skipped, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.written, 2);

  assert.deepEqual(mockDbState.recipes.lowcarb.kulinarik, ['Deutsch', 'Low Carb']);
  assert.deepEqual(mockDbState.recipes.highcarb.kulinarik, ['Italienisch']);
});

test('low-carb full tagging leaves a recipe whose tag is already correct untouched', async () => {
  mockDbState.recipes.lowcarb = {
    title: 'Brokkoli mit Butter',
    portionen: 2,
    kulinarik: ['Deutsch', 'Low Carb'],
    naehrwerte: { kalorien: 400, kohlenhydrate: 10 },
  };

  const result = await lowCarbHandler({ auth: { uid: 'admin-1' }, data: {} });

  assert.equal(result.added, 0);
  assert.equal(result.removed, 0);
  assert.equal(result.unchanged, 1);
  assert.equal(result.written, 0);
  assert.deepEqual(mockDbState.recipes.lowcarb.kulinarik, ['Deutsch', 'Low Carb']);
});

test('low-carb full tagging never skips a recipe that is merely untagged', async () => {
  mockDbState.recipes.lowcarb = {
    title: 'Salat',
    portionen: 1,
    naehrwerte: { kalorien: 200, kohlenhydrate: 5 },
  };

  const result = await lowCarbHandler({ auth: { uid: 'admin-1' }, data: {} });

  assert.equal(result.added, 1);
  assert.deepEqual(mockDbState.recipes.lowcarb.kulinarik, ['Low Carb']);
});

test('low-carb full tagging rejects unauthenticated callers', async () => {
  await assert.rejects(
      lowCarbHandler({ data: {} }),
      (err) => err.code === 'unauthenticated'
  );
});

test('low-carb full tagging rejects callers without admin or moderator role', async () => {
  await assert.rejects(
      lowCarbHandler({ auth: { uid: 'user-1' }, data: {} }),
      (err) => err.code === 'permission-denied'
  );
});

test('low-carb full tagging may be started by a moderator', async () => {
  const result = await lowCarbHandler({ auth: { uid: 'moderator-1' }, data: {} });
  assert.equal(result.completed, true);
});

test('low-carb full tagging mails the recipe list, not just the counters', async () => {
  mockDbState.recipes.lowcarb = {
    title: 'Brokkoli mit Butter',
    portionen: 2,
    kulinarik: ['Deutsch'],
    naehrwerte: { kalorien: 400, kohlenhydrate: 10 },
  };
  mockDbState.recipes.highcarb = {
    title: 'Nudelauflauf',
    portionen: 2,
    kulinarik: ['Italienisch', 'Low Carb'],
    naehrwerte: { kalorien: 500, kohlenhydrate: 80 },
  };

  const result = await lowCarbHandler({ auth: { uid: 'admin-1' }, data: {} });

  assert.equal(result.mailed, true);
  assert.match(result.message, /per E-Mail verschickt/);
  assert.equal(sentMails.length, 1);

  const { subject, text, html } = sentMails[0];
  assert.match(subject, /Low-Carb-Klassifikation/);

  // Each recipe is named, in the section that matches what happened to it.
  assert.match(text, /Neu als Low Carb getaggt \(1\):/);
  assert.match(text, /- Brokkoli mit Butter \(lowcarb\):/);
  assert.match(text, /Tag entfernt \(1\):/);
  assert.match(text, /- Nudelauflauf \(highcarb\):/);
  assert.match(text, /Übersprungen \(1\):/);
  assert.match(text, /- Tomatensuppe \(r1\): unvollständige Nährwerte/);

  // And the numbers the verdict rested on travel with it.
  assert.match(text, /10\.0 % Energie aus KH, 5\.0 g KH\/Portion \(2 Portion\(en\), Basis: total\)/);
  assert.match(html, /Brokkoli mit Butter/);
});

test('low-carb full tagging reports which basis the verdicts rested on', async () => {
  // Unambiguous: per-100-g values plus a final weight.
  mockDbState.recipes.per100 = {
    title: 'Mit 100-g-Werten',
    portionen: 4,
    kulinarik: [],
    naehrwerte: {
      kalorien: 99999,
      kohlenhydrate: 99999,
      calcFinalWeightGrams: 800,
      calcPer100g: { kalorien: 200, kohlenhydrate: 5 },
    },
  };
  // Ambiguous: stored totals only.
  mockDbState.recipes.totalsOnly = {
    title: 'Nur Gesamtwerte',
    portionen: 2,
    kulinarik: [],
    naehrwerte: { kalorien: 400, kohlenhydrate: 10 },
  };

  const result = await lowCarbHandler({ auth: { uid: 'admin-1' }, data: {} });

  // r1 is skipped and therefore counts towards neither basis.
  assert.deepEqual(result.basisCounts, { per100g: 1, total: 1 });

  const { text } = sentMails[0];
  assert.match(text, /Rechengrundlage: 1 x 100-g-Werte, 1 x Gesamtwerte/);
  assert.match(text, /1 von 2 bewerteten Rezepten wurden auf Basis der gespeicherten Gesamtwerte/);
});

test('low-carb full tagging keeps the per-recipe lists out of the response', async () => {
  mockDbState.recipes.lowcarb = {
    title: 'Brokkoli mit Butter',
    portionen: 2,
    kulinarik: [],
    naehrwerte: { kalorien: 400, kohlenhydrate: 10 },
  };

  const result = await lowCarbHandler({ auth: { uid: 'admin-1' }, data: {} });

  assert.equal(result.added, 1);
  assert.equal(result.addedRecipes, undefined);
  assert.equal(result.skippedRecipes, undefined);
  assert.equal(result.removedRecipes, undefined);
  assert.equal(result.failedRecipes, undefined);
});

test('low-carb full tagging still tags when the mail cannot be sent', async () => {
  mockDbState.adminUsers = [];
  mockDbState.recipes.lowcarb = {
    title: 'Brokkoli mit Butter',
    portionen: 2,
    kulinarik: ['Deutsch'],
    naehrwerte: { kalorien: 400, kohlenhydrate: 10 },
  };

  const result = await lowCarbHandler({ auth: { uid: 'admin-1' }, data: {} });

  // The tagging is the point of the call; the mail is a report about it.
  assert.equal(result.completed, true);
  assert.equal(result.written, 1);
  assert.equal(result.mailed, false);
  assert.doesNotMatch(result.message, /per E-Mail/);
  assert.deepEqual(mockDbState.recipes.lowcarb.kulinarik, ['Deutsch', 'Low Carb']);
  assert.equal(sentMails.length, 0);
});
