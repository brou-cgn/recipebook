import {
  getStatusAfterNutritionFetch,
  parseNutritionReferenceBooleanFields,
  NUTRITION_REFERENCE_STATUS_OPTIONS,
  normalizeNutritionReferenceId,
  parseNutritionReferenceValues,
  parseNutritionReferenceFallbackWeight,
  parseNutritionReferenceSynonyms,
  parseNutritionReferencePossibleUnits,
  getNormalizedNutritionReferenceSynonyms,
  buildNutritionSet,
  buildNutritionTrackingFields,
  buildSourceNutritionFields,
  computeEffectiveNutritionValues,
  getNutritionValuesForSource,
  parseAllSourceNutritionFields,
  getSourceFieldName,
  calculateOpenFoodFactsDiagnostics,
} from './nutritionReferenceUtils';

describe('nutritionReferenceUtils', () => {
  test('normalizeNutritionReferenceId creates stable ids', () => {
    expect(normalizeNutritionReferenceId('Crème fraîche')).toBe('creme-fraiche');
    expect(normalizeNutritionReferenceId('  Weißkohl  ')).toBe('weisskohl');
    expect(normalizeNutritionReferenceId('Äpfel')).toBe('aepfel');
    expect(normalizeNutritionReferenceId('Öl')).toBe('oel');
    expect(normalizeNutritionReferenceId('Müsli')).toBe('muesli');
    expect(normalizeNutritionReferenceId('Straße')).toBe('strasse');
    expect(normalizeNutritionReferenceId('')).toBe('');
  });

  test('parseNutritionReferenceValues keeps only valid non-negative numbers', () => {
    expect(
      parseNutritionReferenceValues({
        kalorien: '123',
        protein: 3.4,
        fett: -1,
        kohlenhydrate: 'abc',
        zucker: '',
        ballaststoffe: null,
        salz: '0.8',
      })
    ).toEqual({
      kalorien: 123,
      protein: 3.4,
      salz: 0.8,
    });
  });

  test('offers the new status concept options', () => {
    expect(NUTRITION_REFERENCE_STATUS_OPTIONS).toEqual([
      '',
      'Neu',
      'Datenerfassung ausstehend',
      'Prüfung ausstehend',
      'Freigegeben',
    ]);
  });

  describe('getStatusAfterNutritionFetch', () => {
    test('returns Prüfung ausstehend for existing non-new statuses', () => {
      expect(getStatusAfterNutritionFetch('Freigegeben')).toBe('Prüfung ausstehend');
      expect(getStatusAfterNutritionFetch('')).toBe('Prüfung ausstehend');
    });

    test('keeps Neu for newly created ingredient ids', () => {
      expect(getStatusAfterNutritionFetch('Neu')).toBe('Neu');
    });

    test('maps legacy statuses to the new concept during refresh', () => {
      expect(getStatusAfterNutritionFetch('Validiert')).toBe('Prüfung ausstehend');
      expect(getStatusAfterNutritionFetch('Freizugeben')).toBe('Prüfung ausstehend');
    });
  });

  describe('parseNutritionReferenceFallbackWeight', () => {
    test('returns positive number from defaultAmountG', () => {
      expect(parseNutritionReferenceFallbackWeight({ defaultAmountG: 2 })).toBe(2);
      expect(parseNutritionReferenceFallbackWeight({ defaultAmountG: '0.5' })).toBe(0.5);
      expect(parseNutritionReferenceFallbackWeight({ defaultAmountG: 100 })).toBe(100);
    });

    test('returns null for missing or empty defaultAmountG', () => {
      expect(parseNutritionReferenceFallbackWeight({})).toBeNull();
      expect(parseNutritionReferenceFallbackWeight({ defaultAmountG: '' })).toBeNull();
      expect(parseNutritionReferenceFallbackWeight({ defaultAmountG: null })).toBeNull();
    });

    test('returns null for zero or negative defaultAmountG', () => {
      expect(parseNutritionReferenceFallbackWeight({ defaultAmountG: 0 })).toBeNull();
      expect(parseNutritionReferenceFallbackWeight({ defaultAmountG: -1 })).toBeNull();
    });

    test('returns null for non-numeric defaultAmountG', () => {
      expect(parseNutritionReferenceFallbackWeight({ defaultAmountG: 'abc' })).toBeNull();
    });

    test('returns null when called with no argument', () => {
      expect(parseNutritionReferenceFallbackWeight()).toBeNull();
    });
  });

  describe('parseNutritionReferenceSynonyms', () => {
    test('parses array with one semicolon-separated entry into multiple values', () => {
      expect(parseNutritionReferenceSynonyms({
        synonyms: ['schupfnudeln;nudeln;pasta;spaghetti;nudel_getrocknet'],
      })).toEqual(['schupfnudeln', 'nudeln', 'pasta', 'spaghetti', 'nudel_getrocknet']);
    });

    test('parses arrays with mixed plain and delimited entries', () => {
      expect(parseNutritionReferenceSynonyms({
        synonyms: ['karotte', 'möhren;mohren', 'karotten'],
      })).toEqual(['karotte', 'möhren', 'mohren', 'karotten']);
    });

    test('deduplicates values parsed from delimited array entries', () => {
      expect(parseNutritionReferenceSynonyms({
        synonyms: ['tomate;paradeiser', 'tomate', 'paradeiser'],
      })).toEqual(['tomate', 'paradeiser']);
    });

    test('parses and de-duplicates values from comma-separated strings', () => {
      expect(parseNutritionReferenceSynonyms({ synonyms: 'Tomate, Paradeiser, Tomate' })).toEqual(['Tomate', 'Paradeiser']);
    });

    test('parses semicolon-separated strings', () => {
      expect(parseNutritionReferenceSynonyms({ synonyms: 'karotte;möhren;mohren;karotten' })).toEqual([
        'karotte',
        'möhren',
        'mohren',
        'karotten',
      ]);
    });

    test('parses pipe-separated strings', () => {
      expect(parseNutritionReferenceSynonyms({ synonyms: 'karotte|möhren|mohren' })).toEqual([
        'karotte',
        'möhren',
        'mohren',
      ]);
    });

    test('keeps existing string parsing behavior for semicolon-separated values', () => {
      expect(parseNutritionReferenceSynonyms({ synonyms: 'schupfnudeln;nudeln;pasta;spaghetti' })).toEqual([
        'schupfnudeln',
        'nudeln',
        'pasta',
        'spaghetti',
      ]);
    });

    describe('parseNutritionReferenceBooleanFields', () => {
      test('parses boolean-like values', () => {
        expect(parseNutritionReferenceBooleanFields({
          seasonRelevant: 'ja',
          nutritionRelevant: 'false',
          isFresh: 1,
          isSpice: 0,
          isProcessed: true,
        })).toEqual({
          seasonRelevant: true,
          nutritionRelevant: false,
          isFresh: true,
          isSpice: false,
          isProcessed: true,
        });
      });

      test('ignores empty and invalid values', () => {
        expect(parseNutritionReferenceBooleanFields({
          seasonRelevant: '',
          nutritionRelevant: null,
          isFresh: 'maybe',
        })).toEqual({});
      });
    });

    test('falls back to name when no synonyms are provided', () => {
      expect(parseNutritionReferenceSynonyms({ name: 'Kartoffel' })).toEqual(['Kartoffel']);
    });
  });

  describe('parseNutritionReferencePossibleUnits', () => {
    test('parses comma-separated strings', () => {
      expect(parseNutritionReferencePossibleUnits({ possibleUnits: 'g,kg,stück' })).toEqual(['g', 'kg', 'stück']);
    });

    test('parses semicolon-separated strings', () => {
      expect(parseNutritionReferencePossibleUnits({ possibleUnits: 'g;kg;stück' })).toEqual(['g', 'kg', 'stück']);
    });

    test('parses pipe-separated strings', () => {
      expect(parseNutritionReferencePossibleUnits({ possibleUnits: 'g|kg|stück' })).toEqual(['g', 'kg', 'stück']);
    });
  });

  describe('getNormalizedNutritionReferenceSynonyms', () => {
    test('normalizes parsed synonyms for lookup ids', () => {
      expect(getNormalizedNutritionReferenceSynonyms({ synonyms: ['Crème fraîche', 'Weißkohl'] })).toEqual(['creme-fraiche', 'weisskohl']);
    });
  });

  describe('getSourceFieldName', () => {
    test('returns suffixed field name for known sources', () => {
      expect(getSourceFieldName('kalorien', 'openfoodfacts')).toBe('kalorien_openfoodfacts');
      expect(getSourceFieldName('protein', 'ai-generiert')).toBe('protein_ai');
      expect(getSourceFieldName('fett', 'manual')).toBe('fett_manual');
    });

    test('returns null for unknown sources', () => {
      expect(getSourceFieldName('kalorien', 'unknown')).toBeNull();
      expect(getSourceFieldName('kalorien', '')).toBeNull();
    });
  });

  describe('buildSourceNutritionFields', () => {
    test('builds source-specific field keys for openfoodfacts', () => {
      expect(buildSourceNutritionFields({ kalorien: 82, protein: 4.3 }, 'openfoodfacts')).toEqual({
        kalorien_openfoodfacts: 82,
        protein_openfoodfacts: 4.3,
      });
    });

    test('builds source-specific field keys for ai-generiert', () => {
      expect(buildSourceNutritionFields({ kalorien: 80 }, 'ai-generiert')).toEqual({
        kalorien_ai: 80,
      });
    });

    test('builds source-specific field keys for manual', () => {
      expect(buildSourceNutritionFields({ salz: 0.5 }, 'manual')).toEqual({
        salz_manual: 0.5,
      });
    });

    test('skips empty or null values', () => {
      expect(buildSourceNutritionFields({ kalorien: null, protein: '' }, 'manual')).toEqual({});
    });

    test('skips negative values', () => {
      expect(buildSourceNutritionFields({ kalorien: -5 }, 'manual')).toEqual({});
    });

    test('returns empty object for unknown source', () => {
      expect(buildSourceNutritionFields({ kalorien: 100 }, 'unknown')).toEqual({});
    });
  });

  describe('buildNutritionSet', () => {
    test('creates a normalized nutrition set entry', () => {
      expect(buildNutritionSet({ kalorien: 82, protein: 4.3 }, 'OpenFoodFacts')).toEqual([
        { source: 'openfoodfacts', kalorien: 82, protein: 4.3 },
      ]);
    });

    test('returns empty array when values are invalid', () => {
      expect(buildNutritionSet({ kalorien: '', protein: -1 }, 'manual')).toEqual([]);
    });
  });

  describe('buildNutritionTrackingFields', () => {
    test('initializes nutritionSetActual on first write', () => {
      expect(buildNutritionTrackingFields({
        previousData: {},
        nextValues: { kalorien: 100, protein: 2 },
        nextSource: 'openfoodfacts',
      })).toEqual({
        nutritionSetActual: [{ source: 'openfoodfacts', kalorien: 100, protein: 2 }],
        nutritionSetOutdated: [],
        recalc: false,
      });
    });

    test('moves previous actual to outdated and sets recalc on >5% calorie delta', () => {
      expect(buildNutritionTrackingFields({
        previousData: {
          source: 'openfoodfacts',
          nutritionSetActual: [{ source: 'openfoodfacts', kalorien: 100, protein: 2 }],
        },
        nextValues: { kalorien: 110, protein: 2.2 },
        nextSource: 'ai-generiert',
      })).toEqual({
        nutritionSetActual: [{ source: 'ai-generiert', kalorien: 110, protein: 2.2 }],
        nutritionSetOutdated: [{ source: 'openfoodfacts', kalorien: 100, protein: 2 }],
        recalc: true,
      });
    });

    test('keeps sets unchanged when switching source to manual', () => {
      expect(buildNutritionTrackingFields({
        previousData: {
          source: 'openfoodfacts',
          nutritionSetActual: [{ source: 'openfoodfacts', kalorien: 100 }],
          nutritionSetOutdated: [{ source: 'ai-generiert', kalorien: 97 }],
          recalc: false,
        },
        nextValues: { kalorien: 90 },
        nextSource: 'manual',
        preserveOnManualSourceChange: true,
      })).toEqual({
        nutritionSetActual: [{ source: 'openfoodfacts', kalorien: 100 }],
        nutritionSetOutdated: [{ source: 'ai-generiert', kalorien: 97 }],
        recalc: false,
      });
    });

    test('shifts sets for approval transition without recalc below threshold', () => {
      expect(buildNutritionTrackingFields({
        previousData: {
          source: 'manual',
          nutritionSetActual: [{ source: 'manual', kalorien: 100 }],
        },
        nextValues: { kalorien: 101 },
        nextSource: 'manual',
        forceRecalc: true,
      })).toEqual({
        nutritionSetActual: [{ source: 'manual', kalorien: 101 }],
        nutritionSetOutdated: [{ source: 'manual', kalorien: 100 }],
        recalc: false,
      });
    });

    test('forces recalc on approval transition when calorie delta exceeds threshold', () => {
      expect(buildNutritionTrackingFields({
        previousData: {
          source: 'manual',
          nutritionSetActual: [{ source: 'manual', kalorien: 100 }],
        },
        nextValues: { kalorien: 110 },
        nextSource: 'manual',
        forceRecalc: true,
      })).toEqual({
        nutritionSetActual: [{ source: 'manual', kalorien: 110 }],
        nutritionSetOutdated: [{ source: 'manual', kalorien: 100 }],
        recalc: true,
      });
    });
  });

  describe('computeEffectiveNutritionValues', () => {
    test('prefers manual over openfoodfacts and ai', () => {
      expect(computeEffectiveNutritionValues({
        kalorien_manual: 50,
        kalorien_openfoodfacts: 82,
        kalorien_ai: 80,
      })).toEqual({ kalorien: 50 });
    });

    test('falls back to openfoodfacts when manual is absent', () => {
      expect(computeEffectiveNutritionValues({
        kalorien_openfoodfacts: 82,
        kalorien_ai: 80,
      })).toEqual({ kalorien: 82 });
    });

    test('falls back to ai when only ai value is present', () => {
      expect(computeEffectiveNutritionValues({
        kalorien_ai: 80,
      })).toEqual({ kalorien: 80 });
    });

    test('returns empty object when no source fields are present', () => {
      expect(computeEffectiveNutritionValues({})).toEqual({});
    });

    test('combines multiple fields from different sources', () => {
      expect(computeEffectiveNutritionValues({
        kalorien_manual: 50,
        protein_openfoodfacts: 4.3,
        fett_ai: 1.2,
      })).toEqual({ kalorien: 50, protein: 4.3, fett: 1.2 });
    });

    test('skips negative or invalid values', () => {
      expect(computeEffectiveNutritionValues({
        kalorien_manual: -1,
        kalorien_openfoodfacts: 82,
      })).toEqual({ kalorien: 82 });
    });
  });

  describe('parseAllSourceNutritionFields', () => {
    test('reads all source-specific fields from data', () => {
      const data = {
        kalorien_openfoodfacts: 82,
        kalorien_ai: 80,
        kalorien_manual: 50,
        protein_openfoodfacts: 4.3,
        // flat fields should be ignored
        kalorien: 50,
      };
      expect(parseAllSourceNutritionFields(data)).toEqual({
        kalorien_openfoodfacts: 82,
        kalorien_ai: 80,
        kalorien_manual: 50,
        protein_openfoodfacts: 4.3,
      });
    });

    test('returns empty object when no source-specific fields exist', () => {
      expect(parseAllSourceNutritionFields({ kalorien: 82 })).toEqual({});
    });
  });

  describe('getNutritionValuesForSource', () => {
    test('uses source-specific nutrition fields for openfoodfacts rows', () => {
      expect(getNutritionValuesForSource({
        source: 'openfoodfacts',
        kalorien: 50,
        kalorien_openfoodfacts: 82,
        protein_openfoodfacts: 4.3,
        protein_manual: 9.9,
      }, 'openfoodfacts')).toEqual({
        kalorien: 82,
        protein: 4.3,
      });
    });

    test('uses source-specific nutrition fields for ai-generiert rows', () => {
      expect(getNutritionValuesForSource({
        kalorien: 50,
        kalorien_ai: 80,
        protein_ai: 3.2,
      }, 'ai-generiert')).toEqual({
        kalorien: 80,
        protein: 3.2,
      });
    });

    test('falls back to flat fields when no source-specific values exist for the source', () => {
      expect(getNutritionValuesForSource({
        kalorien: 50,
        protein: 4.3,
      }, 'manual')).toEqual({
        kalorien: 50,
        protein: 4.3,
      });
    });
  });

  describe('calculateOpenFoodFactsDiagnostics', () => {
    test('calculates per-field confidence, deviations and calorie formula validation', () => {
      expect(calculateOpenFoodFactsDiagnostics({
        source: 'openfoodfacts',
        kalorien_openfoodfacts: 90,
        protein_openfoodfacts: 5,
        fett_openfoodfacts: 4,
        kohlenhydrate_openfoodfacts: 10,
        kalorien_ai: 88,
        protein_ai: 4,
        fett_ai: 5,
        kohlenhydrate_ai: 12,
      })).toEqual({
        confidenceByField: {
          kalorien: 98,
          protein: 78,
          fett: 78,
          kohlenhydrate: 82,
          zucker: null,
          ballaststoffe: null,
          salz: null,
        },
        overallConfidence: 84,
        deviationToAiByField: {
          kalorien: 2,
          protein: 1,
          fett: -1,
          kohlenhydrate: -2,
          zucker: null,
          ballaststoffe: null,
          salz: null,
        },
        calorieValidation: {
          calculatedCalories: 96,
          calorieDeviation: -6,
          confidence: 94,
        },
      });
    });

    test('uses legacy flat openfoodfacts values only for matching source rows', () => {
      expect(calculateOpenFoodFactsDiagnostics({
        source: 'openfoodfacts',
        kalorien: 120,
        protein: 3,
        fett: 2,
        kohlenhydrate: 20,
      })).toEqual({
        confidenceByField: {
          kalorien: null,
          protein: null,
          fett: null,
          kohlenhydrate: null,
          zucker: null,
          ballaststoffe: null,
          salz: null,
        },
        overallConfidence: null,
        deviationToAiByField: {
          kalorien: null,
          protein: null,
          fett: null,
          kohlenhydrate: null,
          zucker: null,
          ballaststoffe: null,
          salz: null,
        },
        calorieValidation: {
          calculatedCalories: 110,
          calorieDeviation: 10,
          confidence: 91,
        },
      });
    });
  });
});
