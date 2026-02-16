/**
 * OCR Recipe Parser
 * Parses OCR-recognized text into structured recipe data
 * 
 * This parser takes the raw text output from Tesseract.js (or any OCR engine)
 * and extracts structured recipe information including title, ingredients,
 * preparation steps, and metadata (servings, cooking time, etc.).
 * 
 * Supports:
 * - German keywords (Zutaten, Zubereitung, Portionen, für X Personen)
 * - English keywords (Ingredients, Instructions, Directions, Servings, for X people)
 * - Quantity recognition in ingredients (200g, 2 EL, etc.)
 * - Compatible with parseRecipeData() from recipeImport.js
 * 
 * Smart Text Processing Features:
 * - **Bullet Point Filtering**: Standalone bullet points (-, *, •) without text are ignored
 * - **Intelligent Step Merging**: Multi-line steps are intelligently combined:
 *   - Numbered steps (1., 2., etc.) always start a new step
 *   - Lines within a numbered step are merged even if they contain periods
 *   - Non-numbered lines ending with sentence punctuation (. ! ?) start new steps
 *   - Continuation lines without sentence endings are merged with the current step
 * 
 * Examples of Smart Step Merging:
 * 
 * Input:
 * ```
 * 1. Den Backofen auf 180°C
 * Ober-/Unterhitze vorheizen.
 * Ein Backblech mit
 * Backpapier auslegen.
 * 2. In einer Schüssel Mehl
 * und Zucker vermischen
 * ```
 * 
 * Output:
 * ```
 * [
 *   "Den Backofen auf 180°C Ober-/Unterhitze vorheizen. Ein Backblech mit Backpapier auslegen.",
 *   "In einer Schüssel Mehl und Zucker vermischen"
 * ]
 * ```
 * 
 * Usage:
 * ```javascript
 * import { parseOcrText } from './ocrParser';
 * 
 * const ocrText = `Spaghetti Carbonara
 * Portionen: 4
 * 
 * Zutaten
 * 400g Spaghetti
 * 200g Pancetta
 * 
 * Zubereitung
 * 1. Nudeln kochen
 * 2. Pancetta braten`;
 * 
 * const recipe = parseOcrText(ocrText, 'de');
 * // Returns: { title, ingredients, steps, portionen, ... }
 * ```
 * 
 * Integration with OCR Service:
 * ```javascript
 * import { recognizeText } from './ocrService';
 * import { parseOcrText } from './ocrParser';
 * import { parseRecipeData } from './recipeImport';
 * 
 * // 1. Extract text from image
 * const ocrResult = await recognizeText(imageBase64, 'deu');
 * 
 * // 2. Parse into structured recipe
 * const recipe = parseOcrText(ocrResult.text, 'de');
 * 
 * // 3. Validate and normalize
 * const validated = parseRecipeData(recipe);
 * ```
 */

/**
 * Parse OCR text into structured recipe data
 * @param {string} text - OCR-recognized text
 * @param {string} lang - Language code ('de' or 'en'), optional
 * @returns {Object} - Parsed recipe object
 */
export function parseOcrText(text, lang = 'de') {
  if (!text || typeof text !== 'string') {
    throw new Error('Ungültiger OCR-Text');
  }

  const lines = text.split('\n').map(line => line.trim()).filter(line => line);
  
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
  let titleFound = false;
  let rawStepLines = []; // Collect raw step lines for intelligent merging

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip standalone bullet points
    if (isStandaloneBulletPoint(line)) {
      continue;
    }
    
    // Extract title from first non-empty line if not yet found
    // Skip lines that start with list markers or are section headers or properties
    if (!titleFound && !detectSection(line) && !isPropertyLine(line) && !isListItem(line)) {
      recipe.title = line;
      titleFound = true;
      continue;
    }

    // Detect section headings
    const section = detectSection(line);
    if (section) {
      // If leaving steps section, process collected step lines
      if (currentSection === 'steps' && rawStepLines.length > 0) {
        recipe.steps = mergeStepLines(rawStepLines);
        rawStepLines = [];
      }
      currentSection = section;
      continue;
    }

    // Extract property-value pairs (e.g., "Portionen: 4", "Servings: 4")
    const property = parsePropertyLine(line);
    if (property) {
      applyProperty(recipe, property.key, property.value);
      continue;
    }

    // Handle special patterns like "für 8 Personen" or "for 8 people"
    const servingsMatch = line.match(/^(für|for)\s+(\d+)\s+(personen|people|person)/i);
    if (servingsMatch) {
      const num = parseInt(servingsMatch[2]);
      if (!isNaN(num)) {
        recipe.portionen = num;
      }
      continue;
    }

    // Parse content based on current section
    if (currentSection === 'ingredients') {
      const ingredient = parseIngredientLine(line);
      if (ingredient) {
        recipe.ingredients.push(ingredient);
      }
    } else if (currentSection === 'steps') {
      // Collect raw step lines instead of parsing immediately
      rawStepLines.push(line);
    }
  }
  
  // Process any remaining step lines
  if (rawStepLines.length > 0) {
    recipe.steps = mergeStepLines(rawStepLines);
  }

  // Fallback: if no title found, use generic title
  if (!recipe.title) {
    recipe.title = lang === 'de' ? 'OCR-Rezept' : 'OCR Recipe';
  }

  return recipe;
}

