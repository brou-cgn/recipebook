/**
 * Recipe Versioning Utilities
 * Handles recipe version management and relationships
 */

/**
 * Check if a recipe has versions
 * @param {Array} allRecipes - All recipes
 * @param {string} recipeId - Recipe ID to check
 * @returns {boolean}
 */
export const hasVersions = (allRecipes, recipeId) => {
  return allRecipes.some(r => r.parentRecipeId === recipeId);
};

/**
 * Get all versions of a recipe
 * @param {Array} allRecipes - All recipes
 * @param {string} recipeId - Parent recipe ID
 * @returns {Array} Array of version recipes
 */
export const getRecipeVersions = (allRecipes, recipeId) => {
  return allRecipes.filter(r => r.parentRecipeId === recipeId);
};

/**
 * Get the parent recipe
 * @param {Array} allRecipes - All recipes
 * @param {Object} recipe - Recipe object
 * @returns {Object|null} Parent recipe or null
 */
export const getParentRecipe = (allRecipes, recipe) => {
  if (!recipe.parentRecipeId) return null;
  return allRecipes.find(r => r.id === recipe.parentRecipeId) || null;
};

/**
 * Check if a recipe is a version (has a parent)
 * @param {Object} recipe - Recipe object
 * @returns {boolean}
 */
export const isRecipeVersion = (recipe) => {
  return !!recipe.parentRecipeId;
};

/**
 * Create a new version from an existing recipe
 * @param {Object} recipe - Original recipe
 * @param {string} newAuthorId - ID of user creating the version
 * @returns {Object} New recipe version (without ID - will be added when saved)
 */
export const createRecipeVersion = (recipe, newAuthorId) => {
  const version = {
    ...recipe,
    // Remove the ID - will be generated on save
    id: undefined,
    // Set parent relationship
    parentRecipeId: recipe.id,
    // Set new author
    authorId: newAuthorId,
    // Clear favorite status for new version
    isFavorite: false,
    // Add version metadata
    createdAt: new Date().toISOString(),
    versionCreatedFrom: recipe.title
  };
  
  return version;
};

/**
 * Get version number for a recipe
 * @param {Array} allRecipes - All recipes
 * @param {Object} recipe - Recipe object
 * @returns {number} Version number (0 for original, 1+ for versions)
 */
export const getVersionNumber = (allRecipes, recipe) => {
  if (!recipe.parentRecipeId) return 0;
  
  const versions = getRecipeVersions(allRecipes, recipe.parentRecipeId);
  // Sort versions by creation date
  const sortedVersions = versions.sort((a, b) => {
    const dateA = new Date(a.createdAt || 0);
    const dateB = new Date(b.createdAt || 0);
    return dateA - dateB;
  });
  
  const index = sortedVersions.findIndex(v => v.id === recipe.id);
  return index >= 0 ? index + 1 : 0;
};
