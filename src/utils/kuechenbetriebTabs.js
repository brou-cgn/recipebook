import { hasMissingIngredientIDs } from './ingredientIdMatching';

export const KUECHENBETRIEB_TABS = {
  APP: 'app',
  RECIPE: 'recipe',
  NOLINK: 'nolink',
  NAEHRWERT: 'naehrwert',
  MISSING_INGREDIENT_IDS: 'missingIngredientIDs',
  KULINARIKTYPEN: 'kulinariktypen',
  STANDARDEINHEITEN: 'standardeinheiten',
  KOCHATELIER: 'kochatelier',
};

export function hasNotIncludedNutritionIngredients(recipe) {
  return Array.isArray(recipe?.naehrwerte?.calcNotIncluded) && recipe.naehrwerte.calcNotIncluded.length > 0;
}

function parsePositiveAmount(value) {
  if (value == null) return null;
  const normalized = String(value).trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function hasPendingManualAmountNutritionIngredients(recipe) {
  const ingredientDetails = recipe?.naehrwerte?.calcIngredientDetails;
  if (!Array.isArray(ingredientDetails) || ingredientDetails.length === 0) return false;
  const manualAmounts = recipe?.naehrwerte?.calcManualAmountsG || {};
  return ingredientDetails.some((detail) => {
    if (detail?.noAmountG !== true) return false;
    const ingredient = typeof detail?.ingredient === 'string' ? detail.ingredient : '';
    return parsePositiveAmount(manualAmounts[ingredient]) == null;
  });
}

export function needsNutritionRecalc(recipe, nutritionReferenceRows = []) {
  if (!Array.isArray(nutritionReferenceRows) || nutritionReferenceRows.length === 0) return false;

  const toMs = (value) => {
    if (value == null) return null;
    if (value?.toMillis) return value.toMillis();
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    return null;
  };

  const recalcDateMap = new Map(
    nutritionReferenceRows
      .filter((row) => row?.recalc === true)
      .map((row) => {
        const ingredientID = String(row?.ingredientID || '').trim();
        if (!ingredientID) return null;
        return [ingredientID, toMs(row?.recalcDate)];
      })
      .filter(Boolean)
  );

  if (recalcDateMap.size === 0) return false;

  const calcCompletedAtMs = toMs(recipe?.naehrwerte?.calcCompletedAt ?? null);
  const rawIngredients = Array.isArray(recipe?.zutaten)
    ? recipe.zutaten
    : (Array.isArray(recipe?.ingredients) ? recipe.ingredients : []);

  return rawIngredients.some((item) => {
    if (!item || typeof item !== 'object' || item.type === 'heading') return false;
    const ingredientID = String(item.ingredientID || '').trim();
    if (!ingredientID || !recalcDateMap.has(ingredientID)) return false;
    const recalcDateMs = recalcDateMap.get(ingredientID);
    if (recalcDateMs == null) return true;
    if (calcCompletedAtMs == null) return true;
    return recalcDateMs > calcCompletedAtMs;
  });
}

export function hasProblematicCompletedNutritionCalculation(recipe, nutritionReferenceRows = []) {
  if (!recipe?.naehrwerte || recipe.naehrwerte?.calcPending === true) return false;
  return (
    needsNutritionRecalc(recipe, nutritionReferenceRows)
    || hasNotIncludedNutritionIngredients(recipe)
    || hasPendingManualAmountNutritionIngredients(recipe)
  );
}

export function getKuechenbetriebFabConfig({ recipes = [], nutritionReferenceRows = [], cuisineProposals = [] } = {}) {
  const hasNutritionIssues = recipes.some((recipe) => hasProblematicCompletedNutritionCalculation(recipe, nutritionReferenceRows));
  const hasMissingIngredientIds = recipes.some((recipe) => hasMissingIngredientIDs(recipe, nutritionReferenceRows));
  const hasOpenCuisineProposals = Array.isArray(cuisineProposals) && cuisineProposals.length > 0;

  const visibleTabs = [
    hasNutritionIssues ? KUECHENBETRIEB_TABS.NAEHRWERT : null,
    hasMissingIngredientIds ? KUECHENBETRIEB_TABS.MISSING_INGREDIENT_IDS : null,
    hasOpenCuisineProposals ? KUECHENBETRIEB_TABS.KULINARIKTYPEN : null,
  ].filter(Boolean);

  const activeTab = hasMissingIngredientIds
    ? KUECHENBETRIEB_TABS.MISSING_INGREDIENT_IDS
    : hasNutritionIssues
      ? KUECHENBETRIEB_TABS.NAEHRWERT
      : hasOpenCuisineProposals
        ? KUECHENBETRIEB_TABS.KULINARIKTYPEN
        : null;

  return {
    hasNutritionIssues,
    hasMissingIngredientIds,
    hasOpenCuisineProposals,
    visibleTabs,
    activeTab,
    showFab: visibleTabs.length > 0,
  };
}
