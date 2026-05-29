import {
  normalizeNutritionReferenceId,
  parseNutritionReferenceValues,
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
});
