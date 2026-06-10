import { normalizeNutritionReferenceId } from './nutritionReferenceUtils';
import { decodeRecipeLink } from './recipeLinks';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

const BASE_COMMON_UNITS = [
  // Gewicht
  'g', 'kg', 'mg',
  // Maße & Gewichte
  'cm', 'mm',
  'pfund',
  // Volumen
  'ml', 'l', 'dl', 'cl', 'liter',
  // Küchenmaße (Löffel, Tasse, Glas)
  'el', 'tl', 'essloffel', 'essloeffel', 'teeloffel', 'teeloeffel',
  'tasse', 'tassen',
  'glas', 'glaser',
  // Verpackungen
  'dose', 'dosen',
  'packung', 'packungen', 'pck', 'pkg',
  'packchen', 'paeckchen',
  'flasche', 'flaschen',
  'becher',
  'tube', 'tuben',
  // Formen & Stücke
  'wurfel', 'wuerfel',
  'scheibe', 'scheiben',
  'blatt', 'blatter', 'blaetter',
  'zweig', 'zweige',
  'kopf', 'koepfe',
  'stange', 'stangen',
  'prise', 'prisen',
  'bund', 'zehe', 'zehen',
  'stück', 'stueck', 'stk', 'st',
  // Mengenangaben
  'portion', 'portionen',
  'stuck', 'stuecke',
  'halbe', 'halber', 'halbes',
  // Küchenmaße (klein)
  'messerspitze', 'msp',
  'schuss',
  'spritzer',
  'tropfen',
  'handvoll',
  'schale', 'schalen',
  'topf', 'topfe',
  // Lebensmittelspezifisch
  'riegel',
  'tafel', 'tafeln',
  'beutel',
  'sachet', 'sachets',
  'knolle', 'knollen',
  'stiel', 'stiele',
  'filet', 'filets',
  'ei', 'eier',
  // Häufige Abkürzungen
  'bd',
  'bl',
];

const VULGAR_FRACTIONS = {
  '½': '1/2',
  '⅓': '1/3',
  '⅔': '2/3',
  '¼': '1/4',
  '¾': '3/4',
  '⅕': '1/5',
  '⅖': '2/5',
  '⅗': '3/5',
  '⅘': '4/5',
  '⅙': '1/6',
  '⅚': '5/6',
  '⅐': '1/7',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
  '⅑': '1/9',
  '⅒': '1/10',
};
const VULGAR_FRACTION_CHARS = Object.keys(VULGAR_FRACTIONS).join('');
const DIGIT_VULGAR_FRACTION_REGEX = new RegExp(`(\\d+)\\s*([${VULGAR_FRACTION_CHARS}])`, 'g');
const VULGAR_FRACTION_WITH_SUFFIX_REGEX = new RegExp(`([${VULGAR_FRACTION_CHARS}])(\\S)`, 'g');
const VULGAR_FRACTION_REGEX = new RegExp(`[${VULGAR_FRACTION_CHARS}]`, 'g');

const DEFAULT_IGNORED_MARKERS = ['optional', 'ggf', 'gegebenenfalls'];
const IGNORED_INGREDIENT_MARKERS = new Set(DEFAULT_IGNORED_MARKERS);

const COMMON_ADJECTIVE_GROUP_CONFIG = {
  temperature: { normalizedField: 'normalizedTemperature', includeInBase: true },
  state: { normalizedField: 'normalizedState', includeInBase: true },
  sizing: { normalizedField: 'normalizedSizing', includeInBase: true },
  protected: { normalizedField: 'normalizedProtected', includeInBase: false },
};
const BASE_ADJECTIVE_GROUPS = Object.keys(COMMON_ADJECTIVE_GROUP_CONFIG)
  .filter((group) => COMMON_ADJECTIVE_GROUP_CONFIG[group].includeInBase);

const COMMON_UNIT_GROUP_CONFIG = {
  volume: { normalizedField: 'normalizedVolume', includeInBase: true },
  kitchenSize: { normalizedField: 'normalizedKitchenSize', includeInBase: true },
  weight: { normalizedField: 'normalizedWeight', includeInBase: true },
  dimension: { normalizedField: 'normalizedDimension', includeInBase: true },
};
const BASE_UNIT_GROUPS = Object.keys(COMMON_UNIT_GROUP_CONFIG)
  .filter((group) => COMMON_UNIT_GROUP_CONFIG[group].includeInBase);

