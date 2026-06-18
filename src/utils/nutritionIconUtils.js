export const DEFAULT_ADD_NUTRITION_ICON = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23007aff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>';
export const LEGACY_NUTRITION_PLUS_FALLBACK = '+';

export const DEFAULT_SAVE_MANUAL_AMOUNT_ICON = '💾';

export function normalizeNutritionEmptyIcon(icon) {
  if (typeof icon === 'string') {
    const normalizedIcon = icon.trim();
    if (normalizedIcon && normalizedIcon !== LEGACY_NUTRITION_PLUS_FALLBACK) {
      return normalizedIcon;
    }
  }
  return DEFAULT_ADD_NUTRITION_ICON;
}

export function normalizeNutritionSaveManualAmountIcon(icon) {
  if (typeof icon === 'string') {
    const normalizedIcon = icon.trim();
    if (normalizedIcon) return normalizedIcon;
  }
  return DEFAULT_SAVE_MANUAL_AMOUNT_ICON;
}
