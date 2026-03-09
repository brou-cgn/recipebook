/**
 * Firebase Cloud Functions for RecipeBook
 * Provides secure server-side API access for AI OCR functionality
 */

const {onCall, onRequest, HttpsError} = require('firebase-functions/v2/https');
const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Initialize Firebase Admin
admin.initializeApp();

// Define the Gemini API key as a secret
// Set with: firebase functions:secrets:set GEMINI_API_KEY
const geminiApiKey = defineSecret('GEMINI_API_KEY');

// API key for Apple Shortcut / external recipe import
// Set with: firebase functions:secrets:set SHORTCUT_API_KEY
const shortcutApiKey = defineSecret('SHORTCUT_API_KEY');

// SMTP secrets for email notifications
// Set with: firebase functions:secrets:set SMTP_HOST
// and: SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_FROM
const smtpHost = defineSecret('SMTP_HOST');
const smtpPort = defineSecret('SMTP_PORT');
const smtpUser = defineSecret('SMTP_USER');
const smtpPassword = defineSecret('SMTP_PASSWORD');
const smtpFrom = defineSecret('SMTP_FROM');

/**
 * Trusted origins allowed for CORS on API endpoints.
 * Server-to-server callers (e.g. Apple Shortcuts) send no Origin header and
 * are therefore unaffected by this list.
 */
const ALLOWED_ORIGINS = [
  'https://brou-cgn.github.io',
];

/**
 * Rate limiting configuration
 */
const RATE_LIMITS = {
  admin: 1000, // 1000 scans per day for admin users
  authenticated: 20, // 20 scans per day for authenticated users
  guest: 5, // 5 scans per day for guest/anonymous users
};

/**
 * Maximum number of account registrations allowed per IP address per hour.
 */
const REGISTRATION_RATE_LIMIT = 5;

/**
 * Input validation constants
 */
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20 MB in bytes (Gemini API limit)
const MAX_HTML_SIZE = 500000; // 500 KB in characters
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

/**
 * Blacklist of commonly used weak passwords (all lowercase for case-insensitive comparison).
 */