const DEFAULT_DECLENSION_SUFFIXES = ['', 'e', 'en', 'em', 'er', 'es'];
const ADJECTIVE_DECLENSION_OVERRIDES = {
  mittel: {
    stems: ['mittler'],
    suffixes: ['e', 'en', 'em', 'er', 'es'],
  },
};

const DEFAULT_COMMON_ADJECTIVE_BASE_FORMS = {
  temperature: ['warm', 'kalt', 'heiss', 'eiskalt', 'kuehl', 'lauwarm'],
  state: ['reif', 'unreif', 'frisch', 'trocken', 'getrocknet', 'ganz', 'halb', 'fest', 'weich', 'hart'],
  sizing: ['gross', 'klein', 'mittel'],
  protected: ['weiss'],
};

const DEFAULT_COMMON_UNIT_BASE_FORMS = {
  volume: ['ml', 'l', 'dl', 'cl', 'liter'],
  kitchenSize: ['el', 'tl', 'essloffel', 'essloeffel', 'teeloffel', 'teeloeffel',
    'tasse', 'tassen', 'glas', 'glaser', 'becher', 'prise', 'prisen',
    'messerspitze', 'msp', 'schuss', 'spritzer', 'handvoll'],
  weight: ['g', 'kg', 'mg', 'pfund'],
  dimension: ['cm', 'mm'],
};

function buildDeclensionForms(normalizedWord) {
  const token = normalizeNutritionReferenceId(normalizedWord);
  if (!token) return [];

  const override = ADJECTIVE_DECLENSION_OVERRIDES[token];
  const stems = override?.stems?.length
    ? override.stems.map((stem) => normalizeNutritionReferenceId(stem)).filter(Boolean)
    : [token];
  const suffixes = Array.isArray(override?.suffixes) && override.suffixes.length > 0
    ? override.suffixes
    : DEFAULT_DECLENSION_SUFFIXES;

  const forms = new Set([token]);
  stems.forEach((stem) => {
    suffixes.forEach((suffix) => {
      const form = normalizeNutritionReferenceId(`${stem}${suffix}`);
      if (form) forms.add(form);
    });
  });
  return Array.from(forms);
}

function expandNormalizedAdjectives(words = []) {
  const expanded = new Set();
  words.forEach((word) => {
    buildDeclensionForms(word).forEach((form) => expanded.add(form));
  });
  return Array.from(expanded);
}

function buildDefaultBaseCommonAdjectives() {
  const grouped = BASE_ADJECTIVE_GROUPS
    .flatMap((group) => DEFAULT_COMMON_ADJECTIVE_BASE_FORMS[group] || []);
  return expandNormalizedAdjectives(grouped);
}

function buildDefaultProtectedAdjectives() {
  return expandNormalizedAdjectives(DEFAULT_COMMON_ADJECTIVE_BASE_FORMS.protected || []);
}

function buildDefaultBaseCommonUnits() {
  const grouped = BASE_UNIT_GROUPS
    .flatMap((group) => DEFAULT_COMMON_UNIT_BASE_FORMS[group] || []);
  return Array.from(new Set(
    grouped.map((unit) => normalizeNutritionReferenceId(unit)).filter(Boolean)
  ));
}

const BASE_COMMON_ADJECTIVES = buildDefaultBaseCommonAdjectives();
const PROTECTED_ADJECTIVES = new Set(buildDefaultProtectedAdjectives());

const COMMON_UNITS = new Set(BASE_COMMON_UNITS);
const COMMON_ADJECTIVES = new Set(BASE_COMMON_ADJECTIVES);
const CUSTOM_UNITS = new Set();
const CUSTOM_ADJECTIVES = new Set();
let commonUnitsInitializationPromise = null;
let commonAdjectivesInitializationPromise = null;
let ignoredMarkersInitializationPromise = null;

function applyCommonUnitSets(commonUnits = []) {
  COMMON_UNITS.clear();
  commonUnits.forEach((entry) => COMMON_UNITS.add(entry));
}

