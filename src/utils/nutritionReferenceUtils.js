export const NUTRITION_REFERENCE_FIELDS = [
  'kalorien',
  'protein',
  'fett',
  'kohlenhydrate',
  'zucker',
  'ballaststoffe',
  'salz',
];

/**
 * Maps nutrition source keys to their Firestore field name suffixes.
 * e.g. 'kalorien' + '_openfoodfacts' → 'kalorien_openfoodfacts'
 */
export const NUTRITION_SOURCE_SUFFIX = {
  openfoodfacts: '_openfoodfacts',
  'ai-generiert': '_ai',
  manual: '_manual',
};

/** Ordered list of sources used for effective-value priority (manual > openfoodfacts > ai). */
export const NUTRITION_SOURCE_PRIORITY = ['manual', 'openfoodfacts', 'ai-generiert'];
const CALORIES_PER_GRAM_FAT = 9;
const CALORIES_PER_GRAM_PROTEIN = 4;
const CALORIES_PER_GRAM_CARBS = 4;

/**
 * Returns the Firestore field name for a given base field and source,
 * e.g. getSourceFieldName('kalorien', 'openfoodfacts') → 'kalorien_openfoodfacts'.
 * Returns null for unknown sources.
 * @param {string} field
 * @param {string} source
 * @returns {string|null}
 */
export function getSourceFieldName(field, source) {
  const suffix = NUTRITION_SOURCE_SUFFIX[source];
  return suffix ? `${field}${suffix}` : null;
}

/**
 * Builds a partial Firestore update object with source-specific nutrition fields
 * for a single source, e.g. { kalorien_openfoodfacts: 82, protein_openfoodfacts: 4.3, … }.
 * Only includes fields that have a valid non-negative number.
 * @param {object} values  Plain { kalorien, protein, … } object
 * @param {string} source  One of 'openfoodfacts', 'ai-generiert', 'manual'
 * @returns {object}
 */
export function buildSourceNutritionFields(values = {}, source) {
  const suffix = NUTRITION_SOURCE_SUFFIX[source];
  if (!suffix) return {};
  return NUTRITION_REFERENCE_FIELDS.reduce((acc, key) => {
    const raw = values[key];
    if (raw === '' || raw == null) return acc;
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric >= 0) {
      acc[`${key}${suffix}`] = numeric;
    }
    return acc;
  }, {});
}

/**
 * Computes effective (flat) nutrition values from source-specific fields stored in a
 * data object (e.g. a Firestore document or a row in local state).
 * Priority: manual > openfoodfacts > ai-generiert.
 * Only includes fields for which at least one source has a valid value.
 * @param {object} data
 * @returns {object}  e.g. { kalorien: 18, protein: 2.1, … }
 */
export function computeEffectiveNutritionValues(data = {}) {
  return NUTRITION_REFERENCE_FIELDS.reduce((acc, field) => {
    for (const src of NUTRITION_SOURCE_PRIORITY) {
      const fname = getSourceFieldName(field, src);
      if (!fname) continue;
      const raw = data[fname];
      if (raw === '' || raw == null) continue;
      const numeric = Number(raw);
      if (Number.isFinite(numeric) && numeric >= 0) {
        acc[field] = numeric;
        break;
      }
    }
    return acc;
  }, {});
}

/**
 * Reads all source-specific nutrition fields from a data object.
 * Returns a flat object with keys like 'kalorien_openfoodfacts', 'protein_ai', etc.
 * @param {object} data
 * @returns {object}
 */
export function parseAllSourceNutritionFields(data = {}) {
  const result = {};
  for (const src of Object.keys(NUTRITION_SOURCE_SUFFIX)) {
    const suffix = NUTRITION_SOURCE_SUFFIX[src];
    for (const field of NUTRITION_REFERENCE_FIELDS) {
      const fname = `${field}${suffix}`;
      const raw = data[fname];
      if (raw === '' || raw == null) continue;
      const numeric = Number(raw);
      if (Number.isFinite(numeric) && numeric >= 0) {
        result[fname] = numeric;
      }
    }
  }
  return result;
}

