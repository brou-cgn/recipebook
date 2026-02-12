/**
 * Default configuration values for customizable lists
 */
export const DEFAULT_CUISINE_TYPES = [
  'Italian',
  'Thai',
  'Chinese',
  'Japanese',
  'Indian',
  'Mexican',
  'French',
  'German',
  'American',
  'Mediterranean',
  'Vegetarian',
  'Vegan',
  'Other'
];

export const DEFAULT_MEAL_CATEGORIES = [
  'Appetizer',
  'Main Course',
  'Dessert',
  'Soup',
  'Salad',
  'Snack',
  'Beverage',
  'Side Dish'
];

export const DEFAULT_UNITS = [
  'g',
  'kg',
  'ml',
  'l',
  'tsp',
  'tbsp',
  'cup',
  'oz',
  'lb',
  'piece',
  'pinch'
];

/**
 * Get customizable lists from localStorage or return defaults
 */
export function getCustomLists() {
  const stored = localStorage.getItem('customLists');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Error parsing custom lists:', e);
    }
  }
  
  return {
    cuisineTypes: DEFAULT_CUISINE_TYPES,
    mealCategories: DEFAULT_MEAL_CATEGORIES,
    units: DEFAULT_UNITS
  };
}

/**
 * Save customizable lists to localStorage
 */
export function saveCustomLists(lists) {
  localStorage.setItem('customLists', JSON.stringify(lists));
}

/**
 * Reset lists to defaults
 */
export function resetCustomLists() {
  const defaultLists = {
    cuisineTypes: DEFAULT_CUISINE_TYPES,
    mealCategories: DEFAULT_MEAL_CATEGORIES,
    units: DEFAULT_UNITS
  };
  saveCustomLists(defaultLists);
  return defaultLists;
}