const COMMON_PASSWORDS = [
  '123456', 'password', '12345678', 'qwerty', 'abc123', '111111',
  '123456789', '1234567890', 'iloveyou', 'admin123', 'letmein',
  'welcome', 'monkey', 'dragon', 'master', 'sunshine', 'princess',
  'qwerty123', 'superman', 'shadow', 'baseball', 'football',
  'charlie', 'donald', 'starwars', 'passw0rd', 'trustno1',
  'password123', 'password1234', 'password12345',
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
5. Einheiten: Standardisiere Einheiten (g statt Gramm, ml statt Milliliter, Esslöffel statt EL, Teelöffel statt TL). Wandle Brüche in Dezimalzahlen um (z.B. "1/2" wird zu "0,5", "1 1/2" wird zu "1,5").
6. Tags: Füge nur Tags hinzu, die explizit im Rezept erwähnt werden oder eindeutig aus den Zutaten ableitbar sind
7. Wähle für die Felder "kulinarik" und "kategorie" **NUR** Werte aus diesen Listen:
**Verfügbare Kulinarik-Typen:**
{{CUISINE_TYPES}}
Wenn kein Fleisch oder Fisch enthalten ist, setze zusätzlich **immer** "Vegetarisch".
Wenn keine tierischen Produkte enthalten sind (z.B. Butter, Fleisch, Fisch, Eier usw.), setze zusätzlich **immer** "Vegetarisch" und "Vegan".
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

    // Migration: if the stored prompt is missing required placeholders or outdated rules, reset to default
    if (
      !aiRecipePrompt.includes('{{CUISINE_TYPES}}') ||
      !aiRecipePrompt.includes('{{MEAL_CATEGORIES}}') ||
      !aiRecipePrompt.includes('Wandle Brüche in Dezimalzahlen um')
    ) {
      console.warn('AI prompt in Firestore is outdated or missing placeholders – migrating to DEFAULT_AI_RECIPE_PROMPT');
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
 * Check and enforce the per-IP registration rate limit.
 * Stores counters in the `registrationLimits` Firestore collection, keyed by
 * IP address and the current UTC hour so the counter resets each hour.
 *
 * @param {string} ip - Normalised client IP address
 * @returns {Promise<{allowed: boolean, remaining: number}>}
 */
async function checkRegistrationRateLimit(ip) {
  const db = admin.firestore();
  // Bucket by UTC hour so the counter resets automatically each hour
  const hourKey = new Date().toISOString().slice(0, 13); // e.g. "2026-03-06T19"
  const docRef = db.collection('registrationLimits').doc(`${ip}_${hourKey}`);

  try {
    return await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);

      if (!snap.exists) {
        transaction.set(docRef, {
          ip,
          hourKey,
          count: 1,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return {allowed: true, remaining: REGISTRATION_RATE_LIMIT - 1};
      }

      const data = snap.data();
      if (data.count >= REGISTRATION_RATE_LIMIT) {
        return {allowed: false, remaining: 0};
      }

      transaction.update(docRef, {
        count: admin.firestore.FieldValue.increment(1),
      });
      return {allowed: true, remaining: REGISTRATION_RATE_LIMIT - data.count - 1};
    });
  } catch (error) {
    console.error('Registration rate limit check error:', error);
    // Fail open so a Firestore outage does not block all registrations
    return {allowed: true, remaining: REGISTRATION_RATE_LIMIT};
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

    // Parse JSON response (handle markdown code blocks and extra text)
    let jsonText = textResponse.trim();

    // Strip markdown code fences (```json ... ``` or ``` ... ```), handling \n and \r\n
    const codeBlockMatch = jsonText.match(/```(?:json)?\r?\n([\s\S]*?)\r?\n```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    } else if (!jsonText.startsWith('{')) {
      // If the response begins with preamble text, extract the first JSON object
      const jsonObjectMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonObjectMatch) {
        jsonText = jsonObjectMatch[0];
      }
    }

    const recipeData = JSON.parse(jsonText);
    
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
 * Call Gemini API with plain text input (no image) to process raw HTML content.
 * Returns the same structured recipe shape as callGeminiAPI.
 *
 * @param {string} rawHtml - Raw HTML string to process
 * @param {string} lang - Language code ('de' or 'en')
 * @param {string} apiKey - Gemini API key
 * @param {string[]|undefined} cuisineTypes - Configured cuisine types
 * @param {string[]|undefined} mealCategories - Configured meal categories
 * @returns {Promise<Object>} Structured recipe data
 */
async function callGeminiTextAPI(rawHtml, lang, apiKey, cuisineTypes, mealCategories) {
  // Load the configured prompt from Firestore (like callGeminiAPI does)
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
    prompt = prompt.replaceAll('{{CUISINE_TYPES}}', '- Italienisch\n- Asiatisch\n- Deutsch\n- Amerikanisch\n- Mediterran\n- Mexikanisch\n- Französisch\n- Japanisch\n- Indisch\n- Griechisch');
  }

  if (Array.isArray(mealCategories) && mealCategories.length > 0) {
    const categoryList = mealCategories.map((c) => `- ${c}`).join('\n');
    prompt = prompt.replaceAll('{{MEAL_CATEGORIES}}', categoryList);
  } else {
    // Fallback to default lists if not provided
    prompt = prompt.replaceAll('{{MEAL_CATEGORIES}}', '- Hauptgericht\n- Dessert\n- Vorspeise\n- Beilage\n- Snack\n- Suppe\n- Salat\n- Getränk');
  }

  console.log(`Using AI prompt for HTML processing with replaced placeholders`);
  console.log(`Cuisine types: ${cuisineTypes?.length || 0} items`);
  console.log(`Meal categories: ${mealCategories?.length || 0} items`);

  // HTML-specific instructions as prefix
  const htmlSpecificInstructions = `Der folgende Inhalt ist unverarbeitetes HTML aus einem Social-Media-Reel oder einer Webseite. Bereinige allen Code und sämtliche HTML-Artefakte und extrahiere das Rezept und die Zutaten. Wenn es nicht auf Deutsch ist, übersetze es auf Deutsch.

`;

  // Combine HTML-specific instructions with the configured prompt and the HTML content
  const fullPrompt = htmlSpecificInstructions + prompt + `\n\nHTML-Inhalt:\n${rawHtml}`;

  const requestBody = {
    contents: [
      {
        parts: [
          {text: fullPrompt},
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      topK: 32,
      topP: 1,
      maxOutputTokens: 8192,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini text API error:', errorData);
      const errorMessage = errorData.error?.message || response.statusText;
      if (response.status === 429) {
        throw new HttpsError('resource-exhausted', `Gemini API error: ${errorMessage}`);
      } else if (response.status === 503 || response.status === 502) {
        throw new HttpsError('unavailable', `Gemini API error: ${errorMessage}`);
      }
      throw new HttpsError('internal', `Gemini API error: ${errorMessage}`);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      throw new HttpsError('internal', 'No response from Gemini API');
    }

    // Parse JSON response (handle markdown code blocks)
    let jsonText = textResponse.trim();
    const codeBlockMatch = jsonText.match(/```(?:json)?\r?\n([\s\S]*?)\r?\n```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    } else if (!jsonText.startsWith('{')) {
      const jsonObjectMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonObjectMatch) {
        jsonText = jsonObjectMatch[0];
      }
    }

    const recipeData = JSON.parse(jsonText);

    return {
      title: recipeData.titel || recipeData.title || '',
      servings: recipeData.portionen || recipeData.servings || 0,
      prepTime: recipeData.zubereitungszeit || recipeData.prepTime || '',
      cookTime: recipeData.kochzeit || recipeData.cookTime || '',
      difficulty: recipeData.schwierigkeit || recipeData.difficulty || 0,
      cuisine: recipeData.kulinarik || recipeData.cuisine || '',
      category: recipeData.kategorie || recipeData.category || '',
      tags: recipeData.tags || [],
      ingredients: recipeData.zutaten || recipeData.ingredients || [],
      steps: recipeData.zubereitung || recipeData.steps || [],
      notes: recipeData.notizen || recipeData.notes || '',
      confidence: 95,
      provider: 'gemini',
      rawResponse: textResponse,
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    console.error('Gemini text API call error:', error);
    if (error.message.includes('quota')) {
      throw new HttpsError('resource-exhausted', 'API quota exceeded. Please try again later.');
    } else if (error.name === 'AbortError' || error.message.includes('timeout')) {
      throw new HttpsError('deadline-exceeded', 'Request timed out. Please try again.');
    } else if (error.message.includes('JSON')) {
      throw new HttpsError(
          'invalid-argument',
          'Failed to parse recipe data. The HTML might not contain a valid recipe.',
      );
    }
    throw new HttpsError('internal', 'Failed to process HTML with AI: ' + error.message);
  }
}

/**
 * Cloud Function: Process raw HTML with Gemini AI to extract recipe data.
 * Used when the Apple Shortcut passes raw HTML from Instagram reels or
 * other social-media pages via a recipeImportPage deeplink.
 *
 * Input data:
 * - rawHtml: Raw HTML string to process
 * - language: Language code ('de' or 'en'), defaults to 'de'
 *
 * Returns: Structured recipe data (same shape as scanRecipeWithAI)
 */
exports.processHtmlWithAI = onCall(
    {
      secrets: [geminiApiKey],
      maxInstances: 10,
      memory: '256MiB',
      timeoutSeconds: 60,
    },
    async (request) => {
      const {rawHtml, language = 'de', cuisineTypes, mealCategories} = request.data;

      // Authentication check
      const auth = request.auth;
      if (!auth) {
        throw new HttpsError(
            'unauthenticated',
            'You must be logged in to use AI HTML processing',
        );
      }

      const userId = auth.uid;
      const isAuthenticated = auth.token.firebase?.sign_in_provider !== 'anonymous';
      const isAdmin = auth.token.admin === true;

      console.log(`HTML processing request from user ${userId}`);

      // Input validation
      if (!rawHtml || typeof rawHtml !== 'string') {
        throw new HttpsError('invalid-argument', 'rawHtml must be a non-empty string');
      }
      if (rawHtml.length > MAX_HTML_SIZE) {
        throw new HttpsError('invalid-argument', 'HTML content too large (max 500 KB)');
      }

      // Validate language
      if (!['de', 'en'].includes(language)) {
        throw new HttpsError('invalid-argument', 'Language must be "de" or "en"');
      }

      // Rate limiting (shared with image scanning)
      const rateLimitResult = await checkRateLimit(userId, isAuthenticated, isAdmin);
      if (!rateLimitResult.allowed) {
        const limit = getRateLimit(isAdmin, isAuthenticated);
        throw new HttpsError(
            'resource-exhausted',
            `Tageslimit erreicht (${limit}/${limit} Scans). Versuche es morgen erneut.`,
        );
      }

      // Get API key from secret
      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        console.error('GEMINI_API_KEY secret not configured');
        throw new HttpsError(
            'failed-precondition',
            'AI service not configured. Please contact administrator.',
        );
      }

      try {
        const result = await callGeminiTextAPI(rawHtml, language, apiKey, cuisineTypes, mealCategories);
        console.log(`HTML processing successful for user ${userId}`);
        return {
          ...result,
          remainingScans: rateLimitResult.remaining,
          dailyLimit: rateLimitResult.limit,
        };
      } catch (error) {
        console.error(`HTML processing failed for user ${userId}:`, error);
        throw error;
      }
    },
);

/**
 * Validate that a URL points to an Instagram Reel.
 * Accepts both www.instagram.com/reel/… and instagram.com/reel/…
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isInstagramReelUrl(url) {
  try {
    const urlObj = new URL(url);
    return (
      (urlObj.hostname === 'www.instagram.com' || urlObj.hostname === 'instagram.com') &&
      /^\/reel\/[A-Za-z0-9_-]+\/?$/.test(urlObj.pathname)
    );
  } catch {
    return false;
  }
}

/**
 * Cloud Function: Scrape Instagram Reel and extract recipe data.
 *
 * Uses Puppeteer to navigate to the Instagram Reel page, extracts the caption
 * text from Open Graph meta tags (og:description, og:title), and any visible
 * text content from the page. The combined text is then processed by Gemini AI
 * to extract structured recipe data.
 *
 * Input data:
 * - url: Instagram Reel URL (e.g. https://www.instagram.com/reel/DTXPDu9DHHb/)
 * - language: Language code ('de' or 'en'), defaults to 'de'
 * - cuisineTypes: optional array of cuisine type strings
 * - mealCategories: optional array of meal category strings
 *
 * Returns: Structured recipe data (same shape as scanRecipeWithAI)
 */
exports.scrapeInstagramReel = onCall(
    {
      secrets: [geminiApiKey],
      maxInstances: 5,
      memory: '2GiB',
      timeoutSeconds: 120,
    },
    async (request) => {
      const {url, language = 'de', cuisineTypes, mealCategories} = request.data;

      // Authentication check
      const auth = request.auth;
      if (!auth) {
        throw new HttpsError(
            'unauthenticated',
            'You must be logged in to use Instagram Reel import',
        );
      }

      const userId = auth.uid;
      const isAuthenticated = auth.token.firebase?.sign_in_provider !== 'anonymous';
      const isAdmin = auth.token.admin === true;

      console.log(`Instagram Reel scrape request from user ${userId} for URL: ${url}`);

      // Validate URL
      if (!url || typeof url !== 'string') {
        throw new HttpsError('invalid-argument', 'URL must be a non-empty string');
      }
      if (!isInstagramReelUrl(url)) {
        throw new HttpsError(
            'invalid-argument',
            'URL must be a valid Instagram Reel URL (e.g. https://www.instagram.com/reel/...)',
        );
      }

      // Validate language
      if (!['de', 'en'].includes(language)) {
        throw new HttpsError('invalid-argument', 'Language must be "de" or "en"');
      }

      // Rate limiting (shared with image scanning)
      const rateLimitResult = await checkRateLimit(userId, isAuthenticated, isAdmin);
      if (!rateLimitResult.allowed) {
        const limit = getRateLimit(isAdmin, isAuthenticated);
        throw new HttpsError(
            'resource-exhausted',
            `Tageslimit erreicht (${limit}/${limit} Scans). Versuche es morgen erneut.`,
        );
      }

      // Get API key from secret
      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        console.error('GEMINI_API_KEY secret not configured');
        throw new HttpsError(
            'failed-precondition',
            'AI service not configured. Please contact administrator.',
        );
      }

      const puppeteer = require('puppeteer');
      const chromium = require('@sparticuz/chromium');

      let browser = null;
      try {
        browser = await puppeteer.launch({
          args: chromium.args.concat([
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ]),
          defaultViewport: chromium.defaultViewport,
          executablePath: await chromium.executablePath(),
          headless: chromium.headless,
        });

        const page = await browser.newPage();
        await page.setViewport({width: 1280, height: 800});

        // Use a mobile user-agent as Instagram serves more content to mobile browsers
        await page.setUserAgent(
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) ' +
            'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        );
        await page.setExtraHTTPHeaders({
          'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
        });

        // Navigate to the Instagram Reel page
        try {
          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
        } catch (navError) {
          // Continue even if navigation times out – we may still have partial content
          console.warn(`Navigation warning for ${url}:`, navError.message);
        }

        // Short pause to let meta tags and initial content render
        await new Promise((r) => setTimeout(r, 2000));

        // Extract content from the page
        const extractedData = await page.evaluate(() => {
          const getMeta = (name) => {
            const el = document.querySelector(
                `meta[property="${name}"], meta[name="${name}"]`,
            );
            return el ? (el.getAttribute('content') || '') : '';
          };

          const title = getMeta('og:title') || document.title || '';
          const description = getMeta('og:description') || '';

          // Try to get visible text from the page body (caption + comments)
          const textParts = [];

          // Try article elements (Instagram uses <article> for posts)
          document.querySelectorAll('article').forEach((a) => {
            const text = (a.innerText || a.textContent || '').trim();
            if (text) textParts.push(text);
          });

          // Try the main content area as a fallback
          const main = document.querySelector('main');
          if (main && textParts.length === 0) {
            const text = (main.innerText || main.textContent || '').trim();
            if (text.length > 50) textParts.push(text);
          }

          const bodyText = textParts
              .join('\n\n')
              .replace(/[ \t]{2,}/g, ' ')
              .replace(/\n{3,}/g, '\n\n')
              .slice(0, 10000);

          return {title, description, bodyText};
        });

        await browser.close();
        browser = null;

        // Minimum character lengths for heuristic content quality checks
        const MIN_BODY_TEXT_LENGTH = 100;
        const MIN_COMBINED_TEXT_LENGTH = 30;

        // Build combined text from all available sources
        const parts = [];
        if (extractedData.title) parts.push(`Titel: ${extractedData.title}`);
        if (extractedData.description) {
          parts.push(`Caption:\n${extractedData.description}`);
        }
        if (extractedData.bodyText && extractedData.bodyText.length > MIN_BODY_TEXT_LENGTH) {
          parts.push(`Seiteninhalt:\n${extractedData.bodyText}`);
        }
        const combinedText = parts.join('\n\n');

        if (!combinedText.trim() || combinedText.length < MIN_COMBINED_TEXT_LENGTH) {
          throw new HttpsError(
              'not-found',
              'Kein Rezeptinhalt auf der Instagram-Seite gefunden. ' +
              'Das Reel ist möglicherweise privat oder enthält kein Rezept in der Bildunterschrift.',
          );
        }

        console.log(
            `Instagram Reel content extracted for user ${userId}, ` +
            `length: ${combinedText.length}`,
        );

        // Process the combined text with Gemini AI
        const result = await callGeminiTextAPI(
            combinedText, language, apiKey, cuisineTypes, mealCategories,
        );

        console.log(`Instagram Reel import successful for user ${userId}`);
        return {
          ...result,
          remainingScans: rateLimitResult.remaining,
          dailyLimit: rateLimitResult.limit,
          sourceUrl: url,
        };
      } catch (error) {
        if (browser) {
          try {
            await browser.close();
          } catch (closeErr) {
            console.error('Error closing browser after failure:', closeErr);
          }
        }

        if (error instanceof HttpsError) {
          throw error;
        }

        console.error(`Instagram Reel scrape failed for user ${userId}:`, error);

        if (error.message && error.message.includes('timeout')) {
          throw new HttpsError(
              'deadline-exceeded',
              'Die Instagram-Seite hat zu lange gebraucht. Bitte versuche es erneut.',
          );
        }

        throw new HttpsError(
            'internal',
            'Instagram-Import fehlgeschlagen: ' + error.message,
        );
      }
    },
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
      memory: '2GiB',
      timeoutSeconds: 120,
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

      // Rate limiting
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
      const chromium = require('@sparticuz/chromium');

      let browser;
      let hasFragment = false;
      let fragmentHash = '';
      try {
        browser = await puppeteer.launch({
          args: chromium.args.concat([
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ]),
          defaultViewport: chromium.defaultViewport,
          executablePath: await chromium.executablePath(),
          headless: chromium.headless,
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // Set a realistic browser User-Agent to avoid bot detection
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Set language header to avoid redirects on locale-sensitive sites
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'de-DE,de;q=0.9' });

        // Navigate to the URL – use 'domcontentloaded' instead of 'networkidle0'
        // because heavy sites (tracking, ads, lazy-loading) never reach networkidle0
        try {
          await page.goto(url, { 
            waitUntil: 'domcontentloaded',
            timeout: 20000 
          });
        } catch (navError) {
          // Continue even if navigation times out – page is likely usable
          console.warn(`Navigation warning for ${url}:`, navError.message);
        }

        // Wait a bit for dynamic content to render
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Dismiss cookie/DSGVO consent banner if present (supports multiple CMPs)
        const cookieSelectors = [
          'button[data-testid="uc-accept-all-button"]',           // Usercentrics
          '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', // Cookiebot
          '.borlabs-cookie-btn-accept-all',                         // Borlabs Cookie
          'button[id*="accept"][id*="cookie"]',                     // Generic
          'button[class*="accept-all"]',                            // Generic
          'a.cmplz-btn.cmplz-accept',                              // Complianz
        ];
        for (const selector of cookieSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 2000 });
            await page.click(selector);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            break;
          } catch (_) {
            // Selector not found – try next
          }
        }

        // If URL has a fragment (e.g. #recipe), scroll to that element
        try {
          const urlObj = new URL(url);
          if (urlObj.hash) {
            hasFragment = true;
            fragmentHash = urlObj.hash;
            const elementId = urlObj.hash.substring(1);
            const scrollSuccess = await page.evaluate((id) => {
              const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
              if (el) {
                el.scrollIntoView({ behavior: 'auto', block: 'start' });
                return true;
              }
              return false;
            }, elementId);

            if (!scrollSuccess) {
              console.warn(`Fragment element #${elementId} not found, falling back to full-page`);
              hasFragment = false;
            }

            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        } catch (_) {
          // Ignore scroll errors
        }

        // Wait for main content to be visible
        try {
          await page.waitForSelector('h1', { timeout: 3000 });
          // Short pause to allow dynamic content to finish loading
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (e) {
          // No h1 found – take screenshot anyway
        }

        // Take screenshot
        const screenshot = await page.screenshot({ 
          encoding: 'base64',
          fullPage: true,
          type: 'jpeg',
          quality: 80,
        });

        await browser.close();

        console.log(`Screenshot captured successfully for user ${userId}`);
        
        return {
          screenshot: `data:image/jpeg;base64,${screenshot}`,
          url: url,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        // Close browser on error to prevent memory leaks
        if (browser) { try { await browser.close(); } catch (_) { /* ignore */ } }

        console.error(`Screenshot capture failed for user ${userId}:`, error);
        
        if (error.message.includes('timeout')) {
          const errorMsg = hasFragment 
            ? `Website took too long to load. Fragment: ${fragmentHash}`
            : 'Website took too long to load';
          throw new HttpsError('deadline-exceeded', errorMsg);
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

/**
 * Recursively resolves an ingredient string that may contain a #recipe:... link.
 * Returns an array of plain ingredient strings (no recipe links).
 * @param {object} db - Firestore instance
 * @param {string} ingText - Ingredient text, possibly a recipe link
 * @param {Set} visited - Set of already-visited recipe IDs (prevents infinite recursion)
 * @return {Promise<string[]>}
 */
const resolveIngredientText = async (db, ingText, visited) => {
  const match = ingText.match(/^[^#]*#recipe:([^:]+):/);
  if (!match) return [ingText];
  const recipeId = match[1];
  if (visited.has(recipeId)) return [];
  visited.add(recipeId);
  const doc = await db.collection('recipes').doc(recipeId).get();
  if (!doc.exists) return [];
  const linkedData = doc.data();
  const result = [];
  for (const ing of (linkedData.ingredients || [])) {
    const text = typeof ing === 'string' ? ing : ing.text;
    if (ing && typeof ing === 'object' && ing.type === 'heading') continue;
    const resolved = await resolveIngredientText(db, text, visited);
    result.push(...resolved);
  }
  return result;
};

/**
 * Resolves a raw ingredients array (strings and objects) into a flat array of
 * plain ingredient strings, expanding any #recipe:... links recursively.
 * @param {object} db - Firestore instance
 * @param {Array} rawIngredients
 * @return {Promise<string[]>}
 */
const resolveIngredients = async (db, rawIngredients) => {
  const result = [];
  for (const ing of rawIngredients) {
    if (typeof ing === 'object' && ing !== null && ing.type === 'heading') continue;
    const text = typeof ing === 'string' ? ing : ing.text;
    const resolved = await resolveIngredientText(db, text, new Set());
    result.push(...resolved);
  }
  return result;
};

/**
 * Helper to build and send the Bring!-compatible HTML response.
 * @param {object} res - Express response object
 * @param {string} title
 * @param {string[]} recipeIngredients
 */
const sendBringHtml = (res, title, recipeIngredients) => {
  const escape = (s) => String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    'name': title,
    'recipeIngredient': recipeIngredients,
  });

  const escapedTitle = escape(title);
  const liItems = recipeIngredients.map((i) => `<li>${escape(i)}</li>`).join('');

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapedTitle}</title>
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
<h1>${escapedTitle}</h1>
<ul>${liItems}</ul>
</body>
</html>`;

  res.set('Cache-Control', 'public, max-age=300');
  res.status(200).send(html);
};

/**
 * HTTP function to serve Schema.org Recipe HTML for Bring! deeplink integration.
 * Accepts ?shareId=<id> and returns an HTML page with structured Recipe JSON-LD
 * so the Bring! shopping list app can parse the ingredients.
 *
 * POST with { shareId, items }: saves items to Firestore and returns { exportId }.
 * GET with ?shareId=<id>&exportId=<id>: loads items from Firestore and renders HTML.
 * GET with ?shareId=<id> only: falls back to loading all ingredients from the recipe.
 */
const BRING_EXPORT_TTL_MS = 10 * 60 * 1000; // 10 minutes

exports.bringRecipeExport = onRequest(
    {cors: true, region: 'us-central1'},
    async (req, res) => {
      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
      }

      // Handle POST: save pre-resolved items to Firestore, return exportId.
      if (req.method === 'POST') {
        // req.body may be empty when proxied through Firebase Hosting rewrite –
        // fall back to parsing req.rawBody (Buffer) if necessary.
        let parsedBody = req.body;
        if (!parsedBody || (typeof parsedBody === 'object' && Object.keys(parsedBody).length === 0)) {
          try {
            const raw = req.rawBody;
            if (raw) {
              parsedBody = JSON.parse(raw.toString('utf8'));
            }
          } catch (e) {
            console.error('Failed to parse rawBody:', e);
          }
        }
        const {shareId, items} = parsedBody || {};
        if (!shareId || !Array.isArray(items)) {
          res.status(400).send('Missing shareId or items');
          return;
        }
        try {
          const db = admin.firestore();
          const exportRef = db.collection('bringExports').doc();
          await exportRef.set({
            shareId,
            items,
            expiresAt: Date.now() + BRING_EXPORT_TTL_MS,
          });
          res.status(200).json({exportId: exportRef.id});
        } catch (error) {
          console.error('bringRecipeExport POST error:', error);
          res.status(500).send('Internal server error');
        }
        return;
      }

      const shareId = req.query.shareId;
      if (!shareId) {
        res.status(400).send('Missing shareId parameter');
        return;
      }

      // If exportId is provided, load pre-resolved items from Firestore.
      if (req.query.exportId) {
        try {
          const db = admin.firestore();
          const exportDoc = await db.collection('bringExports')
              .doc(req.query.exportId).get();
          if (!exportDoc.exists) {
            res.status(404).send('Export not found or expired');
            return;
          }
          const exportData = exportDoc.data();
          if (exportData.expiresAt < Date.now()) {
            res.status(410).send('Export expired');
            return;
          }
          if (exportData.shareId !== shareId) {
            res.status(403).send('Forbidden');
            return;
          }
          let title = 'Rezept';
          const recipeSnap = await db.collection('recipes')
              .where('shareId', '==', shareId).limit(1).get();
          if (!recipeSnap.empty) {
            title = recipeSnap.docs[0].data().title || title;
          } else {
            const menuSnap = await db.collection('menus')
                .where('shareId', '==', shareId).limit(1).get();
            if (!menuSnap.empty) {
              title = menuSnap.docs[0].data().name || title;
            }
          }
          sendBringHtml(res, title, exportData.items.map(String));
        } catch (error) {
          console.error('bringRecipeExport error (exportId path):', error);
          res.status(500).send('Internal server error');
        }
        return;
      }

      try {
        const db = admin.firestore();
        const recipesRef = db.collection('recipes');
        const snapshot = await recipesRef
            .where('shareId', '==', shareId)
            .limit(1)
            .get();

        if (snapshot.empty) {
          // No recipe found – try the menus collection
          const menusRef = db.collection('menus');
          const menuSnapshot = await menusRef
              .where('shareId', '==', shareId)
              .limit(1)
              .get();

          if (menuSnapshot.empty) {
            res.status(404).send('Recipe not found');
            return;
          }

          const menu = menuSnapshot.docs[0].data();
          const title = menu.name || 'Menü';

          // Collect all unique recipe IDs from sections (new) or recipeIds (legacy)
          let recipeIds = [];
          if (menu.sections && Array.isArray(menu.sections)) {
            const idSet = new Set();
            for (const section of menu.sections) {
              if (Array.isArray(section.recipeIds)) {
                for (const id of section.recipeIds) {
                  idSet.add(id);
                }
              }
            }
            recipeIds = Array.from(idSet);
          } else if (Array.isArray(menu.recipeIds)) {
            recipeIds = [...new Set(menu.recipeIds)];
          }

          // Load all referenced recipes, resolve recipe links, and combine ingredients
          const recipeIngredients = [];
          for (const recipeId of recipeIds) {
            const recipeDoc = await db.collection('recipes').doc(recipeId).get();
            if (!recipeDoc.exists) continue;
            const recipeData = recipeDoc.data();
            const resolved = await resolveIngredients(db, recipeData.ingredients || []);
            recipeIngredients.push(...resolved);
          }

          sendBringHtml(res, title, recipeIngredients);
          return;
        }

        const recipe = snapshot.docs[0].data();
        const title = recipe.title || 'Rezept';
        const recipeIngredients = await resolveIngredients(db, recipe.ingredients || []);

        sendBringHtml(res, title, recipeIngredients);
      } catch (error) {
        console.error('bringRecipeExport error:', error);
        res.status(500).send('Internal server error');
      }
    },
);

/**
 * Escape HTML special characters to prevent XSS in email HTML body.
 * @param {string} str - Raw string to escape
 * @return {string} HTML-escaped string
 */
function escapeHtml(str) {
  return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}

/**
 * Firestore trigger: send email notification to all admins when a new user registers.
 * Triggered when a new document is created in the 'users' collection.
 * Requires the following Firebase secrets to be set:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
 */
exports.notifyAdminsOnUserRegistration = onDocumentCreated(
    {
      document: 'users/{userId}',
      secrets: [smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom],
    },
    async (event) => {
      const newUser = event.data ? event.data.data() : null;
      if (!newUser) {
        console.error('notifyAdminsOnUserRegistration: no user data in event');
        return;
      }

      // Skip notifications for the very first user (the initial admin)
      if (newUser.isAdmin) {
        console.log('notifyAdminsOnUserRegistration: first user is admin, skipping self-notification');
        return;
      }

      const smtpHostVal = smtpHost.value();
      const smtpPortVal = smtpPort.value();
      const smtpUserVal = smtpUser.value();
      const smtpPasswordVal = smtpPassword.value();
      const smtpFromVal = smtpFrom.value();

      if (!smtpHostVal || !smtpUserVal || !smtpPasswordVal || !smtpFromVal) {
        console.warn('notifyAdminsOnUserRegistration: SMTP secrets not fully configured – skipping email');
        return;
      }

      // Fetch all admin users from Firestore
      const db = admin.firestore();
      const usersSnapshot = await db.collection('users').where('isAdmin', '==', true).get();

      if (usersSnapshot.empty) {
        console.log('notifyAdminsOnUserRegistration: no admin users found');
        return;
      }

      const adminEmails = [];
      usersSnapshot.forEach((doc) => {
        const adminData = doc.data();
        if (adminData.email) {
          adminEmails.push(adminData.email);
        }
      });

      if (adminEmails.length === 0) {
        console.log('notifyAdminsOnUserRegistration: no admin email addresses found');
        return;
      }

      // The transporter is created per invocation because Firebase secrets
      // are only accessible during function execution, not at module load time.
      const transporter = nodemailer.createTransport({
        host: smtpHostVal,
        port: parseInt(smtpPortVal || '587', 10),
        secure: parseInt(smtpPortVal || '587', 10) === 465,
        auth: {
          user: smtpUserVal,
          pass: smtpPasswordVal,
        },
      });

      const registeredAt = newUser.createdAt ?
        new Date(newUser.createdAt).toLocaleString('de-DE', {timeZone: 'Europe/Berlin'}) :
        new Date().toLocaleString('de-DE', {timeZone: 'Europe/Berlin'});

      const fullName = `${newUser.vorname || ''} ${newUser.nachname || ''}`.trim();
      const safeFullName = escapeHtml(fullName);
      const safeEmail = escapeHtml(newUser.email || '–');
      const safeRegisteredAt = escapeHtml(registeredAt);

      const mailOptions = {
        from: smtpFromVal,
        // Use BCC to avoid exposing admin email addresses to each other
        bcc: adminEmails.join(', '),
        subject: 'Neue Benutzerregistrierung im Rezeptbuch',
        text:
          `Ein neuer Benutzer hat sich registriert:\n\n` +
          `Name:          ${fullName}\n` +
          `E-Mail:        ${newUser.email || '–'}\n` +
          `Registriert:   ${registeredAt}\n\n` +
          `Bitte melden Sie sich an, um den neuen Benutzer zu verwalten.`,
        html:
          `<p>Ein neuer Benutzer hat sich registriert:</p>` +
          `<table style="border-collapse:collapse">` +
          `<tr><td style="padding:4px 12px 4px 0"><strong>Name</strong></td>` +
          `<td>${safeFullName}</td></tr>` +
          `<tr><td style="padding:4px 12px 4px 0"><strong>E-Mail</strong></td>` +
          `<td>${safeEmail}</td></tr>` +
          `<tr><td style="padding:4px 12px 4px 0"><strong>Registriert</strong></td>` +
          `<td>${safeRegisteredAt}</td></tr>` +
          `</table>` +
          `<p>Bitte melden Sie sich an, um den neuen Benutzer zu verwalten.</p>`,
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`notifyAdminsOnUserRegistration: email sent to ${adminEmails.length} admin(s)`);
      } catch (error) {
        console.error('notifyAdminsOnUserRegistration: error sending email:', error);
      }
    },
);

/**
 * Cloud Function: Set a user's password (admin only)
 * Allows an admin to set a temporary password for another user via Firebase Admin SDK.
 *
 * Input data:
 * - targetUserId: The UID of the user whose password should be changed
 * - newPassword: The new password to set (min 6 characters)
 *
 * Returns: { success: true }
 */
exports.setUserPassword = onCall(
    {
      maxInstances: 10,
    },
    async (request) => {
      // Authentication check
      const auth = request.auth;
      if (!auth) {
        throw new HttpsError(
            'unauthenticated',
            'Sie müssen angemeldet sein, um diese Aktion durchzuführen.'
        );
      }

      const {targetUserId, newPassword} = request.data;

      // Input validation
      if (!targetUserId || typeof targetUserId !== 'string') {
        throw new HttpsError('invalid-argument', 'Ungültige Benutzer-ID.');
      }
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 12) {
        throw new HttpsError(
            'invalid-argument',
            'Das Passwort muss mindestens 12 Zeichen lang sein.'
        );
      }
      if (!/[0-9]/.test(newPassword) && !/[^a-zA-Z0-9]/.test(newPassword)) {
        throw new HttpsError(
            'invalid-argument',
            'Das Passwort muss mindestens eine Zahl oder ein Sonderzeichen enthalten.'
        );
      }
      if (COMMON_PASSWORDS.includes(newPassword.toLowerCase())) {
        throw new HttpsError(
            'invalid-argument',
            'Dieses Passwort ist zu häufig verwendet. Bitte wählen Sie ein sichereres Passwort.'
        );
      }

      // Verify that the calling user is an admin by checking Firestore
      const db = admin.firestore();
      const callerDoc = await db.collection('users').doc(auth.uid).get();
      if (!callerDoc.exists || !callerDoc.data().isAdmin) {
        throw new HttpsError(
            'permission-denied',
            'Nur Administratoren können Passwörter zurücksetzen.'
        );
      }

      try {
        // Update the target user's password via Firebase Admin SDK
        await admin.auth().updateUser(targetUserId, {password: newPassword});

        // Set requiresPasswordChange flag in Firestore (use set with merge to handle missing docs)
        await db.collection('users').doc(targetUserId).set(
            {requiresPasswordChange: true},
            {merge: true},
        );
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error setting password for user ${targetUserId}:`, err);
        if (err.code === 'auth/user-not-found') {
          throw new HttpsError(
              'not-found',
              'Benutzer nicht gefunden.',
          );
        }
        if (err.code === 'auth/invalid-password') {
          throw new HttpsError(
              'invalid-argument',
              'Das Passwort entspricht nicht den Anforderungen.',
          );
        }
        throw new HttpsError(
            'internal',
            'Fehler beim Setzen des Passworts. Bitte versuchen Sie es erneut.',
        );
      }

      console.log(`[${new Date().toISOString()}] Admin ${auth.uid} successfully set temporary password for user ${targetUserId}`);
      return {success: true};
    },
);

