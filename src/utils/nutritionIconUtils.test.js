import {
  DEFAULT_ADD_NUTRITION_ICON,
  LEGACY_NUTRITION_PLUS_FALLBACK,
  normalizeNutritionEmptyIcon,
} from './nutritionIconUtils';

describe('nutritionIconUtils', () => {
  test('replaces legacy plus fallback with default add nutrition icon', () => {
    expect(normalizeNutritionEmptyIcon(LEGACY_NUTRITION_PLUS_FALLBACK)).toBe(DEFAULT_ADD_NUTRITION_ICON);
  });

  test('keeps configured custom icon values', () => {
    expect(normalizeNutritionEmptyIcon('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });
});
