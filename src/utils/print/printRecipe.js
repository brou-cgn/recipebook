/**
 * Recipe -> printable data. Single place that decides WHICH values and WHICH
 * wording appear on a printed page, shared by every print element renderer.
 *
 * The fixed wording comes from the dictionary i18n/texte/druck.js (German, English, French).
 * The page prints German until the language of the app is passed on (Vorhaben
 * Mehrsprachigkeit, Phase B): every function that produces text takes the translator `t`
 * of druckTexte(sprache) and falls back to German.
 */
import { scaleIngredient, formatIngredientAsFraction } from '../ingredientUtils';
import { decodeRecipeLink } from '../recipeLinks';
import { erstelleT } from '../../i18n/texte';
import { formatiereDatum } from '../../i18n/format';
import { STANDARD_SPRACHE } from '../../i18n/sprachen';
import druckWoerterbuch from '../../i18n/texte/druck';

const uebersetzer = new Map();

/**
 * The translator for the texts of the printed page, one stable function per language.
 * @param {string} [sprache] - defaults to German, the language every page prints in today
 * @returns {(schluessel: string, werte?: Object) => string}
 */
export function druckTexte(sprache = STANDARD_SPRACHE) {
  if (!uebersetzer.has(sprache)) uebersetzer.set(sprache, erstelleT(druckWoerterbuch, sprache));
  return uebersetzer.get(sprache);
}

const NUMERIC_DATE = { day: 'numeric', month: 'numeric', year: 'numeric' };

/**
 * All images of a recipe as `{ url, isDefault }` objects, default image first.
 * Falls back to the single `recipe.image` (string) when `images` is empty.
 */
export function getRecipeImages(recipe) {
  if (!recipe) return [];
  const raw = Array.isArray(recipe.images) && recipe.images.length > 0
    ? recipe.images
    : (recipe.image ? [{ url: recipe.image, isDefault: true }] : []);
  const images = raw
    .map((img) => (typeof img === 'string' ? { url: img } : img))
    .filter((img) => img && img.url);
  return [
    ...images.filter((img) => img.isDefault),
    ...images.filter((img) => !img.isDefault),
  ];
}

/**
 * Numeric date (German: 1.2.2025) for Firestore timestamps, ISO strings and Date objects in
 * the given language; null if invalid.
 */
export function formatRecipeDate(createdAt, sprache = STANDARD_SPRACHE) {
  if (!createdAt) return null;
  let date;
  if (createdAt.toDate) date = createdAt.toDate();
  else if (createdAt instanceof Date) date = createdAt;
  else if (typeof createdAt === 'string' || typeof createdAt === 'number') date = new Date(createdAt);
  else return null;
  if (!date || isNaN(date.getTime())) return null;
  return formatiereDatum(date, sprache, NUMERIC_DATE) || null;
}

/** "Von Anna erstellt am 1.2.2025" – same wording as the recipe detail view. */
export function buildAuthorDateText(authorName, createdAt, { t = druckTexte(), sprache = STANDARD_SPRACHE } = {}) {
  const date = formatRecipeDate(createdAt, sprache);
  if (!authorName && !date) return '';
  if (!date) return t('von', { name: authorName });
  return authorName ? t('vonErstelltAm', { name: authorName, datum: date }) : t('erstelltAm', { datum: date });
}

/** Cuisine names as array (recipes store a string or an array). */
export function getCuisineList(recipe) {
  return (Array.isArray(recipe?.kulinarik) ? recipe.kulinarik : [recipe?.kulinarik]).filter(Boolean);
}

/**
 * Items of the "Kulinarik / Zeit / Infos" element, in display order:
 * cuisine, cooking time, servings, difficulty (as stars).
 * @returns {Array<{key:string, text:string}>}
 */
export function buildMetadataItems(recipe, { servings, portionLabel, t = druckTexte() } = {}) {
  const items = [];
  const cuisine = getCuisineList(recipe);
  if (cuisine.length > 0) items.push({ key: 'cuisine', text: cuisine.join(', ') });
  const minutes = recipe?.kochdauer ?? recipe?.kochzeit;
  if (minutes) items.push({ key: 'time', text: t('minuten', { minuten: minutes }) });
  if (servings) items.push({ key: 'servings', text: `${servings} ${portionLabel || t('portionen')}` });
  const difficulty = Number(recipe?.schwierigkeit);
  if (difficulty > 0) {
    const level = Math.min(5, Math.max(0, Math.round(difficulty)));
    items.push({ key: 'difficulty', text: t('schwierigkeit', { stufe: level }) });
  }
  return items;
}

/** Heading of the ingredients: "Zutaten für 4 Portionen", or just "Zutaten" without servings. */
export function buildIngredientsHeading({ servings, portionLabel, t = druckTexte() } = {}) {
  return servings
    ? t('zutatenFuer', { menge: servings, einheit: portionLabel || t('portionen') })
    : t('zutaten');
}

/** Scale factor for the chosen servings; 1 when unknown. */
export function getServingMultiplier(recipe, servings) {
  const base = recipe?.portionen || 4;
  return servings ? servings / base : 1;
}

/**
 * Printable ingredient lines, scaled to the chosen servings.
 * @returns {Array<{type:'heading'|'ingredient', text:string}>}
 */
export function buildIngredientLines(recipe, multiplier = 1) {
  return (recipe?.ingredients || []).map((ing) => {
    const item = typeof ing === 'string' ? { type: 'ingredient', text: ing } : ing;
    const text = item?.text || '';
    if (item?.type === 'heading') return { type: 'heading', text };
    const link = decodeRecipeLink(text);
    if (link) {
      const qty = link.quantityPrefix ? formatIngredientAsFraction(scaleIngredient(link.quantityPrefix, multiplier)) : '';
      return { type: 'ingredient', text: `${qty ? `${qty} ` : ''}${link.recipeName}` };
    }
    return { type: 'ingredient', text: formatIngredientAsFraction(scaleIngredient(text, multiplier)) };
  });
}

/**
 * Printable steps. Headings are not numbered; `number` counts real steps only.
 * @returns {Array<{type:'heading'|'step', text:string, number?:number}>}
 */
export function buildStepLines(recipe) {
  let count = 0;
  return (recipe?.steps || []).map((step) => {
    const item = typeof step === 'string' ? { type: 'step', text: step } : step;
    if (item?.type === 'heading') return { type: 'heading', text: item.text || '' };
    count += 1;
    return { type: 'step', text: item?.text || '', number: count };
  });
}
