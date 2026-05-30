/* eslint-disable require-jsdoc */

const test = require('node:test');
const assert = require('node:assert/strict');

const {createNutritionNormalizationUtils} = require('./nutritionNormalization');

function createFakeGoogleGenerativeAI(handler) {
  return class FakeGoogleGenerativeAI {
    constructor(apiKey) {
      this.apiKey = apiKey;
    }

    getGenerativeModel() {
      return {
        generateContent: async (prompt) => {
          const response = await handler({prompt, apiKey: this.apiKey});
          return {
            response: {
              text: async () => response,
            },
          };
        },
      };
    }
  };
}

async function normalizeWithFallback(utils, ingredientStr) {
  try {
    const parsed = await utils.normalizeIngredientWithGemini(ingredientStr);
    if (parsed) {
      return parsed;
    }
  } catch (error) {
    return utils.parseIngredientForNutrition(ingredientStr);
  }

  return utils.parseIngredientForNutrition(ingredientStr);
}

test('normalizeIngredientWithGemini returns structured canonical data on success', async () => {
  const FakeGoogleGenerativeAI = createFakeGoogleGenerativeAI(async () => JSON.stringify({
    amount: 2,
    unit: 'EL',
    amountInGrams: 30,
    canonicalNameDE: 'Olivenöl',
    canonicalNameEN: 'olive oil',
  }));

  const utils = createNutritionNormalizationUtils({
    GoogleGenerativeAI: FakeGoogleGenerativeAI,
    env: {GEMINI_API_KEY: 'test-key'},
  });

  const result = await utils.normalizeIngredientWithGemini('2 EL Olivenöl, kaltgepresst');

  assert.deepEqual(result, {
    amountG: 30,
    name: 'Olivenöl',
    searchName: 'olive oil',
  });
});

test('normalizeIngredientWithGemini falls back to regex parsing when Gemini throws', async () => {
  const FakeGoogleGenerativeAI = createFakeGoogleGenerativeAI(async () => {
    throw new Error('rate limit');
  });

  const utils = createNutritionNormalizationUtils({
    GoogleGenerativeAI: FakeGoogleGenerativeAI,
    env: {GEMINI_API_KEY: 'test-key'},
  });

  const result = await normalizeWithFallback(utils, '2 EL Olivenöl, kaltgepresst');

  assert.deepEqual(result, {
    amountG: 30,
    name: 'Olivenöl, kaltgepresst',
  });
});

test('normalizeIngredientWithGemini falls back to regex parsing on invalid JSON', async () => {
  const FakeGoogleGenerativeAI = createFakeGoogleGenerativeAI(async () => 'not valid json');

  const utils = createNutritionNormalizationUtils({
    GoogleGenerativeAI: FakeGoogleGenerativeAI,
    env: {GEMINI_API_KEY: 'test-key'},
  });

  const result = await normalizeWithFallback(utils, '500 g Mehl');

  assert.deepEqual(result, {
    amountG: 500,
    name: 'Mehl',
  });
});

test('parseIngredientForNutrition removes unknown unit token from ingredient name', () => {
  const utils = createNutritionNormalizationUtils();

  const result = utils.parseIngredientForNutrition('1 Schuss Apfelessig');

  assert.deepEqual(result, {
    amountG: 100,
    name: 'Apfelessig',
  });
});

test('normalizeIngredientWithGemini returns null without an API key', async () => {
  const FakeGoogleGenerativeAI = createFakeGoogleGenerativeAI(async () => JSON.stringify({
    amount: 1,
    unit: 'Prise',
    amountInGrams: 1,
    canonicalNameDE: 'Salz',
    canonicalNameEN: 'salt',
  }));

  const utils = createNutritionNormalizationUtils({
    GoogleGenerativeAI: FakeGoogleGenerativeAI,
    env: {},
  });

  const result = await utils.normalizeIngredientWithGemini('1 Prise Salz');

  assert.equal(result, null);
});