export async function initializeCommonUnitsFromFirebase({ forceReload = false } = {}) {
  if (commonUnitsInitializationPromise && !forceReload) {
    return commonUnitsInitializationPromise;
  }

  commonUnitsInitializationPromise = (async () => {
    const defaultBase = Array.from(new Set([...BASE_COMMON_UNITS, ...buildDefaultBaseCommonUnits()]));

    try {
      const snap = await getDoc(doc(db, 'commonTerms', 'commonUnits'));
      if (!snap.exists()) {
        applyCommonUnitSets(defaultBase);
        return;
      }

      const data = snap.data() || {};
      const loadedByGroup = Object.entries(COMMON_UNIT_GROUP_CONFIG).reduce((acc, [group, groupConfig]) => {
        const normalizedFieldValues = Array.isArray(data[groupConfig.normalizedField])
          ? data[groupConfig.normalizedField]
          : [];
        acc[group] = normalizedFieldValues;
        return acc;
      }, {});

      const hasConfiguredFields = BASE_UNIT_GROUPS
        .some((group) => Array.isArray(data[COMMON_UNIT_GROUP_CONFIG[group].normalizedField]));

      const loadedBase = BASE_UNIT_GROUPS
        .flatMap((group) => loadedByGroup[group] || []);

      applyCommonUnitSets(hasConfiguredFields ? loadedBase : defaultBase);
    } catch (error) {
      console.error('Error loading common units for ingredient matching:', error);
      applyCommonUnitSets(defaultBase);
    }
  })();

  return commonUnitsInitializationPromise;
}

function applyCommonAdjectiveSets(commonAdjectives = [], protectedAdjectives = []) {
  COMMON_ADJECTIVES.clear();
  commonAdjectives.forEach((entry) => COMMON_ADJECTIVES.add(entry));

  PROTECTED_ADJECTIVES.clear();
  protectedAdjectives.forEach((entry) => PROTECTED_ADJECTIVES.add(entry));
}

function applyIgnoredMarkerSets(markers = []) {
  IGNORED_INGREDIENT_MARKERS.clear();
  markers.forEach((entry) => IGNORED_INGREDIENT_MARKERS.add(entry));
}

export async function initializeCommonAdjectivesFromFirebase({ forceReload = false } = {}) {
  if (commonAdjectivesInitializationPromise && !forceReload) {
    return commonAdjectivesInitializationPromise;
  }

  commonAdjectivesInitializationPromise = (async () => {
    const defaultBase = buildDefaultBaseCommonAdjectives();
    const defaultProtected = buildDefaultProtectedAdjectives();

    try {
      const snap = await getDoc(doc(db, 'commonTerms', 'commonAdjectives'));
      if (!snap.exists()) {
        applyCommonAdjectiveSets(defaultBase, defaultProtected);
        return;
      }

      const data = snap.data() || {};
      const loadedByGroup = Object.entries(COMMON_ADJECTIVE_GROUP_CONFIG).reduce((acc, [group, groupConfig]) => {
        const normalizedFieldValues = Array.isArray(data[groupConfig.normalizedField])
          ? data[groupConfig.normalizedField]
          : [];
        acc[group] = expandNormalizedAdjectives(normalizedFieldValues);
        return acc;
      }, {});
      const hasConfiguredBaseFields = BASE_ADJECTIVE_GROUPS
        .some((group) => Array.isArray(data[COMMON_ADJECTIVE_GROUP_CONFIG[group].normalizedField]));
      const hasConfiguredProtectedField = Array.isArray(
        data[COMMON_ADJECTIVE_GROUP_CONFIG.protected.normalizedField]
      );

      const loadedBase = BASE_ADJECTIVE_GROUPS
        .flatMap((group) => loadedByGroup[group] || []);
      const loadedProtected = loadedByGroup.protected || [];

      applyCommonAdjectiveSets(
        hasConfiguredBaseFields ? loadedBase : defaultBase,
        hasConfiguredProtectedField ? loadedProtected : defaultProtected
      );
    } catch (error) {
      console.error('Error loading common adjectives for ingredient matching:', error);
      applyCommonAdjectiveSets(defaultBase, defaultProtected);
    }
  })();

  return commonAdjectivesInitializationPromise;
}

