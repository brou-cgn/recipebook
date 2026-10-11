/**
 * Weekly rotation of the personal "Für dich entdeckt" lists.
 *
 * Every list carrying systemKey 'fuerDichEntdeckt' (see
 * src/utils/fuerDichEntdeckt.js) gets, once a week, all of its recipes
 * removed and RECIPES_PER_ROTATION new ones for the current theme assigned.
 * `rotatedAt` on the list document is the clock: a list without it (freshly
 * created) is rotated on the next run, otherwise once ROTATION_INTERVAL_MS
 * has passed.
 *
 * Pure functions only - the scheduled function in index.js does the I/O.
 */

const SYSTEM_KEY = 'fuerDichEntdeckt';
const RECIPES_PER_ROTATION = 5;

// Run is daily; a half-day tolerance keeps "every 7 days" from drifting to 8.
const ROTATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000 - 12 * 60 * 60 * 1000;

// Current theme. Matched case-insensitively against the title and ingredients.
const THEME_TERMS = ['kürbis', 'hokkaido', 'butternut'];

const toMillis = (value) => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return typeof value === 'number' ? value : null;
};

const isRotationDue = (list, now = Date.now()) => {
  if (!list || list.systemKey !== SYSTEM_KEY) return false;
  const last = toMillis(list.rotatedAt);
  return last === null || now - last >= ROTATION_INTERVAL_MS;
};

const matchesTheme = (text) => {
  const lower = String(text || '').toLowerCase();
  return THEME_TERMS.some((term) => lower.includes(term));
};

const ingredientText = (item) => {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object' || item.type === 'heading') return '';
  return [item.name, item.text, item.ingredient].filter(Boolean).join(' ');
};

/**
 * Recipes every user may see: no pending import, not private, not locked
 * to a group unless published to the public list / living in a public group.
 */
const isPubliclyVisible = (recipe) => {
  if (!recipe || recipe.isTemp || recipe.isPrivate) return false;
  return !recipe.groupId || recipe.publishedToPublic === true ||
    recipe.groupType === 'public';
};

/** 2 = theme in the title, 1 = theme only in an ingredient, 0 = no match. */
const themeScore = (recipe) => {
  if (matchesTheme(recipe.title)) return 2;
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  return ingredients.some((i) => matchesTheme(ingredientText(i))) ? 1 : 0;
};

const shuffle = (items, random) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/**
 * Picks the recipe IDs for one list. Title matches come before ingredient
 * matches; within a tier the order is random. Recipes the list held last week
 * are only used if there are not enough others.
 * @param {Array<Object>} recipes - all recipes, each with an `id`
 * @param {string[]} previousIds - last week's recipeIds of this list
 * @param {function(): number} [random] - injectable for tests
 * @return {string[]}
 */
const pickRecipeIds = (recipes, previousIds = [], random = Math.random) => {
  const previous = new Set(previousIds);
  const scored = recipes
      .filter(isPubliclyVisible)
      .map((recipe) => ({id: recipe.id, score: themeScore(recipe)}))
      .filter((r) => r.score > 0);

  const ordered = [2, 1].flatMap((score) => {
    const tier = scored.filter((r) => r.score === score).map((r) => r.id);
    const fresh = shuffle(tier.filter((id) => !previous.has(id)), random);
    const repeat = shuffle(tier.filter((id) => previous.has(id)), random);
    return [fresh, repeat];
  });
  // Fresh recipes of both tiers first, repeats only as a last resort.
  const [freshTitle, repeatTitle, freshIngredient, repeatIngredient] = ordered;
  return [...freshTitle, ...freshIngredient, ...repeatTitle, ...repeatIngredient]
      .slice(0, RECIPES_PER_ROTATION);
};

module.exports = {
  SYSTEM_KEY,
  RECIPES_PER_ROTATION,
  ROTATION_INTERVAL_MS,
  isRotationDue,
  isPubliclyVisible,
  pickRecipeIds,
};
