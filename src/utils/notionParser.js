/**
 * Notion Recipe Parser
 * Parses Notion exported content (Markdown format) into importable recipe JSON
 * 
 * Supported Notion structures:
 * - Headings for sections (## Zutaten, ## Ingredients, etc.)
 * - Bullet lists for ingredients and steps
 * - Tables with recipe metadata
 * - Properties from Notion databases
 */

/**
 * Parse Notion Markdown content into recipe data
 * @param {string} markdownContent - Notion exported Markdown content
 * @returns {Object} - Parsed recipe object
 */
export function parseNotionMarkdown(markdownContent) {
  if (!markdownContent || typeof markdownContent !== 'string') {
    throw new Error('Ungültiger Markdown-Inhalt');
  }

  const lines = markdownContent.split('\n');
  const recipe = {
    title: '',
    image: '',
    portionen: 4,
    kulinarik: [],
    schwierigkeit: 3,
    kochdauer: 30,
    speisekategorie: '',
    ingredients: [],
    steps: []
  };

  let currentSection = null;
  let inTable = false;
  let tableHeaders = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (!line) continue;

    // Extract title from first heading (# Title)
    if (line.startsWith('# ') && !recipe.title) {
      recipe.title = line.substring(2).trim();
      continue;
    }

    // Detect section headings
    if (line.startsWith('## ')) {
      const heading = line.substring(3).trim().toLowerCase();
      currentSection = detectSection(heading);
      inTable = false;
      continue;
    }

    // Handle table format (Notion database properties)
    if (line.includes('|')) {
      if (!inTable) {
        // First line of table - extract headers
        tableHeaders = line.split('|').map(h => h.trim()).filter(h => h);
        inTable = true;
        // Skip separator line (next line with dashes)
        if (i + 1 < lines.length && lines[i + 1].includes('---')) {
          i++;
        }
        continue;
      } else {
        // Table data row
        const values = line.split('|').map(v => v.trim()).filter(v => v);
        parseTableRow(recipe, tableHeaders, values);
        continue;
      }
    } else {
      inTable = false;
    }

    // Handle bullet points (- or * for lists)
    if (line.match(/^[-*]\s+/)) {
      const content = line.replace(/^[-*]\s+/, '').trim();
      if (!content) continue;

      if (currentSection === 'ingredients') {
        recipe.ingredients.push(content);
      } else if (currentSection === 'steps') {
        // Remove step numbers if present
        const stepContent = content.replace(/^\d+\.\s*/, '');
        recipe.steps.push(stepContent);
      }
      continue;
    }

    // Handle numbered lists for steps
    if (line.match(/^\d+\.\s+/)) {
      const stepContent = line.replace(/^\d+\.\s*/, '').trim();
      if (stepContent) {
        recipe.steps.push(stepContent);
      }
      continue;
    }

    // Extract property-value pairs (Notion database properties in text format)
    // Format: "Property: Value" or "**Property:** Value"
    const propertyMatch = line.match(/^(?:\*\*)?([A-Za-zäöüÄÖÜß\s]+)(?:\*\*)?:\s*(.+)$/);
    if (propertyMatch) {
      const [, key, value] = propertyMatch;
      parseProperty(recipe, key.trim().toLowerCase(), value.trim());
    }
  }

  return recipe;
}

/**
 * Detect section type from heading text
 * @param {string} heading - Section heading text
 * @returns {string|null} - Section type or null
 */
function detectSection(heading) {
  const ingredientKeywords = ['zutaten', 'ingredients', 'ingredienti', 'ingrédients'];
  const stepKeywords = ['zubereitung', 'anleitung', 'schritte', 'steps', 'directions', 'instructions', 'preparation'];

  if (ingredientKeywords.some(keyword => heading.includes(keyword))) {
    return 'ingredients';
  }
  if (stepKeywords.some(keyword => heading.includes(keyword))) {
    return 'steps';
  }
  return null;
}

/**
 * Parse a table row and extract recipe properties
 * @param {Object} recipe - Recipe object to update
 * @param {Array} headers - Table headers
 * @param {Array} values - Table values
 */
function parseTableRow(recipe, headers, values) {
  // Check if this is a property-value table (first column is property name)
  if (headers.length === 2 && 
      (headers[0].toLowerCase() === 'property' || headers[0].toLowerCase() === 'eigenschaft' ||
       headers[1].toLowerCase() === 'value' || headers[1].toLowerCase() === 'wert')) {
    // Property-value format: first column is property name, second is value
    if (values.length >= 2) {
      parseProperty(recipe, values[0], values[1]);
    }
  } else {
    // Standard table format: headers are property names, values are in columns
    for (let i = 0; i < Math.min(headers.length, values.length); i++) {
      const header = headers[i];
      const value = values[i];
      parseProperty(recipe, header, value);
    }
  }
}

/**
 * Parse a property and update recipe object
 * @param {Object} recipe - Recipe object to update
 * @param {string} key - Property key
 * @param {string} value - Property value
 */
