/**
 * nutrition: aus index.js ausgelagert (Tech-Check F2).
 */

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {onDocumentCreated, onDocumentWritten} = require('firebase-functions/v2/firestore');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {GoogleGenAI} = require('@google/genai');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const {createNutritionNormalizationUtils} = require('../nutritionNormalization');
const {evaluateLowCarbTag} = require('../lowCarb');
const {fetchFirestoreDailyUsage, buildFirestoreUsageSection} = require('../firestoreUsage');
const {geminiApiKey, smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom} = require('../shared/secrets');
const {consumeDailyQuota} = require('../shared/rateLimit');
const {requireAiCaller} = require('../shared/auth');
const {ALLOWED_ORIGINS} = require('../shared/common');

/**
 * Daily quota for the nutrition callables (parseIngredientAmountG,
 * calculateNutritionFromOpenFoodFacts, generateNutritionFromReference),
 * counted in aiNutritionLimits. Separate from the scan quota because one
 * recipe calculation fires several of these calls (one per linked recipe or
 * unknown ingredient) and each is cheap. Guests get 0: requireAiCaller
 * already refuses them, this keeps the table fail-closed if that ever changes.
 */
const RATE_LIMITS_NUTRITION = {
  admin: 5000,
  moderator: 1000,
  authenticated: 500,
  guest: 0,
};

/**
 * Gate for the nutrition callables: role from users/{uid} (edit or higher, via
 * requireAiCaller), then one call from the daily nutrition quota
 * (aiNutritionLimits, see RATE_LIMITS_NUTRITION). Fails closed.
 * @param {object} auth - request.auth of the callable (already checked non-null)
 * @returns {Promise<void>}
 */
async function requireNutritionCaller(auth) {
  const caller = await requireAiCaller(auth);
  const limit = caller.isAdmin ? RATE_LIMITS_NUTRITION.admin
    : caller.isModerator ? RATE_LIMITS_NUTRITION.moderator
    : caller.isAuthenticated ? RATE_LIMITS_NUTRITION.authenticated
    : RATE_LIMITS_NUTRITION.guest;
  const result = await consumeDailyQuota('aiNutritionLimits', limit, caller);
  if (!result.allowed) {
    throw new HttpsError(
        'resource-exhausted',
        `Tageslimit für Nährwert-Berechnungen erreicht (${result.limit}/${result.limit}). Versuche es morgen erneut.`,
    );
  }
}

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

// 5% Kalorienabweichung zwischen actual/outdated setzt recalc=true.
const NUTRITION_RECALC_CALORIE_THRESHOLD = 0.05;

const ZERO_CALORIE_BASELINE = 1;

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

function buildNutritionSet(values = {}, source = '') {
  const parsedValues = parseNutritionReferenceValues(values);
  if (Object.keys(parsedValues).length === 0) return [];
  const normalizedSource = String(source || '').trim().toLowerCase();
  return [normalizedSource ? { source: normalizedSource, ...parsedValues } : parsedValues];
}

function normalizeNutritionSet(set = []) {
  if (!Array.isArray(set)) return [];
  return set.reduce((acc, entry) => {
    if (!entry || typeof entry !== 'object') return acc;
    const source = String(entry.source || '').trim().toLowerCase();
    const rawValues = entry.values && typeof entry.values === 'object' ? entry.values : entry;
    const parsedValues = parseNutritionReferenceValues(rawValues);
    if (Object.keys(parsedValues).length === 0) return acc;
    acc.push(source ? { source, ...parsedValues } : parsedValues);
    return acc;
  }, []);
}

function getCaloriesFromNutritionSet(set = []) {
  const normalized = normalizeNutritionSet(set);
  if (normalized.length === 0) return null;
  return parseNutritionReferenceNumber(normalized[0].kalorien);
}

function shouldTriggerRecalc(previousCalories, currentCalories) {
  if (previousCalories == null || currentCalories == null) return false;
  const baseline = previousCalories === 0 ? ZERO_CALORIE_BASELINE : previousCalories;
  return Math.abs(currentCalories - previousCalories) / baseline >
    NUTRITION_RECALC_CALORIE_THRESHOLD;
}

function hasSourceChanged(nextSource, previousSource) {
  return Boolean(nextSource && previousSource && nextSource !== previousSource);
}

function buildNutritionTrackingFields({
  previousData = {},
  nextValues = {},
  nextSource = '',
  forceRecalc = false,
  preserveOnManualSourceChange = false,
  fromNutritionGeneration = false,
} = {}) {
  const previousActual = normalizeNutritionSet(previousData.nutritionSetActual);
  let nextActual = previousActual;
  let nextOutdated = normalizeNutritionSet(previousData.nutritionSetOutdated);
  const wasAlreadyRecalc = typeof previousData.recalc === 'boolean' ? previousData.recalc : false;
  let nextRecalc = wasAlreadyRecalc;

  const normalizedNextSource = String(nextSource || '').trim().toLowerCase();
  const normalizedPreviousSource = String(previousData.source || '').trim().toLowerCase();
  const normalizedNextSet = buildNutritionSet(nextValues, normalizedNextSource);
  const hasNextSet = normalizedNextSet.length > 0;
  const sourceChanged = hasSourceChanged(normalizedNextSource, normalizedPreviousSource);
  const switchedToManual = sourceChanged && normalizedNextSource === 'manual';

  if (forceRecalc) {
    nextOutdated = previousActual;
    if (hasNextSet) {
      nextActual = normalizedNextSet;
      nextRecalc = nextRecalc || shouldTriggerRecalc(
          getCaloriesFromNutritionSet(nextOutdated),
          getCaloriesFromNutritionSet(nextActual),
      );
    }
  } else if (hasNextSet && fromNutritionGeneration && !(preserveOnManualSourceChange && switchedToManual)) {
    nextOutdated = previousActual;
    nextActual = normalizedNextSet;
    nextRecalc = nextRecalc || shouldTriggerRecalc(
        getCaloriesFromNutritionSet(nextOutdated),
        getCaloriesFromNutritionSet(nextActual),
    );
  } else if (
    hasNextSet &&
    previousActual.length === 0 &&
    !(preserveOnManualSourceChange && switchedToManual)
  ) {
    nextActual = normalizedNextSet;
  }

  const finalRecalc = Boolean(nextRecalc);
  const result = {
    nutritionSetActual: nextActual,
    nutritionSetOutdated: nextOutdated,
    recalc: finalRecalc,
  };
  if (finalRecalc && !wasAlreadyRecalc) {
    result.recalcDate = new Date();
  }
  return result;
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
 * Cloud Function: Parse ingredient text to amount in grams with Gemini.
 */
exports.parseIngredientAmountG = onCall(
    {maxInstances: 5, timeoutSeconds: 10, secrets: [geminiApiKey], cors: ALLOWED_ORIGINS, invoker: 'public'},
    async (request) => {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'You must be logged in to parse ingredient amounts');
      }

      const ingredientText = String(request.data?.ingredientText || '').trim();
      if (!ingredientText) {
        throw new HttpsError('invalid-argument', 'ingredientText is required');
      }

      await requireNutritionCaller(request.auth);

      const {
        normalizeIngredientWithGemini,
        parseIngredientForNutrition,
      } = createNutritionNormalizationUtils({
        GoogleGenAI,
        env: {GEMINI_API_KEY: geminiApiKey.value()},
      });

      let parsed = null;
      try {
        parsed = await normalizeIngredientWithGemini(ingredientText, {timeoutMs: 7000});
      } catch (error) {
        console.warn(`Failed to parse ingredient amount for "${ingredientText}" with Gemini:`, error);
        parsed = null;
      }
      if (!parsed) {
        parsed = parseIngredientForNutrition(ingredientText);
      }

      return {
        amountG: parsed?.amountG ?? null,
        name: parsed?.name || ingredientText,
      };
    },
);

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
    GoogleGenAI,
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