/**
 * Validate and normalise recipe data submitted via the API.
 * Accepts both English (Apple Shortcut / AI output) and German field names.
 *
 * Required: title (or titel)
 * Required: at least one entry in ingredients (or zutaten)
 * Required: at least one entry in steps (or zubereitung)
 *
 * @param {object} body - Raw request body
 * @returns {object} Normalised recipe object ready for Firestore
 * @throws {Error} when required fields are missing or invalid
 */
function validateAndNormaliseRecipeInput(body) {
  if (!body || typeof body !== 'object') {
    throw Object.assign(new Error('Request body must be a JSON object'), {code: 400});
  }

  // --- title ---
  const title = (body.title || body.titel || '').toString().trim();
  if (!title) {
    throw Object.assign(new Error('Rezepttitel (title) fehlt'), {code: 400});
  }

  // --- ingredients ---
  const rawIngredients = body.ingredients || body.zutaten;
  if (!Array.isArray(rawIngredients) || rawIngredients.length === 0) {
    throw Object.assign(
        new Error('ingredients (Zutaten) muss ein nicht-leeres Array sein'),
        {code: 400},
    );
  }
  const ingredients = rawIngredients
      .map((i) => (typeof i === 'string' ? i.trim() : String(i || '').trim()))
      .filter(Boolean);
  if (ingredients.length === 0) {
    throw Object.assign(
        new Error('ingredients (Zutaten) enthält keine gültigen Einträge'),
        {code: 400},
    );
  }

  // --- steps ---
  const rawSteps = body.steps || body.zubereitung;
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    throw Object.assign(
        new Error('steps (Zubereitung) muss ein nicht-leeres Array sein'),
        {code: 400},
    );
  }
  const steps = rawSteps
      .map((s) => (typeof s === 'string' ? s.trim() : String(s || '').trim()))
      .filter(Boolean);
  if (steps.length === 0) {
    throw Object.assign(
        new Error('steps (Zubereitung) enthält keine gültigen Einträge'),
        {code: 400},
    );
  }

  // --- optional fields ---
  const portionen = parseInt(body.portionen ?? body.servings ?? body.portions ?? 0, 10) || undefined;
  const kochdauer = parseInt(body.kochdauer ?? body.cookTime ?? body.prepTime ?? body.zubereitungszeit ?? 0, 10) || undefined;
  const rawSchwierigkeit = parseInt(body.schwierigkeit ?? body.difficulty ?? 0, 10);
  if (rawSchwierigkeit !== 0 && (rawSchwierigkeit < 1 || rawSchwierigkeit > 5)) {
    throw Object.assign(
        new Error('schwierigkeit (difficulty) muss zwischen 1 und 5 liegen'),
        {code: 400},
    );
  }
  const schwierigkeit = rawSchwierigkeit || undefined;
  const speisekategorie = (body.speisekategorie || body.category || body.kategorie || '').toString().trim() || undefined;

  // kulinarik: accept string or array
  let kulinarik;
  const rawKulinarik = body.kulinarik || body.cuisine || body.kulinarisch;
  if (Array.isArray(rawKulinarik)) {
    kulinarik = rawKulinarik.map(String).filter(Boolean);
  } else if (rawKulinarik) {
    kulinarik = [String(rawKulinarik).trim()].filter(Boolean);
  }

  // tags: accept string (comma-separated) or array
  let tags;
  const rawTags = body.tags;
  if (Array.isArray(rawTags)) {
    tags = rawTags.map(String).filter(Boolean);
  } else if (rawTags) {
    tags = String(rawTags).split(',').map((t) => t.trim()).filter(Boolean);
  }

  const notizen = (body.notizen || body.notes || '').toString().trim() || undefined;

  const recipe = {title, ingredients, steps};
  if (portionen !== undefined) recipe.portionen = portionen;
  if (kochdauer !== undefined) recipe.kochdauer = kochdauer;
  if (schwierigkeit !== undefined) recipe.schwierigkeit = schwierigkeit;
  if (speisekategorie !== undefined) recipe.speisekategorie = speisekategorie;
  if (kulinarik !== undefined && kulinarik.length > 0) recipe.kulinarik = kulinarik;
  if (tags !== undefined && tags.length > 0) recipe.tags = tags;
  if (notizen !== undefined) recipe.notizen = notizen;

  return recipe;
}

