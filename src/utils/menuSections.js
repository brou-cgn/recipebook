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
  return [];
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
    recipes: allRecipes.filter(recipe => section.recipeIds?.includes(recipe.id))
  }));
};

/**
 * Create a new menu section object
 * @param {string} name - Section name
 * @param {Array} recipeIds - Array of recipe IDs in this section
 * @returns {Object} Section object
 */
export const createMenuSection = (name, recipeIds = []) => {
  return {
    name: name.trim(),
    recipeIds: recipeIds
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
