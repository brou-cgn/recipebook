/**
 * Recipe Import Utility
 * Provides functionality to import recipes from external sources
 * Currently supports:
 * - Manual JSON import (for Notion exports)
 * - Extensible architecture for future formats
 */

/**
 * Parse and validate imported recipe data
 * @param {Object} data - Raw recipe data from external source
 * @returns {Object} - Validated recipe object
 */
export function parseRecipeData(data) {
  if (!data) {
    throw new Error('Keine Rezeptdaten bereitgestellt');
  }

  // Validate required fields
  if (!data.title && !data.name) {
    throw new Error('Rezepttitel fehlt');
  }

  // Map common field variations to our schema
  const recipe = {
    title: data.title || data.name || '',
    image: data.image || data.imageUrl || data.foto || '',
    portionen: parseNumber(data.portionen || data.servings || data.portions || 4),
    kulinarik: parseArray(data.kulinarik || data.cuisine || data.kulinarisch),
    schwierigkeit: parseNumber(data.schwierigkeit || data.difficulty || data.schwierigkeitsgrad || 3, 1, 5),
    kochdauer: parseNumber(data.kochdauer || data.cookingTime || data.zeit || 30),
    speisekategorie: data.speisekategorie || data.category || data.kategorie || '',
    ingredients: parseArray(data.ingredients || data.zutaten || []),
    steps: parseArray(data.steps || data.schritte || data.zubereitung || [])
  };

  // Validate ingredients and steps
  if (recipe.ingredients.length === 0) {
    throw new Error('Rezept muss mindestens eine Zutat enthalten');
  }

  if (recipe.steps.length === 0) {
    throw new Error('Rezept muss mindestens einen Zubereitungsschritt enthalten');
  }

  return recipe;
}

/**
 * Import recipe from JSON string
 * @param {string} jsonString - JSON string containing recipe data
 * @returns {Object} - Parsed recipe object
 */
export function importFromJSON(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    return parseRecipeData(data);
  } catch (error) {
    if (error.message.includes('JSON')) {
      throw new Error('Ungültiges JSON-Format. Bitte überprüfen Sie die Eingabe.');
    }
    throw error;
  }
}

/**
 * Import recipe from URL
 * This is a placeholder for future implementation with actual URL fetching
 * For now, it provides instructions for manual import
 * @param {string} url - URL to the recipe
 * @returns {Promise<Object>} - Promise resolving to parsed recipe
 */
export async function importFromURL(url) {
  // Validate URL
  if (!url || typeof url !== 'string') {
    throw new Error('Ungültige URL');
  }

  try {
    new URL(url);
  } catch {
    throw new Error('Ungültige URL-Format');
  }

  // Check if it's a Notion URL
  if (url.includes('notion.so')) {
    throw new Error(
      'Notion-Import ist derzeit nicht direkt verfügbar.\n\n' +
      'So importieren Sie ein Notion-Rezept:\n' +
      '1. Öffnen Sie das Rezept in Notion\n' +
      '2. Klicken Sie auf "..." → "Export"\n' +
      '3. Wählen Sie "Markdown & CSV"\n' +
      '4. Extrahieren Sie die Daten manuell\n\n' +
      'Alternativ können Sie die Rezeptdaten im JSON-Format kopieren und hier einfügen.'
    );
  }

  // For other URLs, we'd need to implement fetching and parsing
  throw new Error(
    'URL-Import ist noch nicht implementiert.\n\n' +
    'Bitte verwenden Sie stattdessen den JSON-Import.'
  );
}

/**
 * Helper function to parse numbers with validation
 * @param {any} value - Value to parse
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} - Parsed number
 */
function parseNumber(value, min = 1, max = 10000) {
  const num = typeof value === 'number' ? value : parseInt(value);
  if (isNaN(num)) return min;
  // Allow 0 as a valid value if it's explicitly set
  if (num === 0) return 0;
  return Math.min(Math.max(num, min), max);
}

/**
 * Helper function to parse arrays
 * Handles both array and string inputs
 * @param {any} value - Value to parse as array
 * @returns {Array} - Parsed array
 */
function parseArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map(item => String(item)) // Convert to string to ensure trim() works
      .filter(item => item && item.trim());
  }
  if (typeof value === 'string') {
    // Try to parse as JSON array first
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .map(item => String(item))
          .filter(item => item && item.trim());
      }
    } catch {
      // If not JSON, split by common delimiters
      return value.split(/[,;\n]/).map(item => item.trim()).filter(item => item);
    }
  }
  return [String(value)];
}

/**
 * Example recipe data for Notion structure
 * This demonstrates the expected format for import
 */
export const EXAMPLE_NOTION_RECIPE = {
  title: "Pizza Bianco al Tartufo",
  portionen: 4,
  kulinarik: ["Italienisch"],
  schwierigkeit: 3,
  kochdauer: 45,
  speisekategorie: "Hauptgericht",
  ingredients: [
    "500g Pizzateig",
    "200g Mozzarella",
    "100g Ricotta",
    "50g Parmesan",
    "2 EL Trüffelöl",
    "Salz, Pfeffer"
  ],
  steps: [
    "Ofen auf 250°C vorheizen",
    "Pizzateig ausrollen",
    "Mozzarella, Ricotta und Parmesan verteilen",
    "Mit Salz und Pfeffer würzen",
    "10-12 Minuten backen",
    "Mit Trüffelöl beträufeln und servieren"
  ]
};