/**
 * Cloud Function: Add a recipe via HTTP API (for Apple Shortcuts and external integrations)
 *
 * POST /addRecipeViaAPI
 *
 * Headers:
 *   X-Api-Key: <API Key stored as SHORTCUT_API_KEY secret>
 *   X-User-Id: <Firebase User ID>
 *   Content-Type: application/json
 *
 * Body (JSON) – supports both German and English field names:
 *   title / titel           {string}   Required – recipe title
 *   ingredients / zutaten   {string[]} Required – list of ingredients
 *   steps / zubereitung     {string[]} Required – list of preparation steps
 *   portionen / servings    {number}   Optional – number of servings
 *   kochdauer / cookTime    {number}   Optional – cooking time in minutes
 *   schwierigkeit/difficulty{number}   Optional – difficulty 1–5
 *   speisekategorie/category{string}   Optional – meal category
 *   kulinarik / cuisine     {string|string[]} Optional – cuisine type(s)
 *   tags                    {string[]} Optional – tags
 *   notizen / notes         {string}   Optional – additional notes
 *
 * Returns:
 *   200 { success: true, recipeId: string }
 *   400 { success: false, error: string }
 *   401 { success: false, error: string, requiredHeaders?: string[] }
 *   403 { success: false, error: string }
 *   405 { success: false, error: string }
 *   500 { success: false, error: string }
 */
