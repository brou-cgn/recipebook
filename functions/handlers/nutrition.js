/**
 * nutrition: aus index.js ausgelagert (Tech-Check F2).
 */

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const {createNutritionNormalizationUtils} = require('../nutritionNormalization');
const {requireAiCaller} = require('../shared/auth');
const {ALLOWED_ORIGINS} = require('../shared/common');
const {NUTRITION_REFERENCE_COLLECTION, NUTRITION_REFERENCE_FIELDS, NUTRITION_SOURCE_SUFFIX_OFF, NUTRITION_SOURCE_SUFFIX_AI, NUTRITION_SOURCE_SUFFIX_MANUAL, parseNutritionReferenceValues, parseNutritionReferenceNumber, calculateNutritionFromOpenFoodFactsCore} = require('../shared/nutritionCore');
const {consumeDailyQuota} = require('../shared/rateLimit');
const {geminiApiKey} = require('../shared/secrets');

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

// 5% Kalorienabweichung zwischen actual/outdated setzt recalc=true.
const NUTRITION_RECALC_CALORIE_THRESHOLD = 0.05;

const ZERO_CALORIE_BASELINE = 1;

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
        GoogleGenAI: require('@google/genai').GoogleGenAI,
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
        GoogleGenAI: require('@google/genai').GoogleGenAI,
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

