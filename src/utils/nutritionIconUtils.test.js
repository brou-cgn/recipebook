import { DEFAULT_ADD_NUTRITION_ICON, normalizeNutritionEmptyIcon } from './nutritionIconUtils';

describe('nutritionIconUtils', () => {
  test('replaces legacy plus fallback with default add nutrition icon', () => {
    expect(normalizeNutritionEmptyIcon('+')).toBe(DEFAULT_ADD_NUTRITION_ICON);
  });

  test('keeps configured custom icon values', () => {
    expect(normalizeNutritionEmptyIcon('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });
});