export async function initializeIgnoredMarkersFromFirebase({ forceReload = false } = {}) {
  if (ignoredMarkersInitializationPromise && !forceReload) {
    return ignoredMarkersInitializationPromise;
  }

  ignoredMarkersInitializationPromise = (async () => {
    const defaultBase = [...DEFAULT_IGNORED_MARKERS];

    try {
      const snap = await getDoc(doc(db, 'commonTerms', 'ignoredTerms'));
      if (!snap.exists()) {
        applyIgnoredMarkerSets(defaultBase);
        return;
      }

      const data = snap.data() || {};
      const normalizedTerms = Array.isArray(data.normalizedTerms)
        ? data.normalizedTerms
        : [];

      applyIgnoredMarkerSets(normalizedTerms.length > 0 ? normalizedTerms : defaultBase);
    } catch (error) {
      console.error('Error loading ignored markers for ingredient matching:', error);
      applyIgnoredMarkerSets(defaultBase);
    }
  })();

  return ignoredMarkersInitializationPromise;
}

// Best-effort background initialization: runtime calls continue to work with defaults
// if Firebase is temporarily unavailable.
if (process.env.NODE_ENV !== 'test') {
  initializeCommonUnitsFromFirebase().catch((error) => {
    console.warn('Common units background initialization failed. Falling back to defaults.', error);
  });
  initializeCommonAdjectivesFromFirebase().catch((error) => {
    console.warn('Common adjective background initialization failed. Falling back to defaults.', error);
  });
  initializeIgnoredMarkersFromFirebase().catch((error) => {
    console.warn('Ignored marker background initialization failed. Falling back to defaults.', error);
  });
}

function normalizeMatchingTokens(entries = []) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => normalizeNutritionReferenceId(entry))
    .filter(Boolean);
}

export function setCustomIngredientMatchingTerms({ units = [], adjectives = [] } = {}) {
  CUSTOM_UNITS.clear();
  CUSTOM_ADJECTIVES.clear();
  normalizeMatchingTokens(units).forEach((unit) => CUSTOM_UNITS.add(unit));
  normalizeMatchingTokens(adjectives).forEach((adjective) => CUSTOM_ADJECTIVES.add(adjective));
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[a.length][b.length];
}

function similarityFromNormalized(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const distance = levenshteinDistance(a, b);
  return Math.max(0, 1 - (distance / Math.max(a.length, b.length)));
}

function sanitizeIngredientNameForIdMatching(name) {
  const normalizedName = String(name || '')
    .replace(/\([^()]*\)/g, ' ')
    .split(/\s+/)
    .filter((token) => {
      const normalized = normalizeNutritionReferenceId(token);
      if (!normalized) return false;
      if (IGNORED_INGREDIENT_MARKERS.has(normalized)) return false;
      if (!PROTECTED_ADJECTIVES.has(normalized) && COMMON_ADJECTIVES.has(normalized)) return false;
      if (!PROTECTED_ADJECTIVES.has(normalized) && CUSTOM_ADJECTIVES.has(normalized)) return false;
      return true;
    })
    .join(' ')
    .trim();

  return normalizedName.replace(/^,+|,+$/g, '');
}

export function normalizeIngredientNameForIdMatching(name) {
  return sanitizeIngredientNameForIdMatching(name);
}

function normalizeVulgarFractions(text) {
  if (!text || typeof text !== 'string') return text;
  let result = text.replace(
    DIGIT_VULGAR_FRACTION_REGEX,
    (_, whole, fractionChar) => {
      const asciiFraction = VULGAR_FRACTIONS[fractionChar];
      if (!asciiFraction) return `${whole}${fractionChar}`;
      const [numerator, denominator] = asciiFraction.split('/').map(Number);
      return String(Number(whole) + (numerator / denominator));
    }
  );
  result = result.replace(
    VULGAR_FRACTION_WITH_SUFFIX_REGEX,
    '$1 $2'
  );
  return result.replace(
    VULGAR_FRACTION_REGEX,
    (match) => VULGAR_FRACTIONS[match]
  );
}

