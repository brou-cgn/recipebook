/**
 * Menu Sections Utilities
 * Handles menu sections for organizing recipes within menus
 */

const MENU_SECTIONS_KEY = 'menuSections';

/**
 * Get all saved menu sections from localStorage
 * These are sections that have been used before and can be reused
 * @returns {Array} Array of unique section names
 */
export const getSavedSections = () => {
  const sectionsJson = localStorage.getItem(MENU_SECTIONS_KEY);
  return sectionsJson ? JSON.parse(sectionsJson) : getDefaultSections();
};

/**
 * Get default section names for menus
 * @returns {Array} Array of default section names
 */
export const getDefaultSections = () => {
  return [
    'Vorspeise',
    'Hauptspeise',
    'Dessert',
    'Drinks'
  ];
};

/**
 * Save a new section name for future use
 * @param {string} sectionName - Section name to save
 * @returns {boolean} True if saved successfully
 */
export const saveSectionName = (sectionName) => {
  if (!sectionName || typeof sectionName !== 'string') return false;
  
  const trimmedName = sectionName.trim();
  if (!trimmedName) return false;
  
  const savedSections = getSavedSections();
  
  // Don't add if already exists (case-insensitive check)
  if (savedSections.some(s => s.toLowerCase() === trimmedName.toLowerCase())) {
    return true;
  }
  
  // Add new section
  const updatedSections = [...savedSections, trimmedName];
  localStorage.setItem(MENU_SECTIONS_KEY, JSON.stringify(updatedSections));
  
  return true;
};

/**
 * Save multiple section names at once
 * @param {Array} sectionNames - Array of section names to save
 * @returns {boolean} True if saved successfully
 */
export const saveSectionNames = (sectionNames) => {
  if (!sectionNames || !Array.isArray(sectionNames)) return false;
  
  sectionNames.forEach(name => saveSectionName(name));
  return true;
};

/**
 * Group recipes by their sections within a menu
 * @param {Array} menuSections - Array of section objects from menu (e.g., [{name: 'Vorspeise', recipeIds: ['1', '2']}])
 * @param {Array} allRecipes - Array of all recipe objects
 * @returns {Array} Array of section objects with populated recipes
 */
export const groupRecipesBySections = (menuSections, allRecipes) => {
  if (!menuSections || !Array.isArray(menuSections) || !allRecipes || !Array.isArray(allRecipes)) {
    return [];
  }

  return menuSections.map(section => ({
    name: section.name,
    recipes: (section.recipeIds || [])
      .map(id => allRecipes.find(recipe => recipe.id === id))
      .filter(Boolean),
    // Manually added drink-catalog IDs (see the "Drinks" section) aren't recipes,
    // so they're passed through as-is for the UI to resolve and render separately.
    ...(Array.isArray(section.drinkIds) ? { drinkIds: section.drinkIds } : {}),
    // Free-sort order (recipe/event/manual composite IDs) for the "Drinks"
    // section, so recipes and drinks can be interleaved instead of recipes
    // always rendering above drinks. See applyItemOrder.
    ...(Array.isArray(section.itemOrder) ? { itemOrder: section.itemOrder } : {}),
  }));
};

/**
 * Reconciles a saved display order (array of composite item keys) against the
 * current set of items: items whose key is in `order` keep that relative
 * order, and any item not yet in `order` (e.g. newly added) is appended at
 * the end in its natural position. Used to render/persist the free-sort
 * order of a menu section's "Drinks" list (recipes + drinks interleaved).
 * @param {Array} order - Saved array of composite item keys
 * @param {Array} items - Current items to order
 * @param {Function} keyFn - Extracts the composite key from an item
 * @returns {Array} Items ordered per `order`, with unseen items appended
 */
export const applyItemOrder = (order, items, keyFn) => {
  const safeOrder = Array.isArray(order) ? order : [];
  const byKey = new Map(items.map((item) => [keyFn(item), item]));
  const ordered = safeOrder.map((key) => byKey.get(key)).filter(Boolean);
  const seen = new Set(safeOrder);
  items.forEach((item) => {
    if (!seen.has(keyFn(item))) ordered.push(item);
  });
  return ordered;
};

/**
 * Create a new menu section object
 * @param {string} name - Section name
 * @param {Array} recipeIds - Array of recipe IDs in this section
 * @param {Array} [drinkIds] - Array of manually added drink-catalog IDs (only meaningful for the "Drinks" section)
 * @returns {Object} Section object
 */
export const createMenuSection = (name, recipeIds = [], drinkIds = undefined) => {
  return {
    name: name.trim(),
    recipeIds: recipeIds,
    ...(drinkIds !== undefined ? { drinkIds } : {}),
  };
};

/**
 * Validate menu sections structure
 * @param {Array} sections - Array of section objects
 * @returns {boolean} True if valid
 */
export const validateMenuSections = (sections) => {
  if (!sections || !Array.isArray(sections) || sections.length === 0) return false;
  
  return sections.every(section => 
    section && 
    typeof section === 'object' &&
    typeof section.name === 'string' &&
    section.name.trim() !== '' &&
    Array.isArray(section.recipeIds)
  );
};
