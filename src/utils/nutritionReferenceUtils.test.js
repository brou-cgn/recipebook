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
});
