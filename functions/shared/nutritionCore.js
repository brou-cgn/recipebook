/**
 * Von mehreren Function-Gruppen genutzte Helfer (nutritionCore; aus index.js, Tech-Check F2).
 */

const admin = require('firebase-admin');
const {createNutritionNormalizationUtils} = require('../nutritionNormalization');
const {geminiApiKey} = require('./secrets');

/**
 * Sleeps for a given duration.
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const OPEN_FOOD_FACTS_FETCH_TIMEOUT_MS = 10000;

const OPEN_FOOD_FACTS_RETRY_DELAYS_MS = [30_000, 270_000]; // 30 s, dann 4.5 min (= 5 min gesamt)

const OPEN_FOOD_FACTS_NETWORK_ERROR_CODES = ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN', 'ETIMEDOUT'];

const NUTRITION_REFERENCE_COLLECTION = 'nutritionReferences';

const NUTRITION_REFERENCE_FIELDS = ['kalorien', 'protein', 'fett', 'kohlenhydrate', 'zucker', 'ballaststoffe', 'salz'];

const NUTRITION_SOURCE_SUFFIX_OFF = '_openfoodfacts';

const NUTRITION_SOURCE_SUFFIX_AI = '_ai';

const NUTRITION_SOURCE_SUFFIX_MANUAL = '_manual';

/**
 * Create a deterministic document id for nutrition reference entries.
 * @param {string} name
 * @returns {string}
 */