export function parseIngredientNameAndUnit(ingredientText) {
  const raw = normalizeVulgarFractions(String(ingredientText || '').trim());
  if (!raw) return { quantity: null, name: '', unit: null };

  // Bereichsmengen erkennen: "3-4 Schalotten", "3 - 4 EL Öl", "100-200 g Mehl"
  // Muss vor der allgemeinen numericPrefixMatch-Logik stehen.
  const rangePrefix = raw.match(
    /^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s+/
  );
  if (rangePrefix) {
    const afterRange = raw.slice(rangePrefix[0].length).trim();
    const tokens = afterRange.split(/\s+/).filter(Boolean);
    const firstToken = tokens[0] || '';
    const normalizedFirst = normalizeNutritionReferenceId(firstToken);
    let unit = null;
    let name = afterRange;
    if (firstToken && (COMMON_UNITS.has(normalizedFirst) || CUSTOM_UNITS.has(normalizedFirst))) {
      unit = firstToken;
      name = tokens.slice(1).join(' ').trim() || afterRange;
    }
    return {
      quantity: parseFloat(rangePrefix[1].replace(',', '.')),
      quantityMax: parseFloat(rangePrefix[2].replace(',', '.')),
      name,
      unit,
    };
  }

  const numericPrefixMatch = raw.match(/^(\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)?)\s*(\S+)?\s*(.*)$/);
  if (!numericPrefixMatch) {
    return { quantity: null, name: raw, unit: null };
  }

  const rawQuantityStr = numericPrefixMatch[1];
  let parsedQuantity = null;
  if (rawQuantityStr.includes('/')) {
    const parts = rawQuantityStr.split('/');
    const num = parseFloat(parts[0].replace(',', '.'));
    const den = parseFloat(parts[1].replace(',', '.'));
    if (!isNaN(num) && !isNaN(den) && den !== 0) parsedQuantity = num / den;
  } else {
    const n = parseFloat(rawQuantityStr.replace(',', '.'));
    if (!isNaN(n)) parsedQuantity = n;
  }

  const possibleUnit = (numericPrefixMatch[2] || '').trim();
  const rest = (numericPrefixMatch[3] || '').trim();
  const normalizedUnit = normalizeNutritionReferenceId(possibleUnit);
  if (possibleUnit && (COMMON_UNITS.has(normalizedUnit) || CUSTOM_UNITS.has(normalizedUnit))) {
    return { quantity: parsedQuantity, name: rest || possibleUnit || raw, unit: possibleUnit };
  }

  // If the first token after the number is a known adjective, scan further tokens for
  // a unit (skipping any additional adjectives), e.g. "1 gestrichener Esslöffel Zucker".
  if (possibleUnit && (COMMON_ADJECTIVES.has(normalizedUnit) || CUSTOM_ADJECTIVES.has(normalizedUnit))) {
    const remainingTokens = rest.split(/\s+/).filter(Boolean);
    for (let i = 0; i < remainingTokens.length; i++) {
      const token = remainingTokens[i];
      const normalized = normalizeNutritionReferenceId(token);
      if (COMMON_ADJECTIVES.has(normalized) || CUSTOM_ADJECTIVES.has(normalized)) {
        continue;
      }
      if (COMMON_UNITS.has(normalized) || CUSTOM_UNITS.has(normalized)) {
        const name = remainingTokens.slice(i + 1).join(' ').trim() || token;
        return { quantity: parsedQuantity, name, unit: token };
      }
      // First non-adjective, non-unit token found – no unit in this ingredient.
      break;
    }
    // No unit found: return only the non-adjective tokens as the ingredient name.
    const allTokens = [possibleUnit, ...remainingTokens];
    const nonAdjectiveTokens = allTokens.filter((token) => {
      const normalized = normalizeNutritionReferenceId(token);
      return !COMMON_ADJECTIVES.has(normalized) && !CUSTOM_ADJECTIVES.has(normalized);
    });
    const name = nonAdjectiveTokens.join(' ').trim() || allTokens.join(' ').trim() || raw;
    return { quantity: parsedQuantity, name, unit: null };
  }

  const withoutAmount = raw.replace(/^(\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)?)\s+/, '').trim();
  return { quantity: parsedQuantity, name: withoutAmount || raw, unit: null };
}

