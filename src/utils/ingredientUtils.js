/**
 * Ingredient Utilities
 * Handles ingredient data normalization and recipe linking
 */

/**
 * Normalize ingredient to object format
 * Supports backward compatibility with string ingredients
 * @param {string|Object} ingredient - Ingredient in any format
 * @returns {Object} Normalized ingredient object
 */
export const normalizeIngredient = (ingredient) => {
  // If already an object with type, return as is
  if (typeof ingredient === 'object' && ingredient !== null && ingredient.type) {
    return ingredient;
  }
  
  // If string, convert to text type
  if (typeof ingredient === 'string') {
    return {
      type: 'text',
      value: ingredient
    };
  }
  
  // Fallback for any other format
  return {
    type: 'text',
    value: String(ingredient || '')
  };
};

/**
 * Convert ingredient object to storage format
 * For backward compatibility, text ingredients are stored as strings
 * @param {Object} ingredient - Normalized ingredient object
 * @returns {string|Object} Storage format (string for text, object for recipe)
 */
export const toStorageFormat = (ingredient) => {
  const normalized = normalizeIngredient(ingredient);
  
  // Store text ingredients as strings for backward compatibility
  if (normalized.type === 'text') {
    return normalized.value;
  }
  
  // Store recipe links as objects
  if (normalized.type === 'recipe') {
    return {
      type: 'recipe',
      recipeId: normalized.recipeId,
      recipeName: normalized.recipeName || ''
    };
  }
  
  return normalized.value || '';
};

/**
 * Check if ingredient is a recipe link
 * @param {string|Object} ingredient - Ingredient in any format
 * @returns {boolean} True if ingredient is a recipe link
 */
export const isRecipeIngredient = (ingredient) => {
  if (typeof ingredient === 'object' && ingredient !== null) {
    return ingredient.type === 'recipe' && Boolean(ingredient.recipeId);
  }
  return false;
};

/**
 * Get display value for ingredient
 * @param {string|Object} ingredient - Ingredient in any format
 * @param {Array} allRecipes - All available recipes for lookup
 * @returns {string} Display value
 */
export const getIngredientDisplayValue = (ingredient, allRecipes = []) => {
  const normalized = normalizeIngredient(ingredient);
  
  if (normalized.type === 'recipe' && normalized.recipeId) {
    // Try to get fresh recipe name from allRecipes
    const recipe = allRecipes.find(r => r.id === normalized.recipeId);
    if (recipe) {
      return recipe.title;
    }
    // Fallback to stored recipe name
    return normalized.recipeName || 'Rezept nicht gefunden';
  }
  
  return normalized.value || '';
};

/**
 * Create a recipe ingredient object
 * @param {string} recipeId - ID of the linked recipe
 * @param {string} recipeName - Name of the linked recipe
 * @returns {Object} Recipe ingredient object
 */
export const createRecipeIngredient = (recipeId, recipeName) => {
  return {
    type: 'recipe',
    recipeId,
    recipeName
  };
};