/**
 * Detect section type from line text
 * @param {string} line - Line text
 * @returns {string|null} - Section type ('ingredients', 'steps') or null
 */
function detectSection(line) {
  const lineLower = line.toLowerCase();
  
  // Remove common formatting markers
  const cleanLine = lineLower.replace(/[#*\-:]/g, '').trim();
  
  // Ingredient keywords (DE and EN)
  const ingredientKeywords = [
    'zutaten',
    'ingredients'
  ];
  
  // Step/Preparation keywords (DE and EN)
  const stepKeywords = [
    'zubereitung',
    'anleitung',
    'schritte',
    'steps',
    'directions',
    'instructions',
    'preparation',
    'method'
  ];

  // Check if line matches section keywords
  for (const keyword of ingredientKeywords) {
    if (cleanLine === keyword || cleanLine.startsWith(keyword)) {
      return 'ingredients';
    }
  }
  
  for (const keyword of stepKeywords) {
    if (cleanLine === keyword || cleanLine.startsWith(keyword)) {
      return 'steps';
    }
  }
  
  return null;
}

/**
 * Check if line is a property-value line
 * @param {string} line - Line text
 * @returns {boolean}
 */
function isPropertyLine(line) {
  // Pattern: "Property: Value" or similar
  // Requires at least one non-whitespace character before colon
  return /^[A-Za-zäöüÄÖÜß]+[A-Za-zäöüÄÖÜß\s]*:\s*.+$/.test(line);
}

/**
 * Check if line is a list item (starts with -, *, •, or number)
 * @param {string} line - Line text
 * @returns {boolean}
 */
function isListItem(line) {
  return /^[-*•]\s/.test(line) || /^\d+[.)]\s/.test(line);
}

/**
 * Check if line is only a bullet point marker (should be ignored)
 * @param {string} line - Line text
 * @returns {boolean}
 */
function isStandaloneBulletPoint(line) {
  // Match lines that are only bullet points or bullet points with minimal content
  // Hyphen is escaped to avoid being interpreted as a range operator
  return /^[\-*•]+\s*$/.test(line);
}

/**
 * Parse property-value line
 * @param {string} line - Line text
 * @returns {Object|null} - {key, value} or null
 */
function parsePropertyLine(line) {
  // Pattern requires at least one non-whitespace character before colon
  const match = line.match(/^([A-Za-zäöüÄÖÜß]+[A-Za-zäöüÄÖÜß\s]*):\s*(.+)$/);
  if (!match) return null;
  
  const key = match[1].trim().toLowerCase();
  const value = match[2].trim();
  
  return { key, value };
}

/**
 * Apply property to recipe object
 * @param {Object} recipe - Recipe object
 * @param {string} key - Property key
 * @param {string} value - Property value
 */
function applyProperty(recipe, key, value) {
  // Portionen / Servings
  if (key.includes('portion') || key.includes('serving')) {
    const num = extractNumber(value);
    if (num) recipe.portionen = num;
    return;
  }
  
  // Special pattern: "für X Personen" / "for X people"
  if (key.includes('für') || key.includes('for')) {
    const num = extractNumber(value);
    if (num) recipe.portionen = num;
    return;
  }
  
  // Kulinarik / Cuisine
  if (key.includes('kulinarik') || key.includes('cuisine') || key.includes('küche')) {
    const cuisines = value.split(',').map(c => c.trim()).filter(c => c);
    if (cuisines.length > 0) {
      recipe.kulinarik = cuisines;
    }
    return;
  }
  
  // Schwierigkeit / Difficulty
  if (key.includes('schwierigkeit') || key.includes('difficulty')) {
    const num = extractNumber(value, 1, 5);
    if (num) recipe.schwierigkeit = num;
    return;
  }
  
  // Kochdauer / Cooking time
  if (key.includes('kochdauer') || key.includes('dauer') || 
      key.includes('zeit') || key.includes('time') || key.includes('cook')) {
    const num = extractNumber(value);
    if (num) recipe.kochdauer = num;
    return;
  }
  
  // Speisekategorie / Category
  if (key.includes('kategorie') || key.includes('category') || 
      key.includes('type') || key.includes('speise')) {
    recipe.speisekategorie = value;
    return;
  }
}

/**
 * Merge step lines intelligently based on numbering and sentence endings
 * @param {Array<string>} rawLines - Raw step lines
 * @returns {Array<string>} - Merged steps
 */
function mergeStepLines(rawLines) {
  if (!rawLines || rawLines.length === 0) return [];

  const steps = [];
  let currentStep = '';
  let inNumberedStep = false; // Track if we're inside a numbered step
  
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const cleaned = parseStepLine(line);
    
    if (!cleaned) continue;
    
    // Check if this line starts with a number (new step indicator)
    const startsWithNumber = /^\d+[.)]\s/.test(line);
    
    // Check if current accumulated text ends with sentence-ending punctuation
    const currentEndsWithPunctuation = currentStep.length > 0 && /[.!?]\s*$/.test(currentStep);
    
    // Peek ahead to see if the next line starts with a number
    let nextStartsWithNumber = false;
    if (i + 1 < rawLines.length) {
      nextStartsWithNumber = /^\d+[.)]\s/.test(rawLines[i + 1]);
    }
    
    // Start a new step if:
    // 1. Current step is empty (first step)
    // 2. This line starts with a number
    // 3. Previous step ended with punctuation AND (we're not in a numbered step OR next line is numbered)
    const shouldStartNewStep = !currentStep || 
                                startsWithNumber || 
                                (currentEndsWithPunctuation && (!inNumberedStep || nextStartsWithNumber));
    
    if (shouldStartNewStep) {
      // Save the previous step if it exists
      if (currentStep) {
        steps.push(currentStep.trim());
      }
      currentStep = cleaned;
      inNumberedStep = startsWithNumber;
    } else {
      // Continue the current step (append with space)
      currentStep += ' ' + cleaned;
    }
  }
  
  // Don't forget to add the last step
  if (currentStep) {
    steps.push(currentStep.trim());
  }
  
  return steps;
}

