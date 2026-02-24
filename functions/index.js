/**
 * Firebase Cloud Functions for RecipeBook
 * Provides secure server-side API access for AI OCR functionality
 */

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();

// Define the Gemini API key as a secret
// Set with: firebase functions:secrets:set GEMINI_API_KEY
const geminiApiKey = defineSecret('GEMINI_API_KEY');

/**
 * Rate limiting configuration
 */
const RATE_LIMITS = {
  admin: 1000, // 1000 scans per day for admin users
  authenticated: 20, // 20 scans per day for authenticated users
  guest: 5, // 5 scans per day for guest/anonymous users
};

/**
 * Input validation constants
 */
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB in bytes
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

/**
 * Default AI recipe extraction prompt (must stay in sync with src/utils/customLists.js)
 */
const DEFAULT_AI_RECIPE_PROMPT = `Analysiere dieses Rezeptbild und extrahiere alle Informationen als strukturiertes JSON.

Bitte gib das Ergebnis im folgenden JSON-Format zurück:
{
  "titel": "Name des Rezepts",
  "portionen": Anzahl der Portionen als Zahl (nur die Zahl, z.B. 4),
  "zubereitungszeit": Zeit in Minuten als Zahl (nur die Zahl, z.B. 30),
  "kochzeit": Kochzeit in Minuten als Zahl (optional),
  "schwierigkeit": Schwierigkeitsgrad 1-5 (1=sehr einfach, 5=sehr schwer),
  "kulinarik": "Kulinarische Herkunft (z.B. Italienisch, Asiatisch, Deutsch)",
  "kategorie": "Kategorie (z.B. Hauptgericht, Dessert, Vorspeise, Beilage, Snack)",
  "tags": ["vegetarisch", "vegan", "glutenfrei"], // nur falls explizit erwähnt
  "zutaten": [
    "500 g Spaghetti",
    "200 g Speck",
    "4 Eier"
  ],
  "zubereitung": [
    "Wasser in einem großen Topf zum Kochen bringen und salzen",
    "Spaghetti nach Packungsanweisung kochen",
    "Speck in Würfel schneiden und in einer Pfanne knusprig braten"
  ],
  "notizen": "Zusätzliche Hinweise oder Tipps (optional)"
}

WICHTIGE REGELN:
1. Mengenangaben: Verwende immer das Format "Zahl Einheit Zutat" (z.B. "500 g Mehl", "2 Esslöffel Olivenöl", "1 Prise Salz")
2. Zahlen: portionen, zubereitungszeit, kochzeit und schwierigkeit müssen reine Zahlen sein (kein Text!)
3. Zubereitungsschritte: Jeder Schritt sollte eine vollständige, klare Anweisung sein
4. Fehlende Informationen: Wenn eine Information nicht lesbar oder nicht vorhanden ist, verwende null oder lasse das Array leer
5. Einheiten: Standardisiere Einheiten (g statt Gramm, ml statt Milliliter, Esslöffel statt EL, Teelöffel statt TL)
6. Tags: Füge nur Tags hinzu, die explizit im Rezept erwähnt werden oder eindeutig aus den Zutaten ableitbar sind
7. Wähle für die Felder "kulinarik" und "kategorie" **NUR** Werte aus diesen Listen:
**Verfügbare Kulinarik-Typen:**
{{CUISINE_TYPES}}
Wenn kein Fleisch oder Fisch enthalten ist, setze zusätzlich **immer** "Vegetarisch".
Wenn keine tierischen Produkte enthalten sind (z.B. Butter, Fleisch, Fisch, Eier usw.), setze zusätzlich **immer** "Vegan".
**Verfügbare Speisekategorien:**
{{MEAL_CATEGORIES}}
Wenn das Rezept zu keiner dieser Kategorien passt, wähle die nächstliegende oder lasse das Feld leer. Mehrfachauswahlen sind möglich
8. Zubereitung: Das Feld "zubereitung" MUSS immer ein JSON-Array von Strings sein. Schreibe jeden einzelnen Schritt als separaten String in das Array. Fasse NIEMALS mehrere Schritte in einem einzigen String zusammen. Mindestens 1 Schritt muss vorhanden sein, wenn Zubereitungsinformationen erkennbar sind.

BEISPIEL GUTE EXTRAKTION:
{
  "titel": "Spaghetti Carbonara",
  "portionen": 4,
  "zubereitungszeit": 30,
  "schwierigkeit": 2,
  "kulinarik": "Italienisch",
  "kategorie": "Hauptgericht",
  "tags": [],
  "zutaten": [
    "400 g Spaghetti",
    "200 g Guanciale oder Pancetta",
    "4 Eigelb",
    "100 g Pecorino Romano",
    "Schwarzer Pfeffer",
    "Salz"
  ],
  "zubereitung": [
    "Reichlich Wasser in einem großen Topf zum Kochen bringen und großzügig salzen",
    "Guanciale in kleine Würfel schneiden und bei mittlerer Hitze knusprig braten",
    "Eigelb mit geriebenem Pecorino und viel schwarzem Pfeffer verrühren",
    "Spaghetti nach Packungsanweisung bissfest kochen",
    "Pasta abgießen, dabei etwas Nudelwasser auffangen",
    "Pasta zum Guanciale geben, von der Hitze nehmen",
    "Ei-Käse-Mischung unterrühren, mit Nudelwasser cremig machen",
    "Sofort servieren mit extra Pecorino und Pfeffer"
  ],
  "notizen": "Wichtig: Die Pfanne muss von der Hitze genommen werden, bevor die Eier hinzugefügt werden, sonst stocken sie."
}

Extrahiere nun alle sichtbaren Informationen aus dem Bild genau nach diesem Schema.`;

