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
 * Now supports quantity prefix: "1 Teil #recipe:id:name" or just "#recipe:id:name"
 */
export const decodeRecipeLink = (ingredient) => {
  if (!ingredient || typeof ingredient !== 'string') {
    return null;
  }

  // Match pattern with optional quantity prefix
  // Examples: "#recipe:id:name" or "1 Teil #recipe:id:name" or "50g #recipe:id:name"
  // Pattern ensures no # symbols in the quantity prefix
  const match = ingredient.match(/^([^#]*?)\s*#recipe:([^:]+):(.+)$/);
  if (match) {
    const quantityPrefix = match[1].trim();
    return {
      recipeId: match[2],
      recipeName: match[3],
      quantityPrefix: quantityPrefix || null
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
  if (!text || typeof text !== 'string') {
    return false;
  }
  const trimmed = text.trim();
  return trimmed !== '' && trimmed.startsWith('#');
};
