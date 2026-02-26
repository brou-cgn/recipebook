/**
 * Ingredient Formatting Utilities
 * Provides utilities for formatting and normalizing ingredient text
 */

// Common units to recognize (case-insensitive)
// German and international units
const UNITS = [
  'ml', 'l', 'g', 'kg', 'mg',
  'EL', 'TL', 'Tl', 'El',  // Esslöffel, Teelöffel variants
  'Prise', 'Prisen',
  'Tasse', 'Tassen',
  'Becher',
  'Stück', 'Stk',
  'Bund',
  'Pck', 'Pkg',
  'Dose', 'Dosen',
  'cl', 'dl'
];

/**
 * Formats an ingredient string to ensure proper spacing between numbers and units
 * Examples:
 *   "100ml" -> "100 ml"
 *   "250g" -> "250 g"
 *   "2EL" -> "2 EL"
 *   "100 ml" -> "100 ml" (already formatted)
 *   "1.5kg" -> "1.5 kg"
 *   "2 1/2 Tassen" -> "2 1/2 Tassen" (already formatted)
 * 
 * @param {string} ingredient - The ingredient text to format
 * @returns {string} - The formatted ingredient text with proper spacing
 */
export function formatIngredientSpacing(ingredient) {
  if (!ingredient || typeof ingredient !== 'string') {
    return ingredient;
  }

  let formatted = ingredient;

  // Create a regex pattern that matches number followed immediately by unit
  // Number can be: integer, decimal (1.5), fraction (1/2), or mixed (2 1/2)
  // The pattern looks for:
  // - Optional whitespace at start
  // - A number (integer or decimal)
  // - NO space
  // - A unit from our list
  
  // Build regex pattern from units list
  // Sort by length (descending) to match longer units first (e.g., "Tassen" before "Tasse")
  const sortedUnits = [...UNITS].sort((a, b) => b.length - a.length);
  const unitsPattern = sortedUnits.map(unit => 
    // Escape special regex characters if any
    unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  ).join('|');

  // Match: number (integer or decimal) followed by optional whitespace and then unit
  // Capture groups: 1=number, 2=whitespace (if any), 3=unit
  // Examples: 100ml, 1.5kg, 2EL, "100 ml" (with space)
  const regex = new RegExp(
    `(\\d+(?:[.,]\\d+)?)(\\s*)(${unitsPattern})(?=\\s|$|[^a-zA-ZäöüÄÖÜß])`,
    'gi'
  );

  // Replace matches with number + single space + unit
  formatted = formatted.replace(regex, (match, number, whitespace, unit) => {
    // Always normalize to single space between number and unit
    return `${number} ${unit}`;
  });

  return formatted;
}

/**
 * Formats an array of ingredient strings
 * @param {string[]} ingredients - Array of ingredient strings
 * @returns {string[]} - Array of formatted ingredient strings
 */
export function formatIngredients(ingredients) {
  if (!Array.isArray(ingredients)) {
    return ingredients;
  }

  return ingredients.map(ingredient => formatIngredientSpacing(ingredient));
}

/**
 * Parses an ingredient string into its amount, unit and name components.
 * Examples:
 *   "200 g Mehl"  -> { amount: 200, unit: 'g',  name: 'Mehl' }
 *   "2 EL Öl"     -> { amount: 2,   unit: 'EL', name: 'Öl' }
 *   "3 Eier"      -> { amount: 3,   unit: null, name: 'Eier' }
 *   "Salz"        -> { amount: null, unit: null, name: 'Salz' }
 * @param {string} ingredient - The ingredient string to parse
 * @returns {{ amount: number|null, unit: string|null, name: string }}
 */
