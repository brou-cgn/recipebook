export const NUTRITION_REFERENCE_FIELDS = [
  'kalorien',
  'protein',
  'fett',
  'kohlenhydrate',
  'zucker',
  'ballaststoffe',
  'salz',
];

export const NUTRITION_REFERENCE_BOOLEAN_FIELDS = [
  'seasonRelevant',
  'nutritionRelevant',
  'isFresh',
  'isSpice',
  'isProcessed',
];

export const NUTRITION_REFERENCE_PENDING_STATUS = 'Freizugeben';
export const NUTRITION_REFERENCE_MANUAL_STATUS = 'manuell';

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

export function parseNutritionReferenceBooleanFields(input = {}) {
  return NUTRITION_REFERENCE_BOOLEAN_FIELDS.reduce((acc, key) => {
    const raw = input[key];
    if (raw == null || raw === '') {
      return acc;
    }
    if (typeof raw === 'boolean') {
      acc[key] = raw;
      return acc;
    }
    if (typeof raw === 'number' && (raw === 0 || raw === 1)) {
      acc[key] = Boolean(raw);
      return acc;
    }

    const normalized = String(raw).trim().toLowerCase();
    if (['true', '1', 'ja', 'yes'].includes(normalized)) {
      acc[key] = true;
    } else if (['false', '0', 'nein', 'no'].includes(normalized)) {
      acc[key] = false;
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
  const parseEntry = (value) => {
    const raw = String(value || '');
    const delimiter = raw.includes('|') ? '|' : raw.includes(';') ? ';' : ',';
    return raw.split(delimiter).map((entry) => entry.trim()).filter(Boolean);
  };

  if (Array.isArray(input.synonyms)) {
    return [...new Set(input.synonyms.flatMap((entry) => parseEntry(entry)))];
  }
  return [...new Set(parseEntry(input.synonyms || input.name || ''))];
}

export function parseNutritionReferencePossibleUnits(input = {}) {
  if (Array.isArray(input.possibleUnits)) {
    return [...new Set(input.possibleUnits.map((u) => String(u || '').trim()).filter(Boolean))];
  }
  const raw = String(input.possibleUnits || '');
  if (!raw.trim()) return [];
  const delimiter = raw.includes('|') ? '|' : raw.includes(';') ? ';' : ',';
  return [...new Set(raw.split(delimiter).map((u) => u.trim()).filter(Boolean))];
}

export function parseNutritionReferenceStatus(input = {}) {
  return String(input.status || input.Status || '').trim();
}

export function scaleNutritionValues(per100g, amountG) {
  const result = {};
  for (const field of NUTRITION_REFERENCE_FIELDS) {
    if (per100g[field] != null) {
      result[field] = (per100g[field] / 100) * amountG;
    }
  }
  return result;
}

export function getNormalizedNutritionReferenceSynonyms(input = {}) {
  const synonyms = parseNutritionReferenceSynonyms(input);
  const normalized = synonyms
    .map((entry) => normalizeNutritionReferenceId(entry))
    .filter(Boolean);
  return [...new Set(normalized)];
}