/**
 * Cloud Function: Calculate Nutrition from OpenFoodFacts
 */
exports.calculateNutritionFromOpenFoodFacts = onCall(
    {
      maxInstances: 5,
      timeoutSeconds: 540,
      secrets: [geminiApiKey],
      cors: ALLOWED_ORIGINS,
      invoker: 'public',
    },
    async (request) => {
      if (!request.auth) {
        throw new HttpsError(
            'unauthenticated',
            'You must be logged in to calculate nutrition'
        );
      }

      const {
        ingredients,
        portionen = 1,
        calcYieldGrams = null,
        calcYieldFactor = null,
      } = request.data || {};
      if (!Array.isArray(ingredients) || ingredients.length === 0) {
        throw new HttpsError(
            'invalid-argument',
            'ingredients must be a non-empty array of strings'
        );
      }
      if (typeof portionen !== 'number' || portionen < 1) {
        throw new HttpsError(
            'invalid-argument',
            'portionen must be a positive number'
        );
      }

      await requireNutritionCaller(request.auth);

      return calculateNutritionFromOpenFoodFactsCore({
        ingredients,
        portionen,
        callerLabel: `user ${request.auth.uid}`,
        calcYieldGrams,
        calcYieldFactor,
      });
    }
);

/**
 * Generates nutrition data for a nutrition reference entry by:
 * 1. Using Gemini to generate a meaningful English search term from the metadata
 * 2. Querying OpenFoodFacts with the generated search term
 * 3. Falling back to Gemini nutrition estimation if OpenFoodFacts returns no results
 */
