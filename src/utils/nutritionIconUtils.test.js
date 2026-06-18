import {
  DEFAULT_ADD_NUTRITION_ICON,
  DEFAULT_SAVE_MANUAL_AMOUNT_ICON,
  LEGACY_NUTRITION_PLUS_FALLBACK,
  normalizeNutritionEmptyIcon,
  normalizeNutritionSaveManualAmountIcon,
} from './nutritionIconUtils';

describe('nutritionIconUtils', () => {
  test('replaces legacy plus fallback with default add nutrition icon', () => {
    expect(normalizeNutritionEmptyIcon(LEGACY_NUTRITION_PLUS_FALLBACK)).toBe(DEFAULT_ADD_NUTRITION_ICON);
  });

  test('keeps configured custom icon values', () => {
    expect(normalizeNutritionEmptyIcon('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });
});

describe('normalizeNutritionSaveManualAmountIcon', () => {
  test('returns default save icon when called with no argument', () => {
    expect(normalizeNutritionSaveManualAmountIcon()).toBe(DEFAULT_SAVE_MANUAL_AMOUNT_ICON);
  });

  test('returns default save icon for null', () => {
    expect(normalizeNutritionSaveManualAmountIcon(null)).toBe(DEFAULT_SAVE_MANUAL_AMOUNT_ICON);
  });

  test('returns default save icon for empty string', () => {
    expect(normalizeNutritionSaveManualAmountIcon('')).toBe(DEFAULT_SAVE_MANUAL_AMOUNT_ICON);
  });

  test('returns default save icon for whitespace-only string', () => {
    expect(normalizeNutritionSaveManualAmountIcon('   ')).toBe(DEFAULT_SAVE_MANUAL_AMOUNT_ICON);
  });

  test('returns custom emoji when provided', () => {
    expect(normalizeNutritionSaveManualAmountIcon('✔')).toBe('✔');
  });

  test('returns custom base64 image string when provided', () => {
    expect(normalizeNutritionSaveManualAmountIcon('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });

  test('trims whitespace from provided icon', () => {
    expect(normalizeNutritionSaveManualAmountIcon('  ✔  ')).toBe('✔');
  });
});
