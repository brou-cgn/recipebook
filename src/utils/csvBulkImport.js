/**
 * CSV Bulk Import Utility
 * Handles importing multiple recipes from CSV files with specific column mappings
 * 
 * Delimiter support:
 * - Automatically detects comma (,) or semicolon (;) delimiters
 * - Detection is based on analyzing the header row
 * 
 * Supported columns:
 * - Name → Recipe title
 * - Erstellt am → Created date
 * - Erstellt von → Author name
 * - Kulinarik → Cuisine types (comma-separated)
 * - Speisenkategorie → Meal category (comma-separated)
 * - Portionen → Portion size + unit
 * - Zubereitung → Cooking time in minutes
 * - Schwierigkeit → Difficulty (1-5 stars)
 * - Zutat1-31 → Ingredients (max 31 fields)
 * - Zubereitungsschritt1-27 → Preparation steps (max 27 fields)
 * 
 * Special formatting:
 * - Items starting with "###" are treated as headers (remove "###" and format as heading)
 * - All recipes are marked as private by default
 */

/**
 * Detect the CSV delimiter from the header line
 * @param {string} headerLine - First line of CSV
 * @returns {string} - Detected delimiter (comma or semicolon)
 */
function detectDelimiter(headerLine) {
  // Count occurrences of comma and semicolon outside of quotes
  let commaCount = 0;
  let semicolonCount = 0;
  let inQuotes = false;

  for (let i = 0; i < headerLine.length; i++) {
    const char = headerLine[i];
    
    if (char === '"') {
      if (inQuotes && i + 1 < headerLine.length && headerLine[i + 1] === '"') {
        i++; // Skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes) {
      if (char === ',') commaCount++;
      else if (char === ';') semicolonCount++;
    }
  }

  // Return the delimiter that appears more frequently
  // Default to comma if both are equal or both are zero
  return semicolonCount > commaCount ? ';' : ',';
}

/**
 * Parse a CSV line handling quoted values
 * @param {string} line - CSV line to parse
 * @param {string} delimiter - CSV delimiter character (default: ',')
 * @returns {Array<string>} - Array of values
 */
function parseCSVLine(line, delimiter = ',') {
  const values = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // Handle escaped quotes ("")
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        currentValue += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      values.push(currentValue);
      currentValue = '';
    } else {
      currentValue += char;
    }
  }

  // Add last value
  values.push(currentValue);

  return values;
}

/**
 * Parse portion string to extract number and unit
 * Examples: "4 Portionen", "6", "2 Personen"
 * @param {string} portionStr - Portion string
 * @returns {Object} - {portionen: number, portionUnitId: string}
 */
function parsePortion(portionStr) {
  if (!portionStr) return { portionen: 4, portionUnitId: 'portion' };
  
  const str = portionStr.trim();
  const match = str.match(/^(\d+)\s*(.*)$/);
  
  if (match) {
    const portionen = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    // Map common units to portionUnitId
    let portionUnitId = 'portion';
    if (unit.includes('person')) {
      portionUnitId = 'person';
    } else if (unit.includes('stück') || unit.includes('stueck')) {
      portionUnitId = 'piece';
    }
    
    return { portionen, portionUnitId };
  }
  
  return { portionen: 4, portionUnitId: 'portion' };
}

/**
 * Parse difficulty value (1-5)
 * @param {string|number} value - Difficulty value
 * @returns {number} - Difficulty (1-5)
 */
function parseDifficulty(value) {
  if (!value) return 3;
  const num = parseInt(value);
  if (isNaN(num)) return 3;
  return Math.min(Math.max(num, 1), 5);
}

/**
 * Parse cooking time in minutes
 * @param {string|number} value - Time value (possibly with unit)
 * @returns {number} - Time in minutes
 */
function parseCookingTime(value) {
  if (!value) return 30;
  const num = parseInt(value);
  if (isNaN(num)) return 30;
  return Math.max(num, 0);
}

/**
 * Parse comma-separated values into array
 * @param {string} value - Comma-separated string
 * @returns {Array<string>} - Array of trimmed values
 */
function parseCommaSeparated(value) {
  if (!value) return [];
  return value.split(',').map(v => v.trim()).filter(v => v);
}

/**
 * Process an ingredient or step field, detecting headers
 * Items starting with "###" are headers (remove "###" and format)
 * @param {string} value - Field value
 * @returns {Object|null} - {type: 'heading'|'step'|'ingredient', text: string} or null
 */
function processListItem(value, itemType = 'ingredient') {
  if (!value || !value.trim()) return null;
  
  const trimmed = value.trim();
  
  // Check if it's a header (starts with ###)
  if (trimmed.startsWith('###')) {
    const text = trimmed.substring(3).trim();
    return { type: 'heading', text };
  }
  
  // Regular item
  const type = itemType === 'step' ? 'step' : 'ingredient';
  return { type, text: trimmed };
}

/**
 * Parse a single recipe row from CSV
 * @param {Array<string>} headers - CSV headers
 * @param {Array<string>} values - CSV values for this row
 * @param {string} currentUserName - Name of the current user (for authorId mapping)
 * @returns {Object} - Recipe object
 */
