import { normalizeNutritionReferenceId } from './nutritionReferenceUtils';

const COMMON_UNITS = new Set([
  'g', 'kg', 'mg',
  'ml', 'l', 'dl', 'cl',
  'el', 'tl',
  'tasse', 'tassen',
  'prise', 'prisen',
  'bund', 'zehe', 'zehen',
  'stück', 'stueck', 'stk', 'st',
]);

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

export function parseIngredientNameAndUnit(ingredientText) {
  const raw = String(ingredientText || '').trim();
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
  if (possibleUnit && COMMON_UNITS.has(normalizeNutritionReferenceId(possibleUnit))) {
    return { quantity: parsedQuantity, name: rest || raw, unit: possibleUnit };
  }

  const withoutAmount = raw.replace(/^(\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)?)\s+/, '').trim();
  return { quantity: parsedQuantity, name: withoutAmount || raw, unit: null };
}

export function getIngredientIdSuggestions(ingredientText, nutritionReferenceRows = []) {
  const { name, unit } = parseIngredientNameAndUnit(ingredientText);
  const normalizedIngredientName = normalizeNutritionReferenceId(name);
  const normalizedIngredientUnit = normalizeNutritionReferenceId(unit || '');
  if (!normalizedIngredientName) return [];

  const candidates = nutritionReferenceRows
    .map((row) => {
      const ingredientID = String(row?.ingredientID || row?.id || '').trim();
      if (!ingredientID) return null;

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