exports.generateNutritionFromReference = onCall(
    {maxInstances: 5, timeoutSeconds: 60, secrets: [geminiApiKey], cors: ALLOWED_ORIGINS, invoker: 'public'},
    async (request) => {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'You must be logged in to generate nutrition data');
      }

      const {ingredientID, nutritionFamily, category} = request.data || {};
      if (!ingredientID || typeof ingredientID !== 'string') {
        throw new HttpsError('invalid-argument', 'ingredientID is required');
      }

      await requireNutritionCaller(request.auth);

      const {
        generateSearchTermWithGemini,
        estimateNutritionWithGemini,
      } = createNutritionNormalizationUtils({
        GoogleGenAI,
        env: {GEMINI_API_KEY: geminiApiKey.value()},
      });

      const referenceRef = admin.firestore()
          .collection(NUTRITION_REFERENCE_COLLECTION)
          .doc(ingredientID);
      const referenceSnapshot = await referenceRef.get();
      const referenceData = referenceSnapshot.exists ? (referenceSnapshot.data() || {}) : {};

      const hasSourceValues = (suffix) => NUTRITION_REFERENCE_FIELDS.some((field) =>
        parseNutritionReferenceNumber(referenceData[`${field}${suffix}`]) != null
      );

      const status = String(referenceData.status || '').trim();
      const previousSource = String(referenceData.source || '').trim().toLowerCase();

      let hasOffValues = hasSourceValues(NUTRITION_SOURCE_SUFFIX_OFF);
      let hasAiValues = hasSourceValues(NUTRITION_SOURCE_SUFFIX_AI);

      // 1. Generate search term with Gemini
      const generatedSearchTerm = await generateSearchTermWithGemini(
          ingredientID,
          nutritionFamily || '',
          category || '',
      );
      const searchTerm = generatedSearchTerm || ingredientID;

      // 2. Query OpenFoodFacts when OFF fields are empty
      let offValues = null;
      let productName = null;
      if (!hasOffValues) {
        try {
          const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(searchTerm)}&action=process&json=1&page_size=5`;
          const offResponse = await fetch(offUrl);
          if (offResponse.ok) {
            const offData = await offResponse.json();
            const product = (offData.products || []).find((entry) => {
              const nutriments = entry?.nutriments || {};
              return nutriments['energy-kcal_100g'] != null || nutriments['energy-kcal'] != null;
            });
            if (product) {
              const nutriments = product.nutriments || {};
              offValues = parseNutritionReferenceValues({
                kalorien: nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal'] ?? null,
                protein: nutriments['proteins_100g'] ?? nutriments.proteins ?? null,
                fett: nutriments['fat_100g'] ?? nutriments.fat ?? null,
                kohlenhydrate: nutriments['carbohydrates_100g'] ?? nutriments.carbohydrates ?? null,
                zucker: nutriments['sugars_100g'] ?? nutriments.sugars ?? null,
                ballaststoffe: nutriments['fiber_100g'] ?? nutriments.fiber ?? null,
                salz: nutriments['salt_100g'] ?? nutriments.salt ?? null,
              });
              if (Object.keys(offValues).length > 0) {
                productName = product.product_name || searchTerm;
                hasOffValues = true;
              } else {
                offValues = null;
              }
            }
          }
        } catch (e) {
          // Network error → continue with Gemini generation if needed
        }
      }

      // 3. Estimate with Gemini when AI fields are empty
      let aiValues = null;
      let kiConfidence = null;
      if (!hasAiValues) {
        const estimated = await estimateNutritionWithGemini(
            ingredientID,
            {amountG: 100, name: ingredientID, searchName: searchTerm},
            {timeoutMs: 20000},
        );
        if (estimated?.per100g) {
          aiValues = parseNutritionReferenceValues(estimated.per100g);
          if (Object.keys(aiValues).length > 0) {
            hasAiValues = true;
            kiConfidence = estimated.confidence ?? null;
          } else {
            aiValues = null;
          }
        }
      }

      // Compute OFF completeness confidence (fraction of non-null fields, 0–1)
      let offConfidence = null;
      if (offValues) {
        const nonNullCount = NUTRITION_REFERENCE_FIELDS.filter((f) => offValues[f] != null).length;
        offConfidence = Math.round(nonNullCount / NUTRITION_REFERENCE_FIELDS.length * 100) / 100;
      }

      const offFields = (offValues || {});
      const aiFields = (aiValues || {});
      const offSourceFields = NUTRITION_REFERENCE_FIELDS.reduce((acc, field) => {
        if (offFields[field] != null) {
          acc[`${field}${NUTRITION_SOURCE_SUFFIX_OFF}`] = offFields[field];
        }
        return acc;
      }, {});
      const aiSourceFields = NUTRITION_REFERENCE_FIELDS.reduce((acc, field) => {
        if (aiFields[field] != null) {
          acc[`${field}${NUTRITION_SOURCE_SUFFIX_AI}`] = aiFields[field];
        }
        return acc;
      }, {});
      const nextData = {
        ...referenceData,
        ...offSourceFields,
        ...aiSourceFields,
      };

      let nextSource = previousSource;
      if (status === 'Prüfung ausstehend') {
        const hasManualAfter = NUTRITION_REFERENCE_FIELDS.some((field) =>
          parseNutritionReferenceNumber(nextData[`${field}${NUTRITION_SOURCE_SUFFIX_MANUAL}`]) != null
        );
        const hasOffAfter = NUTRITION_REFERENCE_FIELDS.some((field) =>
          parseNutritionReferenceNumber(nextData[`${field}${NUTRITION_SOURCE_SUFFIX_OFF}`]) != null
        );
        if (hasManualAfter) {
          nextSource = 'manual';
        } else if (hasOffAfter) {
          nextSource = 'openfoodfacts';
        } else {
          nextSource = 'ai-generiert';
        }
      } else if (status !== 'Freigegeben') {
        if (offValues) {
          nextSource = 'openfoodfacts';
        } else if (aiValues) {
          nextSource = 'ai-generiert';
        }
      }

      const selectedValues = NUTRITION_REFERENCE_FIELDS.reduce((acc, field) => {
        const manualValue = parseNutritionReferenceNumber(nextData[`${field}${NUTRITION_SOURCE_SUFFIX_MANUAL}`]);
        const offValue = parseNutritionReferenceNumber(nextData[`${field}${NUTRITION_SOURCE_SUFFIX_OFF}`]);
        const aiValue = parseNutritionReferenceNumber(nextData[`${field}${NUTRITION_SOURCE_SUFFIX_AI}`]);

        const resolved = manualValue != null ?
          manualValue :
          (offValue != null ? offValue : aiValue);
        if (resolved != null) {
          acc[field] = resolved;
        }
        return acc;
      }, {});

      if (Object.keys(selectedValues).length === 0) {
        throw new HttpsError('not-found', 'Keine Nährwertdaten gefunden.');
      }

      const trackingFields = buildNutritionTrackingFields({
        previousData: referenceData,
        nextValues: selectedValues,
        nextSource: nextSource || previousSource,
        preserveOnManualSourceChange: true,
        fromNutritionGeneration: true,
      });
      const updatePayload = {
        ...(searchTerm ? {searchTerm} : {}),
        ...selectedValues,
        ...offSourceFields,
        ...aiSourceFields,
        ...trackingFields,
      };
      if (nextSource && status !== 'Freigegeben' && status !== 'Neu') {
        updatePayload.source = nextSource;
      }
      // Advance status to 'Prüfung ausstehend' for entries that still need review.
      // 'Neu' is left unchanged (merge will preserve it); 'Freigegeben' is never touched.
      if (status !== 'Neu' && status !== 'Freigegeben') {
        updatePayload.status = 'Prüfung ausstehend';
      }
      updatePayload.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      // Persist dual-confidence: openFoodFacts completeness + KI estimate confidence
      const existingConfidence = referenceData.confidence || {};
      const confidenceData = {...existingConfidence};
      if (offConfidence != null) confidenceData.openFoodFacts = offConfidence;
      if (kiConfidence != null) confidenceData.ki = kiConfidence;
      if (Object.keys(confidenceData).length > 0) {
        updatePayload.confidence = confidenceData;
      }

      await referenceRef.set(updatePayload, {merge: true});

      const resolvedSource = status === 'Freigegeben' ? previousSource : (nextSource || previousSource);
      return {searchTerm, source: resolvedSource, values: selectedValues, productName};
    }
);

function extractRecipeIngredientItems(recipeData = {}) {
  const rawIngredients = Array.isArray(recipeData?.zutaten) ?
    recipeData.zutaten :
    (Array.isArray(recipeData?.ingredients) ? recipeData.ingredients : []);

  return rawIngredients
      .map((item) => (typeof item === 'string' ? {text: item} : item))
      .filter((item) => item && item.type !== 'heading')
      .filter((item) => item.ignoreNutritionCalculation !== true)
      .map((item) => ({
        ...item,
        text: String(item.text || '').trim(),
      }))
      .filter((item) => item.text !== '');
}

function toMilliseconds(date) {
  if (date == null) return null;
  if (date?.toMillis) return date.toMillis();
  if (date instanceof Date) return date.getTime();
  if (typeof date === 'number') return date;
  return null;
}

function recipeUsesRecalcIngredient(recipeData = {}, recalcIngredientMap = new Map()) {
  if (!recalcIngredientMap || recalcIngredientMap.size === 0) return false;
  const calcCompletedAt = recipeData?.naehrwerte?.calcCompletedAt ?? null;
  if (calcCompletedAt == null) return false; // noch nie berechnet → nicht im Recalc-Job
  const ingredientItems = extractRecipeIngredientItems(recipeData);
  return ingredientItems.some((item) => {
    const ingredientID = String(item.ingredientID || '').trim();
    if (!ingredientID || !recalcIngredientMap.has(ingredientID)) return false;
    const recalcDate = recalcIngredientMap.get(ingredientID);
    if (recalcDate == null) return true; // kein recalcDate → immer recalculieren
    const recalcDateMs = toMilliseconds(recalcDate);
    if (recalcDateMs == null) return true;
    return recalcDateMs > calcCompletedAt;
  });
}

function escapeNutritionRecalcHtml(value) {
  return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}

/**
 * Wording for a recipe whose "Low Carb" tag the recalc changed. Returns null
 * for recipes the recalc left tagged as they were, so they read unchanged in
 * the report.
 *
 * @param {string|undefined} action - The action evaluateLowCarbTag reported.
 * @return {string|null} The label, or null when there is nothing to say.
 */
function nutritionRecalcLowCarbLabel(action) {
  if (action === 'added') return 'Low Carb ergänzt';
  if (action === 'removed') return 'Low Carb entfernt';
  // 'unchanged' only reaches the report when a duplicate tag was cleaned up.
  if (action === 'unchanged') return 'Low Carb bereinigt';
  return null;
}

function buildNutritionRecalcSummaryMail(report, runAt, usageSection = null) {
  const updatedCount = report.updatedRecipes.length;
  const failedCount = report.failedRecipes.length;
  const skippedCount = report.skippedRecipes.length;
  const totalAffected = report.affectedRecipeCount;
  const lowCarbAddedCount = report.updatedRecipes
      .filter((entry) => entry.lowCarbAction === 'added').length;
  const lowCarbRemovedCount = report.updatedRecipes
      .filter((entry) => entry.lowCarbAction === 'removed').length;
  const status = failedCount === 0 && !report.fatalError ? '✅ Erfolgreich' : '⚠️ Mit Fehlern';
  const subject = `[RecipeBook] Nährwert-Recalc ${status} (${runAt})`;

  let text = `Nährwert-Recalc Bericht\n`;
  text += `Ausgeführt: ${runAt}\n`;
  text += `Trigger: ${report.triggeredBy}\n`;
  text += `Betroffene Rezepte: ${totalAffected}\n`;
  text += `Aktualisiert: ${updatedCount}\n`;
  text += `Übersprungen: ${skippedCount}\n`;
  text += `Fehlgeschlagen: ${failedCount}\n`;
  text += `recalc zurückgesetzt: ${report.resetRecalcCount}\n`;
  text += `Low Carb ergänzt: ${lowCarbAddedCount}\n`;
  text += `Low Carb entfernt: ${lowCarbRemovedCount}\n`;
  if (report.fatalError) {
    text += `\nFataler Fehler: ${report.fatalError}\n`;
  }
  if (updatedCount > 0) {
    text += `\nAktualisierte Rezepte:\n`;
    report.updatedRecipes.forEach((entry) => {
      const lowCarbLabel = nutritionRecalcLowCarbLabel(entry.lowCarbAction);
      text += `- ${entry.title} (${entry.recipeId})${lowCarbLabel ? ` – ${lowCarbLabel}` : ''}\n`;
    });
  }
  if (failedCount > 0) {
    text += `\nFehlgeschlagene Rezepte:\n`;
    report.failedRecipes.forEach((entry) => {
      text += `- ${entry.title} (${entry.recipeId}): ${entry.error}\n`;
    });
  }
  if (usageSection) {
    text += usageSection.text;
  }

  const htmlList = (entries, formatter) => {
    if (!entries || entries.length === 0) return '<p>Keine</p>';
    return `<ul>${entries.map((entry) => `<li>${formatter(entry)}</li>`).join('')}</ul>`;
  };

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:760px">
      <h2>Nährwert-Recalc Bericht</h2>
      <p><strong>Ausgeführt:</strong> ${escapeNutritionRecalcHtml(runAt)}</p>
      <p><strong>Trigger:</strong> ${escapeNutritionRecalcHtml(report.triggeredBy)}</p>
      <p><strong>Betroffene Rezepte:</strong> ${totalAffected}</p>
      <p><strong>Aktualisiert:</strong> ${updatedCount}</p>
      <p><strong>Übersprungen:</strong> ${skippedCount}</p>
      <p><strong>Fehlgeschlagen:</strong> ${failedCount}</p>
      <p><strong>recalc zurückgesetzt:</strong> ${report.resetRecalcCount}</p>
      <p><strong>Low Carb ergänzt:</strong> ${lowCarbAddedCount}</p>
      <p><strong>Low Carb entfernt:</strong> ${lowCarbRemovedCount}</p>
      ${report.fatalError ? `<p style="color:#c62828"><strong>Fataler Fehler:</strong> ${escapeNutritionRecalcHtml(report.fatalError)}</p>` : ''}
      <h3>Aktualisierte Rezepte</h3>
      ${htmlList(report.updatedRecipes, (entry) => {
    const lowCarbLabel = nutritionRecalcLowCarbLabel(entry.lowCarbAction);
    return `${escapeNutritionRecalcHtml(entry.title)} (${escapeNutritionRecalcHtml(entry.recipeId)})` +
      (lowCarbLabel ? ` &ndash; <strong>${escapeNutritionRecalcHtml(lowCarbLabel)}</strong>` : '');
  })}
      <h3>Fehlgeschlagene Rezepte</h3>
      ${htmlList(report.failedRecipes, (entry) => `${escapeNutritionRecalcHtml(entry.title)} (${escapeNutritionRecalcHtml(entry.recipeId)}): ${escapeNutritionRecalcHtml(entry.error)}`)}
      ${usageSection ? usageSection.html : ''}
    </div>
  `;

  return {subject, text, html};
}