exports.addRecipeViaAPI = onRequest(
    {maxInstances: 10, secrets: [shortcutApiKey]},
    async (req, res) => {
      const origin = req.headers.origin;
      if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key, X-User-Id');
        if (req.method === 'OPTIONS') {
          res.status(204).send('');
          return;
        }
      } else if (req.method === 'OPTIONS') {
        res.status(403).send('');
        return;
      }

      if (req.method !== 'POST') {
        res.status(405).json({success: false, error: 'Method not allowed. Use POST.'});
        return;
      }

      // --- Authentication via API Key ---
      const apiKey = req.headers['x-api-key'];
      const userId = req.headers['x-user-id'];

      if (!apiKey || !userId) {
        res.status(401).json({
          success: false,
          error: 'Missing authentication headers',
          requiredHeaders: ['X-Api-Key', 'X-User-Id'],
        });
        return;
      }

      const validApiKey = shortcutApiKey.value();
      if (!validApiKey) {
        console.error('addRecipeViaAPI: SHORTCUT_API_KEY secret is not set');
        res.status(500).json({success: false, error: 'Server misconfiguration: SHORTCUT_API_KEY secret is not set'});
        return;
      }

      let isValidKey = false;
      try {
        isValidKey = crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(validApiKey));
      } catch (_) {
        isValidKey = false;
      }
      if (!isValidKey) {
        console.warn('addRecipeViaAPI: invalid API key attempt');
        res.status(401).json({success: false, error: 'Invalid API key'});
        return;
      }

      // --- Validate user exists in Firestore and has required role ---
      const db = admin.firestore();
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
          res.status(403).json({success: false, error: 'Access denied'});
          return;
        }
        const role = userDoc.data()?.role;
        if (role !== 'edit' && role !== 'admin') {
          res.status(403).json({success: false, error: 'Insufficient permissions'});
          return;
        }
      } catch (err) {
        console.error('addRecipeViaAPI: error validating user:', err);
        res.status(500).json({success: false, error: 'Failed to validate user'});
        return;
      }

      // --- Parse body ---
      let body = req.body;
      if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
        try {
          const raw = req.rawBody;
          if (raw) body = JSON.parse(raw.toString('utf8'));
        } catch (e) {
          res.status(400).json({success: false, error: 'Ungültiges JSON im Request-Body'});
          return;
        }
      }

      // --- Validate & normalise ---
      let recipeData;
      try {
        recipeData = validateAndNormaliseRecipeInput(body);
      } catch (err) {
        res.status(err.code || 400).json({success: false, error: err.message});
        return;
      }

      // --- Save to Firestore ---
      try {
        const now = admin.firestore.FieldValue.serverTimestamp();
        const docData = {
          ...recipeData,
          authorId: userId,
          createdAt: now,
          updatedAt: now,
          isPrivate: false,
        };

        const docRef = await db.collection('recipes').add(docData);

        // Increment recipe_count for the author (best-effort)
        try {
          await db.collection('users').doc(userId).update({
            recipe_count: admin.firestore.FieldValue.increment(1),
          });
        } catch (countErr) {
          console.error('addRecipeViaAPI: error incrementing recipe_count:', countErr);
        }

        console.log(`addRecipeViaAPI: recipe "${recipeData.title}" created by user ${userId} (id: ${docRef.id})`);
        res.status(200).json({success: true, recipeId: docRef.id});
      } catch (err) {
        console.error('addRecipeViaAPI: Firestore error:', err);
        res.status(500).json({success: false, error: 'Fehler beim Speichern des Rezepts'});
      }
    },
);

