/**
 * Ingredient Formatting Utilities
 * Provides utilities for formatting and normalizing ingredient text
 */

// Common units to recognize (case-insensitive)
// German and international units
const UNITS = [
  'ml', 'l', 'g', 'kg', 'mg',
  'EL', 'TL', 'Tl', 'El',  // Esslöffel, Teelöffel variants
  'Esslöffel', 'Teelöffel', // Full German names
  'Prise', 'Prisen',
  'Tasse', 'Tassen',
  'Becher',
  'Stück', 'Stk',
  'Bund',
  'Pck', 'Pkg',
  'Dose', 'Dosen',
  'cl', 'dl',
  'tsp', 'tbsp',
  'cup', 'oz', 'lb',
  'piece', 'pinch'
];

// Cache for dynamically loaded units
let cachedUnits = null;

/**
 * Get recognized units dynamically from Firestore (with fallback to UNITS)
 * @returns {Promise<string[]>}
 */
export async function getRecognizedUnits() {
  if (!cachedUnits) {
    try {
      const { getAvailableUnits } = await import('./customLists');
      cachedUnits = await getAvailableUnits();
    } catch (error) {
      console.error('Error loading units from Firestore, using defaults:', error);
      cachedUnits = [...UNITS];
    }
  }
  return cachedUnits;
}

/**
 * Invalidate the units cache (call after updating units in settings)
 */
export function invalidateUnitsCache() {
  cachedUnits = null;
}

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
function parseIngredientPartsSync(ingredient) {
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
 * Parses an ingredient string using dynamically loaded units from Firestore.
 * Async version of the internal parseIngredientParts for external use.
 * @param {string} ingredient - The ingredient string to parse
 * @returns {Promise<{ amount: number|null, unit: string|null, name: string }>}
 */
export async function parseIngredientParts(ingredient) {
  if (!ingredient || typeof ingredient !== 'string') {
    return { amount: null, unit: null, name: ingredient || '' };
  }
  const str = ingredient.trim();
  const units = await getRecognizedUnits();

  const sortedUnits = [...units].sort((a, b) => b.length - a.length);
  const unitsPattern = sortedUnits
    .map(u => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

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

  const noUnitRegex = /^(\d+\/\d+|\d+(?:[.,]\d+)?)\s+(.+)$/;
  m = str.match(noUnitRegex);
  if (m) {
    const raw = m[1];
    const amount = raw.includes('/')
      ? parseFloat(raw.split('/')[0]) / parseFloat(raw.split('/')[1])
      : parseFloat(raw.replace(',', '.'));
    return { amount, unit: null, name: m[2] };
  }

  return { amount: null, unit: null, name: str };
}

/**
 * Returns true if the ingredient name is "Wasser" (regardless of amount/unit).
 * Water is a common household item and should not appear in shopping lists.
 * @param {string} ingredient - The ingredient string to check
 * @returns {boolean}
 */
export function isWaterIngredient(ingredient) {
  const { name } = parseIngredientPartsSync(ingredient);
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
    const { amount, unit, name } = parseIngredientPartsSync(ingredient);
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
 * Converts ingredient units using the conversion table.
 * Units 'g' and 'ml' are kept as-is.
 * Standard metric conversions (kg→g, l→ml) are applied automatically.
 * For other units the conversionTable is consulted using ingredient name + unit lookup.
 *
 * @param {string[]} ingredients - Array of ingredient strings
 * @param {Object[]} conversionTable - Array of conversion table entries
 * @returns {{ converted: string[], missing: {unit: string, ingredient: string}[] }}
 */
export function convertIngredientUnits(ingredients, conversionTable = []) {
  if (!Array.isArray(ingredients)) return { converted: ingredients, missing: [] };

  const missing = [];
  const seenMissing = new Set();
  const table = Array.isArray(conversionTable) ? conversionTable : [];

  const converted = ingredients.map(ingredient => {
    let { amount, unit, name } = parseIngredientPartsSync(ingredient);

    // Normalize unit variants for better table matching
    if (unit) {
      const unitLower = unit.toLowerCase();
      if (unitLower === 'teelöffel' || unitLower === 'tl' || unitLower === 'teel' || unitLower === 'teaspoon' || unitLower === 'tsp') {
        unit = 'TL';
      } else if (unitLower === 'esslöffel' || unitLower === 'el' || unitLower === 'essl' || unitLower === 'tablespoon' || unitLower === 'tbsp') {
        unit = 'EL';
      }
    }

    // No unit or already in target units – keep as-is
    if (!unit || unit.toLowerCase() === 'g' || unit.toLowerCase() === 'ml') {
      return ingredient;
    }

    if (amount !== null) {
      // Standard metric conversions (no table entry needed)
      if (unit.toLowerCase() === 'kg') {
        const result = amount * 1000;
        const formatted = result % 1 === 0 ? result.toString() : result.toFixed(1);
        return `${formatted} g ${name}`;
      }
      if (unit.toLowerCase() === 'l') {
        const result = amount * 1000;
        const formatted = result % 1 === 0 ? result.toString() : result.toFixed(1);
        return `${formatted} ml ${name}`;
      }

      // Look up in conversion table by unit + ingredient name
      const entry = table.find(
        e =>
          e.unit &&
          e.ingredient &&
          e.unit.toLowerCase() === unit.toLowerCase() &&
          e.ingredient.toLowerCase() === name.toLowerCase()
      );

      if (entry) {
        if (entry.grams && parseFloat(entry.grams) > 0) {
          const result = amount * parseFloat(entry.grams);
          const formatted = result % 1 === 0 ? result.toString() : result.toFixed(1);
          return `${formatted} g ${name}`;
        }
        if (entry.milliliters && parseFloat(entry.milliliters) > 0) {
          const result = amount * parseFloat(entry.milliliters);
          const formatted = result % 1 === 0 ? result.toString() : result.toFixed(1);
          return `${formatted} ml ${name}`;
        }
        // Entry exists but has no conversion values – show name only
        return name;
      }

      // Not in table – record as missing
      const key = `${unit.toLowerCase()}|${name.toLowerCase()}`;
      if (!seenMissing.has(key)) {
        seenMissing.add(key);
        missing.push({ unit, ingredient: name });
      }
    }

    return name;
  });

  return { converted, missing };
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