test('normalizeIngredientWithGemini handles typical German ingredient strings', async () => {
  const responses = new Map([
    ['500 g Mehl', {
      amount: 500,
      unit: 'g',
      amountInGrams: 500,
      canonicalNameDE: 'Mehl',
      canonicalNameEN: 'wheat flour',
    }],
    ['2 EL Olivenöl', {
      amount: 2,
      unit: 'EL',
      amountInGrams: 30,
      canonicalNameDE: 'Olivenöl',
      canonicalNameEN: 'olive oil',
    }],
    ['4 Eier', {
      amount: 4,
      unit: null,
      amountInGrams: 240,
      canonicalNameDE: 'Ei',
      canonicalNameEN: 'egg',
    }],
    ['1 Prise Salz', {
      amount: 1,
      unit: 'Prise',
      amountInGrams: 1,
      canonicalNameDE: 'Salz',
      canonicalNameEN: 'salt',
    }],
    ['1 Bund Petersilie', {
      amount: 1,
      unit: 'Bund',
      amountInGrams: 30,
      canonicalNameDE: 'Petersilie',
      canonicalNameEN: 'parsley',
    }],
    ['200 ml Sahne', {
      amount: 200,
      unit: 'ml',
      amountInGrams: 200,
      canonicalNameDE: 'Sahne',
      canonicalNameEN: 'heavy cream',
    }],
  ]);

  const FakeGoogleGenerativeAI = createFakeGoogleGenerativeAI(async ({prompt}) => {
    const ingredient = [...responses.keys()]
        .find((entry) => prompt.includes(JSON.stringify(entry)));
    if (!ingredient) {
      throw new Error('Unexpected prompt');
    }
    return JSON.stringify(responses.get(ingredient));
  });

  const utils = createNutritionNormalizationUtils({
    GoogleGenerativeAI: FakeGoogleGenerativeAI,
    env: {GEMINI_API_KEY: 'test-key'},
  });

  for (const [ingredient, expected] of responses.entries()) {
    const result = await utils.normalizeIngredientWithGemini(ingredient);
    assert.deepEqual(result, {
      amountG: expected.amountInGrams,
      name: expected.canonicalNameDE,
      searchName: expected.canonicalNameEN,
    });
  }
});

test('estimateNutritionWithGemini returns full nutrition object on valid Gemini JSON', async () => {
  const FakeGoogleGenerativeAI = createFakeGoogleGenerativeAI(async () => JSON.stringify({
    kalorien: 884,
    protein: 0,
    fett: 100,
    kohlenhydrate: 0,
    zucker: 0,
    ballaststoffe: 0,
    salz: 0,
  }));

  const utils = createNutritionNormalizationUtils({
    GoogleGenerativeAI: FakeGoogleGenerativeAI,
    env: {GEMINI_API_KEY: 'test-key'},
  });

  const result = await utils.estimateNutritionWithGemini('2 EL Olivenöl', {
    amountG: 30,
    name: 'Olivenöl',
    searchName: 'olive oil',
  });

  assert.deepEqual(result, {
    per100g: {
      kalorien: 884,
      protein: 0,
      fett: 100,
      kohlenhydrate: 0,
      zucker: 0,
      ballaststoffe: 0,
      salz: 0,
    },
    amountG: 30,
    name: 'Olivenöl',
  });
});

test('estimateNutritionWithGemini returns null on invalid Gemini JSON', async () => {
  const FakeGoogleGenerativeAI = createFakeGoogleGenerativeAI(async () => 'not valid json');

  const utils = createNutritionNormalizationUtils({
    GoogleGenerativeAI: FakeGoogleGenerativeAI,
    env: {GEMINI_API_KEY: 'test-key'},
  });

  const result = await utils.estimateNutritionWithGemini('500 g Mehl', {
    amountG: 500,
    name: 'Mehl',
    searchName: 'wheat flour',
  });

  assert.equal(result, null);
});