// TTL for recipe text imports (default: 10 minutes)
const RECIPE_IMPORT_TTL_MS = 10 * 60 * 1000;

/**
 * Cloud Function: Create a temporary recipe import from raw text.
 *
 * POST /createRecipeImportFromText
 *
 * Headers:
 *   X-Api-Key: <API Key stored as SHORTCUT_API_KEY secret>
 *   X-User-Id: <Firebase User ID>
 *   Content-Type: application/json
 *
 * Body (JSON):
 *   rawText {string} Required – unstructured recipe text
 *
 * Returns:
 *   200 { success: true, importUrl: string }
 *   400 { success: false, error: string }
 *   401 { success: false, error: string }
 *   403 { success: false, error: string }
 *   404 { success: false, error: string }
 *   405 { success: false, error: string }
 *   500 { success: false, error: string }
 */
exports.createRecipeImportFromText = onRequest(
    {maxInstances: 10, secrets: [shortcutApiKey]},
    async (req, res) => {
      const origin = req.headers.origin;
      if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key, X-User-Id');
        if (req.method === 'OPTIONS') {
          res.status(204).send('');
          return;
        }
      } else if (req.method === 'OPTIONS') {
        res.status(403).send('');
        return;
      }

      if (req.method !== 'POST') {
        res.status(405).json({success: false, error: 'Method not allowed. Use POST.'});
        return;
      }

      // --- Authentication via API Key ---
      const apiKey = req.headers['x-api-key'];
      const userId = req.headers['x-user-id'];

      if (!apiKey || !userId) {
        res.status(401).json({
          success: false,
          error: 'Missing authentication headers',
          required: ['X-Api-Key', 'X-User-Id'],
        });
        return;
      }

      const validApiKey = process.env.SHORTCUT_API_KEY;
      let isValidKey = false;
      if (validApiKey) {
        try {
          isValidKey = crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(validApiKey));
        } catch (_) {
          isValidKey = false;
        }
      }
      if (!isValidKey) {
        console.warn('createRecipeImportFromText: invalid API key attempt');
        res.status(401).json({success: false, error: 'Invalid API key'});
        return;
      }

      // --- Validate user exists and has required role ---
      const db = admin.firestore();
      let userData;
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
          res.status(404).json({success: false, error: 'User not found'});
          return;
        }
        userData = userDoc.data();
      } catch (err) {
        console.error('createRecipeImportFromText: error validating user:', err);
        res.status(500).json({success: false, error: 'Failed to validate user'});
        return;
      }

      const userRole = userData.role || '';
      const isShortcutUser = userData.isShortcutUser === true;
      if (userRole !== 'edit' && userRole !== 'admin' && !userData.isAdmin && !isShortcutUser) {
        res.status(403).json({
          success: false,
          error: 'Insufficient permissions.',
        });
        return;
      }

      // --- Parse body ---
      let body = req.body;
      if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
        try {
          const raw = req.rawBody;
          if (raw) body = JSON.parse(raw.toString('utf8'));
        } catch (e) {
          res.status(400).json({success: false, error: 'Ungültiges JSON im Request-Body'});
          return;
        }
      }

      const rawText = (body && typeof body.rawText === 'string') ? body.rawText.trim() : '';
      if (!rawText) {
        res.status(400).json({success: false, error: 'rawText darf nicht leer sein'});
        return;
      }

      // --- Save to Firestore imports collection with TTL ---
      try {
        const importRef = db.collection('imports').doc();
        const expiresAt = Date.now() + RECIPE_IMPORT_TTL_MS;
        await importRef.set({
          rawText,
          userId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt,
        });

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const importUrl = `${baseUrl}/recipeImportPage?token=${importRef.id}`;

        console.log(`createRecipeImportFromText: import ${importRef.id} created by user ${userId}`);
        res.status(200).json({success: true, importUrl});
      } catch (err) {
        console.error('createRecipeImportFromText: Firestore error:', err);
        res.status(500).json({success: false, error: 'Fehler beim Speichern des Imports'});
      }
    },
);

