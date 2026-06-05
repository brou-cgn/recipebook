import { normalizeNutritionReferenceId } from './nutritionReferenceUtils';
import { decodeRecipeLink } from './recipeLinks';

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

const IGNORED_INGREDIENT_MARKERS = new Set([
  'optional',
  'ggf',
  'gegebenenfalls',
]);

const BASE_COMMON_ADJECTIVES = [
  // Temperatur (normalized: umlauts stripped, ß→ss)
  'warm', 'warme', 'warmer', 'warmes', 'warmen',
  'kalt', 'kalte', 'kalter', 'kaltes', 'kalten',
  'heiss', 'heisse', 'heisser', 'heisses', 'heissen',
  'eiskalt', 'eiskalte', 'eiskalter', 'eiskaltes', 'eiskalten',
  'lauwarm', 'lauwarme', 'lauwarmer', 'lauwarmes', 'lauwarmen',
  'gekuhlt', 'gekuehlt', 'gekuehl',
  // Zustand & Reife
  'reif', 'reife', 'reifer', 'reifes', 'reifen',
  'unreif', 'unreife', 'unreifer', 'unreifes', 'unreifen',
  'frisch', 'frische', 'frischer', 'frisches', 'frischen',
  'trocken', 'trockene', 'trockener', 'trockenes', 'trockenen',
  'getrocknet', 'getrocknete', 'getrockneter', 'getrocknetes', 'getrockneten',
  // Größe (groß→gross after normalization)
  'gross', 'grosse', 'grosser', 'grosses', 'grossen',
  'klein', 'kleine', 'kleiner', 'kleines', 'kleinen',
  'mittel', 'mittlere', 'mittlerer', 'mittleres', 'mittleren',
  // Weitere häufige Beschreibungen
  'ganz', 'ganze', 'ganzer', 'ganzes', 'ganzen',
  'halb', 'halber', 'halbes', 'halben',
  'fest', 'feste', 'fester', 'festes', 'festen',
  'weich', 'weiche', 'weicher', 'weiches', 'weichen',
  'hart', 'harte', 'harter', 'hartes', 'harten',
];

const PROTECTED_ADJECTIVES = new Set([
  'weiss',
  'weisse',
  'weisser',
  'weisses',
]);

const COMMON_UNITS = new Set(BASE_COMMON_UNITS);
const COMMON_ADJECTIVES = new Set(BASE_COMMON_ADJECTIVES);
const CUSTOM_UNITS = new Set();
const CUSTOM_ADJECTIVES = new Set();

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
  return String(name || '')
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
export function hasMissingIngredientIDs(recipe) {
  const rawIngredients = Array.isArray(recipe?.zutaten)
    ? recipe.zutaten
    : Array.isArray(recipe?.ingredients)
    ? recipe.ingredients
    : [];

  return rawIngredients.some((item) => {
    const ingredientItem = typeof item === 'string' ? { type: 'ingredient', text: item } : item;
    if (!ingredientItem || ingredientItem.type === 'heading') return false;
    if (typeof ingredientItem.text !== 'string' || !ingredientItem.text.trim()) return false;
    if (decodeRecipeLink(ingredientItem.text)) return false;
    if (ingredientItem.ignoreNutritionCalculation === true) return false;
    return !String(ingredientItem.ingredientID || '').trim();
  });
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