test('estimateNutritionWithGemini returns null without an API key', async () => {
  const FakeGoogleGenerativeAI = createFakeGoogleGenerativeAI(async () => JSON.stringify({
    kalorien: 364,
    protein: 10,
    fett: 1,
    kohlenhydrate: 76,
    zucker: 1,
    ballaststoffe: 3,
    salz: 0,
  }));

  const utils = createNutritionNormalizationUtils({
    GoogleGenerativeAI: FakeGoogleGenerativeAI,
    env: {},
  });

  const result = await utils.estimateNutritionWithGemini('500 g Mehl', {
    amountG: 500,
    name: 'Mehl',
    searchName: 'wheat flour',
  });

  assert.equal(result, null);
});

test('estimateNutritionWithGemini returns null when Gemini returns null', async () => {
  const FakeGoogleGenerativeAI = createFakeGoogleGenerativeAI(async () => 'null');

  const utils = createNutritionNormalizationUtils({
    GoogleGenerativeAI: FakeGoogleGenerativeAI,
    env: {GEMINI_API_KEY: 'test-key'},
  });

  const result = await utils.estimateNutritionWithGemini('Unbekannte Zutat', {
    amountG: 100,
    name: 'Unbekannte Zutat',
    searchName: 'unknown ingredient',
  });

  assert.equal(result, null);
});

test('estimateNutritionWithGemini maps null nutrient fields to zero', async () => {
  const FakeGoogleGenerativeAI = createFakeGoogleGenerativeAI(async () => JSON.stringify({
    kalorien: 21,
    protein: null,
    fett: 0,
    kohlenhydrate: 0.9,
    zucker: null,
    ballaststoffe: null,
    salz: 0,
  }));

  const utils = createNutritionNormalizationUtils({
    GoogleGenerativeAI: FakeGoogleGenerativeAI,
    env: {GEMINI_API_KEY: 'test-key'},
  });

  const result = await utils.estimateNutritionWithGemini('1 Schuss Apfelessig', {
    amountG: 100,
    name: 'Apfelessig',
    searchName: 'apple cider vinegar',
  });

  assert.deepEqual(result, {
    per100g: {
      kalorien: 21,
      protein: 0,
      fett: 0,
      kohlenhydrate: 0.9,
      zucker: 0,
      ballaststoffe: 0,
      salz: 0,
    },
    amountG: 100,
    name: 'Apfelessig',
  });
});

test('estimateNutritionWithGemini retries once after timeout and reuses the same model', async () => {
  let createModelCalls = 0;
  let generateContentCalls = 0;
  const utils = createNutritionNormalizationUtils({
    GoogleGenerativeAI: class {},
    env: {GEMINI_API_KEY: 'test-key'},
  });

  const result = await utils.estimateNutritionWithGemini('1 TL Zwiebelpulver', {
    amountG: 5,
    name: 'Zwiebelpulver',
    searchName: 'onion powder',
  }, {
    createModel: () => {
      createModelCalls++;
      return {
        generateContent: async () => {
          generateContentCalls++;
          if (generateContentCalls === 1) {
            throw new Error('Gemini normalization timeout');
          }
          return {
            response: {
              text: async () => JSON.stringify({
                kalorien: 341,
                protein: 10,
                fett: 1,
                kohlenhydrate: 79,
                zucker: 38,
                ballaststoffe: 15,
                salz: 0.2,
              }),
            },
          };
        },
      };
    },
    retryDelayMs: 0,
  });

  assert.equal(createModelCalls, 1);
  assert.equal(generateContentCalls, 2);
  assert.deepEqual(result, {
    per100g: {
      kalorien: 341,
      protein: 10,
      fett: 1,
      kohlenhydrate: 79,
      zucker: 38,
      ballaststoffe: 15,
      salz: 0.2,
    },
    amountG: 5,
    name: 'Zwiebelpulver',
  });
});