function parseIngredientParts(ingredient) {
  if (!ingredient || typeof ingredient !== 'string') {
    return { amount: null, unit: null, name: ingredient || '' };
  }
  const str = ingredient.trim();

  const sortedUnits = [...UNITS].sort((a, b) => b.length - a.length);
  const unitsPattern = sortedUnits
    .map(u => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  // Match: number unit name (e.g. "200 g Mehl", "2EL Öl")
  const withUnitRegex = new RegExp(
    `^(\\d+\\/\\d+|\\d+(?:[.,]\\d+)?)\\s*(${unitsPattern})\\s+(.+)$`,
    'i'
  );
  let m = str.match(withUnitRegex);
  if (m) {
    const raw = m[1];
    const amount = raw.includes('/')
      ? parseFloat(raw.split('/')[0]) / parseFloat(raw.split('/')[1])
      : parseFloat(raw.replace(',', '.'));
    return { amount, unit: m[2], name: m[3] };
  }

  // Match: number name without unit (e.g. "3 Eier")
  const noUnitRegex = /^(\d+\/\d+|\d+(?:[.,]\d+)?)\s+(.+)$/;
  m = str.match(noUnitRegex);
  if (m) {
    const raw = m[1];
    const amount = raw.includes('/')
      ? parseFloat(raw.split('/')[0]) / parseFloat(raw.split('/')[1])
      : parseFloat(raw.replace(',', '.'));
    return { amount, unit: null, name: m[2] };
  }

  // No leading number found
  return { amount: null, unit: null, name: str };
}

/**
 * Returns true if the ingredient name is "Wasser" (regardless of amount/unit).
 * Water is a common household item and should not appear in shopping lists.
 * @param {string} ingredient - The ingredient string to check
 * @returns {boolean}
 */
export function isWaterIngredient(ingredient) {
  const { name } = parseIngredientParts(ingredient);
  return name.toLowerCase() === 'wasser';
}

/**
 * Combines duplicate ingredients by summing their amounts.
 * Ingredients with the same name and unit (case-insensitive) are merged.
 * Example: ["100 g Zucker", "50 g Zucker"] => ["150 g Zucker"]
 * @param {string[]} ingredients - Array of ingredient strings
 * @returns {string[]} - Array with duplicates combined
 */
export function combineIngredients(ingredients) {
  if (!Array.isArray(ingredients)) return ingredients;

  const combined = new Map();
  const order = [];

  for (const ingredient of ingredients) {
    if (!ingredient) continue;
    const { amount, unit, name } = parseIngredientParts(ingredient);
    const key = `${name.toLowerCase()}|${(unit || '').toLowerCase()}`;

    if (combined.has(key)) {
      const existing = combined.get(key);
      if (amount !== null && existing.amount !== null) {
        existing.amount += amount;
      }
    } else {
      combined.set(key, { amount, unit, name });
      order.push(key);
    }
  }

  return order.map(key => {
    const { amount, unit, name } = combined.get(key);
    if (amount === null) return name;
    const formatted = amount % 1 === 0 ? amount.toString() : amount.toFixed(1);
    return unit ? `${formatted} ${unit} ${name}` : `${formatted} ${name}`;
  });
}

/**
 * Scales the numeric amounts in an ingredient string by a given multiplier.
 * Example: scaleIngredient("200 g Mehl", 2) => "400 g Mehl"
 * @param {string} ingredient - The ingredient string to scale
 * @param {number} multiplier - The scaling factor
 * @returns {string} - The scaled ingredient string
 */
export function scaleIngredient(ingredient, multiplier) {
  if (!ingredient || typeof ingredient !== 'string' || multiplier === 1) return ingredient;

  const regex = /(?:^|\s)(\d+\/\d+|\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)?/g;

  return ingredient.replace(regex, (match, number, unit) => {
    const leadingSpace = match.startsWith(' ') ? ' ' : '';

    let value;
    if (number.includes('/')) {
      const [num, denom] = number.split('/');
      value = parseFloat(num) / parseFloat(denom);
    } else {
      value = parseFloat(number.replace(',', '.'));
    }

    const scaled = value * multiplier;
    const formatted = scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(1);

    return leadingSpace + (unit ? `${formatted} ${unit}` : formatted);
  });
}
