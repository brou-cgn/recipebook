/**
 * Recipe Sort Index Utility
 *
 * Calculates a numeric sort index for a recipe based on:
 * - Basiswert (base value)
 * - FavoritenBonus (favorite bonus)
 * - KochabstandsBonus (cook-distance bonus)
 * - SaisonBonus (season bonus)
 *
 * The function is pure (no side effects, no Firestore reads).
 * All required data must be provided as parameters.
 */

const BASE_VALUE = 50;
const FAVORITEN_BONUS = 25;

// Number of months ahead to consider "Bald in Saison" (soon in season)
const BALD_IN_SAISON_MONTHS = 2;

/**
 * Season status constants used for SaisonStatusBonus lookup.
 */
export const SAISON_STATUS = {
  HAUPTSAISON: 'HAUPTSAISON',
  NEBENSAISON: 'NEBENSAISON',
  BALD: 'BALD',
  AUSSERHALB: 'AUSSERHALB',
};

/**
 * SaisonStatusBonus lookup table.
 */
export const SAISON_STATUS_BONUS = {
  [SAISON_STATUS.HAUPTSAISON]: 30,
  [SAISON_STATUS.NEBENSAISON]: 15,
  [SAISON_STATUS.BALD]: 8,
  [SAISON_STATUS.AUSSERHALB]: 0,
};

/**
 * Priority order for season status (lower index = higher priority).
 */
const STATUS_PRIORITY = [
  SAISON_STATUS.HAUPTSAISON,
  SAISON_STATUS.NEBENSAISON,
  SAISON_STATUS.BALD,
  SAISON_STATUS.AUSSERHALB,
];

function getRecipeIngredients(recipe = {}) {
  const rawIngredients = recipe.ingredients || recipe.zutaten || [];
  return rawIngredients
    .filter((item) => typeof item === 'string' || (item && item.type === 'ingredient'))
    .map((item) =>
      typeof item === 'string'
        ? { text: item, ingredientID: undefined }
        : { text: item.text || '', ingredientID: item.ingredientID || undefined }
    )
    .filter((item) => item.text);
}

function calculateSaisonBonusDetails(recipe, seasonMatrixEntries, currentMonth, nutritionReferenceRows = [], nutritionReferenceIndex = null) {
  if (!Array.isArray(seasonMatrixEntries) || seasonMatrixEntries.length === 0) {
    return { saisonBonus: 0, saisonBonusIngredient: null };
  }

  const ingredientItems = getRecipeIngredients(recipe);
  if (ingredientItems.length === 0) {
    return { saisonBonus: 0, saisonBonusIngredient: null };
  }

  const activeEntries = seasonMatrixEntries.filter((e) => e.isActive !== false);
  if (activeEntries.length === 0) {
    return { saisonBonus: 0, saisonBonusIngredient: null };
  }

  const nutritionIndex = nutritionReferenceIndex instanceof Map
    ? nutritionReferenceIndex
    : buildNutritionReferenceIndex(nutritionReferenceRows);

  const matchedEntries = [];
  for (const ingredientItem of ingredientItems) {
    for (const entry of activeEntries) {
      if (matchIngredientToEntryWithIndex(ingredientItem, entry, nutritionIndex)) {
        matchedEntries.push({ entry, ingredientItem });
        break;
      }
    }
  }

  if (matchedEntries.length === 0) {
    return { saisonBonus: 0, saisonBonusIngredient: null };
  }

  let totalSeasonScore = 0;
  let bestStatusIndex = STATUS_PRIORITY.indexOf(SAISON_STATUS.AUSSERHALB);
  let bestMatchedIngredient = null;

  for (const matched of matchedEntries) {
    const status = getIngredientSeasonStatus(matched.entry, currentMonth);
    const statusIndex = STATUS_PRIORITY.indexOf(status);

    if (statusIndex < bestStatusIndex) {
      bestStatusIndex = statusIndex;
      bestMatchedIngredient = matched;
    }

    totalSeasonScore += matched.entry.seasonScore || 0;
  }

  const saisonScore = totalSeasonScore / matchedEntries.length;
  const bestStatus = STATUS_PRIORITY[bestStatusIndex];
  const saisonStatusBonus = SAISON_STATUS_BONUS[bestStatus];

  return {
    saisonBonus: saisonStatusBonus * (saisonScore / 100),
    saisonBonusIngredient:
      bestMatchedIngredient?.entry?.name ||
      bestMatchedIngredient?.entry?.id ||
      bestMatchedIngredient?.ingredientItem?.text ||
      null,
  };
}