/**
 * Get the recipe extraction prompt
 * Loads from Firestore settings, throws an error if not configured
 * @returns {Promise<string>} The formatted prompt
 */
async function getRecipeExtractionPrompt() {
  const db = admin.firestore();

  try {
    const settingsDoc = await db.collection('settings').doc('app').get();

    if (!settingsDoc.exists) {
      console.error('Settings document does not exist in Firestore');
      throw new HttpsError(
        'failed-precondition',
        'AI prompt not configured. Please configure the AI recipe prompt in Settings.'
      );
    }

    const settings = settingsDoc.data();

    if (!settings.aiRecipePrompt || settings.aiRecipePrompt.trim() === '') {
      console.error('aiRecipePrompt field is empty or missing in settings/app');
      throw new HttpsError(
        'failed-precondition',
        'AI prompt not configured. Please configure the AI recipe prompt in Settings.'
      );
    }

    let aiRecipePrompt = settings.aiRecipePrompt;

    // Migration: if the stored prompt is missing required placeholders, reset to default
    if (
      !aiRecipePrompt.includes('{{CUISINE_TYPES}}') ||
      !aiRecipePrompt.includes('{{MEAL_CATEGORIES}}')
    ) {
      console.warn('AI prompt in Firestore is missing placeholders – migrating to DEFAULT_AI_RECIPE_PROMPT');
      aiRecipePrompt = DEFAULT_AI_RECIPE_PROMPT;
      await db.collection('settings').doc('app').update({aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT});
      console.log('Successfully migrated aiRecipePrompt in Firestore to default version');
    }

    console.log('Successfully loaded AI prompt from Firestore settings');
    console.log(`Prompt length: ${aiRecipePrompt.length} characters`);

    return aiRecipePrompt;
  } catch (error) {
    // If it's already an HttpsError, rethrow it
    if (error instanceof HttpsError) {
      throw error;
    }

    // Log the actual error
    console.error('Error loading AI prompt from Firestore:', error);

    // Throw a user-friendly error
    throw new HttpsError(
      'internal',
      'Failed to load AI prompt configuration. Please try again or contact support.'
    );
  }
}