export function getIngredientIdSuggestions(ingredientText, nutritionReferenceRows = []) {
  const { name, unit } = parseIngredientNameAndUnit(ingredientText);
  const normalizedIngredientName = normalizeNutritionReferenceId(normalizeIngredientNameForIdMatching(name));
  const normalizedIngredientUnit = normalizeNutritionReferenceId(unit || '');
  if (!normalizedIngredientName) return [];

  const candidates = nutritionReferenceRows
    .map((row) => {
      const ingredientID = String(row?.ingredientID || row?.id || '').trim();
      if (!ingredientID) return null;
      const displayName = String(
        row?.displayName
        || row?.Anzeigename
        || row?.name
        || (Array.isArray(row?.synonyms) ? row.synonyms[0] : '')
        || ingredientID
      ).trim() || ingredientID;

      const normalizedTokens = [
        normalizeNutritionReferenceId(ingredientID),
        ...(Array.isArray(row?.synonyms) ? row.synonyms : []).map((entry) => normalizeNutritionReferenceId(entry)),
      ].filter(Boolean);
      if (normalizedTokens.length === 0) return null;

      const exactMatch = normalizedTokens.includes(normalizedIngredientName);
      const similarity = normalizedTokens.reduce((best, token) => (
        Math.max(best, similarityFromNormalized(normalizedIngredientName, token))
      ), 0);

      const possibleUnits = Array.isArray(row?.possibleUnits)
        ? row.possibleUnits.map((entry) => normalizeNutritionReferenceId(entry)).filter(Boolean)
        : [];
      const unitMatch = Boolean(
        normalizedIngredientUnit &&
        possibleUnits.length > 0 &&
        possibleUnits.includes(normalizedIngredientUnit)
      );

      let score = exactMatch ? 1 : similarity * 0.9;
      if (!exactMatch && unitMatch) {
        score = Math.min(0.99, score + 0.1);
      }

      return {
        ingredientID,
        displayName,
        confidencePercent: Math.round(score * 100),
        score,
      };
    })
    .filter(Boolean)
    .filter((entry) => entry.confidencePercent >= 35)
    .sort((a, b) => b.score - a.score || a.ingredientID.localeCompare(b.ingredientID, 'de', { sensitivity: 'base' }));

  const deduplicated = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate.ingredientID)) continue;
    seen.add(candidate.ingredientID);
    deduplicated.push(candidate);
    if (deduplicated.length >= 5) break;
  }

  return deduplicated;
}

/**
 * Returns a copy of rawIngredients with ingredientID auto-assigned for any ingredient
 * that has a unique 100% match in nutritionReferenceRows.
 * Only handles exact matches – ambiguous or unmatched ingredients are left unchanged.
 */
export function getAutoAssignedIngredients(rawIngredients = [], nutritionReferenceRows = []) {
  const updatedIngredients = [...rawIngredients];
  let autoAssigned = 0;

  rawIngredients.forEach((item, index) => {
    const ingredientItem = typeof item === 'string' ? { type: 'ingredient', text: item } : item;
    if (!ingredientItem || ingredientItem.type === 'heading' || typeof ingredientItem.text !== 'string') return;
    if (ingredientItem.ignoreNutritionCalculation === true) return;
    if (decodeRecipeLink(ingredientItem.text)) return;

    const existingIngredientID = String(ingredientItem.ingredientID || '').trim();
    if (existingIngredientID) {
      const idStillValid = nutritionReferenceRows.some(
        (row) => String(row?.ingredientID || '').trim() === existingIngredientID
      );
      if (idStillValid) return;
    }

    const suggestions = getIngredientIdSuggestions(ingredientItem.text, nutritionReferenceRows);
    const top = suggestions[0];
    const hasUniqueTop =
      Boolean(top) &&
      suggestions.filter((entry) => entry.confidencePercent === top.confidencePercent).length === 1;

    if (top && top.confidencePercent === 100 && hasUniqueTop) {
      const nextItem =
        typeof item === 'string'
          ? { type: 'ingredient', text: item, ingredientID: top.ingredientID }
          : { ...item, ingredientID: top.ingredientID };
      updatedIngredients[index] = nextItem;
      autoAssigned += 1;
    }
  });

  return { updatedIngredients, autoAssigned };
}

/**
 * Returns true if the recipe has at least one ingredient (that is not a heading
 * and not explicitly ignored) without a valid ingredientID.
 */
export function hasMissingIngredientIDs(recipe, nutritionReferenceRows = []) {
  const rawIngredients = Array.isArray(recipe?.zutaten)
    ? recipe.zutaten
    : Array.isArray(recipe?.ingredients)
    ? recipe.ingredients
    : [];

  const validIds =
    nutritionReferenceRows.length > 0
      ? new Set(
          nutritionReferenceRows
            .map((row) => String(row?.ingredientID || '').trim())
            .filter(Boolean)
        )
      : null;

  return rawIngredients.some((item) => {
    const ingredientItem = typeof item === 'string' ? { type: 'ingredient', text: item } : item;
    if (!ingredientItem || ingredientItem.type === 'heading') return false;
    if (typeof ingredientItem.text !== 'string' || !ingredientItem.text.trim()) return false;
    if (decodeRecipeLink(ingredientItem.text)) return false;
    if (ingredientItem.ignoreNutritionCalculation === true) return false;
    const id = String(ingredientItem.ingredientID || '').trim();
    if (!id) return true;
    if (validIds) {
      return !validIds.has(id);
    }
    return false;
  });
}