/**
 * Mails a report to every admin user. Shared by the nutrition recalc and the
 * low-carb full pass, so the admin lookup, the SMTP guard and the transporter
 * exist once rather than once per job.
 *
 * @param {Object} mail - The message.
 * @param {string} mail.subject - Subject line.
 * @param {string} mail.text - Plain-text body.
 * @param {string} mail.html - HTML body.
 * @param {string} mail.logLabel - Job name for the console messages.
 * @return {Promise<boolean>} Whether a mail was actually sent.
 */
async function sendAdminReportMail({subject, text, html, logLabel}) {
  const db = admin.firestore();
  const usersSnapshot = await db.collection('users').where('role', '==', 'admin').get();
  const adminEmails = [];
  usersSnapshot.forEach((doc) => {
    const data = doc.data();
    if (data.email) adminEmails.push(data.email);
  });

  if (adminEmails.length === 0) {
    console.log(`${logLabel}: no admin emails found, skipping email`);
    return false;
  }

  const smtpHostVal = smtpHost.value();
  const smtpPortVal = smtpPort.value();
  const smtpUserVal = smtpUser.value();
  const smtpPasswordVal = smtpPassword.value();
  const smtpFromVal = smtpFrom.value();
  if (!smtpHostVal || !smtpUserVal || !smtpPasswordVal || !smtpFromVal) {
    console.warn(`${logLabel}: SMTP not fully configured – skipping email`);
    return false;
  }

  const smtpPortNum = parseInt(smtpPortVal || '587', 10);
  const transporter = nodemailer.createTransport({
    host: smtpHostVal,
    port: smtpPortNum,
    secure: smtpPortNum === 465,
    auth: {user: smtpUserVal, pass: smtpPasswordVal},
  });

  await transporter.sendMail({
    from: smtpFromVal,
    bcc: adminEmails.join(', '),
    subject,
    text,
    html,
  });
  return true;
}

/**
 * Firestore-Nutzung für den Recalc-Bericht. Schlägt nie fehl: ohne
 * Monitoring-Berechtigung oder bei einem Fehler steht ein Hinweis im Bericht.
 *
 * @return {Promise<{text: string, html: string}>}
 */
async function loadFirestoreUsageSection() {
  try {
    const rows = await fetchFirestoreDailyUsage({
      projectId: process.env.GCLOUD_PROJECT || admin.app().options.projectId,
      getAccessToken: () => admin.credential.applicationDefault().getAccessToken(),
    });
    return buildFirestoreUsageSection({rows});
  } catch (error) {
    console.warn('loadFirestoreUsageSection: Firestore-Nutzung nicht verfügbar:', error.message);
    return buildFirestoreUsageSection({error: error.message, status: error.status});
  }
}