/**
 * Get the appropriate rate limit for a user based on their role
 * @param {boolean} isAdmin - Whether user is an admin
 * @param {boolean} isAuthenticated - Whether user is authenticated
 * @returns {number} The rate limit for the user
 */
function getRateLimit(isAdmin, isAuthenticated) {
  return isAdmin ? RATE_LIMITS.admin
    : isAuthenticated ? RATE_LIMITS.authenticated
    : RATE_LIMITS.guest;
}

/**
 * Check and update rate limit for a user
 * @param {string} userId - User ID (or IP for anonymous)
 * @param {boolean} isAuthenticated - Whether user is authenticated
 * @param {boolean} isAdmin - Whether user is an admin
 * @returns {Promise<{allowed: boolean, remaining: number, limit: number}>}
 */
async function checkRateLimit(userId, isAuthenticated, isAdmin = false) {
  const db = admin.firestore();
  // Use MEZ (Europe/Berlin) timezone so counter resets at 0 Uhr MEZ
  const today = new Date().toLocaleDateString('sv-SE', {timeZone: 'Europe/Berlin'}); // YYYY-MM-DD
  const docRef = db.collection('aiScanLimits').doc(`${userId}_${today}`);

  const limit = getRateLimit(isAdmin, isAuthenticated);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);

      if (!doc.exists) {
        // First scan of the day
        transaction.set(docRef, {
          userId: userId,
          date: today,
          count: 1,
          isAuthenticated: isAuthenticated,
          isAdmin: isAdmin,
        });
        return {allowed: true, remaining: limit - 1, limit};
      }

      const data = doc.data();
      if (data.count >= limit) {
        return {allowed: false, remaining: 0, limit};
      }

      // Increment counter
      transaction.update(docRef, {
        count: admin.firestore.FieldValue.increment(1),
      });
      return {allowed: true, remaining: limit - data.count - 1, limit};
    });

    return result;
  } catch (error) {
    console.error('Rate limit check error:', error);
    // On error, allow the request (fail open)
    return {allowed: true, remaining: limit, limit};
  }
}

/**
 * Validate image data
 * @param {string} imageBase64 - Base64 encoded image
 * @returns {Object} Validation result with mimeType and base64Data
 */