function parseProperty(recipe, key, value) {
  // Clean up value (remove markdown formatting)
  const cleanValue = value.replace(/\*\*/g, '').replace(/\*/g, '').trim();

  // Map various property names to recipe fields
  const keyLower = key.toLowerCase();

  // Portionen / Servings
  if (keyLower.includes('portion') || keyLower.includes('serving')) {
    const num = parseInt(cleanValue);
    if (!isNaN(num)) recipe.portionen = num;
  }
  
  // Kulinarik / Cuisine
  else if (keyLower.includes('kulinarik') || keyLower.includes('cuisine') || keyLower.includes('küche')) {
    // Handle comma-separated values
    const cuisines = cleanValue.split(',').map(c => c.trim()).filter(c => c);
    if (cuisines.length > 0) {
      recipe.kulinarik = cuisines;
    }
  }
  
  // Schwierigkeit / Difficulty
  else if (keyLower.includes('schwierigkeit') || keyLower.includes('difficulty')) {
    const num = extractNumber(cleanValue, 1, 5);
    if (num) recipe.schwierigkeit = num;
  }
  
  // Kochdauer / Cooking time
  else if (keyLower.includes('kochdauer') || keyLower.includes('dauer') || 
           keyLower.includes('zeit') || keyLower.includes('time') || keyLower.includes('cook')) {
    const num = extractNumber(cleanValue);
    if (num) recipe.kochdauer = num;
  }
  
  // Speisekategorie / Category
  else if (keyLower.includes('kategorie') || keyLower.includes('category') || 
           keyLower.includes('type') || keyLower.includes('speise')) {
    recipe.speisekategorie = cleanValue;
  }
  
  // Image URL
  else if (keyLower.includes('bild') || keyLower.includes('foto') || 
           keyLower.includes('image') || keyLower.includes('photo')) {
    // Extract URL from markdown image syntax if present
    const urlMatch = cleanValue.match(/\(([^)]+)\)/);
    if (urlMatch) {
      recipe.image = urlMatch[1];
    } else if (cleanValue.startsWith('http')) {
      recipe.image = cleanValue;
    }
  }
}

/**
 * Extract number from text (handles various formats)
 * @param {string} text - Text containing number
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number|null} - Extracted number or null
 */
function extractNumber(text, min = 0, max = 10000) {
  // Extract first number from text
  const match = text.match(/\d+/);
  if (!match) return null;
  
  const num = parseInt(match[0]);
  if (isNaN(num)) return null;
  
  // Clamp to range
  return Math.min(Math.max(num, min), max);
}

/**
 * Parse Notion database export (CSV format)
 * @param {string} csvContent - CSV content from Notion export
 * @returns {Object} - Parsed recipe object
 */
export function parseNotionCSV(csvContent) {
  if (!csvContent || typeof csvContent !== 'string') {
    throw new Error('Ungültiger CSV-Inhalt');
  }

  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('CSV muss mindestens Header und eine Datenzeile enthalten');
  }

  // Parse CSV (simple parser, doesn't handle complex cases)
  const headers = parseCSVLine(lines[0]);
  const values = parseCSVLine(lines[1]); // Take first recipe only

  const recipe = {
    title: '',
    image: '',
    portionen: 4,
    kulinarik: [],
    schwierigkeit: 3,
    kochdauer: 30,
    speisekategorie: '',
    ingredients: [],
    steps: []
  };

  // Map CSV columns to recipe properties
  for (let i = 0; i < Math.min(headers.length, values.length); i++) {
    const header = headers[i].toLowerCase();
    const value = values[i];

    if (!value) continue;

    // Title/Name
    if (header.includes('name') || header.includes('title') || header.includes('rezept')) {
      recipe.title = value;
    }
    // Parse other properties
    else {
      parseProperty(recipe, header, value);
    }
  }

  return recipe;
}

/**
 * Simple CSV line parser
 * @param {string} line - CSV line
 * @returns {Array} - Parsed values
 */
function parseCSVLine(line) {
  const values = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(currentValue.trim());
      currentValue = '';
    } else {
      currentValue += char;
    }
  }

  // Add last value
  if (currentValue || line.endsWith(',')) {
    values.push(currentValue.trim());
  }

  return values;
}

/**
 * Example Notion Markdown export for reference
 */
export const EXAMPLE_NOTION_MARKDOWN = `# Pizza Bianco al Tartufo

**Portionen:** 4
**Kulinarik:** Italienisch
**Schwierigkeit:** 3
**Kochdauer:** 45 Minuten
**Speisekategorie:** Hauptgericht

## Zutaten

- 500g Pizzateig
- 200g Mozzarella
- 100g Ricotta
- 50g Parmesan
- 2 EL Trüffelöl
- Salz, Pfeffer

## Zubereitung

1. Ofen auf 250°C vorheizen
2. Pizzateig ausrollen
3. Mozzarella, Ricotta und Parmesan verteilen
4. Mit Salz und Pfeffer würzen
5. 10-12 Minuten backen
6. Mit Trüffelöl beträufeln und servieren
`;
