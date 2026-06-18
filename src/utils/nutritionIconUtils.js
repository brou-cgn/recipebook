export const DEFAULT_ADD_NUTRITION_ICON = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23007aff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>';

export function normalizeNutritionEmptyIcon(icon) {
  if (typeof icon === 'string') {
    const normalizedIcon = icon.trim();
    if (normalizedIcon && normalizedIcon !== '+') {
      return normalizedIcon;
    }
  }
  return DEFAULT_ADD_NUTRITION_ICON;
}
