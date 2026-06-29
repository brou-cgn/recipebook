import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { parseIngredientNameAndUnit } from './ingredientIdMatching';
import {
  NUTRITION_REFERENCE_FIELDS,
  NUTRITION_REFERENCE_CHECK_STATUS,
  NUTRITION_REFERENCE_DATA_COLLECTION_PENDING_STATUS,
  NUTRITION_REFERENCE_EMPTY_STATUS,
  NUTRITION_REFERENCE_NEW_STATUS,
  buildNutritionTrackingFields,
  buildSourceNutritionFields,
  getNutritionValuesForSource,
  getStatusAfterNutritionFetch,
  normalizeNutritionReferenceId,
  parseNutritionReferenceStatus,
  parseNutritionReferenceValues,
  scaleNutritionValues,
} from './nutritionReferenceUtils';

const DIRECT_REFERENCE_SOURCES_WHEN_CHECK_PENDING = new Set(['openfoodfacts', 'manual']);
const GENERATED_NUTRITION_REQUIRED_FIELDS = ['kalorien', 'protein', 'fett', 'kohlenhydrate'];

/**
 * Returns true only when at least one of the core macronutrient fields (kalorien,
 * protein, fett, kohlenhydrate) is a positive number.  Both paths that write
 * generated nutrition back to Firestore (resolveIngredientNutritionByStatus and
 * refreshRowFromOpenFoodFacts) use this guard so the write rule is identical.
 */
export function hasMeaningfulGeneratedNutrition(values) {
  return GENERATED_NUTRITION_REQUIRED_FIELDS.some((field) => (values?.[field] ?? 0) > 0);
}

function hasAnyNutritionData(values) {
  return NUTRITION_REFERENCE_FIELDS.some((field) => (values?.[field] ?? 0) > 0);
}

export function computeIngredientAmountG(ingredientText) {
  const { quantity, unit } = parseIngredientNameAndUnit(ingredientText);
  const normalizedUnit = unit ? normalizeNutritionReferenceId(unit) : null;

  if (normalizedUnit === 'g') {
    return quantity != null ? quantity : null;
  }
  if (normalizedUnit === 'kg') {
    return quantity != null ? quantity * 1000 : null;
  }

  return null;
}