function normalizeNutritionReferenceId(name) {
  return String(name || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
}

/**
 * Parse and sanitize per-100g nutrition fields from arbitrary data.
 * @param {object} data
 * @returns {object}
 */
function parseNutritionReferenceValues(data = {}) {
  return NUTRITION_REFERENCE_FIELDS.reduce((acc, key) => {
    const numeric = parseNutritionReferenceNumber(data[key]);
    if (numeric != null) {
      acc[key] = numeric;
    }
    return acc;
  }, {});
}

function parseNutritionReferenceNumber(raw) {
  if (raw === '' || raw == null) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function getNutritionSourceSuffix(source) {
  switch (String(source || '').trim().toLowerCase()) {
    case 'openfoodfacts':
      return NUTRITION_SOURCE_SUFFIX_OFF;
    case 'ai-generiert':
      return NUTRITION_SOURCE_SUFFIX_AI;
    case 'manual':
    case 'manuell':
      return NUTRITION_SOURCE_SUFFIX_MANUAL;
    default:
      return null;
  }
}

function getNutritionValuesForSource(data = {}, source = '') {
  const suffix = getNutritionSourceSuffix(source);
  const hasSourceSpecificValues = suffix && NUTRITION_REFERENCE_FIELDS.some((key) => {
    const numeric = parseNutritionReferenceNumber(data[`${key}${suffix}`]);
    return numeric != null;
  });

  return NUTRITION_REFERENCE_FIELDS.reduce((acc, key) => {
    if (hasSourceSpecificValues) {
      const numeric = parseNutritionReferenceNumber(data[`${key}${suffix}`]);
      if (numeric != null) {
        acc[key] = numeric;
      }
      return acc;
    }

    const numeric = parseNutritionReferenceNumber(data[key]);
    if (numeric != null) {
      acc[key] = numeric;
    }
    return acc;
  }, {});
}

/**
 * @param {Error} err
 * @returns {boolean}
 */
const isOpenFoodFactsNetworkError = (err) => err?.name === 'TypeError' ||
  OPEN_FOOD_FACTS_NETWORK_ERROR_CODES.includes(err?.code);

/**
 * Returns whether an ingredient line should be skipped server-side.
 * @param {string} ingredientStr
 * @returns {boolean}
 */
const isSkippableIngredientLine = (ingredientStr) => {
  if (typeof ingredientStr !== 'string') return true;
  const trimmed = ingredientStr.trim();
  if (trimmed === '') return true;
  return /^\s*#{1,3}(?!recipe:)\s*/i.test(trimmed);
};

/**
 * Detects whether an ingredient starts with a numeric quantity (including
 * decimal values like "1,5" and fractions like "1/2").
 *
 * @param {string} ingredientStr
 * @returns {boolean}
 */
const hasExplicitQuantityInIngredient = (ingredientStr) => (
  /^\s*(?:\d+(?:[.,]\d+)?\/\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\b/.test(String(ingredientStr || '').trim())
);

/**
 * Fetches a URL and retries on OpenFoodFacts timeouts/network errors and HTTP 503.
 * @param {string} url
 * @param {object} options
 * @param {number} maxAttempts - Total attempts (default 3 = 1 try + 2 retries)
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, OPEN_FOOD_FACTS_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const isServiceUnavailable = !response.ok && response.status === 503;
      if (!isServiceUnavailable) {
        return response;
      }

      lastErr = new Error('OpenFoodFacts nicht verfügbar (503)');
      if (attempt < maxAttempts) {
        await sleep(OPEN_FOOD_FACTS_RETRY_DELAYS_MS[attempt - 1]);
      }
    } catch (err) {
      clearTimeout(timeout);
      const isTimeout = timedOut || err.name === 'AbortError';
      const isNetworkError = isOpenFoodFactsNetworkError(err);
      if (!isTimeout && !isNetworkError) {
        throw err;
      }
      lastErr = isTimeout ? new Error('Timeout bei OpenFoodFacts') : err;
      if (attempt < maxAttempts) {
        await sleep(OPEN_FOOD_FACTS_RETRY_DELAYS_MS[attempt - 1]);
      }
    }
  }
  throw lastErr;
}

/**
 * Core implementation for automatic nutrition calculation.
 * @param {{ingredients: Array, portionen?: number, callerLabel?: string}} params
 * @returns {Promise<{naehrwerte: object, details: Array, foundCount: number, totalCount: number}>}
 */
function normalizePositiveNutritionNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function roundNutritionValue(key, value) {
  if (key === 'kalorien') {
    return Math.round(value);
  }
  if (key === 'salz') {
    return Math.round(value * 100) / 100;
  }
  return Math.round(value * 10) / 10;
}

function buildNutritionPer100g(totals = {}, finalWeightGrams) {
  const weight = normalizePositiveNutritionNumber(finalWeightGrams);
  if (weight == null) return null;

  const per100g = {};
  Object.entries(totals).forEach(([key, value]) => {
    if (value == null) return;
    per100g[key] = roundNutritionValue(key, (value / weight) * 100);
  });

  return Object.keys(per100g).length > 0 ? per100g : null;
}

function resolveNutritionFinalWeightGrams({sumIngredientAmounts, calcYieldGrams, calcYieldFactor} = {}) {
  const yieldGrams = normalizePositiveNutritionNumber(calcYieldGrams);
  if (yieldGrams != null) return yieldGrams;

  const ingredientAmountSum = normalizePositiveNutritionNumber(sumIngredientAmounts);
  const yieldFactor = normalizePositiveNutritionNumber(calcYieldFactor);
  if (ingredientAmountSum != null && yieldFactor != null) {
    return Math.round(ingredientAmountSum * yieldFactor * 10) / 10;
  }

  return ingredientAmountSum;
}

async function calculateNutritionFromOpenFoodFactsCore({
  ingredients,
  portionen = 1,
  callerLabel = 'system',
  calcYieldGrams = null,
  calcYieldFactor = null,
} = {}) {
  const {
    parseIngredientForNutrition,
    isSimpleIngredient = () => false,
    normalizeIngredientWithGemini,
    estimateNutritionWithGemini,
  } = createNutritionNormalizationUtils({
    GoogleGenAI: require('@google/genai').GoogleGenAI,
    env: {GEMINI_API_KEY: geminiApiKey.value()},
  });

  const totals = {
    kalorien: 0,
    protein: 0,
    fett: 0,
    kohlenhydrate: 0,
    zucker: 0,
    ballaststoffe: 0,
    salz: 0,
  };

  const DEFAULT_SALT_PER_PORTION_G = 2;
  const details = [];
  let sumIngredientAmounts = 0;
  let foundCount = 0;
  const BATCH_SIZE = 5;
  const ingredientEntries = ingredients.map((ingredient) => {
    if (ingredient && typeof ingredient === 'object' && ingredient.type === 'heading') {
      return null;
    }
    const ingredientStr = (ingredient && typeof ingredient === 'object') ? ingredient.text : ingredient;
    if (isSkippableIngredientLine(ingredientStr)) {
      return null;
    }
    return {ingredientStr};
  }).filter(Boolean);

  const processIngredient = async ({ingredientStr}) => {
    const ingredientTotals = {
      kalorien: 0,
      protein: 0,
      fett: 0,
      kohlenhydrate: 0,
      zucker: 0,
      ballaststoffe: 0,
      salz: 0,
    };

    if (/^salz$/i.test(ingredientStr.trim())) {
      const saltAmountG = DEFAULT_SALT_PER_PORTION_G * portionen;
      ingredientTotals.salz += saltAmountG;
      return {
        found: true,
        detail: {
          ingredient: ingredientStr,
          name: 'Salz',
          product: `Salz (Standard: ${DEFAULT_SALT_PER_PORTION_G} g pro Portion)`,
          amountG: saltAmountG,
        },
        totals: ingredientTotals,
      };
    }

    let parsed = null;
    const hasExplicitQuantity = hasExplicitQuantityInIngredient(ingredientStr);

    if (isSimpleIngredient(ingredientStr)) {
      parsed = parseIngredientForNutrition(ingredientStr);
      if (parsed) {
        console.log(`Fast path (regex) for simple ingredient: "${ingredientStr}"`);
      }
    }

    if (!parsed) {
      try {
        parsed = await normalizeIngredientWithGemini(ingredientStr, {timeoutMs: 5000});
      } catch (geminiError) {
        console.warn(`Gemini normalization failed for "${ingredientStr}", falling back to regex:`, geminiError.message);
        parsed = parseIngredientForNutrition(ingredientStr);
      }
    }

    if (!parsed) {
      parsed = parseIngredientForNutrition(ingredientStr);
    }
    if (!parsed) {
      return {
        found: false,
        detail: {ingredient: ingredientStr, error: 'Konnte nicht geparst werden'},
        totals: ingredientTotals,
      };
    }

    const {name} = parsed;
    const referenceId = normalizeNutritionReferenceId(name);
    let cachedSnapshot = null;

    try {
      if (referenceId) {
        const collectionRef = admin.firestore()
            .collection(NUTRITION_REFERENCE_COLLECTION);
        cachedSnapshot = await collectionRef
            .doc(referenceId)
            .get();
        if (!cachedSnapshot.exists) {
          const synonymQuerySnapshot = await collectionRef
              .where('normalizedSynonyms', 'array-contains', referenceId)
              .limit(1)
              .get();
          if (!synonymQuerySnapshot.empty) {
            [cachedSnapshot] = synonymQuerySnapshot.docs;
          }
        }
        if (cachedSnapshot.exists) {
          const cachedData = cachedSnapshot.data();
          const fallbackAmountG = cachedData.defaultAmountG;
          if (!hasExplicitQuantity && typeof fallbackAmountG === 'number' && fallbackAmountG > 0) {
            parsed = {...parsed, amountG: fallbackAmountG};
          }
          const cachedValues = getNutritionValuesForSource(cachedData, cachedData.source);
          if (Object.keys(cachedValues).length > 0) {
            const scale = parsed.amountG / 100;
            NUTRITION_REFERENCE_FIELDS.forEach((key) => {
              ingredientTotals[key] += (cachedValues[key] || 0) * scale;
            });
            return {
              found: true,
              detail: {
                ingredient: ingredientStr,
                name,
                product: cachedSnapshot.data().product || cachedSnapshot.data().name || name,
                amountG: parsed.amountG,
                searchTerm: parsed.searchName || name,
              },
              totals: ingredientTotals,
            };
          }
        }
      }

      const searchTerms = [...new Set(
          [parsed.searchName, name]
              .filter((term) => typeof term === 'string' && term.trim() !== '')
              .map((term) => term.trim())
      )];
      let product = null;
      let searchError = 'Nicht gefunden';
      let usedSearchTerm = null;

      for (const searchTerm of searchTerms) {
        const cleanSearchTerm = searchTerm.replace(/\s*\([^)]*\)/g, '').trim();
        const termToSearch = cleanSearchTerm || searchTerm;
        const searchUrl =
          `https://world.openfoodfacts.org/cgi/search.pl` +
          `?search_terms=${encodeURIComponent(termToSearch)}` +
          `&json=1&page_size=3` +
          `&fields=product_name,nutriments`;

        const response = await fetchWithRetry(searchUrl, {
          headers: {
            'User-Agent': 'RecipeBook/1.0 (https://github.com/brou-cgn/recipebook)',
          },
        }, 1);

        if (!response.ok) {
          if (response.status === 404) {
            searchError = 'Nicht gefunden';
            continue;
          }
          searchError = `HTTP ${response.status}`;
          console.warn(`OpenFoodFacts HTTP ${response.status} for "${termToSearch}", trying next search term`);
          continue;
        }

        const data = await response.json();

        if (!data.products || data.products.length === 0) {
          searchError = 'Nicht gefunden';
          continue;
        }

        product = data.products.find(
            (entry) => entry.nutriments && entry.nutriments['energy-kcal_100g'] != null
        );

        if (product) {
          usedSearchTerm = termToSearch;
          break;
        }

        console.warn(`No energy data found for "${termToSearch}" in OpenFoodFacts results`);
        searchError = 'Keine Nährwertdaten verfügbar';
      }

      if (!product) {
        let geminiEstimate = null;
        try {
          geminiEstimate = await estimateNutritionWithGemini(ingredientStr, parsed, {timeoutMs: 20000});
        } catch (estimateError) {
          console.warn(
              `Gemini estimation failed for "${ingredientStr}":`,
              estimateError?.message || estimateError,
          );
        }

        if (!geminiEstimate) {
          return {
            found: false,
            detail: {ingredient: ingredientStr, name, searchTerm: usedSearchTerm, error: searchError},
            totals: ingredientTotals,
          };
        }

        const scale = parsed.amountG / 100;
        NUTRITION_REFERENCE_FIELDS.forEach((key) => {
          ingredientTotals[key] += (geminiEstimate.per100g[key] || 0) * scale;
        });

        return {
          found: true,
          aiEstimated: true,
          detail: {
            ingredient: ingredientStr,
            name,
            amountG: parsed.amountG,
            searchTerm: usedSearchTerm || parsed.searchName || name,
            aiEstimated: true,
          },
          totals: ingredientTotals,
        };
      }

      const n = product.nutriments || {};
      const per100gValues = parseNutritionReferenceValues({
        kalorien: n['energy-kcal_100g'] ?? n['energy-kcal'],
        protein: n['proteins_100g'] ?? n.proteins,
        fett: n['fat_100g'] ?? n.fat,
        kohlenhydrate: n['carbohydrates_100g'] ?? n.carbohydrates,
        zucker: n['sugars_100g'] ?? n.sugars,
        ballaststoffe: n['fiber_100g'] ?? n.fiber,
        salz: n['salt_100g'] ?? n.salt,
      });
      const scale = parsed.amountG / 100;

      NUTRITION_REFERENCE_FIELDS.forEach((key) => {
        ingredientTotals[key] += (per100gValues[key] || 0) * scale;
      });

      return {
        found: true,
        detail: {
          ingredient: ingredientStr,
          name,
          product: product.product_name || name,
          amountG: parsed.amountG,
          searchTerm: usedSearchTerm || parsed.searchName || name,
        },
        totals: ingredientTotals,
      };
    } catch (err) {
      const isNetworkError = isOpenFoodFactsNetworkError(err);
      const isTimeout = err.name === 'AbortError' || (err.message || '').toLowerCase().includes('timeout');

      if (parsed) {
        try {
          const geminiEstimate = await estimateNutritionWithGemini(ingredientStr, parsed, {timeoutMs: 20000});
          if (geminiEstimate) {
            const scale = parsed.amountG / 100;
            NUTRITION_REFERENCE_FIELDS.forEach((key) => {
              ingredientTotals[key] += (geminiEstimate.per100g[key] || 0) * scale;
            });

            return {
              found: true,
              aiEstimated: true,
              detail: {
                ingredient: ingredientStr,
                name,
                amountG: parsed.amountG,
                searchTerm: parsed.searchName || name,
                aiEstimated: true,
              },
              totals: ingredientTotals,
            };
          }
        } catch (estimateError) {
          console.warn(`Gemini estimation also failed for "${ingredientStr}":`, estimateError?.message);
        }
      }

      const errorType = isNetworkError ? 'Netzwerkfehler' : (isTimeout ? 'Timeout' : 'API-Fehler');
      console.error(`OpenFoodFacts ${errorType} for "${name}":`, err.message);
      return {
        found: false,
        detail: {
          ingredient: ingredientStr,
          name,
          error: isTimeout ? 'Timeout bei OpenFoodFacts' : (err.message || errorType),
        },
        totals: ingredientTotals,
      };
    }
  };

  for (let i = 0; i < ingredientEntries.length; i += BATCH_SIZE) {
    const batch = ingredientEntries.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(processIngredient));
    for (const result of batchResults) {
      Object.keys(totals).forEach((key) => {
        totals[key] += result.totals[key] || 0;
      });
      details.push({
        ...result.detail,
        found: result.found,
      });
      if (typeof result.detail?.amountG === 'number' && result.detail.amountG > 0) {
        sumIngredientAmounts += result.detail.amountG;
      }
      if (result.found) {
        foundCount++;
      }
    }
  }

  const naehrwerte = {};
  for (const [key, value] of Object.entries(totals)) {
    const perPortion = value / portionen;
    naehrwerte[key] = roundNutritionValue(key, perPortion);
  }
  const calcFinalWeightGrams = resolveNutritionFinalWeightGrams({
    sumIngredientAmounts,
    calcYieldGrams,
    calcYieldFactor,
  });
  const calcPer100g = buildNutritionPer100g(totals, calcFinalWeightGrams);

  console.log(
      `Nutrition calculated for ${callerLabel}: ` +
      `${foundCount}/${ingredientEntries.length} ingredients found`
  );

  return {
    naehrwerte,
    details,
    foundCount,
    totalCount: ingredientEntries.length,
    calcFinalWeightGrams: calcFinalWeightGrams ?? null,
    calcPer100g,
  };
}

module.exports = {sleep, OPEN_FOOD_FACTS_FETCH_TIMEOUT_MS, OPEN_FOOD_FACTS_RETRY_DELAYS_MS, OPEN_FOOD_FACTS_NETWORK_ERROR_CODES, NUTRITION_REFERENCE_COLLECTION, NUTRITION_REFERENCE_FIELDS, NUTRITION_SOURCE_SUFFIX_OFF, NUTRITION_SOURCE_SUFFIX_AI, NUTRITION_SOURCE_SUFFIX_MANUAL, normalizeNutritionReferenceId, parseNutritionReferenceValues, parseNutritionReferenceNumber, getNutritionSourceSuffix, getNutritionValuesForSource, isOpenFoodFactsNetworkError, isSkippableIngredientLine, hasExplicitQuantityInIngredient, fetchWithRetry, normalizePositiveNutritionNumber, roundNutritionValue, buildNutritionPer100g, resolveNutritionFinalWeightGrams, calculateNutritionFromOpenFoodFactsCore};
