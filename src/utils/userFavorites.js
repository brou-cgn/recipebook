/**
 * User Favorites Utilities
 * Handles user-specific favorite recipes storage and management
 */

const USER_FAVORITES_KEY = 'userFavorites';

/**
 * Get all user favorites from localStorage
 * @returns {Object} Object with userId as keys and arrays of recipeIds as values
 */
export const getAllUserFavorites = () => {
  const favoritesJson = localStorage.getItem(USER_FAVORITES_KEY);
  return favoritesJson ? JSON.parse(favoritesJson) : {};
};

/**
 * Save all user favorites to localStorage
 * @param {Object} favorites - Object with userId as keys and arrays of recipeIds as values
 */
export const saveAllUserFavorites = (favorites) => {
  localStorage.setItem(USER_FAVORITES_KEY, JSON.stringify(favorites));
};

/**
 * Get favorite recipe IDs for a specific user
 * @param {string} userId - User ID
 * @returns {Array} Array of recipe IDs that are favorites for this user
 */
export const getUserFavorites = (userId) => {
  if (!userId) return [];
  const allFavorites = getAllUserFavorites();
  return allFavorites[userId] || [];
};

/**
 * Check if a recipe is a favorite for a specific user
 * @param {string} userId - User ID
 * @param {string} recipeId - Recipe ID
 * @returns {boolean} True if the recipe is a favorite for this user
 */
export const isRecipeFavorite = (userId, recipeId) => {
  if (!userId || !recipeId) return false;
  const userFavorites = getUserFavorites(userId);
  return userFavorites.includes(recipeId);
};

/**
 * Add a recipe to user's favorites
 * @param {string} userId - User ID
 * @param {string} recipeId - Recipe ID
 * @returns {boolean} True if added successfully
 */
export const addFavorite = (userId, recipeId) => {
  if (!userId || !recipeId) return false;
  
  const allFavorites = getAllUserFavorites();
  const userFavorites = allFavorites[userId] || [];
  
  // Don't add if already a favorite
  if (userFavorites.includes(recipeId)) {
    return true;
  }
  
  // Add recipe to user's favorites
  allFavorites[userId] = [...userFavorites, recipeId];
  saveAllUserFavorites(allFavorites);
  
  return true;
};

/**
 * Remove a recipe from user's favorites
 * @param {string} userId - User ID
 * @param {string} recipeId - Recipe ID
 * @returns {boolean} True if removed successfully
 */
export const removeFavorite = (userId, recipeId) => {
  if (!userId || !recipeId) return false;
  
  const allFavorites = getAllUserFavorites();
  const userFavorites = allFavorites[userId] || [];
  
  // Remove recipe from user's favorites
  allFavorites[userId] = userFavorites.filter(id => id !== recipeId);
  saveAllUserFavorites(allFavorites);
  
  return true;
};

/**
 * Toggle a recipe's favorite status for a user
 * @param {string} userId - User ID
 * @param {string} recipeId - Recipe ID
 * @returns {boolean} New favorite status (true if now favorite, false if not)
 */
export const toggleFavorite = (userId, recipeId) => {
  if (!userId || !recipeId) return false;
  
  const isFavorite = isRecipeFavorite(userId, recipeId);
  
  if (isFavorite) {
    removeFavorite(userId, recipeId);
    return false;
  } else {
    addFavorite(userId, recipeId);
    return true;
  }
};

/**
 * Get all favorite recipes for a user from a list of recipes
 * @param {string} userId - User ID
 * @param {Array} recipes - Array of recipe objects
 * @returns {Array} Array of favorite recipe objects
 */
export const getFavoriteRecipes = (userId, recipes) => {
  if (!userId || !recipes || !Array.isArray(recipes)) return [];
  
  const favoriteIds = getUserFavorites(userId);
  return recipes.filter(recipe => favoriteIds.includes(recipe.id));
};

/**
 * Migrate old global favorites to user-specific favorites
 * This is a one-time migration for existing data
 * @param {string} userId - User ID to migrate favorites to
 * @param {Array} recipes - Array of recipe objects with isFavorite property
 */
export const migrateGlobalFavorites = (userId, recipes) => {
  if (!userId || !recipes || !Array.isArray(recipes)) return;
  
  const allFavorites = getAllUserFavorites();
  
  // Don't migrate if this user already has favorites
  if (allFavorites[userId] && allFavorites[userId].length > 0) {
    return;
  }
  
  // Find all recipes marked as favorite
  const globalFavorites = recipes
    .filter(recipe => recipe.isFavorite === true)
    .map(recipe => recipe.id);
  
  // Migrate to user-specific favorites
  if (globalFavorites.length > 0) {
    allFavorites[userId] = globalFavorites;
    saveAllUserFavorites(allFavorites);
  }
};
