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
 * Get the recipe extraction prompt in the specified language
 * @param {string} lang - Language code ('de' or 'en')
 * @returns {string} The formatted prompt
 */
function getRecipeExtractionPrompt(lang = 'de') {
  if (lang === 'de') {
    return `Analysiere dieses Rezeptbild und extrahiere alle Informationen als strukturiertes JSON.

Bitte gib das Ergebnis im folgenden JSON-Format zurück:
{
  "titel": "Name des Rezepts",
  "portionen": Anzahl der Portionen als Zahl,
  "zubereitungszeit": "Zeit in Minuten als Zahl oder Text wie '30 min' oder '1 Stunde'",
  "kochzeit": "Kochzeit in Minuten (optional)",
  "schwierigkeit": Schwierigkeitsgrad 1-5 (1=sehr einfach, 5=sehr schwer),
  "kulinarik": "Kulinarische Herkunft (z.B. Italienisch, Asiatisch, Deutsch)",
  "kategorie": "Kategorie (z.B. Hauptgericht, Dessert, Vorspeise, Beilage, Snack)",
  "tags": ["vegetarisch", "vegan", "glutenfrei", etc. - falls zutreffend],
  "zutaten": [
    "Erste Zutat mit Menge",
    "Zweite Zutat mit Menge",
    ...
  ],
  "zubereitung": [
    "Erster Zubereitungsschritt",
    "Zweiter Zubereitungsschritt",
    ...
  ],
  "notizen": "Zusätzliche Hinweise oder Tipps (optional)"
}

Wichtig:
- Extrahiere alle sichtbaren Informationen genau
- Wenn Informationen fehlen, lasse die Felder leer oder null
- Gib NUR das JSON zurück, keine zusätzlichen Erklärungen
- Zahlen ohne Anführungszeichen (außer bei Zeitangaben mit Text)`;
  } else {
    return `Analyze this recipe image and extract all information as structured JSON.

Please return the result in the following JSON format:
{
  "title": "Recipe name",
  "servings": Number of servings as a number,
  "prepTime": "Preparation time in minutes as number or text like '30 min' or '1 hour'",
  "cookTime": "Cooking time in minutes (optional)",
  "difficulty": Difficulty level 1-5 (1=very easy, 5=very hard),
  "cuisine": "Cuisine type (e.g., Italian, Asian, American)",
  "category": "Category (e.g., Main Course, Dessert, Appetizer, Side Dish, Snack)",
  "tags": ["vegetarian", "vegan", "gluten-free", etc. - if applicable],
  "ingredients": [
    "First ingredient with quantity",
    "Second ingredient with quantity",
    ...
  ],
  "steps": [
    "First preparation step",
    "Second preparation step",
    ...
  ],
  "notes": "Additional notes or tips (optional)"
}

Important:
- Extract all visible information accurately
- If information is missing, leave fields empty or null
- Return ONLY the JSON, no additional explanations
- Numbers without quotes (except for time strings with text)`;
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
 * @returns {Promise<boolean>} True if under limit, false if exceeded
 */
async function checkRateLimit(userId, isAuthenticated, isAdmin = false) {
  const db = admin.firestore();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
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
        return true;
      }

      const data = doc.data();
      if (data.count >= limit) {
        return false; // Limit exceeded
      }

      // Increment counter
      transaction.update(docRef, {
        count: admin.firestore.FieldValue.increment(1),
      });
      return true;
    });

    return result;
  } catch (error) {
    console.error('Rate limit check error:', error);
    // On error, allow the request (fail open)
    return true;
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
 * @returns {Promise<Object>} Structured recipe data
 */
async function callGeminiAPI(base64Data, mimeType, lang, apiKey) {
  const prompt = getRecipeExtractionPrompt(lang);

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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

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
      throw new HttpsError(
          'internal',
          `Gemini API error: ${errorData.error?.message || response.statusText}`
      );
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

    // Enhance error messages
    if (error.message.includes('quota')) {
      throw new HttpsError('resource-exhausted', 'API quota exceeded. Please try again later.');
    } else if (error.message.includes('JSON')) {
      throw new HttpsError(
          'internal',
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
      const {imageBase64, language = 'de'} = request.data;

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
      const withinLimit = await checkRateLimit(userId, isAuthenticated, isAdmin);
      if (!withinLimit) {
        const limit = getRateLimit(isAdmin, isAuthenticated);
        throw new HttpsError(
            'resource-exhausted',
            `Rate limit exceeded: maximum ${limit} scans per day`
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
        const result = await callGeminiAPI(base64Data, mimeType, language, apiKey);
        console.log(`AI Scan successful for user ${userId}`);
        return result;
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
      const withinLimit = await checkRateLimit(userId, isAuthenticated, isAdmin);
      if (!withinLimit) {
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
      */
    }
);