export async function resolveIngredientNutritionByStatus(ingredientObj, referenceRow, deps = {}) {
  const ingredientID = String(ingredientObj?.ingredientID || referenceRow?.ingredientID || '').trim();
  if (!ingredientID || !referenceRow) {
    return { found: false, error: 'Keine ingredientID zugeordnet' };
  }

  if (referenceRow.nutritionRelevant === false) {
    return { found: false, skipped: true, notNutritionRelevant: true };
  }

  const ingredientText = ingredientObj?.text || '';
  const { quantity } = parseIngredientNameAndUnit(ingredientText);
  const hasExplicitQuantity = quantity != null;
  const callableFactory = deps.httpsCallable || httpsCallable;
  const callableFunctions = deps.functions;
  const firestoreDb = deps.db;
  const getDocFn = deps.getDoc || getDoc;
  const setDocFn = deps.setDoc || setDoc;
  const docFn = deps.doc || doc;

  let amountG = computeIngredientAmountG(ingredientText, referenceRow);
  if (amountG == null && hasExplicitQuantity) {
    try {
      const parseAmount = callableFactory(callableFunctions, 'parseIngredientAmountG');
      if (typeof parseAmount === 'function') {
        const parsedResult = await parseAmount({ ingredientText });
        amountG = parsedResult?.data?.amountG ?? null;
      }
    } catch {
      console.warn(`parseIngredientAmountG failed for "${ingredientText}"`);
      amountG = null;
    }
  }

  if (!hasExplicitQuantity && amountG == null && referenceRow?.defaultAmountG != null) {
    amountG = referenceRow.defaultAmountG;
  }

  const status = parseNutritionReferenceStatus(referenceRow);
  const source = String(referenceRow?.source || '').trim().toLowerCase();
  const shouldGenerateNutrition =
    status === NUTRITION_REFERENCE_EMPTY_STATUS ||
    status === NUTRITION_REFERENCE_DATA_COLLECTION_PENDING_STATUS ||
    status === NUTRITION_REFERENCE_NEW_STATUS ||
    (status === NUTRITION_REFERENCE_CHECK_STATUS &&
      !DIRECT_REFERENCE_SOURCES_WHEN_CHECK_PENDING.has(source));

  let rowToUse = referenceRow;
  let wroteBackReference = false;
  let writebackError = null;
  if (shouldGenerateNutrition) {
    const generateNutrition = callableFactory(callableFunctions, 'generateNutritionFromReference');
    if (typeof generateNutrition === 'function') {
      try {
        const result = await generateNutrition({
          ingredientID,
          nutritionFamily: referenceRow?.nutritionFamily || '',
          category: referenceRow?.category || '',
        });
        const { values, searchTerm: returnedSearchTerm, source: returnedSource } = result?.data || {};
        if (hasMeaningfulGeneratedNutrition(values)) {
          const parsedValues = parseNutritionReferenceValues(values || {});
          const nextStatus = getStatusAfterNutritionFetch(status);
          if (firestoreDb && typeof setDocFn === 'function') {
            try {
              await setDocFn(
                docFn(firestoreDb, 'nutritionReferences', ingredientID),
                {
                  source: String(returnedSource || '').trim(),
                  status: nextStatus,
                  ...(returnedSearchTerm ? { searchTerm: returnedSearchTerm } : {}),
                  ...parsedValues,
                  ...buildSourceNutritionFields(parsedValues, returnedSource),
                  ...buildNutritionTrackingFields({
                    previousData: referenceRow || {},
                    nextValues: parsedValues,
                    nextSource: returnedSource,
                    preserveOnManualSourceChange: true,
                    fromNutritionGeneration: true,
                  }),
                },
                { merge: true }
              );
              wroteBackReference = true;
            } catch (error) {
              console.warn(`nutrition writeback failed for "${ingredientID}"`, error);
              writebackError = error;
            }
          }
          rowToUse = {
            ...parsedValues,
            ingredientID,
            searchTerm: returnedSearchTerm,
            source: returnedSource,
          };
        } else if (firestoreDb) {
          // Fallback: read from Firestore (for backward compatibility)
          const refreshedSnapshot = await getDocFn(docFn(firestoreDb, 'nutritionReferences', ingredientID));
          if (refreshedSnapshot.exists()) {
            rowToUse = { ...refreshedSnapshot.data(), ingredientID };
          }
        }
      } catch (generateError) {
        console.warn(`generateNutritionFromReference failed for "${ingredientID}", falling back to existing referenceRow data`, generateError);
      }
    }
  }

  const nutritionValues = getNutritionValuesForSource(rowToUse, rowToUse?.source || referenceRow?.source || '');

  if (!hasAnyNutritionData(nutritionValues)) {
    return { found: false, error: 'Nährwerte konnten nicht ermittelt werden (Datenerfassung ausstehend)' };
  }

  if (amountG == null) {
    return {
      found: false,
      noAmountG: true,
      naehrwerte: nutritionValues,
      source: rowToUse?.source || referenceRow?.source || '',
      searchTerm: rowToUse?.searchTerm || null,
      aiEstimated: String(rowToUse?.source || '').trim().toLowerCase() === 'ai-generiert',
      fromReference: true,
      wroteBackReference,
      writebackError,
      error: 'Mengenangabe konnte nicht ermittelt werden',
    };
  }

  return {
    found: true,
    naehrwerte: scaleNutritionValues(nutritionValues, amountG),
    amountG,
    source: rowToUse?.source || referenceRow?.source || '',
    searchTerm: rowToUse?.searchTerm || null,
    aiEstimated: String(rowToUse?.source || '').trim().toLowerCase() === 'ai-generiert',
    fromReference: true,
    wroteBackReference,
    writebackError,
  };
}
