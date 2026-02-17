/**
 * Recipe Linking Utilities
 * Functions to encode/decode recipe references in ingredients
 */

/**
 * Encode a recipe reference in ingredient format
 * Format: #recipe:{recipeId}:{recipeName}
 * Example: #recipe:abc123:Tomatensoße
 */
export const encodeRecipeLink = (recipeId, recipeName) => {
  return `#recipe:${recipeId}:${recipeName}`;
};

/**
 * Decode a recipe reference from ingredient text
 * Returns null if text is not a recipe link
 */
export const decodeRecipeLink = (ingredient) => {
  if (!ingredient || typeof ingredient !== 'string') {
    return null;
  }

  const match = ingredient.match(/^#recipe:([^:]+):(.+)$/);
  if (match) {
    return {
      recipeId: match[1],
      recipeName: match[2]
    };
  }

  return null;
};

/**
 * Check if an ingredient is a recipe link
 */
export const isRecipeLink = (ingredient) => {
  return decodeRecipeLink(ingredient) !== null;
};

/**
 * Extract all recipe links from an ingredients array
 * Returns array of { recipeId, recipeName }
 */
export const extractRecipeLinks = (ingredients) => {
  if (!Array.isArray(ingredients)) {
    return [];
  }

  return ingredients
    .map(ingredient => decodeRecipeLink(ingredient))
    .filter(link => link !== null);
};

/**
 * Check if ingredient text starts with # (indicating potential recipe link)
 */
export const startsWithHash = (text) => {
  return text && typeof text === 'string' && text.trim().startsWith('#');
};
