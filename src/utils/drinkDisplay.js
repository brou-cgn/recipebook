/**
 * Drink Display Resolution
 * Central place to turn a drink reference (a custom drink object, or a raw
 * name/label string such as those coming out of the calculation results)
 * into something displayable, resolving `#recipe:id:name` links against
 * the already-loaded recipes list instead of leaving the raw link string
 * on screen.
 */

import { decodeRecipeLink } from './recipeLinks';

/**
 * Resolves a drink reference for display.
 * @param {Object|string} drinkRef - custom drink object (with a `name` field) or a raw name/label string
 * @param {Array} [recipes] - currently loaded recipes (each with at least `id`, `title`, `ingredients`)
 * @returns {{
 *   isRecipe: boolean,
 *   displayName: string,
 *   recipeId: string|null,
 *   recipe: Object|null,
 *   ingredients: Array,
 * }}
 */
export const resolveDrinkDisplay = (drinkRef, recipes = []) => {
  const rawName = typeof drinkRef === 'string' ? drinkRef : drinkRef?.name;
  const link = decodeRecipeLink(rawName);

  if (!link) {
    return {
      isRecipe: false,
      displayName: rawName || '',
      recipeId: null,
      recipe: null,
      ingredients: [],
    };
  }

  const recipe = Array.isArray(recipes) ? recipes.find((r) => r.id === link.recipeId) || null : null;

  return {
    isRecipe: true,
    displayName: recipe?.title || link.recipeName,
    recipeId: link.recipeId,
    recipe,
    ingredients: Array.isArray(recipe?.ingredients) ? recipe.ingredients : [],
  };
};
