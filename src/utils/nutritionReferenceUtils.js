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

export const NUTRITION_REFERENCE_EMPTY_STATUS = '';
export const NUTRITION_REFERENCE_NEW_STATUS = 'Neu';
export const NUTRITION_REFERENCE_DATA_COLLECTION_PENDING_STATUS = 'Datenerfassung ausstehend';
export const NUTRITION_REFERENCE_CHECK_STATUS = 'Prüfung ausstehend';
export const NUTRITION_REFERENCE_APPROVED_STATUS = 'Freigegeben';
export const NUTRITION_REFERENCE_STATUS_OPTIONS = [
  NUTRITION_REFERENCE_EMPTY_STATUS,
  NUTRITION_REFERENCE_NEW_STATUS,
  NUTRITION_REFERENCE_DATA_COLLECTION_PENDING_STATUS,
  NUTRITION_REFERENCE_CHECK_STATUS,
  NUTRITION_REFERENCE_APPROVED_STATUS,
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

const LEGACY_STATUS_MAP = {
  validiert: NUTRITION_REFERENCE_APPROVED_STATUS,
  freizugeben: NUTRITION_REFERENCE_CHECK_STATUS,
  prüfen: NUTRITION_REFERENCE_CHECK_STATUS,
  pruefen: NUTRITION_REFERENCE_CHECK_STATUS,
  manuell: NUTRITION_REFERENCE_APPROVED_STATUS,
};

export function parseNutritionReferenceStatus(input = {}) {
  const raw = String(input.status || input.Status || '').trim();
  if (!raw) return NUTRITION_REFERENCE_EMPTY_STATUS;
  if (NUTRITION_REFERENCE_STATUS_OPTIONS.includes(raw)) return raw;
  const normalized = LEGACY_STATUS_MAP[raw.toLowerCase()];
  return normalized || NUTRITION_REFERENCE_DATA_COLLECTION_PENDING_STATUS;
}

export function getStatusAfterNutritionFetch(existingStatus = '') {
  const parsedStatus = parseNutritionReferenceStatus({ status: existingStatus });
  if (parsedStatus === NUTRITION_REFERENCE_NEW_STATUS) {
    return NUTRITION_REFERENCE_NEW_STATUS;
  }
  return NUTRITION_REFERENCE_CHECK_STATUS;
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