/**
 * Parse ingredient line
 * @param {string} line - Line text
 * @returns {string|null} - Parsed ingredient or null
 */
function parseIngredientLine(line) {
  // Skip standalone bullet points
  if (isStandaloneBulletPoint(line)) {
    return null;
  }
  
  // Remove list markers (-, *, •, numbers followed by dot or parenthesis)
  let cleaned = line.replace(/^[-*•]\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
  
  if (!cleaned) return null;
  
  // Return the cleaned ingredient line
  // Quantity recognition is already handled by keeping the full line
  // Examples: "200g Mehl", "2 EL Öl", "1 cup flour"
  return cleaned;
}

/**
 * Parse step line
 * @param {string} line - Line text
 * @returns {string|null} - Parsed step or null
 */
function parseStepLine(line) {
  // Remove list markers and step numbers
  let cleaned = line.replace(/^[-*•]\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
  
  if (!cleaned) return null;
  
  return cleaned;
}

/**
 * Extract number from text
 * @param {string} text - Text containing number
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number|null} - Extracted number or null
 */
function extractNumber(text, min = 0, max = 10000) {
  const match = text.match(/\d+/);
  if (!match) return null;
  
  const num = parseInt(match[0]);
  if (isNaN(num)) return null;
  
  return Math.min(Math.max(num, min), max);
}

/**
 * Example OCR text (German)
 */
export const EXAMPLE_OCR_TEXT_DE = `Spaghetti Carbonara

Portionen: 4
Kochdauer: 30

Zutaten

400g Spaghetti
200g Pancetta
4 Eier
100g Parmesan
Salz, Pfeffer

Zubereitung

1. Nudeln in Salzwasser kochen
2. Pancetta in einer Pfanne anbraten
3. Eier mit Parmesan verquirlen
4. Nudeln abgießen und mit Pancetta mischen
5. Ei-Mischung unterrühren
6. Mit Salz und Pfeffer abschmecken`;

/**
 * Example OCR text (English)
 */
export const EXAMPLE_OCR_TEXT_EN = `Chocolate Chip Cookies

Servings: 24
Time: 25

Ingredients

2 cups flour
1 tsp baking soda
1/2 tsp salt
1 cup butter
3/4 cup sugar
2 eggs
2 cups chocolate chips

Instructions

1. Preheat oven to 375°F
2. Mix flour, baking soda and salt
3. Beat butter and sugar until fluffy
4. Add eggs and mix well
5. Stir in flour mixture
6. Fold in chocolate chips
7. Drop spoonfuls onto baking sheet
8. Bake for 10-12 minutes`;