function parseSingleNutritionValue(raw) {
  if (raw === '' || raw == null) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

export function getNutritionValuesForSource(data = {}, source = '') {
  const normalizedSource = String(source || '').trim().toLowerCase();
  const sourceFieldNames = NUTRITION_REFERENCE_FIELDS.reduce((acc, field) => {
    acc[field] = getSourceFieldName(field, normalizedSource);
    return acc;
  }, {});
  const hasSourceSpecificValues = NUTRITION_REFERENCE_FIELDS.some((field) => (
    sourceFieldNames[field] && parseSingleNutritionValue(data[sourceFieldNames[field]]) != null
  ));

  return NUTRITION_REFERENCE_FIELDS.reduce((acc, field) => {
    const sourceFieldName = sourceFieldNames[field];
    const sourceValue = sourceFieldName ? parseSingleNutritionValue(data[sourceFieldName]) : null;

    if (sourceValue != null) {
      acc[field] = sourceValue;
      return acc;
    }

    if (!hasSourceSpecificValues) {
      const flatValue = parseSingleNutritionValue(data[field]);
      if (flatValue != null) {
        acc[field] = flatValue;
      }
    }

    return acc;
  }, {});
}

function toNonNegativeNumber(raw) {
  if (raw === '' || raw == null) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function calculateSimilarityScore(baseValue, comparedValue) {
  if (baseValue == null || comparedValue == null) return null;
  if (baseValue === 0 && comparedValue === 0) return 100;
  const denominator = Math.max((Math.abs(baseValue) + Math.abs(comparedValue)) / 2, 1);
  const deviation = Math.abs(baseValue - comparedValue);
  const score = 100 - (deviation / denominator) * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getSourceNutritionValue(data, field, source, hasAnySourceSpecific) {
  const sourceFieldName = getSourceFieldName(field, source);
  const sourceSpecificValue = toNonNegativeNumber(sourceFieldName ? data[sourceFieldName] : null);
  if (sourceSpecificValue != null) return sourceSpecificValue;
  const normalizedSource = String(data.source || '').trim().toLowerCase();
  if (!hasAnySourceSpecific && normalizedSource === source) {
    return toNonNegativeNumber(data[field]);
  }
  return null;
}

export function calculateOpenFoodFactsDiagnostics(data = {}) {
  const hasAnySourceSpecific = Object.keys(NUTRITION_SOURCE_SUFFIX).some((source) => (
    NUTRITION_REFERENCE_FIELDS.some((field) => (
      toNonNegativeNumber(data[getSourceFieldName(field, source)]) != null
    ))
  ));

  const deviationToAiByField = {};
  const confidenceByField = {};
  NUTRITION_REFERENCE_FIELDS.forEach((field) => {
    const offValue = getSourceNutritionValue(data, field, 'openfoodfacts', hasAnySourceSpecific);
    const aiValue = getSourceNutritionValue(data, field, 'ai-generiert', hasAnySourceSpecific);
    deviationToAiByField[field] = offValue != null && aiValue != null ? offValue - aiValue : null;
    confidenceByField[field] = calculateSimilarityScore(offValue, aiValue);
  });

  const offFat = getSourceNutritionValue(data, 'fett', 'openfoodfacts', hasAnySourceSpecific);
  const offProtein = getSourceNutritionValue(data, 'protein', 'openfoodfacts', hasAnySourceSpecific);
  const offCarbs = getSourceNutritionValue(data, 'kohlenhydrate', 'openfoodfacts', hasAnySourceSpecific);
  const offCalories = getSourceNutritionValue(data, 'kalorien', 'openfoodfacts', hasAnySourceSpecific);
  const calculatedCalories = [offFat, offProtein, offCarbs].every((value) => value != null)
    ? (offFat * CALORIES_PER_GRAM_FAT)
      + (offProtein * CALORIES_PER_GRAM_PROTEIN)
      + (offCarbs * CALORIES_PER_GRAM_CARBS)
    : null;
  const calorieDeviation = offCalories != null && calculatedCalories != null
    ? offCalories - calculatedCalories
    : null;
  const calorieValidationConfidence = calculateSimilarityScore(offCalories, calculatedCalories);

  return {
    confidenceByField,
    deviationToAiByField,
    calorieValidation: {
      calculatedCalories,
      calorieDeviation,
      confidence: calorieValidationConfidence,
    },
  };
}

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
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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