function parseRecipeRow(headers, values, currentUserName = '') {
  const recipe = {
    title: '',
    image: '',
    portionen: 4,
    portionUnitId: 'portion',
    kulinarik: [],
    schwierigkeit: 3,
    kochdauer: 30,
    speisekategorie: [],
    ingredients: [],
    steps: [],
    createdAt: null,
    authorName: '',
    isPrivate: true, // All imported recipes are private
  };
  
  // Process each column
  for (let i = 0; i < Math.min(headers.length, values.length); i++) {
    const header = headers[i].trim();
    const value = values[i].trim();
    
    if (!value) continue;
    
    // Map columns to recipe fields
    if (header === 'Name') {
      recipe.title = value;
    } else if (header === 'Erstellt am') {
      // Parse date if needed - for now just store as string
      // Could be enhanced to parse ISO dates
      recipe.createdAtStr = value;
    } else if (header === 'Erstellt von') {
      recipe.authorName = value;
    } else if (header === 'Kulinarik') {
      recipe.kulinarik = parseCommaSeparated(value);
    } else if (header === 'Speisenkategorie') {
      recipe.speisekategorie = parseCommaSeparated(value);
    } else if (header === 'Portionen') {
      const portion = parsePortion(value);
      recipe.portionen = portion.portionen;
      recipe.portionUnitId = portion.portionUnitId;
    } else if (header === 'Zubereitung') {
      recipe.kochdauer = parseCookingTime(value);
    } else if (header === 'Schwierigkeit') {
      recipe.schwierigkeit = parseDifficulty(value);
    } else if (header.startsWith('Zutat')) {
      // Ingredient fields (Zutat1, Zutat2, ..., Zutat31)
      const item = processListItem(value, 'ingredient');
      if (item) {
        recipe.ingredients.push(item);
      }
    } else if (header.startsWith('Zubereitungsschritt')) {
      // Step fields (Zubereitungsschritt1, ..., Zubereitungsschritt27)
      const item = processListItem(value, 'step');
      if (item) {
        recipe.steps.push(item);
      }
    }
  }
  
  return recipe;
}

/**
 * Validate a parsed recipe
 * @param {Object} recipe - Recipe to validate
 * @param {number} rowNumber - Row number (for error messages)
 * @throws {Error} - If recipe is invalid
 */
function validateRecipe(recipe, rowNumber) {
  if (!recipe.title) {
    throw new Error(`Zeile ${rowNumber}: Rezeptname fehlt`);
  }
  
  if (recipe.ingredients.length === 0) {
    throw new Error(`Zeile ${rowNumber} (${recipe.title}): Mindestens eine Zutat erforderlich`);
  }
  
  if (recipe.steps.length === 0) {
    throw new Error(`Zeile ${rowNumber} (${recipe.title}): Mindestens ein Zubereitungsschritt erforderlich`);
  }
}

/**
 * Parse CSV content and extract multiple recipes
 * @param {string} csvContent - CSV file content
 * @param {string} currentUserName - Name of current user
 * @returns {Array<Object>} - Array of recipe objects
 * @throws {Error} - If CSV is invalid or parsing fails
 */
export function parseBulkCSV(csvContent, currentUserName = '') {
  if (!csvContent || typeof csvContent !== 'string') {
    throw new Error('Ungültiger CSV-Inhalt');
  }
  
  const lines = csvContent.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error('CSV muss mindestens Header und eine Datenzeile enthalten');
  }
  
  // Detect delimiter from header line
  const delimiter = detectDelimiter(lines[0]);
  
  // Parse header
  const headers = parseCSVLine(lines[0], delimiter);
  
  // Parse data rows
  const recipes = [];
  const errors = [];
  
  for (let i = 1; i < lines.length; i++) {
    try {
      const values = parseCSVLine(lines[i], delimiter);
      const recipe = parseRecipeRow(headers, values, currentUserName);
      
      // Validate recipe
      validateRecipe(recipe, i + 1);
      
      recipes.push(recipe);
    } catch (error) {
      errors.push(error.message);
    }
  }
  
  // If there were errors, report them
  if (errors.length > 0) {
    if (recipes.length === 0) {
      // All rows failed
      throw new Error('Fehler beim Importieren:\n' + errors.join('\n'));
    } else {
      // Some rows succeeded, some failed
      console.warn('Einige Rezepte konnten nicht importiert werden:', errors);
    }
  }
  
  if (recipes.length === 0) {
    throw new Error('Keine gültigen Rezepte zum Importieren gefunden');
  }
  
  return recipes;
}

/**
 * Example CSV format for documentation
 */
export const EXAMPLE_CSV = `Name,Erstellt am,Erstellt von,Kulinarik,Speisenkategorie,Portionen,Zubereitung,Schwierigkeit,Zutat1,Zutat2,Zutat3,Zubereitungsschritt1,Zubereitungsschritt2
Spaghetti Carbonara,2024-01-15,Max Mustermann,"Italienisch,Klassisch",Hauptgericht,4 Portionen,30,3,400g Spaghetti,200g Speck,4 Eier,Nudeln kochen,Sauce zubereiten und servieren
Pizza Margherita,2024-01-16,Anna Müller,Italienisch,"Hauptgericht,Vegetarisch",2 Portionen,25,2,###Teig,300g Mehl,###Belag,200g Tomaten,Teig zubereiten,Belegen und backen`;