/**
 * Returns the KochabstandsBonus based on the last cook date timestamp.
 *
 * @param {number|null|undefined} lastCookDateMs - Millisecond timestamp of the last cook date,
 *   or null/undefined if never cooked.
 * @param {number} [nowMs] - Current time in milliseconds (default: Date.now()). Useful for testing.
 * @returns {number} The bonus value.
 */
export function getKochabstandsBonus(lastCookDateMs, nowMs = Date.now()) {
  if (lastCookDateMs === null || lastCookDateMs === undefined) {
    return 10; // nie gekocht
  }

  const daysSince = (nowMs - lastCookDateMs) / (1000 * 60 * 60 * 24);

  if (daysSince <= 7) return -50;
  if (daysSince <= 30) return -30;
  if (daysSince <= 90) return 0;
  if (daysSince <= 180) return 10;
  return 20;
}

/**
 * Determines the season status of a single season matrix entry for the given month.
 *
 * @param {Object} entry - Season matrix entry with mainSeasonMonths, secondarySeasonMonths
 * @param {number} currentMonth - Current month (1–12)
 * @returns {string} One of SAISON_STATUS values
 */
export function getIngredientSeasonStatus(entry, currentMonth) {
  const mainMonths = Array.isArray(entry.mainSeasonMonths) ? entry.mainSeasonMonths : [];
  const secondaryMonths = Array.isArray(entry.secondarySeasonMonths) ? entry.secondarySeasonMonths : [];

  if (mainMonths.includes(currentMonth)) return SAISON_STATUS.HAUPTSAISON;
  if (secondaryMonths.includes(currentMonth)) return SAISON_STATUS.NEBENSAISON;

  // Check if Hauptsaison starts within the next BALD_IN_SAISON_MONTHS months
  for (let i = 1; i <= BALD_IN_SAISON_MONTHS; i++) {
    const futureMonth = ((currentMonth - 1 + i) % 12) + 1;
    if (mainMonths.includes(futureMonth)) return SAISON_STATUS.BALD;
  }

  return SAISON_STATUS.AUSSERHALB;
}

/**
 * Checks whether an ingredient matches a season matrix entry.
 *
 * Uses only ingredientID + nutritionReference lookup:
 *   Looks up ingredientID in nutritionReferenceRows. If a row is found and
 *   seasonRelevant === true, compares seasonalFamily (case-insensitive exact match)
 *   with entry.name. In all other cases the function returns false.
 *
 * @param {string|{text: string, ingredientID?: string}} ingredientItem
 * @param {Object} entry - Season matrix entry
 * @param {Array} [nutritionReferenceRows=[]] - Rows from "Nährwerte je 100 g" table
 * @returns {boolean}
 */
export function matchIngredientToEntry(ingredientItem, entry, nutritionReferenceRows = []) {
  const ingredientID = typeof ingredientItem === 'string' ? undefined : (ingredientItem?.ingredientID || undefined);
  if (!ingredientID) return false;
  if (!Array.isArray(nutritionReferenceRows) || nutritionReferenceRows.length === 0) return false;

  const nutritionRef = nutritionReferenceRows.find(
    (row) => String(row?.ingredientID || '').trim() === ingredientID
  );
  if (!nutritionRef || nutritionRef.seasonRelevant !== true) return false;

  const seasonalFamily = String(nutritionRef.seasonalFamily || '').trim();
  const entryName = String(entry?.name || '').trim();
  return (
    seasonalFamily.length > 0 &&
    entryName.length > 0 &&
    seasonalFamily.toLowerCase() === entryName.toLowerCase()
  );
}

/**
 * Builds a Map<ingredientID, row> from nutritionReferenceRows for O(1) lookup.
 * When duplicate ingredientIDs exist, the first occurrence is kept (matching
 * the behaviour of the original Array.find() approach).
 *
 * @param {Array} [nutritionReferenceRows=[]] - Rows from "Nährwerte je 100 g" table
 * @returns {Map<string, Object>}
 */
export function buildNutritionReferenceIndex(nutritionReferenceRows = []) {
  if (!Array.isArray(nutritionReferenceRows) || nutritionReferenceRows.length === 0) return new Map();
  const index = new Map();
  for (const row of nutritionReferenceRows) {
    const id = String(row?.ingredientID || '').trim();
    if (id && !index.has(id)) {
      index.set(id, row);
    }
  }
  return index;
}

