/**
 * "Version per Beschreibung": Hilfsfunktionen rund um die Cloud Function
 * applyRecipeVersionChanges. Der Client schickt das Rezept in Kurzform und
 * setzt die Antwort so zurück, dass unveränderte Zeilen ihre Zusatzdaten
 * (z. B. ingredientID für die Nährwerte) behalten.
 */

const asEntry = (item, defaultType) => {
  if (typeof item === 'string') return { type: defaultType, text: item };
  if (item && item.type && typeof item.text === 'string') return item;
  return { ...item, type: item?.type || defaultType, text: item?.text ?? '' };
};

/**
 * Rezept in die Form bringen, die die Cloud Function erwartet.
 * @param {Object} recipe
 * @returns {{title: string, portionen: ?number, kochdauer: ?number, ingredients: Array<{type: string, text: string}>, steps: Array<{type: string, text: string}>}}
 */
export function buildVersionRequest(recipe) {
  const shorten = (list, defaultType) => (list || [])
    .map((item) => asEntry(item, defaultType))
    .filter((entry) => entry.text.trim() !== '')
    .map(({ type, text }) => ({ type, text }));
  return {
    title: recipe?.title || '',
    portionen: Number.isInteger(recipe?.portionen) ? recipe.portionen : null,
    kochdauer: Number.isInteger(recipe?.kochdauer) ? recipe.kochdauer : null,
    ingredients: shorten(recipe?.ingredients, 'ingredient'),
    steps: shorten(recipe?.steps, 'step'),
  };
}

// Zeilen, deren Typ und Text die KI unverändert zurückgibt, bleiben das
// Original-Objekt (inkl. ingredientID, isAuthorSignature usw.). Jedes Original
// wird höchstens einmal vergeben, damit doppelte Zeilen nicht verschmelzen.
function mergeEntries(originals, returned, defaultType) {
  const pool = (originals || []).map((item) => asEntry(item, defaultType));
  const used = new Set();
  return returned.map((entry) => {
    const index = pool.findIndex((orig, i) => (
      !used.has(i) && orig.type === entry.type && orig.text.trim() === entry.text.trim()
    ));
    if (index >= 0) {
      used.add(index);
      return pool[index];
    }
    return { type: entry.type, text: entry.text };
  });
}

/**
 * Antwort der Cloud Function in das Originalrezept einarbeiten.
 * Das Ergebnis behält id, Bilder, Kategorien usw. des Originals, damit
 * RecipeForm es wie gewohnt als Grundlage einer neuen Version nutzt.
 * @param {Object} recipe - Originalrezept
 * @param {Object} result - Antwort von applyRecipeVersionChanges
 * @returns {Object} Rezept mit eingearbeiteten Änderungen
 */
export function mergeVersionChanges(recipe, result) {
  return {
    ...recipe,
    title: result.title || recipe.title,
    portionen: Number.isInteger(result.portionen) ? result.portionen : recipe.portionen,
    kochdauer: Number.isInteger(result.kochdauer) ? result.kochdauer : recipe.kochdauer,
    ingredients: mergeEntries(recipe.ingredients, result.ingredients, 'ingredient'),
    steps: mergeEntries(recipe.steps, result.steps, 'step'),
  };
}