function validateImageData(imageBase64) {
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    throw new HttpsError('invalid-argument', 'Invalid image data: must be a non-empty string');
  }

  // Check minimum length
  if (imageBase64.length < 100) {
    throw new HttpsError('invalid-argument', 'Invalid image data: too short');
  }

  // Remove data URL prefix if present and extract MIME type
  let base64Data = imageBase64;
  let mimeType = 'image/jpeg'; // default

  if (imageBase64.startsWith('data:')) {
    const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new HttpsError('invalid-argument', 'Invalid data URL format');
    }
    mimeType = match[1];
    base64Data = match[2];
  }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new HttpsError(
        'invalid-argument',
        `Invalid image type: ${mimeType}. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
    );
  }

  // Estimate base64 size (base64 encoding increases size by ~33%, so decoded size is 3/4 of encoded length)
  const estimatedSize = (base64Data.length * 3) / 4;
  if (estimatedSize > MAX_IMAGE_SIZE) {
    throw new HttpsError(
        'invalid-argument',
        `Image too large: max ${MAX_IMAGE_SIZE / 1024 / 1024}MB allowed`
    );
  }

  return {mimeType, base64Data};
}

/**
 * Call Gemini API to analyze recipe image
 * @param {string} base64Data - Pure base64 image data (no prefix)
 * @param {string} mimeType - Image MIME type
 * @param {string} lang - Language code
 * @param {string} apiKey - Gemini API key
 * @param {string[]|undefined} cuisineTypes - Configured cuisine types
 * @param {string[]|undefined} mealCategories - Configured meal categories
 * @returns {Promise<Object>} Structured recipe data
 */
async function callGeminiAPI(base64Data, mimeType, lang, apiKey, cuisineTypes, mealCategories) {
  let prompt = await getRecipeExtractionPrompt();

  // Warn if expected placeholders are missing from the prompt
  if (!prompt.includes('{{CUISINE_TYPES}}')) {
    console.warn('WARNING: {{CUISINE_TYPES}} placeholder was not found in prompt!');
  }
  if (!prompt.includes('{{MEAL_CATEGORIES}}')) {
    console.warn('WARNING: {{MEAL_CATEGORIES}} placeholder was not found in prompt!');
  }

  // Replace placeholders with actual configured lists
  if (Array.isArray(cuisineTypes) && cuisineTypes.length > 0) {
    const cuisineList = cuisineTypes.map((c) => `- ${c}`).join('\n');
    prompt = prompt.replaceAll('{{CUISINE_TYPES}}', cuisineList);
  } else {
    // Fallback to default lists if not provided
    prompt = prompt.replaceAll('{{CUISINE_TYPES}}', '- Italian\n- Thai\n- Chinese\n- Japanese\n- Indian\n- Mexican\n- French\n- German\n- American\n- Mediterranean');
  }

  if (Array.isArray(mealCategories) && mealCategories.length > 0) {
    const categoryList = mealCategories.map((c) => `- ${c}`).join('\n');
    prompt = prompt.replaceAll('{{MEAL_CATEGORIES}}', categoryList);
  } else {
    // Fallback to default lists if not provided
    prompt = prompt.replaceAll('{{MEAL_CATEGORIES}}', '- Appetizer\n- Main Course\n- Dessert\n- Soup\n- Salad\n- Snack\n- Beverage\n- Side Dish');
  }

  console.log(`Using AI prompt with replaced placeholders`);
  console.log(`Cuisine types: ${cuisineTypes?.length || 0} items`);
  console.log(`Meal categories: ${mealCategories?.length || 0} items`);

  const requestBody = {
    contents: [
      {
        parts: [
          {text: prompt},
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1, // Low temperature for more consistent outputs
      topK: 32,
      topP: 1,
      maxOutputTokens: 8192, // Erhöht von 2048 für vollständige Rezepte mit Zubereitungsschritten
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini API error:', errorData);
      const errorMessage = errorData.error?.message || response.statusText;
      if (response.status === 429) {
        throw new HttpsError('resource-exhausted', `Gemini API error: ${errorMessage}`);
      } else if (response.status === 503 || response.status === 502) {
        throw new HttpsError('unavailable', `Gemini API error: ${errorMessage}`);
      }
      throw new HttpsError('internal', `Gemini API error: ${errorMessage}`);
    }

    const data = await response.json();

    // Extract the text response
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      throw new HttpsError('internal', 'No response from Gemini API');
    }

    // Parse JSON response (handle markdown code blocks if present)
    let jsonText = textResponse.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    const recipeData = JSON.parse(jsonText);
    // DEBUG - kann danach wieder entfernt werden
    console.log('DEBUG zubereitung:', JSON.stringify(recipeData.zubereitung));
    console.log('DEBUG alle Keys:', Object.keys(recipeData));
    
    // Normalize the data structure based on language
    if (lang === 'de') {
      return {
        title: recipeData.titel || '',
        servings: recipeData.portionen || 0,
        prepTime: recipeData.zubereitungszeit || '',
        cookTime: recipeData.kochzeit || '',
        difficulty: recipeData.schwierigkeit || 0,
        cuisine: recipeData.kulinarik || '',
        category: recipeData.kategorie || '',
        tags: recipeData.tags || [],
        ingredients: recipeData.zutaten || [],
        steps: recipeData.zubereitung || [],
        notes: recipeData.notizen || '',
        confidence: 95,
        provider: 'gemini',
        rawResponse: textResponse,
      };
    } else {
      return {
        title: recipeData.title || '',
        servings: recipeData.servings || 0,
        prepTime: recipeData.prepTime || '',
        cookTime: recipeData.cookTime || '',
        difficulty: recipeData.difficulty || 0,
        cuisine: recipeData.cuisine || '',
        category: recipeData.category || '',
        tags: recipeData.tags || [],
        ingredients: recipeData.ingredients || [],
        steps: recipeData.steps || [],
        notes: recipeData.notes || '',
        confidence: 95,
        provider: 'gemini',
        rawResponse: textResponse,
      };
    }
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    console.error('Gemini API call error:', error);

    // Enhance error messages based on error type
    if (error.message.includes('quota')) {
      throw new HttpsError('resource-exhausted', 'API quota exceeded. Please try again later.');
    } else if (error.name === 'AbortError' || error.message.includes('timeout')) {
      throw new HttpsError('deadline-exceeded', 'Request timed out. Please try again.');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' ||
               error.message.includes('fetch') || error.message.includes('network')) {
      throw new HttpsError('unavailable', 'Network error. Please check your connection.');
    } else if (error.message.includes('JSON')) {
      throw new HttpsError(
          'invalid-argument',
          'Failed to parse recipe data. The image might not contain a valid recipe.'
      );
    }

    throw new HttpsError('internal', 'Failed to process image with AI: ' + error.message);
  }
}

/**
 * Cloud Function: Scan recipe with AI
 * This is a callable function that can be invoked from the client
 *
 * Input data:
 * - imageBase64: Base64 encoded image (with or without data URL prefix)
 * - language: Language code ('de' or 'en'), defaults to 'de'
 *
 * Returns: Structured recipe data
 */
exports.scanRecipeWithAI = onCall(
    {
      secrets: [geminiApiKey],
      maxInstances: 10,
      memory: '512MiB',
      timeoutSeconds: 60,
    },
    async (request) => {
      const {imageBase64, language = 'de', cuisineTypes, mealCategories} = request.data;

      // Authentication check
      const auth = request.auth;
      if (!auth) {
        throw new HttpsError(
            'unauthenticated',
            'You must be logged in to use AI recipe scanning'
        );
      }

      const userId = auth.uid;
      const isAuthenticated = auth.token.firebase?.sign_in_provider !== 'anonymous';
      const isAdmin = auth.token.admin === true;

      console.log(`AI Scan request from user ${userId} (authenticated: ${isAuthenticated}, admin: ${isAdmin})`);

      // Rate limiting
      const rateLimitResult = await checkRateLimit(userId, isAuthenticated, isAdmin);
      if (!rateLimitResult.allowed) {
        const limit = getRateLimit(isAdmin, isAuthenticated);
        throw new HttpsError(
            'resource-exhausted',
            `Tageslimit erreicht (${limit}/${limit} Scans). Versuche es morgen erneut oder nutze Standard-OCR.`
        );
      }

      // Input validation
      const {mimeType, base64Data} = validateImageData(imageBase64);

      // Validate language
      if (!['de', 'en'].includes(language)) {
        throw new HttpsError('invalid-argument', 'Language must be "de" or "en"');
      }

      // Get API key from secret
      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        console.error('GEMINI_API_KEY secret not configured');
        throw new HttpsError(
            'failed-precondition',
            'AI service not configured. Please contact administrator.'
        );
      }

      // Call Gemini API
      try {
        const result = await callGeminiAPI(base64Data, mimeType, language, apiKey, cuisineTypes, mealCategories);
        console.log(`AI Scan successful for user ${userId}`);
        return {
          ...result,
          remainingScans: rateLimitResult.remaining,
          dailyLimit: rateLimitResult.limit,
        };
      } catch (error) {
        console.error(`AI Scan failed for user ${userId}:`, error);
        throw error;
      }
    }
);

/**
 * Cloud Function: Capture Website Screenshot
 * This is a callable function that captures a screenshot of a website
 *
 * Input data:
 * - url: The URL of the website to capture
 *
 * Returns: Base64 encoded screenshot
 */
exports.captureWebsiteScreenshot = onCall(
    {
      maxInstances: 10,
      memory: '1GiB',
      timeoutSeconds: 60,
    },
    async (request) => {
      const {url} = request.data;

      // Authentication check
      const auth = request.auth;
      if (!auth) {
        throw new HttpsError(
            'unauthenticated',
            'You must be logged in to use web import'
        );
      }

      const userId = auth.uid;
      const isAuthenticated = auth.token.firebase?.sign_in_provider !== 'anonymous';
      const isAdmin = auth.token.admin === true;

      console.log(`Screenshot request from user ${userId} for URL: ${url}`);

      // Validate URL first (before rate limiting)
      if (!url || typeof url !== 'string') {
        throw new HttpsError('invalid-argument', 'URL must be a non-empty string');
      }

      // Basic URL validation
      try {
        const urlObj = new URL(url);
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
          throw new HttpsError('invalid-argument', 'URL must use HTTP or HTTPS protocol');
        }
      } catch (error) {
        throw new HttpsError('invalid-argument', 'Invalid URL format');
      }

      // Check if Puppeteer is available BEFORE rate limiting
      // This prevents users from consuming their quota when the feature is unavailable
      // Note: Puppeteer is NOT installed in this implementation
      // To activate this feature:
      // 1. Add puppeteer to package.json dependencies: npm install puppeteer@^21.0.0
      // 2. Deploy to a Cloud Function with sufficient resources (2GB+ memory)
      // 3. Uncomment the implementation code below
      // 4. Remove this error check
      
      console.error('Puppeteer not configured in Cloud Functions');
      throw new HttpsError(
          'failed-precondition',
          'Screenshot capture requires Puppeteer to be installed. ' +
          'Please add "puppeteer": "^21.0.0" to functions/package.json and redeploy. ' +
          'For now, please use the photo scan feature instead.'
      );

      // Rate limiting (only checked after Puppeteer availability)
      // This code will run once Puppeteer is installed and the error above is removed
      const rateLimitResult = await checkRateLimit(userId, isAuthenticated, isAdmin);
      if (!rateLimitResult.allowed) {
        const limit = getRateLimit(isAdmin, isAuthenticated);
        throw new HttpsError(
            'resource-exhausted',
            `Rate limit exceeded: maximum ${limit} captures per day`
        );
      }

      // Puppeteer implementation:
      const puppeteer = require('puppeteer');

      try {
        const browser = await puppeteer.launch({
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        
        // Navigate to the URL with timeout
        await page.goto(url, { 
          waitUntil: 'networkidle0',
          timeout: 30000 
        });

        // Take screenshot
        const screenshot = await page.screenshot({ 
          encoding: 'base64',
          fullPage: true 
        });

        await browser.close();

        console.log(`Screenshot captured successfully for user ${userId}`);
        
        return {
          screenshot: `data:image/png;base64,${screenshot}`,
          url: url,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error(`Screenshot capture failed for user ${userId}:`, error);
        
        if (error.message.includes('timeout')) {
          throw new HttpsError('deadline-exceeded', 'Website took too long to load');
        }
        
        throw new HttpsError('internal', 'Failed to capture screenshot: ' + error.message);
      }
    }
);

/**
 * Parse an ingredient string and return the estimated weight in grams and
 * a clean search name for the OpenFoodFacts API.
 *
 * Handles formats like:
 *   "500 g Mehl", "2 EL Olivenöl", "4 Eier", "1 Prise Salz", "200ml Milch"
 *
 * @param {string} ingredientStr - Raw ingredient string
 * @returns {{amountG: number, name: string}|null}
 */
function parseIngredientForNutrition(ingredientStr) {
  if (!ingredientStr || typeof ingredientStr !== 'string') return null;

  const str = ingredientStr.trim();
  if (!str) return null;

  // Conversion factors to grams (approximate)
  const UNIT_GRAMS = {
    g: 1, kg: 1000, mg: 0.001,
    ml: 1, l: 1000, dl: 100, cl: 10,
    EL: 15, el: 15, Esslöffel: 15, esslöffel: 15,
    TL: 5, tl: 5, Teelöffel: 5, teelöffel: 5,
    Prise: 1, prise: 1, Prisen: 1, prisen: 1,
    Tasse: 240, tasse: 240, Tassen: 240, tassen: 240,
    Bund: 30, bund: 30,
  };

  // Match: number (int or decimal) + optional unit + ingredient name
  // e.g. "500 g Mehl", "200ml Milch", "2 EL Öl", "4 Eier"
  const match = str.match(
      /^([\d.,]+)\s*([a-zA-ZäöüÄÖÜß]+)?\.?\s+(.+)/
  );

  if (match) {
    const amount = parseFloat(match[1].replace(',', '.'));
    const potentialUnit = match[2] || '';
    const rest = match[3].trim();

    if (potentialUnit && Object.hasOwn(UNIT_GRAMS, potentialUnit)) {
      const amountG = isNaN(amount) ? 100 : amount * UNIT_GRAMS[potentialUnit];
      return {amountG: Math.max(amountG, 1), name: rest};
    } else if (potentialUnit) {
      // Unknown unit – treat everything after the number as the ingredient name
      const name = `${potentialUnit} ${rest}`.trim();
      return {amountG: 100, name};
    } else {
      // No unit: treat as a count (e.g. "4 Eier") – rough 60 g per piece
      const amountG = isNaN(amount) ? 60 : amount * 60;
      return {amountG: Math.max(amountG, 10), name: rest};
    }
  }

  // No leading number – assume a small condiment/spice (~5 g)
  return {amountG: 5, name: str};
}

/**
 * Fetch a URL with automatic retry and exponential backoff.
 *
 * @param {string} url - The URL to fetch.
 * @param {object} options - Fetch options (headers, etc.).
 * @param {number} maxAttempts - Maximum number of attempts (default 3).
 * @returns {Promise<Response>} The successful fetch response.
 */
async function fetchWithRetry(url, options, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, options);
      // Only retry on server-side 5xx errors, not client errors
      if (response.status >= 500 && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
        continue;
      }
      return response;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
      }
    }
  }
  throw lastErr;
}

/**
 * Cloud Function: Calculate Nutrition from OpenFoodFacts
 *
 * Acts as a server-side proxy for the OpenFoodFacts API so the browser
 * never has to make cross-origin requests directly.
 *
 * Input data:
 * - ingredients: string[]  – array of ingredient strings from the recipe
 * - portionen: number      – number of servings to divide the total by
 *
 * Returns:
 * - naehrwerte: { kalorien, protein, fett, kohlenhydrate, zucker, ballaststoffe, salz }
 *   all values are per portion, rounded to 1 decimal (kalorien is an integer)
 * - details: array with per-ingredient lookup results (for UI feedback)
 * - foundCount / totalCount
 */
exports.calculateNutritionFromOpenFoodFacts = onCall(
    {
      maxInstances: 5,
      timeoutSeconds: 120,
    },
    async (request) => {
      // Authentication check
      if (!request.auth) {
        throw new HttpsError(
            'unauthenticated',
            'You must be logged in to calculate nutrition'
        );
      }

      const {ingredients, portionen = 1} = request.data;

      // Input validation
      if (!Array.isArray(ingredients) || ingredients.length === 0) {
        throw new HttpsError(
            'invalid-argument',
            'ingredients must be a non-empty array of strings'
        );
      }
      if (typeof portionen !== 'number' || portionen < 1) {
        throw new HttpsError(
            'invalid-argument',
            'portionen must be a positive number'
        );
      }

      const totals = {
        kalorien: 0,
        protein: 0,
        fett: 0,
        kohlenhydrate: 0,
        zucker: 0,
        ballaststoffe: 0,
        salz: 0,
      };

      const DEFAULT_SALT_PER_PORTION_G = 2;
      const details = [];
      let foundCount = 0;

      for (const ingredient of ingredients) {
        // Skip heading items (e.g. { type: 'heading', text: '...' })
        if (ingredient && typeof ingredient === 'object' && ingredient.type === 'heading') {
          continue;
        }
        const ingredientStr = (ingredient && typeof ingredient === 'object') ? ingredient.text : ingredient;

        // Special case: salt without quantity → default 2 g per portion
        if (typeof ingredientStr === 'string' && /^salz$/i.test(ingredientStr.trim())) {
          const saltAmountG = DEFAULT_SALT_PER_PORTION_G * portionen;
          totals.salz += saltAmountG;
          details.push({
            ingredient: ingredientStr,
            name: 'Salz',
            found: true,
            product: `Salz (Standard: ${DEFAULT_SALT_PER_PORTION_G} g pro Portion)`,
            amountG: saltAmountG,
          });
          foundCount++;
          continue;
        }

        const parsed = parseIngredientForNutrition(ingredientStr);
        if (!parsed) {
          details.push({ingredient: ingredientStr, found: false, error: 'Konnte nicht geparst werden'});
          continue;
        }

        const {amountG, name} = parsed;

        try {
          const searchUrl =
            `https://world.openfoodfacts.org/cgi/search.pl` +
            `?search_terms=${encodeURIComponent(name)}` +
            `&json=1&page_size=3` +
            `&fields=product_name,nutriments`;

          const response = await fetchWithRetry(searchUrl, {
            headers: {
              'User-Agent': 'RecipeBook/1.0 (https://github.com/brou-cgn/recipebook)',
            },
          });

          if (!response.ok) {
            details.push({ingredient: ingredientStr, name, found: false, error: `HTTP ${response.status}`});
            continue;
          }

          const data = await response.json();

          if (!data.products || data.products.length === 0) {
            details.push({ingredient: ingredientStr, name, found: false, error: 'Nicht gefunden'});
            continue;
          }

          // Prefer the first product with usable energy data; fall back to the first result.
          // If neither has nutriments, mark as not found to avoid adding zero values.
          const productWithData = data.products.find(
              (p) => p.nutriments && p.nutriments['energy-kcal_100g'] != null
          );
          if (!productWithData) {
            console.warn(`No energy data found for "${name}" in OpenFoodFacts results`);
            details.push({ingredient: ingredientStr, name, found: false, error: 'Keine Nährwertdaten verfügbar'});
            continue;
          }
          const product = productWithData;

          const n = product.nutriments || {};
          const scale = amountG / 100;

          totals.kalorien += (n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0) * scale;
          totals.protein += (n['proteins_100g'] ?? n.proteins ?? 0) * scale;
          totals.fett += (n['fat_100g'] ?? n.fat ?? 0) * scale;
          totals.kohlenhydrate += (n['carbohydrates_100g'] ?? n.carbohydrates ?? 0) * scale;
          totals.zucker += (n['sugars_100g'] ?? n.sugars ?? 0) * scale;
          totals.ballaststoffe += (n['fiber_100g'] ?? n.fiber ?? 0) * scale;
          totals.salz += (n['salt_100g'] ?? n.salt ?? 0) * scale;

          details.push({
            ingredient: ingredientStr,
            name,
            found: true,
            product: product.product_name || name,
            amountG,
          });
          foundCount++;
        } catch (err) {
          const isNetworkError = err.name === 'TypeError' || err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED';
          const errorType = isNetworkError ? 'Netzwerkfehler' : 'API-Fehler';
          console.error(`OpenFoodFacts ${errorType} for "${name}":`, err.message);
          details.push({ingredient: ingredientStr, name, found: false, error: err.message});
        }
      }

      // Divide totals by number of portions and round sensibly
      const naehrwerte = {};
      for (const [key, value] of Object.entries(totals)) {
        const perPortion = value / portionen;
        naehrwerte[key] = key === 'kalorien'
          ? Math.round(perPortion)
          : Math.round(perPortion * 10) / 10;
      }

      console.log(
          `Nutrition calculated for user ${request.auth.uid}: ` +
          `${foundCount}/${ingredients.length} ingredients found`
      );

      return {naehrwerte, details, foundCount, totalCount: ingredients.length};
    }
);