/**
 * Like matchIngredientToEntry but accepts a pre-built Map for O(1) lookup.
 *
 * @param {string|{text: string, ingredientID?: string}} ingredientItem
 * @param {Object} entry - Season matrix entry
 * @param {Map<string, Object>} nutritionIndex - Pre-built index from buildNutritionReferenceIndex
 * @returns {boolean}
 */
function matchIngredientToEntryWithIndex(ingredientItem, entry, nutritionIndex) {
  const ingredientID = typeof ingredientItem === 'string' ? undefined : (ingredientItem?.ingredientID || undefined);
  if (!ingredientID) return false;
  if (!nutritionIndex || nutritionIndex.size === 0) return false;

  const nutritionRef = nutritionIndex.get(ingredientID);
  if (!nutritionRef || nutritionRef.seasonRelevant !== true) return false;

  const seasonalFamily = String(nutritionRef.seasonalFamily || '').trim();
  const entryName = String(entry?.name || '').trim();
  return (
    seasonalFamily.length > 0 &&
    entryName.length > 0 &&
    seasonalFamily.toLowerCase() === entryName.toLowerCase()
  );
}

/**
 * Checks whether a recipe contains at least one ingredient that matches an
 * active season matrix entry with a minimum season score.
 *
 * @param {Object} recipe - Recipe object with ingredients/zutaten
 * @param {Array} seasonMatrixEntries - Season matrix entries
 * @param {number} [minimumSeasonScore=60] - Minimum seasonScore threshold
 * @param {Array} [nutritionReferenceRows=[]] - Rows from "Nährwerte je 100 g" table
 * @param {Map} [nutritionReferenceIndex=null] - Pre-built index (skips internal build when provided)
 * @returns {boolean}
 */
export function hasSeasonalIngredient(
  recipe,
  seasonMatrixEntries,
  minimumSeasonScore = 60,
  nutritionReferenceRows = [],
  nutritionReferenceIndex = null
) {
  if (!Array.isArray(seasonMatrixEntries) || seasonMatrixEntries.length === 0) return false;

  const ingredientItems = getRecipeIngredients(recipe);
  if (ingredientItems.length === 0) return false;

  const minimum = Number.isFinite(Number(minimumSeasonScore)) ? Number(minimumSeasonScore) : 60;
  const eligibleEntries = seasonMatrixEntries.filter((entry) => (
    entry?.isActive !== false && Number(entry?.seasonScore) >= minimum
  ));
  if (eligibleEntries.length === 0) return false;

  const nutritionIndex = nutritionReferenceIndex instanceof Map
    ? nutritionReferenceIndex
    : buildNutritionReferenceIndex(nutritionReferenceRows);

  return ingredientItems.some((ingredientItem) =>
    eligibleEntries.some((entry) => matchIngredientToEntryWithIndex(ingredientItem, entry, nutritionIndex))
  );
}

/**
 * Checks whether a recipe contains at least one ingredient that matches an
 * active season matrix entry currently in Hauptsaison.
 *
 * @param {Object} recipe - Recipe object with ingredients/zutaten
 * @param {Array} seasonMatrixEntries - Season matrix entries
 * @param {number} [currentMonth] - Current month (1–12), defaults to system month
 * @param {Array} [nutritionReferenceRows=[]] - Rows from "Nährwerte je 100 g" table
 * @param {Map} [nutritionReferenceIndex=null] - Pre-built index (skips internal build when provided)
 * @returns {boolean}
 */
export function hasHauptsaisonIngredient(
  recipe,
  seasonMatrixEntries,
  currentMonth = new Date().getMonth() + 1,
  nutritionReferenceRows = [],
  nutritionReferenceIndex = null
) {
  if (!Array.isArray(seasonMatrixEntries) || seasonMatrixEntries.length === 0) return false;

  const ingredientItems = getRecipeIngredients(recipe);
  if (ingredientItems.length === 0) return false;

  const activeEntries = seasonMatrixEntries.filter((entry) => entry?.isActive !== false);
  if (activeEntries.length === 0) return false;

  const nutritionIndex = nutritionReferenceIndex instanceof Map
    ? nutritionReferenceIndex
    : buildNutritionReferenceIndex(nutritionReferenceRows);

  return ingredientItems.some((ingredientItem) =>
    activeEntries.some((entry) =>
      matchIngredientToEntryWithIndex(ingredientItem, entry, nutritionIndex) &&
      getIngredientSeasonStatus(entry, currentMonth) === SAISON_STATUS.HAUPTSAISON
    )
  );
}

