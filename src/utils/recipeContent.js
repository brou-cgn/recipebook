/**
 * „Rezept mit Inhalt“ im Sinne der Löschregel (AGENTS.md, Löschaktionen): Nur ein solches
 * Rezept fragt vor dem Löschen nach. Inhalt sind Zutaten, Schritte oder ein Bild.
 * Im Zweifel zählt ein Wert als Inhalt, damit nichts ohne Rückfrage verschwindet.
 */
function filled(value) {
  if (Array.isArray(value)) {
    return value.some((item) => (typeof item === 'string' ? item.trim() !== '' : item != null));
  }
  if (typeof value === 'string') return value.trim() !== '';
  return value != null && value !== false;
}

export function recipeHasContent(recipe) {
  if (!recipe) return false;
  return filled(recipe.ingredients) || filled(recipe.steps) || filled(recipe.image) || filled(recipe.images);
}

export default recipeHasContent;
