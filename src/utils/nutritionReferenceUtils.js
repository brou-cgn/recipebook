export const NUTRITION_REFERENCE_FIELDS = [
  'kalorien',
  'protein',
  'fett',
  'kohlenhydrate',
  'zucker',
  'ballaststoffe',
  'salz',
];

export function normalizeNutritionReferenceId(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseNutritionReferenceValues(input = {}) {
  return NUTRITION_REFERENCE_FIELDS.reduce((acc, key) => {
    const raw = input[key];
    if (raw === '' || raw == null) {
      return acc;
    }
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric >= 0) {
      acc[key] = numeric;
    }
    return acc;
  }, {});
}

export function parseNutritionReferenceFallbackWeight(input = {}) {
  const raw = input.defaultAmountG;
  if (raw === '' || raw == null) {
    return null;
  }
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  return null;
}

export function parseNutritionReferenceSynonyms(input = {}) {
  const raw = Array.isArray(input.synonyms) ? input.synonyms : String(input.synonyms || input.name || '').split(',');
  const synonyms = raw
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
  return [...new Set(synonyms)];
}

export function getNormalizedNutritionReferenceSynonyms(input = {}) {
  const synonyms = parseNutritionReferenceSynonyms(input);
  const normalized = synonyms
    .map((entry) => normalizeNutritionReferenceId(entry))
    .filter(Boolean);
  return [...new Set(normalized)];
}
