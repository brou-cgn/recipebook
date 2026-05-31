import {
  normalizeNutritionReferenceId,
  parseNutritionReferenceValues,
  parseNutritionReferenceFallbackWeight,
  parseNutritionReferenceSynonyms,
  getNormalizedNutritionReferenceSynonyms,
} from './nutritionReferenceUtils';

describe('nutritionReferenceUtils', () => {
  test('normalizeNutritionReferenceId creates stable ids', () => {
    expect(normalizeNutritionReferenceId('Crème fraîche')).toBe('creme-fraiche');
    expect(normalizeNutritionReferenceId('  Weißkohl  ')).toBe('weisskohl');
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
    test('parses and de-duplicates values from comma-separated strings', () => {
      expect(parseNutritionReferenceSynonyms({ synonyms: 'Tomate, Paradeiser, Tomate' })).toEqual(['Tomate', 'Paradeiser']);
    });

    test('falls back to name when no synonyms are provided', () => {
      expect(parseNutritionReferenceSynonyms({ name: 'Kartoffel' })).toEqual(['Kartoffel']);
    });
  });

  describe('getNormalizedNutritionReferenceSynonyms', () => {
    test('normalizes parsed synonyms for lookup ids', () => {
      expect(getNormalizedNutritionReferenceSynonyms({ synonyms: ['Crème fraîche', 'Weißkohl'] })).toEqual(['creme-fraiche', 'weisskohl']);
    });
  });
});