/**
 * Cloud Function: Render a temporary recipe import as structured HTML.
 *
 * GET /recipeImportPage?token=<importId>
 *
 * No authentication required – the random token acts as a capability URL.
 * Returns HTML with the raw text and JSON-LD structured data.
 * Returns 404 if not found, 410 if expired.
 */
exports.recipeImportPage = onRequest(
    {maxInstances: 10, cors: true},
    async (req, res) => {
      if (req.method !== 'GET') {
        res.status(405).send('Method not allowed. Use GET.');
        return;
      }

      const token = req.query.token;
      if (!token) {
        res.status(400).send('Missing token parameter');
        return;
      }

      const db = admin.firestore();
      let importData;
      try {
        const importDoc = await db.collection('imports').doc(token).get();
        if (!importDoc.exists) {
          res.status(404).send('Import not found');
          return;
        }
        importData = importDoc.data();
      } catch (err) {
        console.error('recipeImportPage: Firestore error:', err);
        res.status(500).send('Internal server error');
        return;
      }

      if (importData.expiresAt < Date.now()) {
        res.status(410).send('Import expired');
        return;
      }

      const rawText = importData.rawText || '';

      // Derive a title from the first non-empty line of the raw text
      const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
      const title = lines[0] || 'Rezept-Import';

      const escape = (s) => String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

      const jsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Recipe',
        'name': title,
        'description': rawText,
      });

      const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
