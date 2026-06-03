import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { parseIngredientNameAndUnit } from './ingredientIdMatching';
import {
  NUTRITION_REFERENCE_FIELDS,
  NUTRITION_REFERENCE_CHECK_STATUS,
  NUTRITION_REFERENCE_DATA_COLLECTION_PENDING_STATUS,
  NUTRITION_REFERENCE_EMPTY_STATUS,
  NUTRITION_REFERENCE_NEW_STATUS,
  normalizeNutritionReferenceId,
  parseNutritionReferenceStatus,
  scaleNutritionValues,
} from './nutritionReferenceUtils';

const DIRECT_REFERENCE_SOURCES_WHEN_CHECK_PENDING = new Set(['openfoodfacts', 'manual']);
const GENERATED_NUTRITION_REQUIRED_FIELDS = ['kalorien', 'protein', 'fett', 'kohlenhydrate'];

function hasMeaningfulGeneratedNutrition(values) {
  return GENERATED_NUTRITION_REQUIRED_FIELDS.some((field) => (values?.[field] ?? 0) > 0);
}

function hasAnyNutritionData(values) {
  return NUTRITION_REFERENCE_FIELDS.some((field) => (values?.[field] ?? 0) > 0);
}

export function computeIngredientAmountG(ingredientText, referenceRow) {
  const { quantity, unit } = parseIngredientNameAndUnit(ingredientText);
  const normalizedUnit = unit ? normalizeNutritionReferenceId(unit) : null;

  if (normalizedUnit === 'g') {
    return quantity != null ? quantity : null;
  }
  if (normalizedUnit === 'kg') {
    return quantity != null ? quantity * 1000 : null;
  }

  // For other units or no unit, scale by defaultAmountG from the reference row
  const defaultAmountG = referenceRow?.defaultAmountG;
  if (defaultAmountG != null) {
    const multiplier = quantity != null ? quantity : 1;
    return multiplier * defaultAmountG;
  }

  return null;
}

export async function resolveIngredientNutritionByStatus(ingredientObj, referenceRow, deps = {}) {
  const ingredientID = String(ingredientObj?.ingredientID || referenceRow?.ingredientID || '').trim();
  if (!ingredientID || !referenceRow) {
    return { found: false, error: 'Keine ingredientID zugeordnet' };
  }

  const ingredientText = ingredientObj?.text || '';
  const callableFactory = deps.httpsCallable || httpsCallable;
  const callableFunctions = deps.functions;
  const firestoreDb = deps.db;
  const getDocFn = deps.getDoc || getDoc;
  const docFn = deps.doc || doc;

  let amountG = computeIngredientAmountG(ingredientText, referenceRow);
  if (amountG == null) {
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

  if (amountG == null && referenceRow?.defaultAmountG != null) {
    amountG = referenceRow.defaultAmountG;
  }

  if (amountG == null) {
    return { found: false, error: 'Mengenangabe konnte nicht ermittelt werden' };
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
  if (shouldGenerateNutrition) {
    const generateNutrition = callableFactory(callableFunctions, 'generateNutritionFromReference');
    if (typeof generateNutrition === 'function') {
      const result = await generateNutrition({
        ingredientID,
        nutritionFamily: referenceRow?.nutritionFamily || '',
        category: referenceRow?.category || '',
      });
      const { values, searchTerm: returnedSearchTerm, source: returnedSource } = result?.data || {};
      if (hasMeaningfulGeneratedNutrition(values)) {
        rowToUse = {
          ...values,
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
    }
  }

  if (!hasAnyNutritionData(rowToUse)) {
    return { found: false, error: 'Nährwerte konnten nicht ermittelt werden (Datenerfassung ausstehend)' };
  }

  return {
    found: true,
    naehrwerte: scaleNutritionValues(rowToUse, amountG),
    amountG,
    source: rowToUse?.source || referenceRow?.source || '',
    searchTerm: rowToUse?.searchTerm || null,
    aiEstimated: String(rowToUse?.source || '').trim().toLowerCase() === 'ai-generiert',
    fromReference: true,
  };
}