async function sendNutritionRecalcSummary(report) {
  const runAt = new Date(report.finishedAt || Date.now()).toLocaleString('de-DE', {timeZone: 'Europe/Berlin'});
  const usageSection = await loadFirestoreUsageSection();
  const mailContent = buildNutritionRecalcSummaryMail(report, runAt, usageSection);
  await sendAdminReportMail({
    subject: mailContent.subject,
    text: mailContent.text,
    html: mailContent.html,
    logLabel: 'runNutritionRecalcForFlaggedRecipes',
  });
}

async function setRecalcFalseForReferences(referenceDocs = []) {
  if (!Array.isArray(referenceDocs) || referenceDocs.length === 0) {
    return 0;
  }
  const db = admin.firestore();
  let updatedCount = 0;
  let batch = db.batch();
  let operationCount = 0;

  for (const docSnap of referenceDocs) {
    batch.update(docSnap.ref, {recalc: false});
    operationCount += 1;
    if (operationCount >= 450) {
      await batch.commit();
      updatedCount += operationCount;
      batch = db.batch();
      operationCount = 0;
    }
  }

  if (operationCount > 0) {
    await batch.commit();
    updatedCount += operationCount;
  }

  return updatedCount;
}

async function runNutritionRecalcForFlaggedRecipesCore({triggeredBy = 'schedule'} = {}) {
  const db = admin.firestore();
  const report = {
    triggeredBy,
    startedAt: Date.now(),
    finishedAt: null,
    affectedRecipeCount: 0,
    updatedRecipes: [],
    failedRecipes: [],
    skippedRecipes: [],
    resetRecalcCount: 0,
    fatalError: null,
  };

  let recalcReferenceDocs = [];
  try {
    const recalcSnapshot = await db
        .collection(NUTRITION_REFERENCE_COLLECTION)
        .where('recalc', '==', true)
        .get();
    recalcReferenceDocs = recalcSnapshot.docs;

    const recalcIngredientMap = new Map(
        recalcSnapshot.docs
            .map((docSnap) => {
              const data = docSnap.data() || {};
              const ingredientID = String(data?.ingredientID || docSnap.id || '').trim();
              if (!ingredientID) return null;
              return [ingredientID, data?.recalcDate ?? null];
            })
            .filter(Boolean)
    );

    if (recalcIngredientMap.size === 0) {
      console.log('runNutritionRecalcForFlaggedRecipes: no recalc ingredientIDs found');
      return report;
    }

    const recipesSnapshot = await db.collection('recipes').get();
    const affectedRecipes = recipesSnapshot.docs.filter((recipeDoc) =>
      recipeUsesRecalcIngredient(recipeDoc.data() || {}, recalcIngredientMap)
    );
    report.affectedRecipeCount = affectedRecipes.length;

    for (const recipeDoc of affectedRecipes) {
      const recipeData = recipeDoc.data() || {};
      const recipeTitle = String(recipeData.title || recipeDoc.id);
      const ingredientItems = extractRecipeIngredientItems(recipeData);
      const regularIngredients = ingredientItems
          .map((item) => item.text)
          .filter((text) => !/#recipe:[^:]+:/i.test(text));
      const skippedRecipeLinkIngredients = ingredientItems
          .filter((item) => /#recipe:[^:]+:/i.test(item.text))
          .map((item) => item.text);

      if (regularIngredients.length === 0) {
        report.skippedRecipes.push({
          recipeId: recipeDoc.id,
          title: recipeTitle,
          reason: 'Keine berechenbaren Zutaten',
        });
        continue;
      }

      try {
        const calcResult = await calculateNutritionFromOpenFoodFactsCore({
          ingredients: regularIngredients,
          portionen: Number(recipeData.portionen) > 0 ? Number(recipeData.portionen) : 1,
          callerLabel: `nightly job (${recipeDoc.id})`,
          calcYieldGrams: recipeData?.naehrwerte?.calcYieldGrams ?? null,
          calcYieldFactor: recipeData?.naehrwerte?.calcYieldFactor ?? null,
        });
        const notIncluded = calcResult.details
            .filter((entry) => entry.found === false)
            .map((entry) => ({
              ingredient: entry.ingredient,
              error: entry.error || 'Nicht gefunden',
            }));
        skippedRecipeLinkIngredients.forEach((ingredient) => {
          notIncluded.push({
            ingredient,
            error: 'Rezept-Link konnte im Nachtjob nicht automatisch aufgelöst werden.',
            isRecipeLink: true,
          });
        });

        const updatedNaehrwerte = {
          ...(recipeData.naehrwerte || {}),
          ...calcResult.naehrwerte,
          calcPending: false,
          calcCompletedAt: Date.now(),
          calcError: null,
          calcNotIncluded: notIncluded.length > 0 ? notIncluded : null,
          calcFoundCount: calcResult.foundCount,
          calcTotalCount: calcResult.totalCount + skippedRecipeLinkIngredients.length,
          calcYieldGrams: recipeData?.naehrwerte?.calcYieldGrams ?? null,
          calcYieldFactor: recipeData?.naehrwerte?.calcYieldFactor ?? null,
          calcFinalWeightGrams: calcResult.calcFinalWeightGrams ?? null,
          calcPer100g: calcResult.calcPer100g ?? null,
        };

        // The nutrition figures have just changed, so the low-carb verdict may
        // have changed with them. Judged on the values about to be written, in
        // the same set() - no second read, no second write.
        const lowCarb = evaluateLowCarbTag({
          ...recipeData,
          naehrwerte: updatedNaehrwerte,
        });

        await recipeDoc.ref.set({
          naehrwerte: updatedNaehrwerte,
          ...(lowCarb.changed ? {kulinarik: lowCarb.kulinarik} : {}),
        }, {merge: true});

        report.updatedRecipes.push({
          recipeId: recipeDoc.id,
          title: recipeTitle,
          ...(lowCarb.changed ? {lowCarbAction: lowCarb.action} : {}),
        });
      } catch (error) {
        const errorMessage = error?.message || 'Unbekannter Fehler';
        report.failedRecipes.push({
          recipeId: recipeDoc.id,
          title: recipeTitle,
          error: errorMessage,
        });
        try {
          await recipeDoc.ref.set({
            naehrwerte: {
              ...(recipeData.naehrwerte || {}),
              calcPending: false,
              calcCompletedAt: Date.now(),
              calcError: errorMessage,
            },
          }, {merge: true});
        } catch (persistError) {
          console.error(`runNutritionRecalcForFlaggedRecipes: could not persist calcError for ${recipeDoc.id}`, persistError);
        }
      }
    }
  } catch (error) {
    report.fatalError = error?.message || 'Unbekannter Fehler im Nachtjob';
    console.error('runNutritionRecalcForFlaggedRecipes: fatal error', error);
  } finally {
    try {
      if (!report.fatalError && report.failedRecipes.length === 0) {
        report.resetRecalcCount = await setRecalcFalseForReferences(recalcReferenceDocs);
      }
    } catch (resetError) {
      report.fatalError = report.fatalError || `recalc-Reset fehlgeschlagen: ${resetError?.message || resetError}`;
      console.error('runNutritionRecalcForFlaggedRecipes: could not reset recalc flags', resetError);
    }
    report.finishedAt = Date.now();
    try {
      await sendNutritionRecalcSummary(report);
    } catch (mailError) {
      console.error('runNutritionRecalcForFlaggedRecipes: could not send summary email', mailError);
    }
  }

  return report;
}

exports.runNutritionRecalcForFlaggedRecipes = onCall(
    {
      timeoutSeconds: 10,
      maxInstances: 1,
      secrets: [geminiApiKey, smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom],
      invoker: 'public',
    },
    async (request) => {
      const callerUid = request.auth?.uid;
      if (!callerUid) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
      }

      const callerDoc = await admin.firestore().doc(`users/${callerUid}`).get();
      const callerData = callerDoc.exists ? (callerDoc.data() || {}) : {};
      const canRunManualRecalc = (
        callerData.role === 'admin' ||
        callerData.role === 'moderator'
      );
      if (!canRunManualRecalc) {
        throw new HttpsError('permission-denied', 'Admin or moderator role required.');
      }

      // Nur den Auftrag anlegen: Arbeit nach der Antwort eines Callables
      // drosselt Cloud Run fast auf null und darf sie jederzeit beenden.
      // processNutritionRecalcRequest führt ihn mit voller Laufzeit aus.
      await admin.firestore().collection('jobRequests').add({
        type: 'nutritionRecalc',
        triggeredBy: `manual:${callerUid}`,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        started: true,
        message: 'Recalc-Job gestartet. Ergebnis wird per E-Mail gesendet.',
      };
    }
);

/**
 * Führt einen manuell angeforderten Nährwert-Recalc aus (Auftrag aus
 * runNutritionRecalcForFlaggedRecipes). Der Trigger wartet bis zum Ende des
 * Jobs und behält dadurch die volle Rechenzeit, wie der Nachtlauf. Der
 * Auftrag wird danach gelöscht; Ergebnis und Fehler stehen in der Mail.
 */
exports.processNutritionRecalcRequest = onDocumentCreated(
    {
      document: 'jobRequests/{requestId}',
      timeoutSeconds: 540,
      maxInstances: 1,
      secrets: [geminiApiKey, smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom],
    },
    async (event) => {
      const data = event.data ? event.data.data() : null;
      if (!data || data.type !== 'nutritionRecalc') return;
      try {
        await runNutritionRecalcForFlaggedRecipesCore({triggeredBy: data.triggeredBy || 'manual'});
      } finally {
        await event.data.ref.delete().catch((err) => {
          console.error('processNutritionRecalcRequest: could not delete job request', err);
        });
      }
    },
);

exports.nightlyNutritionRecalc = onSchedule(
    {
      schedule: '0 2 * * *',
      timeZone: 'Europe/Berlin',
      timeoutSeconds: 540,
      maxInstances: 1,
      secrets: [geminiApiKey, smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom],
    },
    async () => {
      await runNutritionRecalcForFlaggedRecipesCore({triggeredBy: 'schedule'});
    }
);

/**
 * Applies the low-carb rules to every recipe in the collection - the one-time
 * full pass that gives the tag to the recipes nothing has touched since the
 * rules were introduced.
 *
 * Unlike the nutrition recalc this reads the stored values and does no
 * arithmetic of its own beyond evaluateLowCarbTag: no external lookups, no
 * recalculation, no e-mail. That makes it cheap enough to run inside the
 * request and hand the numbers straight back to the caller.
 *
 * Idempotent: a recipe whose tag is already correct produces no write at all,
 * so a second run touches nothing.
 *
 * @return {Promise<Object>} Counters describing what happened.
 */
/**
 * How many recipes each section of the low-carb report mail lists before it
 * falls back to a count. A mailbox is not a database export; on a large
 * collection the "skipped" section alone would otherwise run into thousands
 * of lines.
 */
const LOW_CARB_MAIL_LIST_LIMIT = 100;

/**
 * @param {number|null} value - A number for the report.
 * @param {number} digits - Decimal places.
 * @return {string} The formatted number, or a dash when there is none.
 */
function formatLowCarbNumber(value, digits = 1) {
  return typeof value === 'number' && Number.isFinite(value) ?
    value.toFixed(digits) :
    '-';
}

/**
 * The numbers a verdict rested on, as one readable phrase.
 *
 * @param {Object} entry - A report entry.
 * @return {string} e.g. "12.0 % Energie aus KH, 30.0 g KH/Portion (2 Portionen, Basis: per100g)".
 */
function formatLowCarbEntryNumbers(entry) {
  return `${formatLowCarbNumber(entry.energyPercent)} % Energie aus KH, ` +
    `${formatLowCarbNumber(entry.carbsPerPortionG)} g KH/Portion ` +
    `(${entry.portionen} Portion(en), Basis: ${entry.basisSource})`;
}

/**
 * Builds the report mail for the low-carb full pass.
 *
 * @param {Object} report - What runLowCarbFullTaggingCore returned, plus
 *   triggeredBy and finishedAt.
 * @param {string} runAt - Localised timestamp for the header.
 * @return {{subject: string, text: string, html: string}} The message.
 */
function buildLowCarbTaggingMail(report, runAt) {
  const status = report.failed === 0 ? '✅ Erfolgreich' : '⚠️ Mit Fehlern';
  const subject = `[RecipeBook] Low-Carb-Klassifikation ${status} (${runAt})`;

  const judged = report.basisCounts.per100g + report.basisCounts.total;
  const basisNote = report.basisCounts.total > 0 ?
    `${report.basisCounts.total} von ${judged} bewerteten Rezepten wurden auf Basis der ` +
    'gespeicherten Gesamtwerte beurteilt statt auf Basis der eindeutigen 100-g-Werte. ' +
    'Bei diesen hängt das Ergebnis davon ab, welcher Schreibweg die Nährwerte zuletzt ' +
    'gesetzt hat – ein hoher Anteil ist ein Grund, die Werte stichprobenartig zu prüfen.' :
    'Alle bewerteten Rezepte wurden auf Basis der eindeutigen 100-g-Werte beurteilt.';

  const textSection = (heading, entries, formatter) => {
    if (!entries || entries.length === 0) return '';
    const shown = entries.slice(0, LOW_CARB_MAIL_LIST_LIMIT);
    let out = `\n${heading} (${entries.length}):\n`;
    shown.forEach((entry) => {
      out += `- ${formatter(entry)}\n`;
    });
    if (entries.length > shown.length) {
      out += `- ... und ${entries.length - shown.length} weitere\n`;
    }
    return out;
  };

  let text = `Low-Carb-Klassifikation\n`;
  text += `Ausgeführt: ${runAt}\n`;
  text += `Ausgelöst von: ${report.triggeredBy}\n`;
  text += `Rezepte gesamt: ${report.total}\n`;
  text += `Neu Low Carb: ${report.added}\n`;
  text += `Tag entfernt: ${report.removed}\n`;
  text += `Unverändert: ${report.unchanged}\n`;
  text += `Übersprungen: ${report.skipped} (unvollständige Nährwerte)\n`;
  text += `Geschrieben: ${report.written}\n`;
  text += `Fehler: ${report.failed}\n`;
  text += `\nRechengrundlage: ${report.basisCounts.per100g} x 100-g-Werte, `;
  text += `${report.basisCounts.total} x Gesamtwerte\n${basisNote}\n`;

  text += textSection(
      'Neu als Low Carb getaggt',
      report.addedRecipes,
      (entry) => `${entry.title} (${entry.recipeId}): ${formatLowCarbEntryNumbers(entry)}`
  );
  text += textSection(
      'Tag entfernt',
      report.removedRecipes,
      (entry) => `${entry.title} (${entry.recipeId}): ${formatLowCarbEntryNumbers(entry)}`
  );
  text += textSection(
      'Übersprungen',
      report.skippedRecipes,
      (entry) => `${entry.title} (${entry.recipeId}): ${entry.reason}`
  );
  text += textSection(
      'Fehler',
      report.failedRecipes,
      (entry) => `${entry.recipeId}: ${entry.error}`
  );

  const htmlSection = (heading, entries, formatter) => {
    if (!entries || entries.length === 0) return '';
    const shown = entries.slice(0, LOW_CARB_MAIL_LIST_LIMIT);
    const items = shown.map((entry) => `<li>${formatter(entry)}</li>`).join('');
    const more = entries.length > shown.length ?
      `<li>... und ${entries.length - shown.length} weitere</li>` :
      '';
    return `<h3>${escapeNutritionRecalcHtml(heading)} (${entries.length})</h3><ul>${items}${more}</ul>`;
  };

  const htmlRecipe = (entry) =>
    `<strong>${escapeNutritionRecalcHtml(entry.title)}</strong> ` +
    `(${escapeNutritionRecalcHtml(entry.recipeId)})<br>` +
    `<small>${escapeNutritionRecalcHtml(formatLowCarbEntryNumbers(entry))}</small>`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:760px">
      <h2>Low-Carb-Klassifikation</h2>
      <p><strong>Ausgeführt:</strong> ${escapeNutritionRecalcHtml(runAt)}</p>
      <p><strong>Ausgelöst von:</strong> ${escapeNutritionRecalcHtml(report.triggeredBy)}</p>
      <p><strong>Rezepte gesamt:</strong> ${report.total}</p>
      <p><strong>Neu Low Carb:</strong> ${report.added}</p>
      <p><strong>Tag entfernt:</strong> ${report.removed}</p>
      <p><strong>Unverändert:</strong> ${report.unchanged}</p>
      <p><strong>Übersprungen:</strong> ${report.skipped} (unvollständige Nährwerte)</p>
      <p><strong>Geschrieben:</strong> ${report.written}</p>
      <p><strong>Fehler:</strong> ${report.failed}</p>
      <p style="background:#f5f5f5;padding:12px;border-radius:6px">
        <strong>Rechengrundlage:</strong>
        ${report.basisCounts.per100g} x 100-g-Werte, ${report.basisCounts.total} x Gesamtwerte<br>
        <small>${escapeNutritionRecalcHtml(basisNote)}</small>
      </p>
      ${htmlSection('Neu als Low Carb getaggt', report.addedRecipes, htmlRecipe)}
      ${htmlSection('Tag entfernt', report.removedRecipes, htmlRecipe)}
      ${htmlSection('Übersprungen', report.skippedRecipes, (entry) =>
    `${escapeNutritionRecalcHtml(entry.title)} ` +
        `(${escapeNutritionRecalcHtml(entry.recipeId)}): ${escapeNutritionRecalcHtml(entry.reason)}`)}
      ${htmlSection('Fehler', report.failedRecipes, (entry) =>
    `${escapeNutritionRecalcHtml(entry.recipeId)}: ${escapeNutritionRecalcHtml(entry.error)}`)}
    </div>
  `;

  return {subject, text, html};
}

/**
 * Mails the low-carb report to the admins.
 *
 * @param {Object} report - runLowCarbFullTaggingCore's result plus
 *   triggeredBy and finishedAt.
 * @return {Promise<boolean>} Whether a mail was actually sent.
 */
async function sendLowCarbTaggingSummary(report) {
  const runAt = new Date(report.finishedAt || Date.now())
      .toLocaleString('de-DE', {timeZone: 'Europe/Berlin'});
  const mailContent = buildLowCarbTaggingMail(report, runAt);
  return sendAdminReportMail({
    subject: mailContent.subject,
    text: mailContent.text,
    html: mailContent.html,
    logLabel: 'runLowCarbFullTagging',
  });
}

async function runLowCarbFullTaggingCore() {
  const db = admin.firestore();
  const stats = {
    total: 0, added: 0, removed: 0, unchanged: 0, skipped: 0, failed: 0, written: 0,
  };

  // Per-recipe detail for the report mail. Counters alone say how many recipes
  // moved; only these say which ones, and on what numbers the verdict rested.
  const detail = {
    addedRecipes: [],
    removedRecipes: [],
    skippedRecipes: [],
    failedRecipes: [],
    // How many verdicts rested on the unambiguous per-100-g values and how
    // many on the stored totals, whose meaning differs between the write
    // paths. A high 'total' share is the signal to look closer.
    basisCounts: {per100g: 0, total: 0},
  };

  const recipesSnapshot = await db.collection('recipes').get();
  // docs.length rather than snapshot.size: the same number, but read off the
  // array this function iterates anyway.
  stats.total = recipesSnapshot.docs.length;

  // Only the recipes that actually need a write are collected. Everything else
  // never reaches a batch, which is what keeps repeated runs free of writes.
  const pendingWrites = [];

  for (const recipeDoc of recipesSnapshot.docs) {
    try {
      const recipeData = recipeDoc.data() || {};
      const result = evaluateLowCarbTag(recipeData);
      const entry = {
        recipeId: recipeDoc.id,
        title: String(recipeData.title || recipeDoc.id),
        energyPercent: result.energyPercent,
        carbsPerPortionG: result.carbsPerPortionG,
        basisSource: result.basisSource,
        portionen: result.portionen,
      };

      if (result.action === 'skipped') {
        stats.skipped += 1;
        detail.skippedRecipes.push({...entry, reason: result.reason});
      } else {
        // Only recipes that were actually judged say anything about the basis.
        if (result.basisSource === 'per100g') detail.basisCounts.per100g += 1;
        else detail.basisCounts.total += 1;

        if (result.action === 'added') {
          stats.added += 1;
          detail.addedRecipes.push(entry);
        } else if (result.action === 'removed') {
          stats.removed += 1;
          detail.removedRecipes.push(entry);
        } else {
          stats.unchanged += 1;
        }
      }

      if (result.changed) {
        pendingWrites.push({ref: recipeDoc.ref, kulinarik: result.kulinarik});
      }
    } catch (error) {
      // One bad recipe must not take the run down with it.
      stats.failed += 1;
      const errorMessage = error?.message || String(error);
      detail.failedRecipes.push({recipeId: recipeDoc.id, error: errorMessage});
      console.error(
          `runLowCarbFullTagging: ${recipeDoc.id}: ${errorMessage}`,
      );
    }
  }

  // Firestore allows 500 operations per batch. That is a hard limit, not a
  // guideline - one more and the whole commit is rejected.
  const BATCH_SIZE = 500;
  for (let i = 0; i < pendingWrites.length; i += BATCH_SIZE) {
    const chunk = pendingWrites.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach(({ref, kulinarik}) => batch.update(ref, {kulinarik}));

    try {
      await batch.commit();
      stats.written += chunk.length;
    } catch (error) {
      // A failed batch is reported and the run carries on with the next one,
      // rather than leaving the remaining recipes untouched.
      stats.failed += chunk.length;
      const errorMessage = error?.message || String(error);
      detail.failedRecipes.push({
        recipeId: `Batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} Rezepte)`,
        error: errorMessage,
      });
      console.error(
          `runLowCarbFullTagging: batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ` +
          `${errorMessage}`,
      );
    }
  }

  return {...stats, ...detail};
}

/**
 * Callable Cloud Function: the one-time low-carb full pass, startable from the
 * Kuechenbetrieb page so that it needs no local checkout, no service account
 * key and no terminal.
 *
 * Runs synchronously and returns its counters rather than mailing them: the
 * pass is one collection read plus the batched writes for the recipes that
 * actually change, so the caller can simply wait for it.
 */
exports.runLowCarbFullTagging = onCall(
    {
      timeoutSeconds: 300,
      maxInstances: 1,
      secrets: [smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom],
      invoker: 'public',
    },
    async (request) => {
      const callerUid = request.auth?.uid;
      if (!callerUid) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
      }

      const callerDoc = await admin.firestore().doc(`users/${callerUid}`).get();
      const callerData = callerDoc.exists ? (callerDoc.data() || {}) : {};
      const canRunFullTagging = (
        callerData.role === 'admin' ||
        callerData.role === 'moderator'
      );
      if (!canRunFullTagging) {
        throw new HttpsError('permission-denied', 'Admin or moderator role required.');
      }

      const report = await runLowCarbFullTaggingCore();
      const {
        addedRecipes, removedRecipes, skippedRecipes, failedRecipes, basisCounts, ...stats
      } = report;
      console.log(`runLowCarbFullTagging: triggered by ${callerUid}`, stats);

      // The per-recipe lists go into the mail, not into the response: the page
      // shows the counters, and a few thousand entries have no business
      // crossing the wire to a browser.
      let mailed = false;
      try {
        mailed = await sendLowCarbTaggingSummary({
          ...report,
          triggeredBy: callerData.email || callerUid,
          finishedAt: Date.now(),
        });
      } catch (mailError) {
        // The tagging already happened and is the point of the call. A mail
        // that cannot be sent is worth logging, not worth failing over.
        console.error('runLowCarbFullTagging: could not send summary email', mailError);
      }

      return {
        completed: true,
        ...stats,
        basisCounts,
        mailed,
        message:
          `${stats.total} Rezepte geprüft: ${stats.added} neu als Low Carb getaggt, ` +
          `${stats.removed} Tag entfernt, ${stats.unchanged} unverändert, ` +
          `${stats.skipped} übersprungen (unvollständige Nährwerte).` +
          (mailed ? ' Die Rezeptliste wurde per E-Mail verschickt.' : ''),
      };
    }
);

/**
 * Season status constants – must stay in sync with
 * src/utils/seasonMatrix.js CURRENT_SEASON_STATUS.
 */
const CURRENT_SEASON_STATUS = {
  HAUPTSAISON: 'Hauptsaison',
  NEBENSAISON: 'Nebensaison',
  BALD_SAISON: 'Bald_Saison',
  KEINE_SAISON: 'Keine_Saison',
};

/**
 * Computes the current season status for one season matrix entry.
 *
 * @param {Object} entry - Firestore season matrix document data
 * @param {Date} date - Reference date (defaults to today)
 * @returns {string} One of CURRENT_SEASON_STATUS values
 */
function computeCurrentSeasonStatus(entry, date = new Date()) {
  const mainMonths = Array.isArray(entry.mainSeasonMonths) ? entry.mainSeasonMonths : [];
  const secondaryMonths = Array.isArray(entry.secondarySeasonMonths) ?
    entry.secondarySeasonMonths :
    [];

  const currentMonth = date.getMonth() + 1; // 1–12

  if (mainMonths.includes(currentMonth)) return CURRENT_SEASON_STATUS.HAUPTSAISON;
  if (secondaryMonths.includes(currentMonth)) return CURRENT_SEASON_STATUS.NEBENSAISON;

  // Check if a main-season month starts within the next 7 days
  for (let i = 1; i <= 7; i++) {
    const futureDate = new Date(date);
    futureDate.setDate(futureDate.getDate() + i);
    const futureMonth = futureDate.getMonth() + 1;
    if (mainMonths.includes(futureMonth)) return CURRENT_SEASON_STATUS.BALD_SAISON;
  }

  return CURRENT_SEASON_STATUS.KEINE_SAISON;
}

/**
 * Scheduled Cloud Function: update the `currentSeasonStatus` field on every
 * season matrix entry once per day.
 *
 * Schedule: every day at 03:00 Europe/Berlin (MEZ/MESZ).
 */
exports.updateSeasonMatrixStatus = onSchedule(
    {
      schedule: '0 3 * * *',
      timeZone: 'Europe/Berlin',
    },
    async (_event) => {
      const db = admin.firestore();
      const snapshot = await db.collection('seasonMatrix').get();

      if (snapshot.empty) {
        console.log('updateSeasonMatrixStatus: no entries found, nothing to update');
        return;
      }

      const today = new Date();
      const batch = db.batch();

      snapshot.forEach((docSnap) => {
        const entry = docSnap.data();
        const status = computeCurrentSeasonStatus(entry, today);
        batch.update(docSnap.ref, {currentSeasonStatus: status});
      });

      await batch.commit();
      console.log(
          `updateSeasonMatrixStatus: updated ${snapshot.size} entries` +
          ` for ${today.toISOString().slice(0, 10)}`,
      );
    },
);

exports.onNutritionReferenceChanged = onDocumentWritten(
    {document: 'nutritionReferences/{refId}'},
    async () => {
      try {
        await admin.firestore()
            .collection('appConfig')
            .doc('nutritionReferences')
            .set({lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true});
      } catch (err) {
        console.error('onNutritionReferenceChanged: failed to update lastUpdatedAt', err);
      }
    },
);
