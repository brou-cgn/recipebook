/**
 * Von mehreren Function-Gruppen genutzte Helfer (importLists; aus index.js, Tech-Check F2).
 */

const admin = require('firebase-admin');
const {normalizeCuisines, suggestNewCuisines} = require('../cuisineNormalization');

const RECIPE_EXTRACTION_PROMPT_CACHE_TTL_MS = 5 * 60 * 1000;

// Configured cuisine types / meal categories from settings/app, cached like
// the prompt above. Imports used to rely on the caller sending these lists -
// Shortcut jobs and the Instagram Shortcut never did, so Gemini got a
// hard-coded "Italienisch/Deutsch" list instead of "Italienische Küche" etc.
let importListsCache = null;

let importListsCacheExpiry = 0;

/**
 * Load cuisineTypes/mealCategories from settings/app (fallback: defaults).
 * @return {Promise<{cuisineTypes: string[], mealCategories: string[]}>}
 */
async function getConfiguredImportLists() {
  if (importListsCache && Date.now() < importListsCacheExpiry) {
    return importListsCache;
  }
  let data = {};
  try {
    const settingsDoc = await admin.firestore().collection('settings').doc('app').get();
    data = settingsDoc.exists ? (settingsDoc.data() || {}) : {};
  } catch (err) {
    console.error('getConfiguredImportLists: could not read settings/app, using defaults:', err);
  }
  const lists = {
    cuisineTypes: Array.isArray(data.cuisineTypes) && data.cuisineTypes.length > 0 ?
      data.cuisineTypes : FALLBACK_CUISINE_TYPES,
    mealCategories: Array.isArray(data.mealCategories) && data.mealCategories.length > 0 ?
      data.mealCategories : FALLBACK_MEAL_CATEGORIES,
  };
  importListsCache = lists;
  importListsCacheExpiry = Date.now() + RECIPE_EXTRACTION_PROMPT_CACHE_TTL_MS;
  return lists;
}

/**
 * Use the lists the caller sent if present, otherwise the configured ones.
 * @param {string[]|undefined} cuisineTypes
 * @param {string[]|undefined} mealCategories
 * @return {Promise<{cuisineTypes: string[], mealCategories: string[]}>}
 */
async function resolveImportLists(cuisineTypes, mealCategories) {
  const hasCuisines = Array.isArray(cuisineTypes) && cuisineTypes.length > 0;
  const hasCategories = Array.isArray(mealCategories) && mealCategories.length > 0;
  if (hasCuisines && hasCategories) return {cuisineTypes, mealCategories};
  const configured = await getConfiguredImportLists();
  return {
    cuisineTypes: hasCuisines ? cuisineTypes : configured.cuisineTypes,
    mealCategories: hasCategories ? mealCategories : configured.mealCategories,
  };
}

/**
 * AI result cuisine fields mapped onto the configured cuisine types:
 * `cuisine` (first match, string - the shape existing consumers expect),
 * `cuisines` (all matches, e.g. ["Italienische Küche", "Vegetarisch"]) and
 * `cuisineSuggestions` (values without a configured type, offered in the
 * import review as a new type - never created automatically).
 * @param {string|string[]|null|undefined} raw - kulinarik as returned by Gemini
 * @param {string[]} cuisineTypes
 * @return {{cuisine: string, cuisines: string[], cuisineSuggestions: string[]}}
 */
function cuisineFields(raw, cuisineTypes) {
  const cuisines = normalizeCuisines(raw, cuisineTypes);
  const cuisineSuggestions = suggestNewCuisines(raw, cuisineTypes);
  return {cuisine: cuisines[0] || '', cuisines, cuisineSuggestions};
}

/**
 * Normalizes ingredient unit abbreviations to their full German names.
 * Replaces standalone "EL"/"El" with "Esslöffel" and "TL"/"Tl" with "Teelöffel".
 * Acts as a safety net when Gemini ignores the prompt instruction to use full unit names.
 *
 * @param {string[]} ingredients - Array of ingredient strings
 * @returns {string[]} Normalized ingredient strings
 */
function normalizeIngredientUnits(ingredients) {
  if (!Array.isArray(ingredients)) return ingredients;
  return ingredients.map((ingredient) => {
    if (typeof ingredient !== 'string') return ingredient;
    return ingredient
      .replace(/\bEL\b/g, 'Esslöffel')
      .replace(/\bEl\b/g, 'Esslöffel')
      .replace(/\bTL\b/g, 'Teelöffel')
      .replace(/\bTl\b/g, 'Teelöffel');
  });
}

// Fallback lists if settings/app has no cuisineTypes/mealCategories yet (kept in
// sync with DEFAULT_CUISINE_TYPES / DEFAULT_MEAL_CATEGORIES in src/utils/customLists.js).
const FALLBACK_CUISINE_TYPES = [
  'Deutsche Küche', 'Französische Küche', 'Italienische Küche', 'Österreichische Küche',
  'Schweizer Küche', 'Türkische Küche', 'Chinesische Küche', 'Indische Küche',
  'Japanische Küche', 'Orientalische Küche', 'Thailändische Küche', 'Mexikanische Küche',
  'US-Amerikanische Küche', 'Vegetarisch', 'Vegan', 'Weihnachtliche Küche',
];

const FALLBACK_MEAL_CATEGORIES = [
  'Appetizer', 'Dips & Saucen', 'Vorspeisen', 'Salate', 'Suppen & Eintöpfe',
  'Hauptspeisen', 'Desserts', 'Drinks', 'Beilagen & Grundrezepte', 'Gebäcke & Teige',
  'Kuchen & Torten', 'Grillrezepte',
];

module.exports = {RECIPE_EXTRACTION_PROMPT_CACHE_TTL_MS, importListsCache, importListsCacheExpiry, getConfiguredImportLists, resolveImportLists, cuisineFields, normalizeIngredientUnits, FALLBACK_CUISINE_TYPES, FALLBACK_MEAL_CATEGORIES};