/**
 * Classifies the words of an ingredient text into semantic categories used during
 * ingredient-ID matching.  Useful for explaining the parsing result to the user.
 *
 * @param {string} ingredientText - Raw ingredient string
 * @returns {{
 *   amount: string|null,
 *   unit: string|null,
 *   ingredientWords: string[],
 *   ignoredWords: string[]
 * }}
 */
export function classifyIngredientWords(ingredientText) {
  const rawText = String(ingredientText || '').trim();
  if (!rawText) {
    return { amount: null, unit: null, ingredientWords: [], ignoredWords: [] };
  }

  const { quantity, name, unit } = parseIngredientNameAndUnit(rawText);

  // Use the first whitespace-delimited token as the displayed amount when a
  // numeric quantity was detected (covers digits, fractions and vulgar fractions).
  const firstWord = rawText.split(/\s+/)[0] || '';
  const amount = quantity !== null && /^[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒\d]/u.test(firstWord)
    ? firstWord
    : null;

  // Collect any adjectives that appear in the raw text between the amount token and
  // the unit/name.  parseIngredientNameAndUnit strips these from the returned name
  // when it skips them to locate a unit, so they must be gathered here from the
  // original text to ensure they are still reported as ignoredWords.
  const ignoredWords = [];
  if (amount !== null) {
    const tokensAfterAmount = rawText.split(/\s+/).filter(Boolean).slice(1);
    for (const token of tokensAfterAmount) {
      const normalized = normalizeNutritionReferenceId(token);
      if (!PROTECTED_ADJECTIVES.has(normalized) && (COMMON_ADJECTIVES.has(normalized) || CUSTOM_ADJECTIVES.has(normalized))) {
        ignoredWords.push(token);
      } else {
        break;
      }
    }
  }

  // Classify words inside the name part:
  // – parenthesised segments are always treated as ignored
  // – remaining tokens are checked against adjective / marker sets
  const rawName = String(name || '');

  const nameWithoutParens = rawName.replace(/\(([^()]*)\)/g, (match) => {
    const inner = match.slice(1, -1).trim();
    if (inner) ignoredWords.push(match);
    return ' ';
  });

  const ingredientWords = [];
  nameWithoutParens.split(/\s+/).filter(Boolean).forEach((token) => {
    const cleanedToken = token.replace(/^,+|,+$/g, '');
    if (!cleanedToken) return;
    const normalized = normalizeNutritionReferenceId(cleanedToken);
    if (!normalized || IGNORED_INGREDIENT_MARKERS.has(normalized)) {
      ignoredWords.push(cleanedToken);
    } else if (!PROTECTED_ADJECTIVES.has(normalized) && (COMMON_ADJECTIVES.has(normalized) || CUSTOM_ADJECTIVES.has(normalized))) {
      ignoredWords.push(cleanedToken);
    } else {
      ingredientWords.push(cleanedToken);
    }
  });

  return {
    amount,
    unit: unit || null,
    ingredientWords,
    ignoredWords,
  };
}

export function buildPendingNutritionReferenceDraft(ingredientText, nutritionReferenceRows = []) {
  const { name, unit } = parseIngredientNameAndUnit(ingredientText);
  const displayName = String(normalizeIngredientNameForIdMatching(name) || String(name || '').trim()).trim();
  const canonicalKey = normalizeNutritionReferenceId(displayName);
  if (!canonicalKey) return null;

  const usedIds = new Set(
    nutritionReferenceRows
      .map((row) => String(row?.ingredientID || row?.id || '').trim().toLowerCase())
      .filter(Boolean)
  );

  let ingredientID = canonicalKey;
  let suffix = 2;
  while (usedIds.has(ingredientID.toLowerCase())) {
    ingredientID = `${canonicalKey}-${suffix}`;
    suffix += 1;
  }

  return {
    canonicalKey,
    ingredientID,
    displayName,
    synonyms: [displayName],
    possibleUnits: unit ? [String(unit).trim()].filter(Boolean) : [],
  };
}