/**
 * Calculates the SaisonBonus for a recipe.
 *
 * Formula: SaisonBonus = SaisonStatusBonus * (SaisonScore / 100)
 *
 * Where:
 * - SaisonScore = average of entry.seasonScore across all matched ingredients
 * - SaisonStatusBonus = determined by the best (most favourable) season status
 *   among matched ingredients
 *
 * @param {Object} recipe - Recipe object with ingredients array
 * @param {Array} seasonMatrixEntries - Array of season matrix entries
 * @param {number} currentMonth - Current month (1–12)
 * @param {Array} [nutritionReferenceRows=[]] - Rows from "Nährwerte je 100 g" table
 * @returns {number} The SaisonBonus
 */
export function calculateSaisonBonus(recipe, seasonMatrixEntries, currentMonth, nutritionReferenceRows = []) {
  return calculateSaisonBonusDetails(
    recipe,
    seasonMatrixEntries,
    currentMonth,
    nutritionReferenceRows
  ).saisonBonus;
}

/**
 * Calculates the composite sort index for a recipe.
 *
 * SortIndex = Basiswert + FavoritenBonus + KochabstandsBonus + SaisonBonus
 *
 * @param {Object} params
 * @param {boolean} [params.isFavorite=false] - Whether the recipe is a favourite for the current user
 * @param {number|null|undefined} [params.lastCookDateMs] - Millisecond timestamp of the last cook
 *   date by the current user, or null/undefined if never cooked
 * @param {Array} [params.seasonMatrixEntries=[]] - Active season matrix entries from Firestore
 * @param {Array} [params.nutritionReferenceRows=[]] - Rows from "Nährwerte je 100 g" table
 * @param {Map} [params.nutritionReferenceIndex=null] - Pre-built index (skips internal build when provided)
 * @param {Object} [params.recipe={}] - Recipe object (needs ingredients/zutaten array)
 * @param {number} [params.currentMonth] - Current month 1–12 (defaults to current calendar month)
 * @param {number} [params.nowMs] - Current time in ms for cook-distance calculation (default: Date.now())
 * @returns {number} The computed sort index
 */
export function calculateRecipeSortIndex({
  isFavorite = false,
  lastCookDateMs = undefined,
  seasonMatrixEntries = [],
  nutritionReferenceRows = [],
  nutritionReferenceIndex = null,
  recipe = {},
  currentMonth = new Date().getMonth() + 1,
  nowMs = Date.now(),
} = {}) {
  return calculateRecipeSortIndexBreakdown({
    isFavorite,
    lastCookDateMs,
    seasonMatrixEntries,
    nutritionReferenceRows,
    nutritionReferenceIndex,
    recipe,
    currentMonth,
    nowMs,
  }).totalIndex;
}

/**
 * Calculates a transparent component breakdown for the recipe sort index.
 *
 * @param {Object} params
 * @param {boolean} [params.isFavorite=false]
 * @param {number|null|undefined} [params.lastCookDateMs]
 * @param {Array} [params.seasonMatrixEntries=[]]
 * @param {Array} [params.nutritionReferenceRows=[]]
 * @param {Map} [params.nutritionReferenceIndex=null] - Pre-built index (skips internal build when provided)
 * @param {Object} [params.recipe={}]
 * @param {number} [params.currentMonth]
 * @param {number} [params.nowMs]
 * @returns {{
 *   baseValue: number,
 *   favoritenBonus: number,
 *   kochabstandsBonus: number,
 *   saisonBonus: number,
 *   saisonBonusIngredient: (string|null),
 *   totalIndex: number
 * }}
 */
export function calculateRecipeSortIndexBreakdown({
  isFavorite = false,
  lastCookDateMs = undefined,
  seasonMatrixEntries = [],
  nutritionReferenceRows = [],
  nutritionReferenceIndex = null,
  recipe = {},
  currentMonth = new Date().getMonth() + 1,
  nowMs = Date.now(),
} = {}) {
  const favoritenBonus = isFavorite ? FAVORITEN_BONUS : 0;
  const kochabstandsBonus = getKochabstandsBonus(lastCookDateMs, nowMs);
  const saisonBonusDetails = calculateSaisonBonusDetails(
    recipe,
    seasonMatrixEntries,
    currentMonth,
    nutritionReferenceRows,
    nutritionReferenceIndex
  );

  return {
    baseValue: BASE_VALUE,
    favoritenBonus,
    kochabstandsBonus,
    saisonBonus: saisonBonusDetails.saisonBonus,
    saisonBonusIngredient: saisonBonusDetails.saisonBonusIngredient,
    totalIndex: BASE_VALUE + favoritenBonus + kochabstandsBonus + saisonBonusDetails.saisonBonus,
  };
}
