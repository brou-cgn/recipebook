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
 * Parses an ingredient string into its component parts.
 * Handles formats like "100 g Zucker", "2 EL Öl", "3 Eier", "Salz"
 *
 * @param {string} text - The ingredient string to parse
 * @returns {{ amount: number|null, unit: string|null, name: string, original: string }}
 */
function parseIngredientString(text) {
  if (!text || typeof text !== 'string') {
    return { amount: null, unit: null, name: text || '', original: text };
  }

  const trimmed = text.trim();

  // Build regex from known units (longest first to avoid partial matches)
  const sortedUnits = [...UNITS].sort((a, b) => b.length - a.length);
  const unitsPattern = sortedUnits
    .map(u => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  // Try: number + known unit + name  e.g. "100 g Zucker"
  const withUnitRegex = new RegExp(
    `^(\\d+(?:[.,]\\d+)?)\\s+(${unitsPattern})\\s+(.+)$`,
    'i'
  );
  let match = trimmed.match(withUnitRegex);
  if (match) {
    return {
      amount: parseFloat(match[1].replace(',', '.')),
      unit: match[2],
      name: match[3].trim(),
      original: text,
    };
  }

  // Try: number + name (no unit)  e.g. "3 Eier"
  const withoutUnitRegex = /^(\d+(?:[.,]\d+)?)\s+(.+)$/;
  match = trimmed.match(withoutUnitRegex);
  if (match) {
    return {
      amount: parseFloat(match[1].replace(',', '.')),
      unit: null,
      name: match[2].trim(),
      original: text,
    };
  }

  // No leading number – just a name  e.g. "Salz und Pfeffer"
  return { amount: null, unit: null, name: trimmed, original: text };
}

/**
 * Formats a numeric amount for display (avoids unnecessary decimal places).
 * @param {number} amount
 * @returns {string}
 */
function formatAmount(amount) {
  const rounded = Math.round(amount * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/**
 * Merges duplicate ingredients by combining quantities.
 * Ingredients with the same name (case-insensitive) and the same unit are
 * summed into a single entry.  Items without a parseable quantity are
 * deduplicated (only the first occurrence is kept).
 *
 * @param {string[]} ingredients - Array of ingredient strings
 * @returns {string[]} - Merged array of ingredient strings
 */
export function mergeIngredients(ingredients) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return ingredients;
  }

  // key: "{normalizedName}|{normalizedUnit}" → accumulated entry
  const map = new Map();

  for (const ing of ingredients) {
    if (!ing) continue;
    const parsed = parseIngredientString(ing);
    const key = `${parsed.name.toLowerCase()}|${(parsed.unit || '').toLowerCase()}`;

    if (map.has(key)) {
      const existing = map.get(key);
      if (parsed.amount !== null && existing.amount !== null) {
        existing.amount += parsed.amount;
      }
    } else {
      map.set(key, {
        amount: parsed.amount,
        unit: parsed.unit,
        name: parsed.name,
      });
    }
  }

  return Array.from(map.values()).map(item => {
    if (item.amount !== null && item.unit) {
      return `${formatAmount(item.amount)} ${item.unit} ${item.name}`;
    }
    if (item.amount !== null) {
      return `${formatAmount(item.amount)} ${item.name}`;
    }
    return item.name;
  });
}
