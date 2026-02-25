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