<h1>${escape(title)}</h1>
<pre>${escape(rawText)}</pre>
</body>
</html>`;

      res.set('Cache-Control', 'no-store');
      res.status(200).send(html);
    },
);

/**
 * Atomically create a user profile in Firestore after Firebase Auth registration.
 *
 * The caller must already be authenticated (Firebase Auth) as the new user.
 * The function uses a Firestore transaction to detect whether this is the very
 * first user and grants admin rights only in that case, eliminating the
 * client-side race condition.
 *
 * Expected request.data: { vorname, nachname, email }
 */
exports.createUserProfile = onCall(
    {
      maxInstances: 10,
    },
    async (request) => {
      // Must be called by an authenticated user
      if (!request.auth) {
        throw new HttpsError(
            'unauthenticated',
            'Sie müssen angemeldet sein, um diese Aktion durchzuführen.',
        );
      }

      const {vorname, nachname, email} = request.data || {};
      const uid = request.auth.uid;

      // IP-based registration rate limiting
      const rawIp = (
        request.rawRequest.headers['x-forwarded-for'] ||
        request.rawRequest.ip ||
        'unknown'
      );
      const clientIp = rawIp.split(',')[0].trim();
      const rateLimitResult = await checkRegistrationRateLimit(clientIp);
      if (!rateLimitResult.allowed) {
        throw new HttpsError(
            'resource-exhausted',
            'Zu viele Registrierungsversuche. Bitte versuchen Sie es später erneut.',
        );
      }

      // Basic input validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (
        !vorname || typeof vorname !== 'string' || vorname.trim().length === 0 ||
        !nachname || typeof nachname !== 'string' || nachname.trim().length === 0 ||
        !email || typeof email !== 'string' || !emailRegex.test(email)
      ) {
        throw new HttpsError(
            'invalid-argument',
            'Ungültige Benutzerdaten. Vor- und Nachname sowie E-Mail sind erforderlich.',
        );
      }

      const db = admin.firestore();
      const userRef = db.collection('users').doc(uid);
      // Sentinel document used to atomically mark that the first user has been
      // registered. Stored in 'settings' because the Admin SDK bypasses rules.
      const sentinelRef = db.collection('settings').doc('_adminBootstrap');

      try {
        // Non-transactional pre-check: protects against migration edge case where
        // users already exist but the sentinel has not been set yet.
        const existingUsersSnap = await db.collection('users').limit(1).get();
        const usersAlreadyExist = !existingUsersSnap.empty;

        const isFirstUser = await db.runTransaction(async (transaction) => {
          // Check whether the profile already exists (idempotency)
          const existingDoc = await transaction.get(userRef);
          if (existingDoc.exists) {
            return null; // Signal: document already present, skip creation
          }

          // Read sentinel document to detect the first-user case atomically.
          // Firestore transactions guarantee that if two concurrent transactions
          // both attempt to write the sentinel, only one commits; the other
          // retries and sees the sentinel already set.
          const sentinelDoc = await transaction.get(sentinelRef);

          // A user is the "first" only if no users existed before AND no
          // sentinel has been written yet.
          const first = !usersAlreadyExist && !sentinelDoc.exists;

          const userProfile = {
            vorname: vorname.trim(),
            nachname: nachname.trim(),
            email: email.toLowerCase().trim(),
            isAdmin: first,
            role: first ? 'admin' : 'read',
            fotoscan: false,
            createdAt: new Date().toISOString(),
          };

          transaction.set(userRef, userProfile);
          if (first) {
            // Mark that the first admin has been registered
            transaction.set(sentinelRef, {createdAt: new Date().toISOString()});
          }
          // Return the profile so the caller can use it without an extra read
          return {first, userProfile};
        });

        if (isFirstUser === null) {
          // Profile already existed – return it without modification
          const existingDoc = await userRef.get();
          return {success: true, user: {id: uid, ...existingDoc.data()}};
        }

        console.log(
            `[${new Date().toISOString()}] createUserProfile: created profile for ${uid}` +
            ` (isFirstUser=${isFirstUser.first})`,
        );
        return {success: true, user: {id: uid, ...isFirstUser.userProfile}};
      } catch (err) {
        console.error(
            `[${new Date().toISOString()}] createUserProfile error for uid ${uid}:`,
            err,
        );
        throw new HttpsError(
            'internal',
            'Fehler beim Erstellen des Benutzerprofils. Bitte versuchen Sie es erneut.',
        );
      }
    },
);

