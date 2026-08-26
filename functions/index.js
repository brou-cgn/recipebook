/**
 * Firebase Cloud Functions for RecipeBook
 * Provides secure server-side API access for AI OCR functionality
 */

const {onCall, onRequest, HttpsError} = require('firebase-functions/v2/https');
const {onDocumentCreated, onDocumentWritten} = require('firebase-functions/v2/firestore');
const {onObjectFinalized} = require('firebase-functions/v2/storage');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {defineSecret} = require('firebase-functions/params');
const {GoogleGenerativeAI} = require('@google/generative-ai');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const sharp = require('sharp');
const cheerio = require('cheerio');
const {createNutritionNormalizationUtils} = require('./nutritionNormalization');
const {requireShortcutPin} = require('./webImportPin');

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
 * Localhost origins are included for local development.
 */
const ALLOWED_ORIGINS = [
  'https://brou-cgn.github.io',
  'https://broubook.web.app',
  'https://broubook.firebaseapp.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
];

/**
 * Rate limiting configuration
 */
const RATE_LIMITS = {
  admin: 1000, // 1000 scans per day for admin users
  moderator: 50, // 50 scans per day for moderator users
  authenticated: 20, // 20 scans per day for authenticated users
  guest: 5, // 5 scans per day for guest/anonymous users
};

/**
 * Maximum number of account registrations allowed per IP address per hour.
 */
const REGISTRATION_RATE_LIMIT = 5;

/**
 * Validate that a URL does not target internal/private infrastructure (SSRF guard).
 * Throws an HttpsError if the URL is blocked.
 * @param {string} urlString - The URL to validate
 */
function assertPublicUrl(urlString) {
  let urlObj;
  try {
    urlObj = new URL(urlString);
  } catch (_) {
    throw new HttpsError('invalid-argument', 'Invalid URL format');
  }

  if (!['http:', 'https:'].includes(urlObj.protocol)) {
    throw new HttpsError('invalid-argument', 'URL must use HTTP or HTTPS protocol');
  }

  const hostname = urlObj.hostname.toLowerCase();

  // Block loopback and link-local
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' ||
      hostname === '0.0.0.0' || hostname === '::1') {
    throw new HttpsError('invalid-argument', 'URL targets a disallowed host');
  }

  // Block cloud metadata endpoints
  if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal' ||
      hostname === 'metadata.internal' || hostname.endsWith('.internal')) {
    throw new HttpsError('invalid-argument', 'URL targets a disallowed host');
  }

  // Block RFC-1918 private IP ranges
  const privatePatterns = [
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
    /^192\.168\.\d{1,3}\.\d{1,3}$/,
    /^fc[\da-f]{2}:/i,
  ];
  if (privatePatterns.some((re) => re.test(hostname))) {
    throw new HttpsError('invalid-argument', 'URL targets a disallowed host');
  }
}

/**
 * Resolves a Shortcut request's X-User-Email header to a Firebase Auth uid.
 * Returns null (instead of throwing) for any lookup failure so callers can
 * respond with the same generic 403 used for other permission failures —
 * this avoids letting a caller who already holds a valid API key enumerate
 * which email addresses are registered.
 * @param {string} email - raw X-User-Email header value
 * @return {Promise<string|null>}
 */
async function resolveShortcutUserId(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;
  try {
    const userRecord = await admin.auth().getUserByEmail(normalizedEmail);
    return userRecord.uid;
  } catch (err) {
    if (err.code !== 'auth/user-not-found') {
      console.error('resolveShortcutUserId: error looking up user by email:', err);
    }
    return null;
  }
}

/**
 * Input validation constants
 */
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20 MB in bytes (Gemini API limit)
// Gemini's generateContent endpoint caps the total inline-data request payload at 20 MB.
// Base64-encoding a video inflates its raw byte size by 4/3, so the raw video must stay
// well under that ceiling once encoded, leaving headroom for the prompt text/JSON overhead.
// Checking the raw buffer against the full 20 MB (as before) let ~14-20 MB reels pass the
// pre-check and then fail the Gemini call once base64-encoded — a failure that
// transcribeVideoWithGemini swallows silently, so no audio ever got transcribed for them.
const GEMINI_INLINE_REQUEST_LIMIT = 20 * 1024 * 1024;
const MAX_REEL_VIDEO_SIZE = Math.floor((GEMINI_INLINE_REQUEST_LIMIT - 64 * 1024) * 3 / 4); // ~14.95 MB raw
const MAX_HTML_SIZE = 500000; // 500 KB in characters – used by processHtmlWithAI input validation
const MAX_FETCH_HTML_SIZE = 1000000; // 1 MB – higher limit for raw HTML fetch to avoid truncating JSON-LD on large pages
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
const DEFAULT_AI_RECIPE_PROMPT = `Analysiere dieses Rezeptbild und extrahiere alle Informationen als strukturiertes JSON. Extrahiere nur das Rezept, ignoriere Kommentare, Likes, UI‑Text. Erfinde keine Zutaten/Mengen/Temperaturen/Zubereitungsschritte.

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
3. Zubereitungsschritte: Jeder Schritt sollte eine vollständige, klare Anweisung sein. Übernimm NUR Schritte, die tatsächlich in der Quelle beschrieben oder eindeutig erkennbar sind – ergänze KEINE zusätzlichen Arbeitsschritte, Zeiten, Temperaturen oder Reihenfolgen aus allgemeinem Kochwissen, auch wenn sie plausibel wirken. Wenn die Quelle nur eine Zutatenliste ohne Zubereitungsanleitung enthält, lasse "zubereitung" als leeres Array – erfinde KEINE Schritte anhand der Zutaten.
4. Fehlende Informationen: Wenn eine Information nicht lesbar oder nicht vorhanden ist, verwende null oder lasse das Array leer
5. Einheiten: Standardisiere Einheiten (g statt Gramm, ml statt Milliliter). Verwende IMMER "Esslöffel" statt "EL" und "Teelöffel" statt "TL" – schreibe die Einheit NIE als Abkürzung (z.B. "2 Esslöffel Olivenöl", "1 Teelöffel Salz"). Wandle Brüche in Dezimalzahlen um (z.B. "1/2" wird zu "0,5", "1 1/2" wird zu "1,5"). WICHTIG: Rechne ALLE imperialen Einheiten in metrische Einheiten um! Verwende folgende Umrechnungen: 1 cup (Flüssigkeit) = 240 ml, 1 cup (Mehl) = 130 g, 1 cup (Zucker) = 200 g, 1 cup (Butter) = 227 g, 1 oz = 28 g, 1 lb = 454 g, 1 fl oz = 30 ml, 1 quart = 946 ml, 1 pint = 473 ml, 1 gallon = 3785 ml, 1 stick Butter = 113 g. Für cups: verwende das jeweils passende Gewicht abhängig von der Zutat (z.B. "1 cup flour" = "130 g Mehl", "1 cup milk" = "240 ml Milch"). Runde die Ergebnisse auf sinnvolle Werte (z.B. 454 g → 450 g, 227 g → 225 g).
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

// In-memory cache for the AI recipe extraction prompt, shared across warm
// invocations of the same Cloud Functions instance. TTL keeps changes made
// in Settings visible within a few minutes without a Firestore read on
// every single OCR/import call.
let recipeExtractionPromptCache = null;
let recipeExtractionPromptCacheExpiry = 0;
const RECIPE_EXTRACTION_PROMPT_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Get the recipe extraction prompt
 * Loads from Firestore settings (cached in-memory for a few minutes),
 * throws an error if not configured
 * @returns {Promise<string>} The formatted prompt
 */
async function getRecipeExtractionPrompt() {
  if (recipeExtractionPromptCache && Date.now() < recipeExtractionPromptCacheExpiry) {
    return recipeExtractionPromptCache;
  }

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
      !aiRecipePrompt.includes('imperiale') ||
      !aiRecipePrompt.includes('ergänze KEINE zusätzlichen Arbeitsschritte')
    ) {
      console.warn('AI prompt in Firestore is outdated or missing placeholders – migrating to DEFAULT_AI_RECIPE_PROMPT');
      aiRecipePrompt = DEFAULT_AI_RECIPE_PROMPT;
      await db.collection('settings').doc('app').update({aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT});
      console.log('Successfully migrated aiRecipePrompt in Firestore to default version');
    }

    console.log('Successfully loaded AI prompt from Firestore settings');
    console.log(`Prompt length: ${aiRecipePrompt.length} characters`);

    recipeExtractionPromptCache = aiRecipePrompt;
    recipeExtractionPromptCacheExpiry = Date.now() + RECIPE_EXTRACTION_PROMPT_CACHE_TTL_MS;

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
 * @param {boolean} isModerator - Whether user is a moderator
 * @returns {number} The rate limit for the user
 */
function getRateLimit(isAdmin, isAuthenticated, isModerator = false) {
  return isAdmin ? RATE_LIMITS.admin
    : isModerator ? RATE_LIMITS.moderator
    : isAuthenticated ? RATE_LIMITS.authenticated
    : RATE_LIMITS.guest;
}

/**
 * Look up whether the given user has the 'moderator' role in Firestore.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function isModeratorUser(userId) {
  try {
    const doc = await admin.firestore().doc(`users/${userId}`).get();
    return doc.exists && doc.data()?.role === 'moderator';
  } catch (err) {
    console.error(`isModeratorUser: failed to look up role for ${userId}:`, err);
    return false;
  }
}

/**
 * Check and update rate limit for a user
 * @param {string} userId - User ID (or IP for anonymous)
 * @param {boolean} isAuthenticated - Whether user is authenticated
 * @param {boolean} isAdmin - Whether user is an admin
 * @param {boolean} isModerator - Whether user is a moderator
 * @returns {Promise<{allowed: boolean, remaining: number, limit: number}>}
 */
async function checkRateLimit(userId, isAuthenticated, isAdmin = false, isModerator = false) {
  const db = admin.firestore();
  // Use MEZ (Europe/Berlin) timezone so counter resets at 0 Uhr MEZ
  const today = new Date().toLocaleDateString('sv-SE', {timeZone: 'Europe/Berlin'}); // YYYY-MM-DD
  const docRef = db.collection('aiScanLimits').doc(`${userId}_${today}`);

  const limit = getRateLimit(isAdmin, isAuthenticated, isModerator);

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
          isModerator: isModerator,
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
 * Normalizes ingredient unit abbreviations to their full German names.
 * Replaces standalone "EL"/"El" with "Esslöffel" and "TL"/"Tl" with "Teelöffel".
 * Acts as a safety net when Gemini ignores the prompt instruction to use full unit names.
 *
 * @param {string[]} ingredients - Array of ingredient strings
 * @returns {string[]} Normalized ingredient strings
 */
function normalizeIngredientUnits(ingredients) {
  if (!Array.isArray(ingredients)) return ingredients;
  return ingredients.map((ingredient) => {
    if (typeof ingredient !== 'string') return ingredient;
    return ingredient
      .replace(/\bEL\b/g, 'Esslöffel')
      .replace(/\bEl\b/g, 'Esslöffel')
      .replace(/\bTL\b/g, 'Teelöffel')
      .replace(/\bTl\b/g, 'Teelöffel');
  });
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

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
        throw new HttpsError(
          'resource-exhausted',
          'Die KI-API ist momentan ausgelastet. Bitte versuche es in einigen Minuten erneut oder nutze Standard-OCR.'
        );
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
        ingredients: normalizeIngredientUnits(recipeData.zutaten || []),
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
        ingredients: normalizeIngredientUnits(recipeData.ingredients || []),
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
 * Convert a raw Gemini/AI result into the recipe field shape used by
 * RecipeForm/RecipeImportQueueContext. Node-side port of the browser
 * buildRecipeFromAiResult (src/utils/ocrParser.js) so background import
 * jobs can be finalized directly from a Cloud Function, without depending
 * on the client tab staying open to write the result back.
 *
 * @param {Object} aiResult - Structured recipe data (title, ingredients, ...)
 * @param {string} [authorId] - Optional author id to attach to the recipe
 * @returns {Object} Recipe field object matching the RecipeForm shape
 */
function buildRecipeFieldsFromResult(aiResult, authorId = '') {
  const parseTime = (timeStr) => {
    if (!timeStr) return 0;
    const numMatch = String(timeStr).match(/\d+/);
    return numMatch ? parseInt(numMatch[0], 10) : 0;
  };

  const kulinarikTagKeywords = {vegetarisch: 'Vegetarisch', vegan: 'Vegan'};
  const tags = Array.isArray(aiResult.tags) ? aiResult.tags : [];
  const kulinarikFromTags = tags.reduce((result, tag) => {
    const canonical = kulinarikTagKeywords[String(tag).toLowerCase().trim()];
    if (canonical && !result.includes(canonical)) result.push(canonical);
    return result;
  }, []);
  const kulinarikSet = new Set(aiResult.cuisine ? [aiResult.cuisine] : []);
  kulinarikFromTags.forEach((k) => kulinarikSet.add(k));

  return {
    title: aiResult.title || '',
    ingredients: aiResult.ingredients || [],
    steps: aiResult.steps || [],
    portionen: aiResult.servings || 4,
    kochdauer: parseTime(aiResult.prepTime) || parseTime(aiResult.cookTime) || 30,
    kulinarik: [...kulinarikSet],
    schwierigkeit: aiResult.difficulty || 3,
    speisekategorie: aiResult.category || '',
    ...(authorId ? {authorId} : {}),
  };
}

/**
 * Retention window for successful Reel/video import protocol entries in
 * failedWebImports (see writeImportProtocolEntry) before
 * nightlyImportProtocolCleanup removes them. Failed entries have no
 * expiresAt and are kept indefinitely for developer review.
 */
const IMPORT_PROTOCOL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Persists a step-by-step record ("Protokoll") of an Instagram Reel / video
 * import attempt to failedWebImports — the same collection
 * src/utils/failedWebImportsFirestore.js already logs dismissed failed web
 * imports to, so there is one place to look for "what happened with an
 * import". Only called for Reel-style sources (see isReelImportSource):
 * those are the paths detailed enough (navigate, video capture,
 * transcription, caption, combined text, AI extraction) to produce a
 * meaningful step list; other import types (plain web/universal/photo)
 * aren't instrumented and never reach here. Best-effort — a logging failure
 * must never mask the actual import outcome.
 *
 * @param {Object} params
 * @param {string|null} params.jobId - Firestore recipes/{jobId} doc id, or null
 *   (the synchronous Shortcut endpoint creates its recipe doc only on success)
 * @param {string|null} params.authorId
 * @param {Object} params.source - importSource-shaped object ({type, url|storagePath, ...})
 * @param {boolean} params.success
 * @param {Array<{step: string, ok: boolean, detail?: string, at?: number}>} params.steps
 * @param {Error} [params.error] - The failure, when success is false
 * @returns {Promise<void>}
 */
async function writeImportProtocolEntry({jobId, authorId, source, success, steps, error}) {
  try {
    const entry = {
      jobId: jobId || null,
      userId: authorId || null,
      sourceType: (source && source.type) || null,
      url: (source && source.url) || null,
      success: Boolean(success),
      steps: Array.isArray(steps) ? steps : [],
      error: success ? null : (error && error.message ? error.message : 'Import fehlgeschlagen'),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(success ? {
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + IMPORT_PROTOCOL_TTL_MS),
      } : {}),
    };
    await admin.firestore().collection('failedWebImports').add(entry);
  } catch (writeError) {
    console.error('writeImportProtocolEntry: failed to write import protocol entry:', writeError);
  }
}

/**
 * Write a completed background-import result directly to its temp-recipe
 * Firestore document, so the job finishes even if the client tab that
 * queued it (RecipeImportQueueContext) was closed before the Cloud
 * Function call returned. Best-effort: swallows its own errors so a
 * Firestore write failure never masks the actual AI result from a client
 * that is still connected and waiting on the callable's response.
 *
 * Runs inside a transaction and only writes when the document still has an
 * importStatus set (queued/processing/error) — once another caller has
 * already finalized or discarded the job, importStatus is gone (deleted on
 * success, or the whole doc removed by dismissJob/cancelJob), so a late
 * result from a superseded attempt (e.g. one the sweeper restarted while a
 * client tab was also mid-retry) can no longer clobber it.
 *
 * @param {string} jobId - Firestore recipes/{jobId} doc id (the temp recipe)
 * @param {string} authorId - Owner of the queued job
 * @param {Object} aiResult - Structured recipe data to persist
 * @param {{steps: Array, source: Object}} [meta] - Reel import protocol data
 *   (see writeImportProtocolEntry); omitted for non-Reel import types.
 * @returns {Promise<void>}
 */
async function finalizeImportJob(jobId, authorId, aiResult, meta) {
  if (!jobId) return;
  const db = admin.firestore();
  const ref = db.collection('recipes').doc(jobId);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      if (!snap.get('importStatus')) return;
      tx.update(ref, {
        ...buildRecipeFieldsFromResult(aiResult, authorId),
        authorId,
        isTemp: true,
        importStatus: admin.firestore.FieldValue.delete(),
        importProgress: admin.firestore.FieldValue.delete(),
      });
    });
    if (meta && meta.steps) {
      await writeImportProtocolEntry({
        jobId, authorId, source: meta.source, success: true, steps: meta.steps,
      });
    }
  } catch (error) {
    // Previously logged-and-swallowed: the job was left stuck on its prior
    // importStatus forever (no error, no result) since nothing else marks it
    // failed once execution reaches this point. Write the error state too so
    // it surfaces in the app (and becomes retryable via "Neu starten")
    // instead of silently hanging.
    console.error(`finalizeImportJob: failed to write result for job ${jobId}:`, error);
    await failImportJob(jobId, error, meta);
  }
}

/**
 * Firebase Functions error codes that mean retrying without user
 * intervention won't help (bad input, quota, missing config, auth) — a job
 * that fails with one of these is left in 'error' for the user's own
 * "Neu starten" action rather than being retried automatically.
 */
const PERMANENT_IMPORT_ERROR_CODES = new Set([
  'invalid-argument', 'resource-exhausted', 'failed-precondition', 'unauthenticated',
]);

/**
 * Firebase Functions error codes that are plausibly transient (server-side
 * hiccup, timeout, upstream outage) — recoverStuckImportJobs will redrive
 * jobs failing with one of these, up to the retry budget.
 */
const RETRYABLE_IMPORT_ERROR_CODES = new Set(['internal', 'deadline-exceeded', 'unavailable']);

/**
 * Classify an import failure as 'permanent' or 'retryable' for
 * recoverStuckImportJobs. Codes outside both known sets (e.g. a plain Error
 * with no .code, or 'not-found') default to 'retryable' — the sweeper's
 * attempt budget (MAX_IMPORT_ATTEMPTS) already bounds the cost of a wrong
 * guess, whereas defaulting to 'permanent' would strand a possibly-transient
 * failure without ever giving recovery a chance.
 *
 * @param {Error} error
 * @returns {'permanent'|'retryable'}
 */
function classifyImportErrorKind(error) {
  const code = error && error.code;
  if (PERMANENT_IMPORT_ERROR_CODES.has(code)) return 'permanent';
  if (RETRYABLE_IMPORT_ERROR_CODES.has(code)) return 'retryable';
  return 'retryable';
}

/**
 * Mark a background-import job as failed directly in Firestore, mirroring
 * finalizeImportJob above but for the error path. Best-effort for the same
 * reason.
 *
 * @param {string} jobId - Firestore recipes/{jobId} doc id
 * @param {Error} error - The failure; error.message becomes importError and
 *   error.code (a Firebase Functions error code, e.g. from an HttpsError or
 *   from a plain Error assigned one) is classified into importErrorKind.
 * @param {{steps: Array, source: Object, authorId?: string}} [meta] - Reel import
 *   protocol data (see writeImportProtocolEntry); omitted for non-Reel import types.
 * @returns {Promise<void>}
 */
async function failImportJob(jobId, error, meta) {
  if (!jobId) return;
  try {
    await admin.firestore().collection('recipes').doc(jobId).update({
      importStatus: 'error',
      importError: error?.message || 'Import fehlgeschlagen',
      importErrorKind: classifyImportErrorKind(error),
    });
  } catch (writeError) {
    console.error(`failImportJob: failed to write error state for job ${jobId}:`, writeError);
  }
  if (meta && meta.steps) {
    await writeImportProtocolEntry({
      jobId, authorId: meta.authorId || null, source: meta.source, success: false, steps: meta.steps, error,
    });
  }
}

/**
 * Push a data-only FCM message to a user's own devices when a fully
 * background-run import job finishes — i.e. one with no client tab involved
 * (processShortcutImportJob, recoverStuckImportJobs), as opposed to the
 * callable-driven flow where an open tab already learns the result directly.
 * This is what lets the "Hintergrundaktualisierung" setting update the OS
 * app badge / show a notification while brouBook is closed.
 *
 * No-op unless the user opted in (users/{authorId}.backgroundUpdatesEnabled)
 * and has at least one saved FCM token. Best-effort: never throws, mirrors
 * the token-cleanup approach used by notifyPrivateListMembers.
 *
 * @param {string} authorId - Owner of the job (recipes/{jobId}.authorId)
 * @param {Object} info
 * @param {string} info.jobId - Firestore recipes/{jobId} doc id
 * @param {'ready'|'error'} info.status
 * @param {string} [info.title] - Recipe title, for the 'ready' case
 * @param {string} [info.errorMessage] - Failure reason, for the 'error' case
 * @returns {Promise<void>}
 */
async function sendImportStatusPush(authorId, {jobId, status, title, errorMessage}) {
  if (!authorId || authorId === 'unknown') return;
  const db = admin.firestore();
  try {
    const userRef = db.collection('users').doc(authorId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return;
    const userData = userSnap.data();
    if (!userData.backgroundUpdatesEnabled) return;
    const tokens = Array.isArray(userData.fcmTokens) ? userData.fcmTokens.filter(Boolean) : [];
    if (tokens.length === 0) return;

    let pendingReviewCount = 0;
    try {
      const countSnap = await db.collection('recipes')
          .where('authorId', '==', authorId)
          .where('isTemp', '==', true)
          .count()
          .get();
      pendingReviewCount = countSnap.data().count;
    } catch (countErr) {
      console.warn('sendImportStatusPush: count query failed', countErr);
    }

    const notificationTitle = status === 'ready' ?
      'Rezept bereit zur Prüfung' :
      'Import fehlgeschlagen';
    const notificationBody = status === 'ready' ?
      `„${title || 'Ein Rezept'}" wartet auf deine Bestätigung.` :
      (errorMessage || 'Der Hintergrund-Import ist fehlgeschlagen.');

    const notificationPayload = {
      data: {
        type: status === 'ready' ? 'import_ready' : 'import_failed',
        title: notificationTitle,
        body: notificationBody,
        icon: '/logo192.png',
        badge: '/favicon.ico',
        recipeId: jobId || '',
        pendingReviewCount: String(pendingReviewCount),
        notificationId: `import-${jobId}-${Date.now()}`,
      },
      apns: {
        headers: {
          'apns-push-type': 'alert',
          'apns-priority': '10',
        },
        payload: {
          aps: {
            alert: {
              title: notificationTitle,
              body: notificationBody,
            },
            sound: 'default',
            'mutable-content': 1,
            badge: pendingReviewCount,
          },
        },
      },
      webpush: {
        fcm_options: {
          link: '/?reviewImport=1',
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      ...notificationPayload,
    });

    const staleTokens = [];
    response.responses.forEach((resp, idx) => {
      if (
        !resp.success &&
        (resp.error?.code === 'messaging/registration-token-not-registered' ||
          resp.error?.code === 'messaging/invalid-registration-token')
      ) {
        staleTokens.push(tokens[idx]);
      }
    });
    if (staleTokens.length > 0) {
      await userRef.update({
        fcmTokens: tokens.filter((t) => !staleTokens.includes(t)),
      });
    }
  } catch (err) {
    console.error(`sendImportStatusPush: failed for job ${jobId}:`, err);
  }
}

/**
 * finalizeImportJob wrapper for the fully-background paths (see
 * sendImportStatusPush) — writes the result and then, best-effort, notifies
 * the user's own devices.
 */
async function finalizeImportJobBackground(jobId, authorId, aiResult, meta) {
  await finalizeImportJob(jobId, authorId, aiResult, meta);
  await sendImportStatusPush(authorId, {jobId, status: 'ready', title: aiResult?.title});
}

/**
 * failImportJob wrapper for the fully-background paths (see
 * sendImportStatusPush) — writes the error state and then, best-effort,
 * notifies the user's own devices.
 */
async function failImportJobBackground(jobId, authorId, error, meta) {
  await failImportJob(jobId, error, meta ? {...meta, authorId} : meta);
  await sendImportStatusPush(authorId, {jobId, status: 'error', errorMessage: error?.message});
}

/**
 * Cloud Function: Scan recipe with AI
 * This is a callable function that can be invoked from the client
 *
 * Input data:
 * - imageBase64: Base64 encoded image (with or without data URL prefix)
 * - language: Language code ('de' or 'en'), defaults to 'de'
 * - jobId: Optional background-import job id (temp recipe doc). When set,
 *   the result (or error) is written directly to that Firestore document so
 *   the import survives the calling tab being closed mid-request.
 * - authorId: Owner of the job; required for jobId to take effect.
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
      const {imageBase64, language = 'de', cuisineTypes, mealCategories, jobId, authorId} = request.data;

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
      const isModerator = !isAdmin && await isModeratorUser(userId);

      console.log(`AI Scan request from user ${userId} (authenticated: ${isAuthenticated}, admin: ${isAdmin})`);

      // Rate limiting
      const rateLimitResult = await checkRateLimit(userId, isAuthenticated, isAdmin, isModerator);
      if (!rateLimitResult.allowed) {
        const limit = getRateLimit(isAdmin, isAuthenticated, isModerator);
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
        if (jobId) await finalizeImportJob(jobId, authorId || userId, result);
        return {
          ...result,
          remainingScans: rateLimitResult.remaining,
          dailyLimit: rateLimitResult.limit,
        };
      } catch (error) {
        console.error(`AI Scan failed for user ${userId}:`, error);
        if (jobId) await failImportJob(jobId, error);
        throw error;
      }
    }
);

/**
 * Maximum number of images accepted by a single scanRecipesWithAI batch call.
 */
const MAX_BATCH_IMAGES = 10;

/**
 * Number of images processed concurrently within one scanRecipesWithAI call.
 * Mirrors BATCH_CONCURRENCY in src/utils/importRunners.js.
 */
const BATCH_IMAGE_CONCURRENCY = 3;

/**
 * Levenshtein edit distance between two strings (Node-side port of the
 * browser helper in src/utils/importRunners.js, used for near-duplicate
 * ingredient/step filtering when merging multi-image scan results).
 * @param {string} s1
 * @param {string} s2
 * @returns {number}
 */
function levenshteinDistance(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

/**
 * @param {string} s1
 * @param {string} s2
 * @returns {number} Similarity ratio between 0 and 1
 */
function stringSimilarity(s1, s2) {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Remove near-duplicate strings (similarity > 0.8) from a list, keeping the
 * first occurrence of each. Node-side port of the browser helper used to
 * merge ingredients/steps collected from multiple scanned images.
 * @param {string[]} items
 * @returns {string[]}
 */
function removeDuplicateStrings(items) {
  if (!items || items.length === 0) return [];
  const unique = [];
  for (const item of items) {
    const normalized = item.toLowerCase().trim();
    const isDuplicate = unique.some(
        (existing) => stringSimilarity(existing.toLowerCase().trim(), normalized) > 0.8,
    );
    if (!isDuplicate) unique.push(item);
  }
  return unique;
}

/**
 * Combine multiple per-image AI OCR results into one recipe. Node-side port
 * of mergePhotoAiResults in src/utils/importRunners.js.
 * @param {Array<Object>} results - Per-image results, each possibly {error}
 * @returns {Object} Merged recipe data
 */
function mergePhotoAiResultsServer(results) {
  const validResults = results.filter((r) => r && !r.error);
  if (validResults.length === 0) {
    throw new HttpsError('invalid-argument', 'Keine gültigen OCR-Ergebnisse gefunden');
  }

  const merged = {...validResults[0]};
  merged.ingredients = removeDuplicateStrings(validResults.flatMap((r) => r.ingredients || []));
  merged.steps = removeDuplicateStrings(validResults.flatMap((r) => r.steps || []));
  merged.tags = [...new Set(validResults.flatMap((r) => r.tags || []))];
  merged.notes = validResults.map((r) => r.notes).filter((n) => n && n.trim()).join('\n\n') || merged.notes;
  merged.servings = merged.servings || validResults.find((r) => r.servings)?.servings;
  merged.prepTime = merged.prepTime || validResults.find((r) => r.prepTime)?.prepTime;
  merged.cookTime = merged.cookTime || validResults.find((r) => r.cookTime)?.cookTime;
  merged.difficulty = merged.difficulty || validResults.find((r) => r.difficulty)?.difficulty;
  merged.cuisine = merged.cuisine || validResults.find((r) => r.cuisine)?.cuisine;
  merged.category = merged.category || validResults.find((r) => r.category)?.category;

  return merged;
}

/**
 * Cloud Function: Batch-scan multiple recipe photos with AI in one call.
 * Replaces N separate scanRecipeWithAI calls from the client for multi-image
 * Foto-Scan imports so the whole batch (concurrent OCR + merge) runs
 * server-side and can finalize the background-import job even if the
 * calling tab is closed before all images finish.
 *
 * Input data:
 * - images: string[]   Required – base64-encoded images (1..MAX_BATCH_IMAGES)
 * - language: string    Optional – 'de' or 'en', defaults to 'de'
 * - jobId: string        Optional – background-import job id (temp recipe doc)
 * - authorId: string     Optional – owner of the job; required for jobId to take effect
 *
 * Returns: Merged structured recipe data (same shape as scanRecipeWithAI)
 */
exports.scanRecipesWithAI = onCall(
    {
      secrets: [geminiApiKey],
      maxInstances: 10,
      memory: '1GiB',
      timeoutSeconds: 180,
    },
    async (request) => {
      const {images, language = 'de', cuisineTypes, mealCategories, jobId, authorId} = request.data;

      const auth = request.auth;
      if (!auth) {
        throw new HttpsError('unauthenticated', 'You must be logged in to use AI recipe scanning');
      }

      const userId = auth.uid;
      const isAuthenticated = auth.token.firebase?.sign_in_provider !== 'anonymous';
      const isAdmin = auth.token.admin === true;
      const isModerator = !isAdmin && await isModeratorUser(userId);

      if (!Array.isArray(images) || images.length === 0) {
        throw new HttpsError('invalid-argument', 'images must be a non-empty array');
      }
      if (images.length > MAX_BATCH_IMAGES) {
        throw new HttpsError('invalid-argument', `A maximum of ${MAX_BATCH_IMAGES} images is supported per batch`);
      }
      if (!['de', 'en'].includes(language)) {
        throw new HttpsError('invalid-argument', 'Language must be "de" or "en"');
      }

      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        console.error('GEMINI_API_KEY secret not configured');
        throw new HttpsError('failed-precondition', 'AI service not configured. Please contact administrator.');
      }

      console.log(`Batch AI Scan request from user ${userId}: ${images.length} images`);

      const results = new Array(images.length);
      let lastRateLimit = null;
      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < images.length) {
          const i = nextIndex++;
          try {
            const rateLimitResult = await checkRateLimit(userId, isAuthenticated, isAdmin, isModerator);
            lastRateLimit = rateLimitResult;
            if (!rateLimitResult.allowed) {
              const limit = getRateLimit(isAdmin, isAuthenticated, isModerator);
              throw new Error(`Tageslimit erreicht (${limit}/${limit} Scans). Versuche es morgen erneut oder nutze Standard-OCR.`);
            }
            const {mimeType, base64Data} = validateImageData(images[i]);
            results[i] = await callGeminiAPI(base64Data, mimeType, language, apiKey, cuisineTypes, mealCategories);
          } catch (error) {
            results[i] = {error: error.message};
          }
        }
      };

      const workerCount = Math.min(BATCH_IMAGE_CONCURRENCY, images.length);
      await Promise.all(Array.from({length: workerCount}, worker));

      try {
        const merged = mergePhotoAiResultsServer(results);
        console.log(`Batch AI Scan successful for user ${userId}`);
        if (jobId) await finalizeImportJob(jobId, authorId || userId, merged);
        return {
          ...merged,
          remainingScans: lastRateLimit?.remaining,
          dailyLimit: lastRateLimit?.limit,
        };
      } catch (error) {
        console.error(`Batch AI Scan failed for user ${userId}:`, error);
        if (jobId) await failImportJob(jobId, error);
        throw error;
      }
    },
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

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
        throw new HttpsError(
          'resource-exhausted',
          'Die KI-API ist momentan ausgelastet. Bitte versuche es in einigen Minuten erneut oder nutze Standard-OCR.'
        );
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
      ingredients: normalizeIngredientUnits(recipeData.zutaten || recipeData.ingredients || []),
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
 * Transcribe spoken text from a video buffer using Gemini.
 * Fail-safe: returns null on errors.
 *
 * @param {Buffer} videoBuffer - Video data as buffer
 * @param {string} language - Language code ('de' or 'en')
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<string|null>} Transcribed text or null
 */
async function transcribeVideoWithGemini(videoBuffer, language, apiKey) {
  try {
    if (!videoBuffer || !Buffer.isBuffer(videoBuffer) || videoBuffer.length === 0) {
      return null;
    }

    const base64Video = videoBuffer.toString('base64');
    const prompt = language === 'de' ?
      'Transkribiere den gesprochenen Text dieses Videos vollständig. ' +
      'Extrahiere dabei besonders alle Rezeptinformationen wie Zutaten, ' +
      'Mengenangaben und Zubereitungsschritte. ' +
      'Gib nur den transkribierten Text zurück, keine Kommentare.' :
      'Transcribe all spoken text from this video completely. Focus on extracting ' +
      'recipe information like ingredients, amounts, and preparation steps. ' +
      'Return only the transcribed text.';

    const requestBody = {
      contents: [
        {
          parts: [
            {text: prompt},
            {
              inline_data: {
                mime_type: 'video/mp4',
                data: base64Video,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.warn(
          `Gemini video transcription failed with status ${response.status}: ${response.statusText}` +
          (errorBody ? ` - ${errorBody.slice(0, 1000)}` : ''),
      );
      return null;
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (error) {
    console.warn('Gemini video transcription warning:', error.message || error);
    return null;
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
      const {rawHtml, language = 'de', cuisineTypes, mealCategories, jobId, authorId} = request.data;

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
      const isModerator = !isAdmin && await isModeratorUser(userId);

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
      const rateLimitResult = await checkRateLimit(userId, isAuthenticated, isAdmin, isModerator);
      if (!rateLimitResult.allowed) {
        const limit = getRateLimit(isAdmin, isAuthenticated, isModerator);
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
        if (jobId) await finalizeImportJob(jobId, authorId || userId, result);
        return {
          ...result,
          remainingScans: rateLimitResult.remaining,
          dailyLimit: rateLimitResult.limit,
        };
      } catch (error) {
        console.error(`HTML processing failed for user ${userId}:`, error);
        if (jobId) await failImportJob(jobId, error);
        throw error;
      }
    },
);

/**
 * Validate that a URL points to an Instagram post, Reel, or IGTV.
 * Accepts both www.instagram.com and instagram.com, and the path patterns
 * /reel/…, /p/…, and /tv/….
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isInstagramUrl(url) {
  try {
    const urlObj = new URL(url);
    return (
      (urlObj.hostname === 'www.instagram.com' || urlObj.hostname === 'instagram.com') &&
      /^\/(reel|p|tv)\/[A-Za-z0-9_-]+\/?$/.test(urlObj.pathname)
    );
  } catch {
    return false;
  }
}

/**
 * Whether a persisted importSource is a Reel-style import (Instagram scrape
 * or the video-upload fallback) — the two paths detailed enough to produce a
 * step-by-step protocol (see writeImportProtocolEntry). A plain 'web'
 * source only counts when its URL is actually an Instagram link; 'universal'
 * and 'photo' sources never do.
 * @param {Object} source - importSource-shaped object ({type, url|storagePath, ...})
 * @returns {boolean}
 */
function isReelImportSource(source) {
  const type = source && source.type;
  if (type === 'video') return true;
  if (type === 'web' && isInstagramUrl(source && source.url)) return true;
  return false;
}

/**
 * Core Instagram Reel/post scraping + Gemini extraction: navigates with
 * Puppeteer, extracts the caption/page text (and transcribes the Reel's
 * audio when a video URL is captured), then runs the combined text through
 * callGeminiTextAPI. Shared by the scrapeInstagramReel callable and
 * recoverStuckImportJobs so the puppeteer scraping logic isn't duplicated.
 * Throws plain Errors, some carrying a Firebase Functions error .code
 * ('not-found' / 'deadline-exceeded' / 'internal') — HttpsError wrapping is
 * the onCall wrapper's job, not this function's.
 *
 * @param {string} url - Instagram Reel/post URL (validated by the caller)
 * @param {{language?: string, apiKey: string, cuisineTypes?: string[], mealCategories?: string[]}} opts
 * @returns {Promise<Object>} Structured recipe data (same shape as callGeminiAPI), plus sourceUrl
 */
async function runImportFromInstagram(url, {language = 'de', apiKey, cuisineTypes, mealCategories, steps} = {}) {
  const puppeteer = require('puppeteer');
  const chromium = require('@sparticuz/chromium');

  // Appends a step to the caller's protocol array (see writeImportProtocolEntry)
  // when one was passed in; a no-op otherwise so this function works standalone.
  const recordStep = (step, ok, detail) => {
    if (Array.isArray(steps)) steps.push({step, ok: Boolean(ok), detail: detail || '', at: Date.now()});
  };

  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args.concat([
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
      ]),
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // Hide automation fingerprint before any page scripts run
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {get: () => false});
    });

    let videoUrl = null;
    page.on('response', (response) => {
      try {
        const responseUrl = response.url();
        if (
          !videoUrl &&
          responseUrl.includes('.mp4') &&
          response.request().resourceType() === 'media'
        ) {
          videoUrl = responseUrl;
        }
      } catch (error) {
        console.warn('Instagram video response listener warning:', error.message || error);
      }
    });

    await page.setViewport({width: 1280, height: 800});

    // Use a mobile user-agent as Instagram serves more content to mobile browsers
    await page.setUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) ' +
        'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
    });

    // Navigate to the Instagram Reel page.
    const navigateAndCheckLoginWall = async () => {
      let status = null;
      try {
        const gotoResponse = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        status = gotoResponse ? gotoResponse.status() : null;
      } catch (navError) {
        // Continue even if navigation times out – we may still have partial content
        console.warn(`Navigation warning for ${url}:`, navError.message);
      }
      const currentUrl = page.url();
      const loginWall = /\/accounts\/login/.test(currentUrl);
      return {status, currentUrl, loginWall};
    };

    const navResult = await navigateAndCheckLoginWall();
    console.log(
        `Instagram navigation result: status=${navResult.status}, finalUrl=${navResult.currentUrl}, ` +
        `likelyLoginWall=${navResult.loginWall}`,
    );

    recordStep(
        'navigate',
        Boolean(navResult.status) && navResult.status < 400 && !navResult.loginWall,
        `status=${navResult.status} url=${navResult.currentUrl} loginWall=${navResult.loginWall}`,
    );

    // Short pause to let meta tags and initial content render
    await new Promise((r) => setTimeout(r, 2000));

    // A prior test run showed the fixed 2s pause above isn't enough: Instagram
    // hydrates the <video> element client-side well after domcontentloaded, so
    // checking for it immediately after the pause found nothing. Wait
    // explicitly for the element instead of guessing a fixed delay — this
    // resolves as soon as it appears rather than always paying the full 6s.
    const videoSelectorFound = await page.waitForSelector('video', {timeout: 6000})
        .then(() => true)
        .catch(() => false);
    console.log(`Instagram <video> element found via waitForSelector: ${videoSelectorFound}`);
    recordStep('video_element_found', videoSelectorFound, `found=${videoSelectorFound}`);

    // Instagram only issues the video network request once the <video> element
    // starts loading/playing — it does not fire from a static page load alone.
    // Chromium blocks unmuted autoplay, so mute + scroll it into view + play(),
    // then poll (instead of trusting the fixed pause above) until the response
    // listener registered above captures the .mp4 URL or this times out.
    let videoElementPresent = false;
    try {
      videoElementPresent = await page.evaluate(() => {
        const videoEl = document.querySelector('video');
        if (videoEl) {
          videoEl.muted = true;
          videoEl.scrollIntoView({behavior: 'auto', block: 'center'});
          videoEl.play().catch(() => {});
          return true;
        }
        return false;
      });
    } catch (playError) {
      console.warn('Instagram video autoplay trigger warning:', playError.message || playError);
    }
    console.log(`Instagram <video> element present in DOM: ${videoElementPresent}`);

    const videoCaptureDeadline = Date.now() + 5000;
    while (!videoUrl && Date.now() < videoCaptureDeadline) {
      await new Promise((r) => setTimeout(r, 250));
    }

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

    console.log(
        `Instagram page content extracted: titleLength=${extractedData.title.length}, ` +
        `descriptionLength=${extractedData.description.length}, ` +
        `bodyTextLength=${extractedData.bodyText.length}`,
    );
    recordStep(
        'caption_extracted',
        Boolean(extractedData.description || extractedData.bodyText),
        `titleLen=${extractedData.title.length} descLen=${extractedData.description.length} ` +
        `bodyLen=${extractedData.bodyText.length}`,
    );

    // Grab the (anonymous) session cookies Instagram set during this page visit
    // while the browser is still around – the out-of-band video fetch below
    // otherwise looks like plain hotlinking to Instagram's CDN (no Referer, no
    // cookies) and gets rejected. This is not a user login, just the same
    // request context the browser already established for itself.
    let cookieHeader = '';
    try {
      const cookies = await page.cookies();
      cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    } catch (cookieError) {
      console.warn('Instagram cookie capture warning:', cookieError.message || cookieError);
    }

    await browser.close();
    browser = null;

    recordStep('video_url_captured', Boolean(videoUrl), videoUrl ? 'video url captured' : 'no video url captured within timeout');

    let transcribedAudio = null;
    if (videoUrl) {
      try {
        const videoResponse = await fetch(videoUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) ' +
              'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            'Referer': 'https://www.instagram.com/',
            ...(cookieHeader ? {'Cookie': cookieHeader} : {}),
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!videoResponse.ok) {
          console.warn(
              `Instagram video download failed with status ${videoResponse.status}: ` +
              `${videoResponse.statusText}`,
          );
          recordStep('video_transcription', false, `download failed: HTTP ${videoResponse.status}`);
        } else {
          const contentLengthHeader = videoResponse.headers.get('content-length');
          const parsedContentLength = contentLengthHeader ?
            parseInt(contentLengthHeader, 10) :
            NaN;
          const contentLength = Number.isFinite(parsedContentLength) ?
            parsedContentLength :
            null;

          if (contentLength && contentLength > MAX_REEL_VIDEO_SIZE) {
            console.warn(
                `Instagram video too large by header: ${contentLength} bytes ` +
                `(max ${MAX_REEL_VIDEO_SIZE})`,
            );
            recordStep('video_transcription', false, `video too large (header): ${contentLength} bytes`);
          } else {
            const videoArrayBuffer = await videoResponse.arrayBuffer();
            const videoBuffer = Buffer.from(videoArrayBuffer);

            if (videoBuffer.length > MAX_REEL_VIDEO_SIZE) {
              console.warn(
                  `Instagram video too large after download: ${videoBuffer.length} bytes ` +
                  `(max ${MAX_REEL_VIDEO_SIZE})`,
              );
              recordStep('video_transcription', false, `video too large (downloaded): ${videoBuffer.length} bytes`);
            } else {
              transcribedAudio = await transcribeVideoWithGemini(
                  videoBuffer, language, apiKey,
              );
              recordStep(
                  'video_transcription',
                  Boolean(transcribedAudio),
                  transcribedAudio ? `transcript length=${transcribedAudio.length}` : 'transcription returned empty',
              );
            }
          }
        }
      } catch (error) {
        console.warn('Instagram video download/transcription warning:', error.message || error);
        recordStep('video_transcription', false, `error: ${error.message || error}`);
      }
    } else {
      console.warn('No Instagram Reel video URL captured; continuing without transcription.');
      recordStep('video_transcription', false, 'no video url captured, skipped');
    }

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
    if (transcribedAudio) {
      const transcriptionLabel = language === 'de' ?
        'Gesprochener Inhalt (Audiotranskription)' :
        'Spoken Content (Audio Transcription)';
      parts.push(`${transcriptionLabel}:\n${transcribedAudio}`);
    }
    const combinedText = parts.join('\n\n');
    recordStep(
        'content_combined',
        combinedText.trim().length >= MIN_COMBINED_TEXT_LENGTH,
        `combined length=${combinedText.length}`,
    );

    if (!combinedText.trim() || combinedText.length < MIN_COMBINED_TEXT_LENGTH) {
      // Distinguish the two empty-result causes so the user gets an actionable
      // message instead of a generic "nothing found": a login-wall redirect
      // means Instagram blocked this request entirely — no caption, no video —
      // and it reflects a temporary block against this IP/URL rather than a
      // per-request coin flip, so retrying immediately won't help. Point the
      // user at the video-upload Shortcut path instead, which never touches
      // Instagram from our server at all.
      const notFoundError = navResult.loginWall ?
        new Error(
            'Instagram hat diese Anfrage blockiert und keine Inhalte ausgeliefert (Login-Wall). ' +
            'Das ist meist eine vorübergehende Sperre – ein sofortiger erneuter Versuch wird ' +
            'vermutlich genauso fehlschlagen. Nutze stattdessen den Video-Upload-Kurzbefehl: Video ' +
            'über „Video speichern" sichern und direkt hochladen statt den Link zu importieren.',
        ) :
        new Error(
            'Kein Rezeptinhalt auf der Instagram-Seite gefunden. ' +
            'Das Reel ist möglicherweise privat oder enthält kein Rezept in der Bildunterschrift.',
        );
      notFoundError.code = 'not-found';
      recordStep('result', false, notFoundError.message);
      throw notFoundError;
    }

    console.log(`Instagram Reel content extracted, length: ${combinedText.length}`);

    // Process the combined text with Gemini AI
    const result = await callGeminiTextAPI(
        combinedText, language, apiKey, cuisineTypes, mealCategories,
    );
    recordStep('ai_extraction', true, 'Gemini-Extraktion erfolgreich');

    return {...result, sourceUrl: url};
  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        console.error('Error closing browser after failure:', closeErr);
      }
    }
    if (error.code) {
      // Already recorded at its own throw site above (not-found) or is a
      // rethrow from a nested call that recorded its own step — avoid a
      // duplicate, undifferentiated entry here.
      throw error;
    }
    if (error.message && error.message.includes('timeout')) {
      const timeoutError = new Error('Die Instagram-Seite hat zu lange gebraucht. Bitte versuche es erneut.');
      timeoutError.code = 'deadline-exceeded';
      recordStep('result', false, timeoutError.message);
      throw timeoutError;
    }
    const internalError = new Error('Instagram-Import fehlgeschlagen: ' + error.message);
    internalError.code = 'internal';
    recordStep('result', false, internalError.message);
    throw internalError;
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
      memory: '4GiB',
      timeoutSeconds: 180,
    },
    async (request) => {
      const {url, language = 'de', cuisineTypes, mealCategories, jobId, authorId} = request.data;

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
      const isModerator = !isAdmin && await isModeratorUser(userId);

      console.log(`Instagram scrape request from user ${userId} for URL: ${url}`);

      // Validate URL
      if (!url || typeof url !== 'string') {
        throw new HttpsError('invalid-argument', 'URL must be a non-empty string');
      }
      if (!isInstagramUrl(url)) {
        throw new HttpsError(
            'invalid-argument',
            'URL must be a valid Instagram URL (e.g. https://www.instagram.com/reel/... or https://www.instagram.com/p/...)',
        );
      }

      // Validate language
      if (!['de', 'en'].includes(language)) {
        throw new HttpsError('invalid-argument', 'Language must be "de" or "en"');
      }

      // Rate limiting (shared with image scanning)
      const rateLimitResult = await checkRateLimit(userId, isAuthenticated, isAdmin, isModerator);
      if (!rateLimitResult.allowed) {
        const limit = getRateLimit(isAdmin, isAuthenticated, isModerator);
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

      const steps = [];
      try {
        const result = await runImportFromInstagram(url, {language, apiKey, cuisineTypes, mealCategories, steps});
        console.log(`Instagram Reel import successful for user ${userId}`);
        if (jobId) {
          await finalizeImportJob(jobId, authorId || userId, result, {steps, source: {type: 'instagram', url}});
        }
        return {
          ...result,
          remainingScans: rateLimitResult.remaining,
          dailyLimit: rateLimitResult.limit,
        };
      } catch (error) {
        console.error(`Instagram Reel scrape failed for user ${userId}:`, error);
        const httpsError = new HttpsError(error.code || 'internal', error.message);
        if (jobId) {
          await failImportJob(jobId, httpsError, {steps, source: {type: 'instagram', url}, authorId: authorId || userId});
        }
        throw httpsError;
      }
    },
);

/**
 * Cloud Function: Fetch Recipe HTML
 * Fetches the raw HTML of a given URL server-side to bypass CORS restrictions.
 * Uses a simple HTTP GET request (no Puppeteer) so that structured data like
 * JSON-LD and visible page text can be extracted on the client.
 *
 * Input data:
 * - url: The URL to fetch
 *
 * Returns: { html: string } — raw HTML content (max 500 KB)
 */
exports.fetchRecipeHtml = onCall(
    {
      maxInstances: 10,
      memory: '256MiB',
      timeoutSeconds: 30,
      cors: ALLOWED_ORIGINS,
      invoker: 'public',
    },
    async (request) => {
      const {url} = request.data;

      // Authentication check
      const auth = request.auth;
      if (!auth) {
        throw new HttpsError(
            'unauthenticated',
            'You must be logged in to use web import',
        );
      }

      const userId = auth.uid;
      const isAuthenticated = auth.token.firebase?.sign_in_provider !== 'anonymous';
      const isAdmin = auth.token.admin === true;
      const isModerator = !isAdmin && await isModeratorUser(userId);

      // Validate URL (includes SSRF guard for private/internal hosts)
      if (!url || typeof url !== 'string') {
        throw new HttpsError('invalid-argument', 'URL must be a non-empty string');
      }
      assertPublicUrl(url);

      // Rate limiting (shared with other AI endpoints)
      const rateLimitResult = await checkRateLimit(userId, isAuthenticated, isAdmin, isModerator);
      if (!rateLimitResult.allowed) {
        const limit = getRateLimit(isAdmin, isAuthenticated, isModerator);
        throw new HttpsError(
            'resource-exhausted',
            `Rate limit exceeded: maximum ${limit} requests per day`,
        );
      }

      console.log(`fetchRecipeHtml request from user ${userId} for URL: ${url}`);

      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
            'Cache-Control': 'max-age=0',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(20000),
        });

        if (!response.ok) {
          throw new HttpsError(
              'internal',
              `Failed to fetch URL: HTTP ${response.status}`,
          );
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
          throw new HttpsError(
              'invalid-argument',
              'URL does not return an HTML page',
          );
        }

        const html = await response.text();
        // Use a larger limit for raw HTML fetch so JSON-LD scripts near the bottom
        // of large pages (e.g. heavy Next.js sites like lecker.de) are not truncated.
        return {html: html.slice(0, MAX_FETCH_HTML_SIZE)};
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error(`fetchRecipeHtml failed for user ${userId}:`, error);
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
          throw new HttpsError('deadline-exceeded', 'Website took too long to respond');
        }
        throw new HttpsError('internal', 'Failed to fetch page HTML: ' + error.message);
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
      cors: ALLOWED_ORIGINS,
      invoker: 'public',
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
      const isModerator = !isAdmin && await isModeratorUser(userId);

      console.log(`Screenshot request from user ${userId} for URL: ${url}`);

      // Validate URL first (before rate limiting), includes SSRF guard
      if (!url || typeof url !== 'string') {
        throw new HttpsError('invalid-argument', 'URL must be a non-empty string');
      }
      assertPublicUrl(url);

      // Rate limiting
      const rateLimitResult = await checkRateLimit(userId, isAuthenticated, isAdmin, isModerator);
      if (!rateLimitResult.allowed) {
        const limit = getRateLimit(isAdmin, isAuthenticated, isModerator);
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
            '--disable-blink-features=AutomationControlled',
          ]),
          defaultViewport: chromium.defaultViewport,
          executablePath: await chromium.executablePath(),
          headless: chromium.headless,
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // Hide automation fingerprint before any page scripts run
        await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'webdriver', {get: () => false});
        });

        // Set a realistic browser User-Agent to avoid bot detection
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Set language header to avoid redirects on locale-sensitive sites
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'de-DE,de;q=0.9' });

        // Navigate to the URL – use 'domcontentloaded' instead of 'networkidle0'
        // because heavy sites (tracking, ads, lazy-loading) never reach networkidle0
        try {
          await page.goto(url, { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
          });
        } catch (navError) {
          // Continue even if navigation times out – page is likely usable
          console.warn(`Navigation warning for ${url}:`, navError.message);
        }

        // Wait a bit for dynamic content to render
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Dismiss cookie/DSGVO consent banner if present
        // First try the Usercentrics JavaScript API (works even with shadow DOM)
        try {
          await page.evaluate(() => {
            if (window.UC_UI && typeof window.UC_UI.acceptAllConsents === 'function') {
              window.UC_UI.acceptAllConsents();
            }
          });
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (ucErr) {
          console.warn(`UC_UI consent API failed for ${url}:`, ucErr?.message);
        }

        // Then try CSS selectors for other CMPs and Usercentrics shadow DOM
        const cookieSelectors = [
          'button[data-testid="uc-accept-all-button"]',           // Usercentrics (regular DOM)
          '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', // Cookiebot
          '.borlabs-cookie-btn-accept-all',                         // Borlabs Cookie
          'button[id*="accept"][id*="cookie"]',                     // Generic
          'button[class*="accept-all"]',                            // Generic
          'a.cmplz-btn.cmplz-accept',                              // Complianz
        ];
        for (const selector of cookieSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 800 });
            await page.click(selector);
            await new Promise((resolve) => setTimeout(resolve, 500));
            break;
          } catch (_) {
            // Selector not found – try next
          }
        }

        // Usercentrics v3 renders inside a shadow root – try piercing it
        try {
          await page.evaluate(() => {
            const host = document.querySelector('#usercentrics-root');
            if (host && host.shadowRoot) {
              const btn = host.shadowRoot.querySelector('button[data-testid="uc-accept-all-button"]');
              if (btn) btn.click();
            }
          });
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (_) {
          // Shadow root access failed or element not present
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

        // Take screenshot – try full-page first, fall back to viewport if it fails
        // (fullPage can cause memory/crash issues on pages with infinite scroll)
        let screenshot;
        try {
          screenshot = await page.screenshot({ 
            encoding: 'base64',
            fullPage: true,
            type: 'jpeg',
            quality: 80,
          });
        } catch (fullPageErr) {
          console.warn(`fullPage screenshot failed for ${url}, falling back to viewport:`, fullPageErr.message);
          screenshot = await page.screenshot({ 
            encoding: 'base64',
            fullPage: false,
            type: 'jpeg',
            quality: 80,
          });
        }

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

// ─── Hybrid Import Architecture ───────────────────────────────────────────────
// Shared server-side helpers and the consolidated import pipeline that powers
// both importRecipeCallable (web app) and importRecipeShortcut (Apple Shortcut).

/**
 * @param {*} type - A JSON-LD `@type` value (string or array of strings).
 * @returns {boolean} True if the type is (or includes) "Recipe".
 */
function isRecipeType(type) {
  return type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
}

/**
 * @param {Object} node - Candidate JSON-LD node.
 * @returns {boolean} True if the node has enough content to be usable.
 */
function hasUsableRecipeContent(node) {
  if (!node) return false;
  const hasIngredients =
    Array.isArray(node.recipeIngredient) && node.recipeIngredient.length > 0;
  const hasInstructions =
    Array.isArray(node.recipeInstructions) && node.recipeInstructions.length > 0;
  return hasIngredients || hasInstructions;
}

/**
 * Extract the first Schema.org Recipe JSON-LD candidate from raw HTML.
 * Node-safe regex alternative to the browser-side findJsonLdRecipeCandidate.
 * Handles both a bare Recipe node and one wrapped in `@graph` and/or nested
 * under a WebPage's `mainEntity` (a common pattern on recipe blogs).
 *
 * @param {string} html
 * @returns {Object|null}
 */
function extractJsonLdRecipeCandidateFromHtml(html) {
  const scriptPattern =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptPattern.exec(html)) !== null) {
    let json;
    try {
      json = JSON.parse(match[1]);
    } catch {
      continue;
    }
    const roots = Array.isArray(json) ? json : [json];
    const candidates = [];
    for (const node of roots) {
      if (node && Array.isArray(node['@graph'])) {
        candidates.push(...node['@graph']);
      } else if (node) {
        candidates.push(node);
      }
    }
    for (const candidate of candidates) {
      const nodesToCheck = [candidate];
      if (candidate && candidate.mainEntity) {
        const mainEntity = candidate.mainEntity;
        nodesToCheck.push(...(Array.isArray(mainEntity) ? mainEntity : [mainEntity]));
      }
      for (const node of nodesToCheck) {
        if (!node || !isRecipeType(node['@type'])) continue;
        if (!hasUsableRecipeContent(node)) continue;
        return node;
      }
    }
  }
  return null;
}

/**
 * Read a Schema.org microdata `itemprop` element's effective value: the
 * `content` attribute when present (used on `<meta>` and often duplicated
 * elsewhere for machine-readable values), the `datetime` attribute for
 * `<time>` elements (e.g. ISO-8601 durations), the `src` for `<img>`, and
 * otherwise the element's trimmed text content.
 *
 * @param {import('cheerio').Cheerio<any>} $el
 * @returns {string}
 */
function microdataPropValue($el) {
  const tagName = ($el.get(0)?.tagName || '').toLowerCase();
  if (tagName === 'meta') return ($el.attr('content') || '').trim();
  if (tagName === 'time') {
    return ($el.attr('datetime') || $el.attr('content') || $el.text()).trim();
  }
  if (tagName === 'img') return ($el.attr('src') || $el.attr('content') || '').trim();
  if ($el.attr('content') !== undefined) return ($el.attr('content') || '').trim();
  return $el.text().trim();
}

/**
 * Find elements with `[itemprop="name"]` inside `$root` that belong directly
 * to it (skipping any that fall inside a nested `[itemscope]`, e.g. an
 * author, rating or nutrition sub-object, so a Recipe's own `name` isn't
 * confused with the `name` of its author or of an ingredient sub-item).
 *
 * @param {import('cheerio').CheerioAPI} $
 * @param {import('cheerio').Cheerio<any>} $root
 * @param {string} propName
 * @returns {import('cheerio').Cheerio<any>[]}
 */
function directItemProps($, $root, propName) {
  const results = [];
  $root.find(`[itemprop="${propName}"]`).each((_, el) => {
    const $el = $(el);
    let belongsToRoot = true;
    $el.parentsUntil($root).each((__, ancestor) => {
      if ($(ancestor).attr('itemscope') !== undefined) belongsToRoot = false;
    });
    if (belongsToRoot) results.push($el);
  });
  return results;
}

/**
 * Extract `recipeInstructions` from a microdata Recipe root, supporting both
 * plain text list items (`<li itemprop="recipeInstructions">…</li>`, common
 * on WordPress recipe plugins) and nested HowToStep items
 * (`<div itemprop="recipeInstructions" itemscope itemtype=".../HowToStep">`).
 *
 * @param {import('cheerio').CheerioAPI} $
 * @param {import('cheerio').Cheerio<any>} $root
 * @returns {string[]}
 */
function extractMicrodataInstructions($, $root) {
  const steps = [];
  for (const $el of directItemProps($, $root, 'recipeInstructions')) {
    if ($el.attr('itemscope') !== undefined) {
      const textEls = directItemProps($, $el, 'text');
      const nameEls = directItemProps($, $el, 'name');
      const text =
        (textEls[0] && microdataPropValue(textEls[0])) ||
        (nameEls[0] && microdataPropValue(nameEls[0])) ||
        $el.text().trim();
      if (text) steps.push(text);
    } else {
      const text = microdataPropValue($el);
      if (text) steps.push(text);
    }
  }
  return steps;
}

/**
 * Extract a Schema.org Recipe candidate from HTML microdata
 * (`itemscope`/`itemtype`/`itemprop` attributes), for sites that mark up
 * recipes without JSON-LD. Returns the same node shape as
 * {@link extractJsonLdRecipeCandidateFromHtml} so it can be fed through the
 * same `jsonLdCandidateToText` conversion and Gemini normalization step.
 *
 * @param {string} html
 * @returns {Object|null}
 */
function extractMicrodataRecipeCandidateFromHtml(html) {
  let $;
  try {
    $ = cheerio.load(html);
  } catch {
    return null;
  }
  const $root = $('[itemscope][itemtype]')
      .filter((_, el) => /schema\.org\/Recipe\/?$/i.test(($(el).attr('itemtype') || '').trim()))
      .first();
  if (!$root.length) return null;

  const propValue = (name) => {
    const els = directItemProps($, $root, name);
    return els[0] ? microdataPropValue(els[0]) : undefined;
  };
  const propValueList = (name) => {
    const list = directItemProps($, $root, name).map(microdataPropValue).filter(Boolean);
    // Return undefined (not []) when absent, matching the JSON-LD candidate
    // shape: jsonLdCandidateToText treats a present-but-empty array as truthy
    // and would otherwise emit a blank "Küche:"/"Kategorie:" line.
    return list.length ? list : undefined;
  };

  const candidate = {
    '@type': 'Recipe',
    name: propValue('name'),
    description: propValue('description'),
    recipeYield: propValue('recipeYield'),
    prepTime: propValue('prepTime'),
    cookTime: propValue('cookTime'),
    totalTime: propValue('totalTime'),
    recipeCuisine: propValueList('recipeCuisine'),
    recipeCategory: propValueList('recipeCategory'),
    recipeIngredient: propValueList('recipeIngredient'),
    recipeInstructions: extractMicrodataInstructions($, $root),
  };
  return hasUsableRecipeContent(candidate) ? candidate : null;
}

/**
 * Convert a Schema.org Recipe JSON-LD object to human-readable text.
 * Server-side equivalent of the browser-side jsonLdToText function.
 *
 * @param {Object} candidate
 * @returns {string}
 */
function jsonLdCandidateToText(candidate) {
  let text = `Rezept: ${candidate.name || ''}\n\n`;
  if (candidate.recipeYield) {
    const yieldVal = Array.isArray(candidate.recipeYield)
      ? candidate.recipeYield[0]
      : candidate.recipeYield;
    text += `Portionen: ${yieldVal}\n`;
  }
  if (candidate.prepTime) text += `Zubereitungszeit: ${candidate.prepTime}\n`;
  if (candidate.cookTime) text += `Kochzeit: ${candidate.cookTime}\n`;
  if (candidate.totalTime) text += `Gesamtzeit: ${candidate.totalTime}\n`;
  if (candidate.recipeCuisine) {
    const cuisine = Array.isArray(candidate.recipeCuisine)
      ? candidate.recipeCuisine.join(', ')
      : candidate.recipeCuisine;
    text += `Küche: ${cuisine}\n`;
  }
  if (candidate.recipeCategory) {
    const category = Array.isArray(candidate.recipeCategory)
      ? candidate.recipeCategory.join(', ')
      : candidate.recipeCategory;
    text += `Kategorie: ${category}\n`;
  }
  text += '\nZutaten:\n';
  for (const ingredient of candidate.recipeIngredient || []) {
    text += `- ${ingredient}\n`;
  }
  text += '\nZubereitung:\n';
  const instructions = Array.isArray(candidate.recipeInstructions)
    ? candidate.recipeInstructions
    : [];
  for (const step of instructions) {
    if (typeof step === 'string') {
      text += `- ${step}\n`;
    } else if (
      step['@type'] === 'HowToSection' &&
      Array.isArray(step.itemListElement)
    ) {
      for (const s of step.itemListElement) {
        const sText =
          s['@type'] === 'HowToStep' ? s.text || s.name || '' : '';
        if (sText) text += `- ${sText}\n`;
      }
    } else {
      const stepText = step.text || step.name || '';
      if (stepText) text += `- ${stepText}\n`;
    }
  }
  if (candidate.description) {
    text += `\nBeschreibung: ${candidate.description}\n`;
  }
  return text;
}

/**
 * Strip HTML tags and decode common entities (Node-safe, no DOMParser).
 * The tag-removal passes run first so that the entity-decoding step only
 * operates on surviving text content and cannot be confused by entity-encoded
 * tag characters.
 *
 * @param {string} html
 * @returns {string} Plain text (max 80,000 chars)
 */
function extractPlainTextFromHtml(html) {
  return html
    // Remove block-level non-content elements including all whitespace before
    // the closing tag to handle variants like </script > or </script\n> (CodeQL js/bad-tag-filter)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg[^>]*>/gi, ' ')
    // Strip remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode a safe, bounded set of HTML entities.
    // Named entities are replaced with a space rather than decoded to the
    // corresponding character so that decoded output can never re-introduce
    // characters that look like HTML markup (avoids double-unescaping).
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d{1,6};/g, ' ')
    .replace(/&[a-zA-Z]{2,32};/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 80000);
}

/**
 * Heuristic check for whether a phase-2/3 (JSON-LD or plain-text) result looks
 * like a genuinely complete recipe, or just a short SEO/social-preview teaser.
 *
 * Many JS-rendered sites (Next.js/React SPAs) only server-render a short
 * summary (title, og:description with a one/two-sentence teaser) in the raw
 * HTML returned by a plain `fetch()`; the full ingredient/step list is only
 * populated client-side after hydration. Gemini can still produce a
 * well-formed-looking recipe object from that teaser text (a title plus 2-3
 * steps), which would otherwise be returned immediately and short-circuit
 * the more thorough (and more expensive) screenshot/vision phase.
 *
 * @param {Object} result - Structured recipe data from callGeminiTextAPI
 * @param {string} sourceText - The text that was sent to Gemini for this phase
 * @returns {boolean} True when the result looks incomplete and the pipeline
 *   should fall through to the next phase instead of returning immediately.
 */
function looksLikeIncompleteRecipe(result, sourceText) {
  const stepsCount = Array.isArray(result?.steps) ? result.steps.length : 0;
  const ingredientsCount = Array.isArray(result?.ingredients) ? result.ingredients.length : 0;
  if (stepsCount === 0 && ingredientsCount === 0) return true;
  // A handful of steps extracted from very little source text is a strong
  // sign the fetched HTML only contained a short teaser, not the full recipe.
  return stepsCount < 4 && (sourceText?.length || 0) < 1200;
}

/**
 * Shared import pipeline: HTML fetch → JSON-LD → plain text → screenshot/vision.
 *
 * @param {string} url - Validated public URL to import from
 * @param {Object} opts
 * @param {string}   opts.apiKey         - Gemini API key value
 * @param {string[]|undefined} opts.cuisineTypes
 * @param {string[]|undefined} opts.mealCategories
 * @param {string}   [opts.source]       - 'callable' | 'shortcut' (for log context)
 * @param {string}   [opts.userId]       - User ID (for log context)
 * @returns {Promise<Object>} Structured recipe data (same shape as callGeminiTextAPI)
 */
async function runImportFromUrl(url, {apiKey, cuisineTypes, mealCategories, source = 'unknown', userId = 'unknown'} = {}) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url;
  }
  const startMs = Date.now();
  console.log(`[importRecipe:start] source=${source} user=${userId} host=${hostname}`);

  // ── Phase 1: Fetch HTML ──────────────────────────────────────────────────
  let html = null;
  try {
    console.log(`[importRecipe:fetch_html:start] host=${hostname}`);
    const fetchResponse = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,' +
          'image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
        'Cache-Control': 'max-age=0',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    if (fetchResponse.ok) {
      html = (await fetchResponse.text()).slice(0, MAX_FETCH_HTML_SIZE);
      console.log(
          `[importRecipe:fetch_html:ok] host=${hostname} ` +
          `size=${html.length} elapsed=${Date.now() - startMs}ms`,
      );
    } else {
      console.warn(
          `[importRecipe:fetch_html:fail] host=${hostname} ` +
          `status=${fetchResponse.status} elapsed=${Date.now() - startMs}ms`,
      );
    }
  } catch (fetchErr) {
    console.warn(
        `[importRecipe:fetch_html:error] host=${hostname} ` +
        `err=${fetchErr.message} elapsed=${Date.now() - startMs}ms`,
    );
  }

  // Best result seen so far from a phase that looked incomplete (e.g. a
  // short SEO teaser on a JS-rendered page). Kept as a last-resort fallback
  // in case the more thorough screenshot phase below fails outright.
  let bestPartialResult = null;
  const partialStepsCount = (r) => (Array.isArray(r?.steps) ? r.steps.length : 0);

  if (html) {
    // ── Phase 2: JSON-LD extraction ────────────────────────────────────────
    try {
      console.log(`[importRecipe:jsonld:start] host=${hostname}`);
      const candidate = extractJsonLdRecipeCandidateFromHtml(html);
      if (candidate) {
        console.log(`[importRecipe:jsonld:found] host=${hostname}`);
        const jsonLdText = jsonLdCandidateToText(candidate);
        try {
          const result = await callGeminiTextAPI(
              jsonLdText, 'de', apiKey, cuisineTypes, mealCategories,
          );
          if (looksLikeIncompleteRecipe(result, jsonLdText)) {
            console.warn(
                `[importRecipe:jsonld:incomplete] host=${hostname} ` +
                `steps=${partialStepsCount(result)} – trying next phase`,
            );
            bestPartialResult = result;
          } else {
            console.log(
                `[importRecipe:jsonld:ai_ok] host=${hostname} ` +
                `elapsed=${Date.now() - startMs}ms`,
            );
            return result;
          }
        } catch (aiErr) {
          console.warn(
              `[importRecipe:jsonld:ai_fail] host=${hostname} ` +
              `err=${aiErr.message}`,
          );
        }
      } else {
        console.log(`[importRecipe:jsonld:not_found] host=${hostname}`);
      }
    } catch (jsonLdErr) {
      console.warn(
          `[importRecipe:jsonld:error] host=${hostname} ` +
          `err=${jsonLdErr.message}`,
      );
    }

    // ── Phase 2b: Microdata extraction ────────────────────────────────────
    // Fallback for sites (often WordPress recipe plugins) that mark up
    // recipes with itemscope/itemprop microdata instead of JSON-LD. Feeds
    // through the same jsonLdCandidateToText → Gemini normalization step as
    // Phase 2, so no app-specific normalization behavior changes.
    try {
      console.log(`[importRecipe:microdata:start] host=${hostname}`);
      const candidate = extractMicrodataRecipeCandidateFromHtml(html);
      if (candidate) {
        console.log(`[importRecipe:microdata:found] host=${hostname}`);
        const microdataText = jsonLdCandidateToText(candidate);
        try {
          const result = await callGeminiTextAPI(
              microdataText, 'de', apiKey, cuisineTypes, mealCategories,
          );
          if (looksLikeIncompleteRecipe(result, microdataText)) {
            console.warn(
                `[importRecipe:microdata:incomplete] host=${hostname} ` +
                `steps=${partialStepsCount(result)} – trying next phase`,
            );
            if (partialStepsCount(result) > partialStepsCount(bestPartialResult)) {
              bestPartialResult = result;
            }
          } else {
            console.log(
                `[importRecipe:microdata:ai_ok] host=${hostname} ` +
                `elapsed=${Date.now() - startMs}ms`,
            );
            return result;
          }
        } catch (aiErr) {
          console.warn(
              `[importRecipe:microdata:ai_fail] host=${hostname} ` +
              `err=${aiErr.message}`,
          );
        }
      } else {
        console.log(`[importRecipe:microdata:not_found] host=${hostname}`);
      }
    } catch (microdataErr) {
      console.warn(
          `[importRecipe:microdata:error] host=${hostname} ` +
          `err=${microdataErr.message}`,
      );
    }

    // ── Phase 3: Plain text extraction ────────────────────────────────────
    try {
      console.log(`[importRecipe:text:start] host=${hostname}`);
      const plainText = extractPlainTextFromHtml(html);
      if (plainText && plainText.trim()) {
        const result = await callGeminiTextAPI(
            plainText, 'de', apiKey, cuisineTypes, mealCategories,
        );
        if (looksLikeIncompleteRecipe(result, plainText)) {
          console.warn(
              `[importRecipe:text:incomplete] host=${hostname} ` +
              `steps=${partialStepsCount(result)} – trying next phase`,
          );
          if (partialStepsCount(result) > partialStepsCount(bestPartialResult)) {
            bestPartialResult = result;
          }
        } else {
          console.log(
              `[importRecipe:text:ok] host=${hostname} ` +
              `elapsed=${Date.now() - startMs}ms`,
          );
          return result;
        }
      }
    } catch (textErr) {
      console.warn(
          `[importRecipe:text:error] host=${hostname} ` +
          `err=${textErr.message}`,
      );
    }
  }

  // ── Phase 4: Screenshot + Gemini Vision fallback ──────────────────────────
  console.log(`[importRecipe:screenshot:start] host=${hostname}`);
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
        '--disable-blink-features=AutomationControlled',
      ]),
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setViewport({width: 1280, height: 800});
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {get: () => false});
    });
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );
    await page.setExtraHTTPHeaders({'Accept-Language': 'de-DE,de;q=0.9'});

    try {
      await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 30000});
    } catch (navError) {
      console.warn(`[importRecipe:screenshot:nav_warn] host=${hostname}: ${navError.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Dismiss consent banners (Usercentrics JS API)
    try {
      await page.evaluate(() => {
        if (window.UC_UI && typeof window.UC_UI.acceptAllConsents === 'function') {
          window.UC_UI.acceptAllConsents();
        }
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      console.log(`[importRecipe:consent:uc_api] host=${hostname}`);
    } catch (_) {
      // ignore
    }

    // CSS selector consent dismissal
    const cookieSelectors = [
      'button[data-testid="uc-accept-all-button"]',
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
      '.borlabs-cookie-btn-accept-all',
      'button[id*="accept"][id*="cookie"]',
      'button[class*="accept-all"]',
      'a.cmplz-btn.cmplz-accept',
    ];
    for (const selector of cookieSelectors) {
      try {
        await page.waitForSelector(selector, {timeout: 800});
        await page.click(selector);
        await new Promise((resolve) => setTimeout(resolve, 500));
        console.log(`[importRecipe:consent:selector] host=${hostname} sel=${selector}`);
        break;
      } catch (_) {
        // try next
      }
    }

    // Usercentrics shadow DOM
    try {
      await page.evaluate(() => {
        const host = document.querySelector('#usercentrics-root');
        if (host && host.shadowRoot) {
          const btn = host.shadowRoot.querySelector(
              'button[data-testid="uc-accept-all-button"]',
          );
          if (btn) btn.click();
        }
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (_) {
      // ignore
    }

    // Scroll to fragment if present
    try {
      const urlObj = new URL(url);
      if (urlObj.hash) {
        hasFragment = true;
        fragmentHash = urlObj.hash;
        const elementId = urlObj.hash.substring(1);
        const scrollSuccess = await page.evaluate((id) => {
          const el =
            document.getElementById(id) ||
            document.querySelector(`[name="${id}"]`);
          if (el) {
            el.scrollIntoView({behavior: 'auto', block: 'start'});
            return true;
          }
          return false;
        }, elementId);
        if (!scrollSuccess) {
          console.warn(
              `[importRecipe:screenshot:fragment_miss] ` +
              `host=${hostname} id=${elementId} – falling back to full-page`,
          );
          hasFragment = false;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (_) {
      // ignore
    }

    try {
      await page.waitForSelector('h1', {timeout: 3000});
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (_) {
      // no h1 – proceed anyway
    }

    // Determine page height to decide between a single full-page screenshot
    // and a tiled scroll capture. Very long single-scroll recipe pages (e.g.
    // cook-mode layouts with one photo per step) lose legibility once
    // stitched into one tall image and downscaled by Gemini Vision, so only
    // the top of the page (the first couple of steps) ends up recognized.
    const viewportHeight = 800;
    let pageHeight = viewportHeight;
    try {
      pageHeight = await page.evaluate(() =>
        Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
      );
    } catch (_) {
      // ignore – fall back to single-viewport height
    }

    const TILE_SCROLL_RATIO = 0.9; // slight overlap between tiles
    const MAX_TILES = 8;
    const screenshots = [];

    if (pageHeight > viewportHeight * 1.5) {
      console.log(
          `[importRecipe:screenshot:tiling] host=${hostname} ` +
          `pageHeight=${pageHeight} viewportHeight=${viewportHeight}`,
      );
      const scrollStep = Math.round(viewportHeight * TILE_SCROLL_RATIO);
      let scrollY = 0;
      while (screenshots.length < MAX_TILES) {
        try {
          await page.evaluate((y) => window.scrollTo(0, y), scrollY);
        } catch (_) {
          break;
        }
        // Let lazy-loaded images/content at the new scroll position render
        await new Promise((resolve) => setTimeout(resolve, 500));
        try {
          screenshots.push(await page.screenshot({
            encoding: 'base64',
            fullPage: false,
            type: 'jpeg',
            quality: 80,
          }));
        } catch (tileErr) {
          console.warn(
              `[importRecipe:screenshot:tile_fail] host=${hostname}: ${tileErr.message}`,
          );
          break;
        }
        if (scrollY + viewportHeight >= pageHeight) break;
        scrollY += scrollStep;
      }
    }

    if (screenshots.length === 0) {
      // Single-viewport page (or tiling failed) – full-page → viewport fallback
      try {
        screenshots.push(await page.screenshot({
          encoding: 'base64',
          fullPage: true,
          type: 'jpeg',
          quality: 80,
        }));
      } catch (fullPageErr) {
        console.warn(
            `[importRecipe:screenshot:fullpage_fallback] ` +
            `host=${hostname}: ${fullPageErr.message}`,
        );
        screenshots.push(await page.screenshot({
          encoding: 'base64',
          fullPage: false,
          type: 'jpeg',
          quality: 80,
        }));
      }
    }

    await browser.close();
    console.log(
        `[importRecipe:screenshot:ok] host=${hostname} tiles=${screenshots.length} ` +
        `elapsed=${Date.now() - startMs}ms`,
    );

    // Gemini Vision API – one call for a single screenshot, or one call per
    // tile (merged the same way multi-photo Foto-Scan imports are merged)
    // for a tiled scroll capture.
    if (screenshots.length === 1) {
      const {mimeType: _mime, base64Data} = validateImageData(
          `data:image/jpeg;base64,${screenshots[0]}`,
      );
      const result = await callGeminiAPI(
          base64Data, 'image/jpeg', 'de', apiKey, cuisineTypes, mealCategories,
      );
      console.log(
          `[importRecipe:vision:ok] host=${hostname} ` +
          `elapsed=${Date.now() - startMs}ms`,
      );
      return result;
    }

    const tileResults = new Array(screenshots.length);
    let nextTileIndex = 0;
    const tileWorker = async () => {
      while (nextTileIndex < screenshots.length) {
        const idx = nextTileIndex++;
        try {
          const {mimeType: _m, base64Data} = validateImageData(
              `data:image/jpeg;base64,${screenshots[idx]}`,
          );
          tileResults[idx] = await callGeminiAPI(
              base64Data, 'image/jpeg', 'de', apiKey, cuisineTypes, mealCategories,
          );
        } catch (tileErr) {
          tileResults[idx] = {error: tileErr.message};
        }
      }
    };
    const tileWorkerCount = Math.min(BATCH_IMAGE_CONCURRENCY, screenshots.length);
    await Promise.all(Array.from({length: tileWorkerCount}, tileWorker));

    const result = mergePhotoAiResultsServer(tileResults);
    console.log(
        `[importRecipe:vision:tiled_ok] host=${hostname} tiles=${screenshots.length} ` +
        `elapsed=${Date.now() - startMs}ms`,
    );
    return result;
  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch (_) {
        // ignore close error
      }
    }
    console.error(
        `[importRecipe:screenshot:fail] host=${hostname} ` +
        `err=${error.message} elapsed=${Date.now() - startMs}ms`,
    );

    // The screenshot/vision phase failed outright (navigation error, no
    // Gemini result on any tile, etc.) – rather than failing the whole
    // import, fall back to the incomplete-but-non-empty result an earlier
    // phase produced, if any. A partial recipe beats no recipe.
    if (bestPartialResult) {
      console.warn(
          `[importRecipe:fallback_to_partial] host=${hostname} ` +
          `steps=${partialStepsCount(bestPartialResult)}`,
      );
      return bestPartialResult;
    }

    const context = hasFragment ? ` (fragment: ${fragmentHash})` : '';
    if (error instanceof HttpsError) throw error;
    if (error.message && error.message.includes('timeout')) {
      throw new HttpsError(
          'deadline-exceeded',
          `Website took too long to load${context}`,
      );
    }
    throw new HttpsError(
        'internal',
        `Import failed after all phases${context}: ${error.message}`,
    );
  }
}

/**
 * Cloud Function: importRecipeCallable
 * Web-app callable that runs the full import pipeline server-side and returns
 * structured recipe data. Replaces separate fetchRecipeHtml + screenshot calls
 * from the browser.
 *
 * Input data:
 * - url {string}            Required – public recipe URL
 * - cuisineTypes {string[]} Optional – configured cuisine type list
 * - mealCategories {string[]} Optional – configured meal category list
 *
 * Returns: Structured recipe data (title, ingredients, steps, …)
 */
exports.importRecipeCallable = onCall(
    {
      secrets: [geminiApiKey],
      maxInstances: 10,
      memory: '2GiB',
      timeoutSeconds: 120,
      cors: ALLOWED_ORIGINS,
      invoker: 'public',
    },
    async (request) => {
      const {url, cuisineTypes, mealCategories, jobId, authorId} = request.data;

      const auth = request.auth;
      if (!auth) {
        throw new HttpsError(
            'unauthenticated',
            'You must be logged in to use web import',
        );
      }

      const userId = auth.uid;
      const isAuthenticated =
        auth.token.firebase?.sign_in_provider !== 'anonymous';
      const isAdmin = auth.token.admin === true;
      const isModerator = !isAdmin && await isModeratorUser(userId);

      if (!url || typeof url !== 'string') {
        throw new HttpsError('invalid-argument', 'URL must be a non-empty string');
      }
      assertPublicUrl(url);

      const rateLimitResult = await checkRateLimit(userId, isAuthenticated, isAdmin, isModerator);
      if (!rateLimitResult.allowed) {
        const limit = getRateLimit(isAdmin, isAuthenticated, isModerator);
        throw new HttpsError(
            'resource-exhausted',
            `Rate limit exceeded: maximum ${limit} requests per day`,
        );
      }

      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        throw new HttpsError(
            'failed-precondition',
            'AI service not configured. Please contact administrator.',
        );
      }

      try {
        const result = await runImportFromUrl(url, {
          apiKey,
          cuisineTypes,
          mealCategories,
          source: 'callable',
          userId,
        });
        if (jobId) await finalizeImportJob(jobId, authorId || userId, result);
        return result;
      } catch (error) {
        if (error instanceof HttpsError) {
          if (jobId) await failImportJob(jobId, error);
          throw error;
        }
        console.error(`importRecipeCallable failed for user ${userId}:`, error);
        const internalError = new HttpsError('internal', 'Import failed: ' + error.message);
        if (jobId) await failImportJob(jobId, internalError);
        throw internalError;
      }
    },
);

/**
 * Cloud Function: importRecipeShortcut
 * HTTP endpoint for Apple Shortcut deep-link imports.
 * Authenticates via SHORTCUT_API_KEY (same mechanism as addRecipeViaAPI).
 *
 * POST /importRecipeShortcut
 *
 * Headers:
 *   X-Api-Key:    <SHORTCUT_API_KEY secret>
 *   X-User-Email: <registrierte E-Mail-Adresse des Users>
 *   Content-Type: application/json
 *
 * Body (JSON):
 *   url {string}            Required – public recipe URL to import
 *   pin {string}            Required, wenn der Zielnutzer einen Webimport-PIN
 *                            eingerichtet hat (sonst nicht erforderlich) –
 *                            siehe requireShortcutPin in webImportPin.js
 *   cuisineTypes {string[]} Optional – cuisine type list for AI prompt
 *   mealCategories {string[]} Optional – meal category list for AI prompt
 *
 * Returns:
 *   200 { success: true, recipe: <structured recipe data> }
 *   400/401/403/429/500 { success: false, error: string }
 */
exports.importRecipeShortcut = onRequest(
    {
      maxInstances: 10,
      memory: '2GiB',
      timeoutSeconds: 120,
      secrets: [geminiApiKey, shortcutApiKey],
      invoker: 'public',
    },
    async (req, res) => {
      // CORS – browsers hitting this from ALLOWED_ORIGINS get the header;
      // native Apple Shortcut calls have no Origin header and are unaffected.
      const origin = req.headers.origin;
      if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.set(
            'Access-Control-Allow-Headers',
            'Content-Type, X-Api-Key, X-User-Email',
        );
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

      // Authentication via SHORTCUT_API_KEY + user email
      const apiKeyHeader = req.headers['x-api-key'];
      const userEmail = req.headers['x-user-email'];

      if (!apiKeyHeader || !userEmail) {
        res.status(401).json({
          success: false,
          error: 'Missing authentication headers',
          requiredHeaders: ['X-Api-Key', 'X-User-Email'],
        });
        return;
      }

      const validApiKey = shortcutApiKey.value();
      if (!validApiKey) {
        console.error('importRecipeShortcut: SHORTCUT_API_KEY secret is not set');
        res.status(500).json({
          success: false,
          error: 'Server misconfiguration: SHORTCUT_API_KEY secret is not set',
        });
        return;
      }

      let isValidKey = false;
      try {
        isValidKey = crypto.timingSafeEqual(
            Buffer.from(apiKeyHeader),
            Buffer.from(validApiKey),
        );
      } catch (_) {
        isValidKey = false;
      }
      if (!isValidKey) {
        console.warn('importRecipeShortcut: invalid API key attempt');
        res.status(401).json({success: false, error: 'Invalid API key'});
        return;
      }

      // Resolve the email to a Firebase uid, then validate role in Firestore
      const userId = await resolveShortcutUserId(userEmail);
      const db = admin.firestore();
      try {
        const userDoc = userId ? await db.collection('users').doc(userId).get() : null;
        if (!userId || !userDoc.exists) {
          res.status(403).json({success: false, error: 'Access denied'});
          return;
        }
        const userData = userDoc.data();
        const role = userData?.role;
        const isShortcutUser = userData?.isShortcutUser === true;
        if (role !== 'edit' && role !== 'admin' && role !== 'moderator' && !isShortcutUser) {
          res.status(403).json({success: false, error: 'Insufficient permissions'});
          return;
        }
      } catch (err) {
        console.error('importRecipeShortcut: error validating user:', err);
        res.status(500).json({success: false, error: 'Failed to validate user'});
        return;
      }

      // Parse JSON body
      let body = req.body;
      if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
        try {
          const raw = req.rawBody;
          if (raw) body = JSON.parse(raw.toString('utf8'));
        } catch (_) {
          res.status(400).json({success: false, error: 'Invalid JSON body'});
          return;
        }
      }

      const {url, pin} = body || {};
      if (!url || typeof url !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Missing required field: url (string)',
        });
        return;
      }

      // Webimport-PIN: no-op if the target user never set one; otherwise the
      // Shortcut must send a matching `pin` field with every request (it has
      // no interactive session to stay "unlocked" like the in-app modals).
      try {
        await requireShortcutPin(userId, pin);
      } catch (pinErr) {
        const status = pinErr.code === 'resource-exhausted' ? 429 :
          pinErr.code === 'invalid-argument' ? 400 : 403;
        res.status(status).json({success: false, error: pinErr.message || 'PIN erforderlich.'});
        return;
      }

      // SSRF guard
      try {
        assertPublicUrl(url);
      } catch (ssrfErr) {
        res.status(400).json({success: false, error: ssrfErr.message});
        return;
      }

      const geminiKey = geminiApiKey.value();
      if (!geminiKey) {
        res.status(500).json({
          success: false,
          error: 'AI service not configured. Please contact administrator.',
        });
        return;
      }

      console.log(`importRecipeShortcut: import queued by user ${userId} for URL: ${url}`);

      // Queue the job and respond immediately instead of running the whole
      // import (screenshot/JSON-LD + Gemini, ~10-20s) inline — a Shortcut's
      // HTTP call over a mobile connection has no business staying open that
      // long. processShortcutImportJob (a Firestore trigger, see above)
      // picks this up within seconds and finishes it server-side; the result
      // shows up in the app's normal import review queue like any other
      // import. cuisineTypes/mealCategories aren't persisted onto the job —
      // same tradeoff recoverStuckImportJobs already accepts for redriven
      // 'web' jobs (see runImportFromWebSource).
      try {
        const db = admin.firestore();
        const jobRef = db.collection('recipes').doc();
        await jobRef.set({
          title: 'Rezept-Import',
          authorId: userId,
          isTemp: true,
          importStatus: 'queued',
          importProgress: 0,
          importHeartbeatAt: Date.now(),
          importOrigin: 'shortcut',
          importSource: {type: 'web', url},
        });
        res.status(200).json({success: true, jobId: jobRef.id, status: 'queued'});
      } catch (err) {
        console.error(`importRecipeShortcut: failed to queue import for user ${userId}:`, err);
        res.status(500).json({success: false, error: 'Import konnte nicht in die Warteschlange gestellt werden.'});
      }
    },
);

/** Storage path prefix for Shortcut-uploaded Reel videos awaiting transcription. */
const VIDEO_IMPORT_STORAGE_PREFIX = 'pending-video-imports';

/**
 * Cloud Function: Issue a signed upload URL for a Shortcut-provided Reel
 * video (see APPLE_SHORTCUT_SETUP.md). This exists because Instagram's
 * anti-bot detection blocks our Puppeteer scraper (scrapeInstagramReel) from
 * a meaningful share of requests — a video the user already saved to their
 * own device sidesteps that entirely, at the cost of one extra manual step
 * (saving the video first). The video is uploaded straight to Storage via
 * the signed URL (never through this function's own request body) so a
 * multi-minute Reel doesn't run into Cloud Functions' ~32MB HTTP request
 * limit. processVideoImportUpload (Storage trigger, below) picks the file up
 * once the PUT completes and deletes it again once processing finishes.
 *
 * Input (POST JSON body): { pin, language? }
 * Returns: { success: true, jobId, uploadUrl } — uploadUrl accepts a single
 * PUT with Content-Type: video/mp4, valid for 10 minutes.
 */
exports.getVideoUploadUrl = onRequest(
    {
      maxInstances: 10,
      memory: '256MiB',
      timeoutSeconds: 30,
      secrets: [shortcutApiKey],
      invoker: 'public',
    },
    async (req, res) => {
      const origin = req.headers.origin;
      if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.set(
            'Access-Control-Allow-Headers',
            'Content-Type, X-Api-Key, X-User-Email',
        );
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

      const apiKeyHeader = req.headers['x-api-key'];
      const userEmail = req.headers['x-user-email'];
      if (!apiKeyHeader || !userEmail) {
        res.status(401).json({
          success: false,
          error: 'Missing authentication headers',
          requiredHeaders: ['X-Api-Key', 'X-User-Email'],
        });
        return;
      }

      const validApiKey = shortcutApiKey.value();
      if (!validApiKey) {
        console.error('getVideoUploadUrl: SHORTCUT_API_KEY secret is not set');
        res.status(500).json({
          success: false,
          error: 'Server misconfiguration: SHORTCUT_API_KEY secret is not set',
        });
        return;
      }

      let isValidKey = false;
      try {
        isValidKey = crypto.timingSafeEqual(
            Buffer.from(apiKeyHeader),
            Buffer.from(validApiKey),
        );
      } catch (_) {
        isValidKey = false;
      }
      if (!isValidKey) {
        console.warn('getVideoUploadUrl: invalid API key attempt');
        res.status(401).json({success: false, error: 'Invalid API key'});
        return;
      }

      const userId = await resolveShortcutUserId(userEmail);
      const db = admin.firestore();
      try {
        const userDoc = userId ? await db.collection('users').doc(userId).get() : null;
        if (!userId || !userDoc.exists) {
          res.status(403).json({success: false, error: 'Access denied'});
          return;
        }
        const userData = userDoc.data();
        const role = userData?.role;
        const isShortcutUser = userData?.isShortcutUser === true;
        if (role !== 'edit' && role !== 'admin' && role !== 'moderator' && !isShortcutUser) {
          res.status(403).json({success: false, error: 'Insufficient permissions'});
          return;
        }
      } catch (err) {
        console.error('getVideoUploadUrl: error validating user:', err);
        res.status(500).json({success: false, error: 'Failed to validate user'});
        return;
      }

      let body = req.body;
      if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
        try {
          const raw = req.rawBody;
          if (raw) body = JSON.parse(raw.toString('utf8'));
        } catch (_) {
          res.status(400).json({success: false, error: 'Invalid JSON body'});
          return;
        }
      }

      const {pin} = body || {};
      const language = ['de', 'en'].includes(body?.language) ? body.language : 'de';
      const caption = typeof body?.caption === 'string' ? body.caption.slice(0, 10000) : '';

      try {
        await requireShortcutPin(userId, pin);
      } catch (pinErr) {
        const status = pinErr.code === 'resource-exhausted' ? 429 :
          pinErr.code === 'invalid-argument' ? 400 : 403;
        res.status(status).json({success: false, error: pinErr.message || 'PIN erforderlich.'});
        return;
      }

      try {
        const jobRef = db.collection('recipes').doc();
        const storagePath = `${VIDEO_IMPORT_STORAGE_PREFIX}/${userId}/${jobRef.id}.mp4`;

        // importStatus is 'awaiting_upload', not 'queued' – processShortcutImportJob
        // (the Firestore trigger for the 'web' shortcut flow above) only acts on
        // importStatus:'queued' and would otherwise try to process this job before
        // any video has actually been uploaded. processVideoImportUpload picks it
        // up once the file lands in Storage instead.
        await jobRef.set({
          title: 'Rezept-Import',
          authorId: userId,
          isTemp: true,
          importStatus: 'awaiting_upload',
          importProgress: 0,
          importHeartbeatAt: Date.now(),
          importOrigin: 'shortcut',
          importSource: {type: 'video', storagePath, language, caption},
        });

        const bucket = admin.storage().bucket();
        const [uploadUrl] = await bucket.file(storagePath).getSignedUrl({
          version: 'v4',
          action: 'write',
          expires: Date.now() + 10 * 60 * 1000,
          contentType: 'video/mp4',
        });

        console.log(`getVideoUploadUrl: issued upload URL for user ${userId}, job ${jobRef.id}`);
        res.status(200).json({success: true, jobId: jobRef.id, uploadUrl});
      } catch (err) {
        console.error(`getVideoUploadUrl: failed to prepare upload for user ${userId}:`, err);
        res.status(500).json({success: false, error: 'Video-Upload konnte nicht vorbereitet werden.'});
      }
    },
);

/**
 * Storage trigger: processes a Reel video once a Shortcut finishes uploading
 * it to the signed URL from getVideoUploadUrl (path pending-video-imports/
 * {userId}/{jobId}.mp4). Transcribes it and runs the transcript through the
 * normal recipe-extraction step, then deletes the video from Storage
 * regardless of outcome — it has already served its purpose and shouldn't
 * linger (cost, and it's the user's personal upload).
 */
exports.processVideoImportUpload = onObjectFinalized(
    {
      region: 'us-central1',
      secrets: [geminiApiKey],
      memory: '512MiB',
      timeoutSeconds: 120,
    },
    async (event) => {
      const filePath = event.data.name;
      if (!filePath || !filePath.startsWith(`${VIDEO_IMPORT_STORAGE_PREFIX}/`)) {
        return;
      }

      const match = filePath.match(
          new RegExp(`^${VIDEO_IMPORT_STORAGE_PREFIX}/([^/]+)/([^/]+)\\.mp4$`),
      );
      if (!match) {
        console.warn(`processVideoImportUpload: unexpected path ${filePath}, ignoring`);
        return;
      }
      const [, userId, jobId] = match;

      const db = admin.firestore();
      const jobRef = db.collection('recipes').doc(jobId);
      const bucket = admin.storage().bucket(event.data.bucket);
      const file = bucket.file(filePath);

      const steps = [];
      let jobData = null;
      try {
        const jobSnap = await jobRef.get();
        if (!jobSnap.exists) {
          console.warn(`processVideoImportUpload: job ${jobId} not found, discarding upload`);
          return;
        }
        jobData = jobSnap.data();
        if (jobData.importStatus !== 'awaiting_upload' || jobData.authorId !== userId) {
          // Already processed (or redriven by recoverStuckImportJobs), or a
          // path/user mismatch – don't reprocess or clobber that outcome.
          return;
        }

        await jobRef.update({
          importStatus: 'processing',
          importHeartbeatAt: Date.now(),
          importAttempts: 1,
        });

        const apiKey = geminiApiKey.value();
        if (!apiKey) {
          const error = new Error('AI service not configured. Please contact administrator.');
          error.code = 'failed-precondition';
          throw error;
        }

        const language = jobData.importSource?.language || 'de';
        const caption = jobData.importSource?.caption || '';
        const result = await runImportFromVideoSource({storagePath: filePath, language, caption}, {apiKey, steps});
        await finalizeImportJobBackground(jobId, userId, result, {steps, source: {type: 'video', storagePath: filePath}});
      } catch (error) {
        console.error(`processVideoImportUpload: job ${jobId} failed`, error);
        await failImportJobBackground(
            jobId, userId, error,
            {steps, source: jobData?.importSource || {type: 'video', storagePath: filePath}},
        );
      } finally {
        await file.delete().catch((delErr) => {
          console.warn(`processVideoImportUpload: failed to delete ${filePath}:`, delErr.message || delErr);
        });
      }
    },
);

/**
 * Cloud Function: Synchronous Instagram Reel scrape for Shortcuts.
 *
 * importRecipeShortcut (above) deliberately queues and returns immediately —
 * its own comment explains why: "a Shortcut's HTTP call over a mobile
 * connection has no business staying open" for a 10-30s Puppeteer scrape.
 * This endpoint exists anyway because the Shortcut itself needs to know,
 * synchronously, whether the scrape actually found a recipe — so it can
 * branch to the video-upload fallback (getVideoUploadUrl) on failure instead
 * of silently landing an error in the review queue. That means holding the
 * Shortcut's connection open for the full scrape duration (~15-30s observed,
 * up to the 180s function timeout) is an intentional trade-off here, not an
 * oversight — accept the latency, or use importRecipeShortcut's queued flow
 * if that's not acceptable. Only handles Instagram URLs (use
 * importRecipeShortcut for generic recipe URLs).
 *
 * Input (POST JSON body): { url, pin, cuisineTypes?, mealCategories? }
 * Returns on success (HTTP 200): { success: true, recipeId }
 * Returns when the scrape ran but found nothing (HTTP 200, not an error
 * status — the request itself succeeded): { success: false, error,
 * loginWall: boolean } — loginWall:true means Instagram blocked the request;
 * the Shortcut should branch to the video-upload flow on any success:false,
 * loginWall is extra context if you want to branch more narrowly.
 */
exports.scrapeInstagramReelShortcut = onRequest(
    {
      maxInstances: 5,
      memory: '4GiB',
      timeoutSeconds: 180,
      secrets: [geminiApiKey, shortcutApiKey],
      invoker: 'public',
    },
    async (req, res) => {
      const origin = req.headers.origin;
      if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.set(
            'Access-Control-Allow-Headers',
            'Content-Type, X-Api-Key, X-User-Email',
        );
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

      const apiKeyHeader = req.headers['x-api-key'];
      const userEmail = req.headers['x-user-email'];
      if (!apiKeyHeader || !userEmail) {
        res.status(401).json({
          success: false,
          error: 'Missing authentication headers',
          requiredHeaders: ['X-Api-Key', 'X-User-Email'],
        });
        return;
      }

      const validApiKey = shortcutApiKey.value();
      if (!validApiKey) {
        console.error('scrapeInstagramReelShortcut: SHORTCUT_API_KEY secret is not set');
        res.status(500).json({
          success: false,
          error: 'Server misconfiguration: SHORTCUT_API_KEY secret is not set',
        });
        return;
      }

      let isValidKey = false;
      try {
        isValidKey = crypto.timingSafeEqual(
            Buffer.from(apiKeyHeader),
            Buffer.from(validApiKey),
        );
      } catch (_) {
        isValidKey = false;
      }
      if (!isValidKey) {
        console.warn('scrapeInstagramReelShortcut: invalid API key attempt');
        res.status(401).json({success: false, error: 'Invalid API key'});
        return;
      }

      const userId = await resolveShortcutUserId(userEmail);
      const db = admin.firestore();
      try {
        const userDoc = userId ? await db.collection('users').doc(userId).get() : null;
        if (!userId || !userDoc.exists) {
          res.status(403).json({success: false, error: 'Access denied'});
          return;
        }
        const userData = userDoc.data();
        const role = userData?.role;
        const isShortcutUser = userData?.isShortcutUser === true;
        if (role !== 'edit' && role !== 'admin' && role !== 'moderator' && !isShortcutUser) {
          res.status(403).json({success: false, error: 'Insufficient permissions'});
          return;
        }
      } catch (err) {
        console.error('scrapeInstagramReelShortcut: error validating user:', err);
        res.status(500).json({success: false, error: 'Failed to validate user'});
        return;
      }

      let body = req.body;
      if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
        try {
          const raw = req.rawBody;
          if (raw) body = JSON.parse(raw.toString('utf8'));
        } catch (_) {
          res.status(400).json({success: false, error: 'Invalid JSON body'});
          return;
        }
      }

      const {url, pin, cuisineTypes, mealCategories} = body || {};
      if (!url || typeof url !== 'string') {
        res.status(400).json({success: false, error: 'Missing required field: url (string)'});
        return;
      }
      if (!isInstagramUrl(url)) {
        res.status(400).json({
          success: false,
          error: 'URL must be a valid Instagram URL (e.g. https://www.instagram.com/reel/... or .../p/...)',
        });
        return;
      }

      try {
        await requireShortcutPin(userId, pin);
      } catch (pinErr) {
        const status = pinErr.code === 'resource-exhausted' ? 429 :
          pinErr.code === 'invalid-argument' ? 400 : 403;
        res.status(status).json({success: false, error: pinErr.message || 'PIN erforderlich.'});
        return;
      }

      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        res.status(500).json({
          success: false,
          error: 'AI service not configured. Please contact administrator.',
        });
        return;
      }

      console.log(`scrapeInstagramReelShortcut: sync scrape requested by user ${userId} for URL: ${url}`);

      const steps = [];
      // Surfaced to the Shortcut alongside success/error so it can tell "Gemini
      // extracted a recipe from the caption alone" apart from "the Reel's video
      // was actually captured and transcribed" — the former can silently miss
      // ingredients/steps that only appear in the video's audio.
      const videoFound = () => Boolean(steps.find((s) => s.step === 'video_element_found')?.ok);
      try {
        const result = await runImportFromInstagram(url, {language: 'de', apiKey, cuisineTypes, mealCategories, steps});
        const docRef = await db.collection('recipes').add({
          ...buildRecipeFieldsFromResult(result, userId),
          isTemp: true,
        });
        console.log(`scrapeInstagramReelShortcut: recipe ${docRef.id} created for user ${userId}`);
        await writeImportProtocolEntry({
          jobId: docRef.id, authorId: userId, source: {type: 'instagram', url}, success: true, steps,
        });
        res.status(200).json({success: true, recipeId: docRef.id, videoFound: videoFound()});
      } catch (error) {
        console.error(`scrapeInstagramReelShortcut: scrape failed for user ${userId}:`, error);
        const loginWall = /Login-Wall/i.test(error.message || '');
        await writeImportProtocolEntry({
          jobId: null, authorId: userId, source: {type: 'instagram', url}, success: false, steps, error,
        });
        // 200, not 4xx/5xx: the request itself was handled correctly, the
        // scrape just didn't find a recipe — the Shortcut branches on the
        // success field in the body, not the HTTP status.
        res.status(200).json({success: false, error: error.message, loginWall, videoFound: videoFound()});
      }
    },
);

// ─── End of Hybrid Import Architecture ────────────────────────────────────────

/**
 * Sleeps for a given duration.
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const OPEN_FOOD_FACTS_FETCH_TIMEOUT_MS = 10000;
const OPEN_FOOD_FACTS_RETRY_DELAYS_MS = [30_000, 270_000]; // 30 s, dann 4.5 min (= 5 min gesamt)
const OPEN_FOOD_FACTS_NETWORK_ERROR_CODES = ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN', 'ETIMEDOUT'];
const NUTRITION_REFERENCE_COLLECTION = 'nutritionReferences';
const NUTRITION_REFERENCE_FIELDS = ['kalorien', 'protein', 'fett', 'kohlenhydrate', 'zucker', 'ballaststoffe', 'salz'];
const NUTRITION_SOURCE_SUFFIX_OFF = '_openfoodfacts';
const NUTRITION_SOURCE_SUFFIX_AI = '_ai';
const NUTRITION_SOURCE_SUFFIX_MANUAL = '_manual';
// 5% Kalorienabweichung zwischen actual/outdated setzt recalc=true.
const NUTRITION_RECALC_CALORIE_THRESHOLD = 0.05;
const ZERO_CALORIE_BASELINE = 1;

/**
 * Create a deterministic document id for nutrition reference entries.
 * @param {string} name
 * @returns {string}
 */
function normalizeNutritionReferenceId(name) {
  return String(name || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
}

/**
 * Parse and sanitize per-100g nutrition fields from arbitrary data.
 * @param {object} data
 * @returns {object}
 */
function parseNutritionReferenceValues(data = {}) {
  return NUTRITION_REFERENCE_FIELDS.reduce((acc, key) => {
    const numeric = parseNutritionReferenceNumber(data[key]);
    if (numeric != null) {
      acc[key] = numeric;
    }
    return acc;
  }, {});
}

function parseNutritionReferenceNumber(raw) {
  if (raw === '' || raw == null) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function getNutritionSourceSuffix(source) {
  switch (String(source || '').trim().toLowerCase()) {
    case 'openfoodfacts':
      return NUTRITION_SOURCE_SUFFIX_OFF;
    case 'ai-generiert':
      return NUTRITION_SOURCE_SUFFIX_AI;
    case 'manual':
    case 'manuell':
      return NUTRITION_SOURCE_SUFFIX_MANUAL;
    default:
      return null;
  }
}

function getNutritionValuesForSource(data = {}, source = '') {
  const suffix = getNutritionSourceSuffix(source);
  const hasSourceSpecificValues = suffix && NUTRITION_REFERENCE_FIELDS.some((key) => {
    const numeric = parseNutritionReferenceNumber(data[`${key}${suffix}`]);
    return numeric != null;
  });

  return NUTRITION_REFERENCE_FIELDS.reduce((acc, key) => {
    if (hasSourceSpecificValues) {
      const numeric = parseNutritionReferenceNumber(data[`${key}${suffix}`]);
      if (numeric != null) {
        acc[key] = numeric;
      }
      return acc;
    }

    const numeric = parseNutritionReferenceNumber(data[key]);
    if (numeric != null) {
      acc[key] = numeric;
    }
    return acc;
  }, {});
}

function buildNutritionSet(values = {}, source = '') {
  const parsedValues = parseNutritionReferenceValues(values);
  if (Object.keys(parsedValues).length === 0) return [];
  const normalizedSource = String(source || '').trim().toLowerCase();
  return [normalizedSource ? { source: normalizedSource, ...parsedValues } : parsedValues];
}

function normalizeNutritionSet(set = []) {
  if (!Array.isArray(set)) return [];
  return set.reduce((acc, entry) => {
    if (!entry || typeof entry !== 'object') return acc;
    const source = String(entry.source || '').trim().toLowerCase();
    const rawValues = entry.values && typeof entry.values === 'object' ? entry.values : entry;
    const parsedValues = parseNutritionReferenceValues(rawValues);
    if (Object.keys(parsedValues).length === 0) return acc;
    acc.push(source ? { source, ...parsedValues } : parsedValues);
    return acc;
  }, []);
}

function getCaloriesFromNutritionSet(set = []) {
  const normalized = normalizeNutritionSet(set);
  if (normalized.length === 0) return null;
  return parseNutritionReferenceNumber(normalized[0].kalorien);
}

function shouldTriggerRecalc(previousCalories, currentCalories) {
  if (previousCalories == null || currentCalories == null) return false;
  const baseline = previousCalories === 0 ? ZERO_CALORIE_BASELINE : previousCalories;
  return Math.abs(currentCalories - previousCalories) / baseline >
    NUTRITION_RECALC_CALORIE_THRESHOLD;
}

function hasSourceChanged(nextSource, previousSource) {
  return Boolean(nextSource && previousSource && nextSource !== previousSource);
}

function buildNutritionTrackingFields({
  previousData = {},
  nextValues = {},
  nextSource = '',
  forceRecalc = false,
  preserveOnManualSourceChange = false,
  fromNutritionGeneration = false,
} = {}) {
  const previousActual = normalizeNutritionSet(previousData.nutritionSetActual);
  let nextActual = previousActual;
  let nextOutdated = normalizeNutritionSet(previousData.nutritionSetOutdated);
  const wasAlreadyRecalc = typeof previousData.recalc === 'boolean' ? previousData.recalc : false;
  let nextRecalc = wasAlreadyRecalc;

  const normalizedNextSource = String(nextSource || '').trim().toLowerCase();
  const normalizedPreviousSource = String(previousData.source || '').trim().toLowerCase();
  const normalizedNextSet = buildNutritionSet(nextValues, normalizedNextSource);
  const hasNextSet = normalizedNextSet.length > 0;
  const sourceChanged = hasSourceChanged(normalizedNextSource, normalizedPreviousSource);
  const switchedToManual = sourceChanged && normalizedNextSource === 'manual';

  if (forceRecalc) {
    nextOutdated = previousActual;
    if (hasNextSet) {
      nextActual = normalizedNextSet;
      nextRecalc = nextRecalc || shouldTriggerRecalc(
          getCaloriesFromNutritionSet(nextOutdated),
          getCaloriesFromNutritionSet(nextActual),
      );
    }
  } else if (hasNextSet && fromNutritionGeneration && !(preserveOnManualSourceChange && switchedToManual)) {
    nextOutdated = previousActual;
    nextActual = normalizedNextSet;
    nextRecalc = nextRecalc || shouldTriggerRecalc(
        getCaloriesFromNutritionSet(nextOutdated),
        getCaloriesFromNutritionSet(nextActual),
    );
  } else if (
    hasNextSet &&
    previousActual.length === 0 &&
    !(preserveOnManualSourceChange && switchedToManual)
  ) {
    nextActual = normalizedNextSet;
  }

  const finalRecalc = Boolean(nextRecalc);
  const result = {
    nutritionSetActual: nextActual,
    nutritionSetOutdated: nextOutdated,
    recalc: finalRecalc,
  };
  if (finalRecalc && !wasAlreadyRecalc) {
    result.recalcDate = new Date();
  }
  return result;
}

/**
 * @param {Error} err
 * @returns {boolean}
 */
const isOpenFoodFactsNetworkError = (err) => err?.name === 'TypeError' ||
  OPEN_FOOD_FACTS_NETWORK_ERROR_CODES.includes(err?.code);

/**
 * Returns whether an ingredient line should be skipped server-side.
 * @param {string} ingredientStr
 * @returns {boolean}
 */
const isSkippableIngredientLine = (ingredientStr) => {
  if (typeof ingredientStr !== 'string') return true;
  const trimmed = ingredientStr.trim();
  if (trimmed === '') return true;
  return /^\s*#{1,3}(?!recipe:)\s*/i.test(trimmed);
};

/**
 * Detects whether an ingredient starts with a numeric quantity (including
 * decimal values like "1,5" and fractions like "1/2").
 *
 * @param {string} ingredientStr
 * @returns {boolean}
 */
const hasExplicitQuantityInIngredient = (ingredientStr) => (
  /^\s*(?:\d+(?:[.,]\d+)?\/\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\b/.test(String(ingredientStr || '').trim())
);

/**
 * Fetches a URL and retries on OpenFoodFacts timeouts/network errors and HTTP 503.
 * @param {string} url
 * @param {object} options
 * @param {number} maxAttempts - Total attempts (default 3 = 1 try + 2 retries)
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, OPEN_FOOD_FACTS_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const isServiceUnavailable = !response.ok && response.status === 503;
      if (!isServiceUnavailable) {
        return response;
      }

      lastErr = new Error('OpenFoodFacts nicht verfügbar (503)');
      if (attempt < maxAttempts) {
        await sleep(OPEN_FOOD_FACTS_RETRY_DELAYS_MS[attempt - 1]);
      }
    } catch (err) {
      clearTimeout(timeout);
      const isTimeout = timedOut || err.name === 'AbortError';
      const isNetworkError = isOpenFoodFactsNetworkError(err);
      if (!isTimeout && !isNetworkError) {
        throw err;
      }
      lastErr = isTimeout ? new Error('Timeout bei OpenFoodFacts') : err;
      if (attempt < maxAttempts) {
        await sleep(OPEN_FOOD_FACTS_RETRY_DELAYS_MS[attempt - 1]);
      }
    }
  }
  throw lastErr;
}

/**
 * Cloud Function: Parse ingredient text to amount in grams with Gemini.
 */
exports.parseIngredientAmountG = onCall(
    {maxInstances: 5, timeoutSeconds: 10, secrets: [geminiApiKey], cors: ALLOWED_ORIGINS, invoker: 'public'},
    async (request) => {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'You must be logged in to parse ingredient amounts');
      }

      const ingredientText = String(request.data?.ingredientText || '').trim();
      if (!ingredientText) {
        throw new HttpsError('invalid-argument', 'ingredientText is required');
      }

      const {
        normalizeIngredientWithGemini,
        parseIngredientForNutrition,
      } = createNutritionNormalizationUtils({
        GoogleGenerativeAI,
        env: {GEMINI_API_KEY: geminiApiKey.value()},
      });

      let parsed = null;
      try {
        parsed = await normalizeIngredientWithGemini(ingredientText, {timeoutMs: 7000});
      } catch (error) {
        console.warn(`Failed to parse ingredient amount for "${ingredientText}" with Gemini:`, error);
        parsed = null;
      }
      if (!parsed) {
        parsed = parseIngredientForNutrition(ingredientText);
      }

      return {
        amountG: parsed?.amountG ?? null,
        name: parsed?.name || ingredientText,
      };
    },
);

/**
 * Core implementation for automatic nutrition calculation.
 * @param {{ingredients: Array, portionen?: number, callerLabel?: string}} params
 * @returns {Promise<{naehrwerte: object, details: Array, foundCount: number, totalCount: number}>}
 */
function normalizePositiveNutritionNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function roundNutritionValue(key, value) {
  if (key === 'kalorien') {
    return Math.round(value);
  }
  if (key === 'salz') {
    return Math.round(value * 100) / 100;
  }
  return Math.round(value * 10) / 10;
}

function buildNutritionPer100g(totals = {}, finalWeightGrams) {
  const weight = normalizePositiveNutritionNumber(finalWeightGrams);
  if (weight == null) return null;

  const per100g = {};
  Object.entries(totals).forEach(([key, value]) => {
    if (value == null) return;
    per100g[key] = roundNutritionValue(key, (value / weight) * 100);
  });

  return Object.keys(per100g).length > 0 ? per100g : null;
}

function resolveNutritionFinalWeightGrams({sumIngredientAmounts, calcYieldGrams, calcYieldFactor} = {}) {
  const yieldGrams = normalizePositiveNutritionNumber(calcYieldGrams);
  if (yieldGrams != null) return yieldGrams;

  const ingredientAmountSum = normalizePositiveNutritionNumber(sumIngredientAmounts);
  const yieldFactor = normalizePositiveNutritionNumber(calcYieldFactor);
  if (ingredientAmountSum != null && yieldFactor != null) {
    return Math.round(ingredientAmountSum * yieldFactor * 10) / 10;
  }

  return ingredientAmountSum;
}

async function calculateNutritionFromOpenFoodFactsCore({
  ingredients,
  portionen = 1,
  callerLabel = 'system',
  calcYieldGrams = null,
  calcYieldFactor = null,
} = {}) {
  const {
    parseIngredientForNutrition,
    isSimpleIngredient = () => false,
    normalizeIngredientWithGemini,
    estimateNutritionWithGemini,
  } = createNutritionNormalizationUtils({
    GoogleGenerativeAI,
    env: {GEMINI_API_KEY: geminiApiKey.value()},
  });

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
  let sumIngredientAmounts = 0;
  let foundCount = 0;
  const BATCH_SIZE = 5;
  const ingredientEntries = ingredients.map((ingredient) => {
    if (ingredient && typeof ingredient === 'object' && ingredient.type === 'heading') {
      return null;
    }
    const ingredientStr = (ingredient && typeof ingredient === 'object') ? ingredient.text : ingredient;
    if (isSkippableIngredientLine(ingredientStr)) {
      return null;
    }
    return {ingredientStr};
  }).filter(Boolean);

  const processIngredient = async ({ingredientStr}) => {
    const ingredientTotals = {
      kalorien: 0,
      protein: 0,
      fett: 0,
      kohlenhydrate: 0,
      zucker: 0,
      ballaststoffe: 0,
      salz: 0,
    };

    if (/^salz$/i.test(ingredientStr.trim())) {
      const saltAmountG = DEFAULT_SALT_PER_PORTION_G * portionen;
      ingredientTotals.salz += saltAmountG;
      return {
        found: true,
        detail: {
          ingredient: ingredientStr,
          name: 'Salz',
          product: `Salz (Standard: ${DEFAULT_SALT_PER_PORTION_G} g pro Portion)`,
          amountG: saltAmountG,
        },
        totals: ingredientTotals,
      };
    }

    let parsed = null;
    const hasExplicitQuantity = hasExplicitQuantityInIngredient(ingredientStr);

    if (isSimpleIngredient(ingredientStr)) {
      parsed = parseIngredientForNutrition(ingredientStr);
      if (parsed) {
        console.log(`Fast path (regex) for simple ingredient: "${ingredientStr}"`);
      }
    }

    if (!parsed) {
      try {
        parsed = await normalizeIngredientWithGemini(ingredientStr, {timeoutMs: 5000});
      } catch (geminiError) {
        console.warn(`Gemini normalization failed for "${ingredientStr}", falling back to regex:`, geminiError.message);
        parsed = parseIngredientForNutrition(ingredientStr);
      }
    }

    if (!parsed) {
      parsed = parseIngredientForNutrition(ingredientStr);
    }
    if (!parsed) {
      return {
        found: false,
        detail: {ingredient: ingredientStr, error: 'Konnte nicht geparst werden'},
        totals: ingredientTotals,
      };
    }

    const {name} = parsed;
    const referenceId = normalizeNutritionReferenceId(name);
    let cachedSnapshot = null;

    try {
      if (referenceId) {
        const collectionRef = admin.firestore()
            .collection(NUTRITION_REFERENCE_COLLECTION);
        cachedSnapshot = await collectionRef
            .doc(referenceId)
            .get();
        if (!cachedSnapshot.exists) {
          const synonymQuerySnapshot = await collectionRef
              .where('normalizedSynonyms', 'array-contains', referenceId)
              .limit(1)
              .get();
          if (!synonymQuerySnapshot.empty) {
            [cachedSnapshot] = synonymQuerySnapshot.docs;
          }
        }
        if (cachedSnapshot.exists) {
          const cachedData = cachedSnapshot.data();
          const fallbackAmountG = cachedData.defaultAmountG;
          if (!hasExplicitQuantity && typeof fallbackAmountG === 'number' && fallbackAmountG > 0) {
            parsed = {...parsed, amountG: fallbackAmountG};
          }
          const cachedValues = getNutritionValuesForSource(cachedData, cachedData.source);
          if (Object.keys(cachedValues).length > 0) {
            const scale = parsed.amountG / 100;
            NUTRITION_REFERENCE_FIELDS.forEach((key) => {
              ingredientTotals[key] += (cachedValues[key] || 0) * scale;
            });
            return {
              found: true,
              detail: {
                ingredient: ingredientStr,
                name,
                product: cachedSnapshot.data().product || cachedSnapshot.data().name || name,
                amountG: parsed.amountG,
                searchTerm: parsed.searchName || name,
              },
              totals: ingredientTotals,
            };
          }
        }
      }

      const searchTerms = [...new Set(
          [parsed.searchName, name]
              .filter((term) => typeof term === 'string' && term.trim() !== '')
              .map((term) => term.trim())
      )];
      let product = null;
      let searchError = 'Nicht gefunden';
      let usedSearchTerm = null;

      for (const searchTerm of searchTerms) {
        const cleanSearchTerm = searchTerm.replace(/\s*\([^)]*\)/g, '').trim();
        const termToSearch = cleanSearchTerm || searchTerm;
        const searchUrl =
          `https://world.openfoodfacts.org/cgi/search.pl` +
          `?search_terms=${encodeURIComponent(termToSearch)}` +
          `&json=1&page_size=3` +
          `&fields=product_name,nutriments`;

        const response = await fetchWithRetry(searchUrl, {
          headers: {
            'User-Agent': 'RecipeBook/1.0 (https://github.com/brou-cgn/recipebook)',
          },
        }, 1);

        if (!response.ok) {
          if (response.status === 404) {
            searchError = 'Nicht gefunden';
            continue;
          }
          searchError = `HTTP ${response.status}`;
          console.warn(`OpenFoodFacts HTTP ${response.status} for "${termToSearch}", trying next search term`);
          continue;
        }

        const data = await response.json();

        if (!data.products || data.products.length === 0) {
          searchError = 'Nicht gefunden';
          continue;
        }

        product = data.products.find(
            (entry) => entry.nutriments && entry.nutriments['energy-kcal_100g'] != null
        );

        if (product) {
          usedSearchTerm = termToSearch;
          break;
        }

        console.warn(`No energy data found for "${termToSearch}" in OpenFoodFacts results`);
        searchError = 'Keine Nährwertdaten verfügbar';
      }

      if (!product) {
        let geminiEstimate = null;
        try {
          geminiEstimate = await estimateNutritionWithGemini(ingredientStr, parsed, {timeoutMs: 20000});
        } catch (estimateError) {
          console.warn(
              `Gemini estimation failed for "${ingredientStr}":`,
              estimateError?.message || estimateError,
          );
        }

        if (!geminiEstimate) {
          return {
            found: false,
            detail: {ingredient: ingredientStr, name, searchTerm: usedSearchTerm, error: searchError},
            totals: ingredientTotals,
          };
        }

        const scale = parsed.amountG / 100;
        NUTRITION_REFERENCE_FIELDS.forEach((key) => {
          ingredientTotals[key] += (geminiEstimate.per100g[key] || 0) * scale;
        });

        return {
          found: true,
          aiEstimated: true,
          detail: {
            ingredient: ingredientStr,
            name,
            amountG: parsed.amountG,
            searchTerm: usedSearchTerm || parsed.searchName || name,
            aiEstimated: true,
          },
          totals: ingredientTotals,
        };
      }

      const n = product.nutriments || {};
      const per100gValues = parseNutritionReferenceValues({
        kalorien: n['energy-kcal_100g'] ?? n['energy-kcal'],
        protein: n['proteins_100g'] ?? n.proteins,
        fett: n['fat_100g'] ?? n.fat,
        kohlenhydrate: n['carbohydrates_100g'] ?? n.carbohydrates,
        zucker: n['sugars_100g'] ?? n.sugars,
        ballaststoffe: n['fiber_100g'] ?? n.fiber,
        salz: n['salt_100g'] ?? n.salt,
      });
      const scale = parsed.amountG / 100;

      NUTRITION_REFERENCE_FIELDS.forEach((key) => {
        ingredientTotals[key] += (per100gValues[key] || 0) * scale;
      });

      return {
        found: true,
        detail: {
          ingredient: ingredientStr,
          name,
          product: product.product_name || name,
          amountG: parsed.amountG,
          searchTerm: usedSearchTerm || parsed.searchName || name,
        },
        totals: ingredientTotals,
      };
    } catch (err) {
      const isNetworkError = isOpenFoodFactsNetworkError(err);
      const isTimeout = err.name === 'AbortError' || (err.message || '').toLowerCase().includes('timeout');

      if (parsed) {
        try {
          const geminiEstimate = await estimateNutritionWithGemini(ingredientStr, parsed, {timeoutMs: 20000});
          if (geminiEstimate) {
            const scale = parsed.amountG / 100;
            NUTRITION_REFERENCE_FIELDS.forEach((key) => {
              ingredientTotals[key] += (geminiEstimate.per100g[key] || 0) * scale;
            });

            return {
              found: true,
              aiEstimated: true,
              detail: {
                ingredient: ingredientStr,
                name,
                amountG: parsed.amountG,
                searchTerm: parsed.searchName || name,
                aiEstimated: true,
              },
              totals: ingredientTotals,
            };
          }
        } catch (estimateError) {
          console.warn(`Gemini estimation also failed for "${ingredientStr}":`, estimateError?.message);
        }
      }

      const errorType = isNetworkError ? 'Netzwerkfehler' : (isTimeout ? 'Timeout' : 'API-Fehler');
      console.error(`OpenFoodFacts ${errorType} for "${name}":`, err.message);
      return {
        found: false,
        detail: {
          ingredient: ingredientStr,
          name,
          error: isTimeout ? 'Timeout bei OpenFoodFacts' : (err.message || errorType),
        },
        totals: ingredientTotals,
      };
    }
  };

  for (let i = 0; i < ingredientEntries.length; i += BATCH_SIZE) {
    const batch = ingredientEntries.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(processIngredient));
    for (const result of batchResults) {
      Object.keys(totals).forEach((key) => {
        totals[key] += result.totals[key] || 0;
      });
      details.push({
        ...result.detail,
        found: result.found,
      });
      if (typeof result.detail?.amountG === 'number' && result.detail.amountG > 0) {
        sumIngredientAmounts += result.detail.amountG;
      }
      if (result.found) {
        foundCount++;
      }
    }
  }

  const naehrwerte = {};
  for (const [key, value] of Object.entries(totals)) {
    const perPortion = value / portionen;
    naehrwerte[key] = roundNutritionValue(key, perPortion);
  }
  const calcFinalWeightGrams = resolveNutritionFinalWeightGrams({
    sumIngredientAmounts,
    calcYieldGrams,
    calcYieldFactor,
  });
  const calcPer100g = buildNutritionPer100g(totals, calcFinalWeightGrams);

  console.log(
      `Nutrition calculated for ${callerLabel}: ` +
      `${foundCount}/${ingredientEntries.length} ingredients found`
  );

  return {
    naehrwerte,
    details,
    foundCount,
    totalCount: ingredientEntries.length,
    calcFinalWeightGrams: calcFinalWeightGrams ?? null,
    calcPer100g,
  };
}

/**
 * Cloud Function: Calculate Nutrition from OpenFoodFacts
 */
exports.calculateNutritionFromOpenFoodFacts = onCall(
    {
      maxInstances: 5,
      timeoutSeconds: 540,
      secrets: [geminiApiKey],
      cors: ALLOWED_ORIGINS,
      invoker: 'public',
    },
    async (request) => {
      if (!request.auth) {
        throw new HttpsError(
            'unauthenticated',
            'You must be logged in to calculate nutrition'
        );
      }

      const {
        ingredients,
        portionen = 1,
        calcYieldGrams = null,
        calcYieldFactor = null,
      } = request.data || {};
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

      return calculateNutritionFromOpenFoodFactsCore({
        ingredients,
        portionen,
        callerLabel: `user ${request.auth.uid}`,
        calcYieldGrams,
        calcYieldFactor,
      });
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
 * Generates nutrition data for a nutrition reference entry by:
 * 1. Using Gemini to generate a meaningful English search term from the metadata
 * 2. Querying OpenFoodFacts with the generated search term
 * 3. Falling back to Gemini nutrition estimation if OpenFoodFacts returns no results
 */
exports.generateNutritionFromReference = onCall(
    {maxInstances: 5, timeoutSeconds: 60, secrets: [geminiApiKey], cors: ALLOWED_ORIGINS, invoker: 'public'},
    async (request) => {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'You must be logged in to generate nutrition data');
      }

      const {ingredientID, nutritionFamily, category} = request.data || {};
      if (!ingredientID || typeof ingredientID !== 'string') {
        throw new HttpsError('invalid-argument', 'ingredientID is required');
      }

      const {
        generateSearchTermWithGemini,
        estimateNutritionWithGemini,
      } = createNutritionNormalizationUtils({
        GoogleGenerativeAI,
        env: {GEMINI_API_KEY: geminiApiKey.value()},
      });

      const referenceRef = admin.firestore()
          .collection(NUTRITION_REFERENCE_COLLECTION)
          .doc(ingredientID);
      const referenceSnapshot = await referenceRef.get();
      const referenceData = referenceSnapshot.exists ? (referenceSnapshot.data() || {}) : {};

      const hasSourceValues = (suffix) => NUTRITION_REFERENCE_FIELDS.some((field) =>
        parseNutritionReferenceNumber(referenceData[`${field}${suffix}`]) != null
      );

      const status = String(referenceData.status || '').trim();
      const previousSource = String(referenceData.source || '').trim().toLowerCase();

      let hasOffValues = hasSourceValues(NUTRITION_SOURCE_SUFFIX_OFF);
      let hasAiValues = hasSourceValues(NUTRITION_SOURCE_SUFFIX_AI);

      // 1. Generate search term with Gemini
      const generatedSearchTerm = await generateSearchTermWithGemini(
          ingredientID,
          nutritionFamily || '',
          category || '',
      );
      const searchTerm = generatedSearchTerm || ingredientID;

      // 2. Query OpenFoodFacts when OFF fields are empty
      let offValues = null;
      let productName = null;
      if (!hasOffValues) {
        try {
          const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(searchTerm)}&action=process&json=1&page_size=5`;
          const offResponse = await fetch(offUrl);
          if (offResponse.ok) {
            const offData = await offResponse.json();
            const product = (offData.products || []).find((entry) => {
              const nutriments = entry?.nutriments || {};
              return nutriments['energy-kcal_100g'] != null || nutriments['energy-kcal'] != null;
            });
            if (product) {
              const nutriments = product.nutriments || {};
              offValues = parseNutritionReferenceValues({
                kalorien: nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal'] ?? null,
                protein: nutriments['proteins_100g'] ?? nutriments.proteins ?? null,
                fett: nutriments['fat_100g'] ?? nutriments.fat ?? null,
                kohlenhydrate: nutriments['carbohydrates_100g'] ?? nutriments.carbohydrates ?? null,
                zucker: nutriments['sugars_100g'] ?? nutriments.sugars ?? null,
                ballaststoffe: nutriments['fiber_100g'] ?? nutriments.fiber ?? null,
                salz: nutriments['salt_100g'] ?? nutriments.salt ?? null,
              });
              if (Object.keys(offValues).length > 0) {
                productName = product.product_name || searchTerm;
                hasOffValues = true;
              } else {
                offValues = null;
              }
            }
          }
        } catch (e) {
          // Network error → continue with Gemini generation if needed
        }
      }

      // 3. Estimate with Gemini when AI fields are empty
      let aiValues = null;
      let kiConfidence = null;
      if (!hasAiValues) {
        const estimated = await estimateNutritionWithGemini(
            ingredientID,
            {amountG: 100, name: ingredientID, searchName: searchTerm},
            {timeoutMs: 20000},
        );
        if (estimated?.per100g) {
          aiValues = parseNutritionReferenceValues(estimated.per100g);
          if (Object.keys(aiValues).length > 0) {
            hasAiValues = true;
            kiConfidence = estimated.confidence ?? null;
          } else {
            aiValues = null;
          }
        }
      }

      // Compute OFF completeness confidence (fraction of non-null fields, 0–1)
      let offConfidence = null;
      if (offValues) {
        const nonNullCount = NUTRITION_REFERENCE_FIELDS.filter((f) => offValues[f] != null).length;
        offConfidence = Math.round(nonNullCount / NUTRITION_REFERENCE_FIELDS.length * 100) / 100;
      }

      const offFields = (offValues || {});
      const aiFields = (aiValues || {});
      const offSourceFields = NUTRITION_REFERENCE_FIELDS.reduce((acc, field) => {
        if (offFields[field] != null) {
          acc[`${field}${NUTRITION_SOURCE_SUFFIX_OFF}`] = offFields[field];
        }
        return acc;
      }, {});
      const aiSourceFields = NUTRITION_REFERENCE_FIELDS.reduce((acc, field) => {
        if (aiFields[field] != null) {
          acc[`${field}${NUTRITION_SOURCE_SUFFIX_AI}`] = aiFields[field];
        }
        return acc;
      }, {});
      const nextData = {
        ...referenceData,
        ...offSourceFields,
        ...aiSourceFields,
      };

      let nextSource = previousSource;
      if (status === 'Prüfung ausstehend') {
        const hasManualAfter = NUTRITION_REFERENCE_FIELDS.some((field) =>
          parseNutritionReferenceNumber(nextData[`${field}${NUTRITION_SOURCE_SUFFIX_MANUAL}`]) != null
        );
        const hasOffAfter = NUTRITION_REFERENCE_FIELDS.some((field) =>
          parseNutritionReferenceNumber(nextData[`${field}${NUTRITION_SOURCE_SUFFIX_OFF}`]) != null
        );
        if (hasManualAfter) {
          nextSource = 'manual';
        } else if (hasOffAfter) {
          nextSource = 'openfoodfacts';
        } else {
          nextSource = 'ai-generiert';
        }
      } else if (status !== 'Freigegeben') {
        if (offValues) {
          nextSource = 'openfoodfacts';
        } else if (aiValues) {
          nextSource = 'ai-generiert';
        }
      }

      const selectedValues = NUTRITION_REFERENCE_FIELDS.reduce((acc, field) => {
        const manualValue = parseNutritionReferenceNumber(nextData[`${field}${NUTRITION_SOURCE_SUFFIX_MANUAL}`]);
        const offValue = parseNutritionReferenceNumber(nextData[`${field}${NUTRITION_SOURCE_SUFFIX_OFF}`]);
        const aiValue = parseNutritionReferenceNumber(nextData[`${field}${NUTRITION_SOURCE_SUFFIX_AI}`]);

        const resolved = manualValue != null ?
          manualValue :
          (offValue != null ? offValue : aiValue);
        if (resolved != null) {
          acc[field] = resolved;
        }
        return acc;
      }, {});

      if (Object.keys(selectedValues).length === 0) {
        throw new HttpsError('not-found', 'Keine Nährwertdaten gefunden.');
      }

      const trackingFields = buildNutritionTrackingFields({
        previousData: referenceData,
        nextValues: selectedValues,
        nextSource: nextSource || previousSource,
        preserveOnManualSourceChange: true,
        fromNutritionGeneration: true,
      });
      if (trackingFields.recalcDate !== undefined) {
        trackingFields.recalcDate = admin.firestore.FieldValue.serverTimestamp();
      }
      const updatePayload = {
        ...(searchTerm ? {searchTerm} : {}),
        ...selectedValues,
        ...offSourceFields,
        ...aiSourceFields,
        ...trackingFields,
      };
      if (nextSource && status !== 'Freigegeben' && status !== 'Neu') {
        updatePayload.source = nextSource;
      }
      // Advance status to 'Prüfung ausstehend' for entries that still need review.
      // 'Neu' is left unchanged (merge will preserve it); 'Freigegeben' is never touched.
      if (status !== 'Neu' && status !== 'Freigegeben') {
        updatePayload.status = 'Prüfung ausstehend';
      }
      updatePayload.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      // Persist dual-confidence: openFoodFacts completeness + KI estimate confidence
      const existingConfidence = referenceData.confidence || {};
      const confidenceData = {...existingConfidence};
      if (offConfidence != null) confidenceData.openFoodFacts = offConfidence;
      if (kiConfidence != null) confidenceData.ki = kiConfidence;
      if (Object.keys(confidenceData).length > 0) {
        updatePayload.confidence = confidenceData;
      }

      await referenceRef.set(updatePayload, {merge: true});

      const resolvedSource = status === 'Freigegeben' ? previousSource : (nextSource || previousSource);
      return {searchTerm, source: resolvedSource, values: selectedValues, productName};
    }
);

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
    {region: 'us-central1', invoker: 'public'},
    async (req, res) => {
      const origin = req.headers.origin;
      const hasOrigin = typeof origin === 'string' && origin.length > 0;
      const isAllowedOrigin = hasOrigin && ALLOWED_ORIGINS.includes(origin);

      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        res.set('Vary', 'Origin');
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        if (!hasOrigin) {
          res.status(204).send('');
          return;
        }
        if (hasOrigin && !isAllowedOrigin) {
          res.status(403).send('Forbidden origin');
          return;
        }
        res.set('Access-Control-Allow-Origin', origin);
        res.status(204).send('');
        return;
      }

      if (hasOrigin) {
        if (!isAllowedOrigin) {
          res.status(403).send('Forbidden origin');
          return;
        }
        res.set('Vary', 'Origin');
        res.set('Access-Control-Allow-Origin', origin);
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
 * Cloud Function: Send an invitation email to a new email address added to a private list.
 * Checks whether the address is already registered or has already received an invitation.
 * If neither, sends an invitation email and records the sent invitation in Firestore.
 *
 * Input data:
 * - email: The email address to invite
 *
 * Returns: { success: boolean, alreadyRegistered: boolean, alreadyInvited: boolean }
 */
exports.sendGroupInvitationEmail = onCall(
    {
      maxInstances: 10,
      secrets: [smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom],
    },
    async (request) => {
      const callerAuth = request.auth;
      if (!callerAuth) {
        throw new HttpsError(
            'unauthenticated',
            'Sie müssen angemeldet sein, um Einladungen zu versenden.'
        );
      }

      const {email} = request.data;

      if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        throw new HttpsError('invalid-argument', 'Ungültige E-Mail-Adresse.');
      }

      const normalizedEmail = email.trim().toLowerCase();
      const db = admin.firestore();

      // Check if the email address is already registered as a user
      try {
        await admin.auth().getUserByEmail(normalizedEmail);
        // User exists – no invitation needed
        return {success: true, alreadyRegistered: true, alreadyInvited: false};
      } catch (authError) {
        if (authError.code !== 'auth/user-not-found') {
          console.error('sendGroupInvitationEmail: error checking Firebase Auth:', authError);
          throw new HttpsError('internal', 'Fehler bei der Benutzerprüfung.');
        }
        // auth/user-not-found → proceed
      }

      // Check if an invitation has already been sent for this address
      const invitationRef = db.collection('invitations').doc(normalizedEmail);
      const invitationSnap = await invitationRef.get();
      if (invitationSnap.exists) {
        return {success: true, alreadyRegistered: false, alreadyInvited: true};
      }

      // Send the invitation email
      const smtpHostVal = smtpHost.value();
      const smtpPortVal = smtpPort.value();
      const smtpUserVal = smtpUser.value();
      const smtpPasswordVal = smtpPassword.value();
      const smtpFromVal = smtpFrom.value();

      if (!smtpHostVal || !smtpUserVal || !smtpPasswordVal || !smtpFromVal) {
        console.warn('sendGroupInvitationEmail: SMTP secrets not fully configured – skipping email');
        throw new HttpsError('unavailable', 'E-Mail-Versand ist momentan nicht konfiguriert.');
      }

      const registrationUrl = 'https://brou-cgn.github.io/recipebook/';

      const transporter = nodemailer.createTransport({
        host: smtpHostVal,
        port: parseInt(smtpPortVal || '587', 10),
        secure: parseInt(smtpPortVal || '587', 10) === 465,
        auth: {
          user: smtpUserVal,
          pass: smtpPasswordVal,
        },
      });

      const safeEmail = escapeHtml(normalizedEmail);
      const safeUrl = escapeHtml(registrationUrl);

      const mailOptions = {
        from: smtpFromVal,
        to: normalizedEmail,
        subject: 'Einladung zur Nutzung von Recipebook',
        text:
          `Hallo!\n\n` +
          `Du wurdest eingeladen, Recipebook zu nutzen. Bitte registriere dich über den folgenden Link, ` +
          `um Zugriff auf die private Liste zu erhalten.\n\n` +
          `${registrationUrl}\n\n` +
          `Bei Fragen antworte gerne auf diese Mail.\n\n` +
          `Viele Grüße,\n` +
          `Dein Recipebook-Team`,
        html:
          `<p>Hallo!</p>` +
          `<p>Du wurdest eingeladen, Recipebook zu nutzen. Bitte registriere dich über den folgenden Link, ` +
          `um Zugriff auf die private Liste zu erhalten.</p>` +
          `<p><a href="${safeUrl}">Registrierung starten</a></p>` +
          `<p>Bei Fragen antworte gerne auf diese Mail.</p>` +
          `<p>Viele Grüße,<br>Dein Recipebook-Team</p>`,
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`sendGroupInvitationEmail: invitation sent to ${normalizedEmail}`);
      } catch (mailError) {
        console.error('sendGroupInvitationEmail: error sending email:', mailError);
        throw new HttpsError('internal', 'Fehler beim Versenden der Einladungs-E-Mail.');
      }

      // Record the sent invitation so it is only sent once
      await invitationRef.set({
        email: normalizedEmail,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        sentBy: callerAuth.uid,
      });

      return {success: true, alreadyRegistered: false, alreadyInvited: false};
    },
);

/**
 * Firestore trigger: automatically add a newly registered user to all private groups
 * they were previously invited to by email.
 * Triggered when a new document is created in the 'users' collection.
 */
exports.processGroupInvitationsOnUserRegistration = onDocumentCreated(
    {
      document: 'users/{userId}',
      region: 'us-central1',
    },
    async (event) => {
      const userId = event.params.userId;
      const newUser = event.data ? event.data.data() : null;
      if (!newUser) {
        console.error('processGroupInvitationsOnUserRegistration: no user data in event');
        return;
      }

      const userEmail = newUser.email;
      if (!userEmail) {
        console.log('processGroupInvitationsOnUserRegistration: user has no email, skipping');
        return;
      }

      const normalizedEmail = userEmail.trim().toLowerCase();
      const db = admin.firestore();

      // Find all groups where this email is listed in invitedEmails
      const groupsSnapshot = await db.collection('groups')
          .where('invitedEmails', 'array-contains', normalizedEmail)
          .get();

      if (groupsSnapshot.empty) {
        console.log(`processGroupInvitationsOnUserRegistration: no pending group invitations for ${normalizedEmail}`);
        return;
      }

      // Add the user to each group and remove the email from invitedEmails using a batch write
      const batch = db.batch();
      groupsSnapshot.forEach((groupDoc) => {
        const groupData = groupDoc.data();
        const updatedMemberIds = [...new Set([...(groupData.memberIds || []), userId])];
        const updatedInvitedEmails = (groupData.invitedEmails || []).filter(
            (e) => e.trim().toLowerCase() !== normalizedEmail
        );
        batch.update(groupDoc.ref, {
          memberIds: updatedMemberIds,
          invitedEmails: updatedInvitedEmails,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`processGroupInvitationsOnUserRegistration: adding user ${userId} to group ${groupDoc.id}`);
      });

      await batch.commit();
      console.log(`processGroupInvitationsOnUserRegistration: processed ${groupsSnapshot.size} group(s) for ${normalizedEmail}`);

      // Mark the invitation as processed if a corresponding record exists.
      // The 'invitations' collection tracks invitation emails sent to unregistered
      // addresses (one document per email, keyed by normalized email address).
      const invitationRef = db.collection('invitations').doc(normalizedEmail);
      const invitationSnap = await invitationRef.get();
      if (invitationSnap.exists) {
        await invitationRef.update({
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          processedUserId: userId,
        });
        console.log(`processGroupInvitationsOnUserRegistration: invitation marked as processed for ${normalizedEmail}`);
      }
    },
);

/**
 * Firestore trigger: send email notification to all admins when a new user registers.
 * Triggered when a new document is created in the 'users' collection.
 * Requires the following Firebase secrets to be set:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
 */
exports.notifyAdminsOnUserRegistration = onDocumentCreated(
    {
      document: 'users/{userId}',
      region: 'us-central1',
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
 *   X-Api-Key:    <API Key stored as SHORTCUT_API_KEY secret>
 *   X-User-Email: <registrierte E-Mail-Adresse des Users>
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
    {maxInstances: 10, secrets: [shortcutApiKey], invoker: 'public'},
    async (req, res) => {
      const origin = req.headers.origin;
      if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key, X-User-Email');
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
      const userEmail = req.headers['x-user-email'];

      if (!apiKey || !userEmail) {
        res.status(401).json({
          success: false,
          error: 'Missing authentication headers',
          requiredHeaders: ['X-Api-Key', 'X-User-Email'],
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

      // --- Resolve email to uid, then validate user exists and has required role ---
      const userId = await resolveShortcutUserId(userEmail);
      const db = admin.firestore();
      try {
        const userDoc = userId ? await db.collection('users').doc(userId).get() : null;
        if (!userId || !userDoc.exists) {
          res.status(403).json({success: false, error: 'Access denied'});
          return;
        }
        const role = userDoc.data()?.role;
        if (role !== 'edit' && role !== 'admin' && role !== 'moderator') {
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
 *   X-Api-Key:    <API Key stored as SHORTCUT_API_KEY secret>
 *   X-User-Email: <registrierte E-Mail-Adresse des Users/Service-Users>
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
 *   405 { success: false, error: string }
 *   500 { success: false, error: string }
 */
exports.createRecipeImportFromText = onRequest(
    {maxInstances: 10, secrets: [shortcutApiKey], invoker: 'public'},
    async (req, res) => {
      const origin = req.headers.origin;
      if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key, X-User-Email');
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
      const userEmail = req.headers['x-user-email'];

      if (!apiKey || !userEmail) {
        res.status(401).json({
          success: false,
          error: 'Missing authentication headers',
          required: ['X-Api-Key', 'X-User-Email'],
        });
        return;
      }

      const validApiKey = shortcutApiKey.value();
      if (!validApiKey) {
        console.error('createRecipeImportFromText: SHORTCUT_API_KEY secret is not set');
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
        console.warn('createRecipeImportFromText: invalid API key attempt');
        res.status(401).json({success: false, error: 'Invalid API key'});
        return;
      }

      // --- Resolve email to uid, then validate user exists and has required role ---
      const userId = await resolveShortcutUserId(userEmail);
      const db = admin.firestore();
      let userData;
      try {
        const userDoc = userId ? await db.collection('users').doc(userId).get() : null;
        if (!userId || !userDoc.exists) {
          res.status(403).json({success: false, error: 'Access denied'});
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
      if (userRole !== 'edit' && userRole !== 'admin' && userRole !== 'moderator' && !userData.isAdmin && !isShortcutUser) {
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
    {maxInstances: 10, cors: true, invoker: 'public'},
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

/**
 * Regular expression that matches known social media crawler User-Agent strings.
 * Used by shareRecipe to decide whether to serve OG meta-tag HTML or redirect.
 */
const CRAWLER_UA_REGEX =
  /bot|crawler|spider|crawling|facebookexternalhit|whatsapp|twitterbot|telegrambot|linkedinbot|slackbot|discordbot|pinterest/i;

/**
 * Allowed UUID v4 pattern for shareId values stored by crypto.randomUUID().
 * Rejects any shareId that doesn't look like a UUID, preventing path traversal
 * and other injection attempts before the value reaches Firestore or HTML output.
 */
const SHARE_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SHARED_RECIPE_IDS = 100;

/** Fallback OG image URL used when no recipe thumbnail and no custom app logo exist. */
const STATIC_FALLBACK_LOGO_URL = 'https://brou-cgn.github.io/recipebook/logo512.png';

/**
 * Escapes HTML special characters to prevent XSS in generated HTML.
 * @param {*} text - Value to escape
 * @return {string} Escaped string safe for use in HTML attributes and text
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Generates a thumbnail from a Base64 image using sharp.
 * Resizes to at most 1200×630 px (preserving aspect ratio) and re-encodes as
 * JPEG with reduced quality so the result stays well under 100 KB.
 *
 * @param {string} base64Image - Full data-URL, e.g. "data:image/jpeg;base64,…"
 * @return {Promise<string>} data-URL of the generated JPEG thumbnail
 */
async function generateThumbnail(base64Image) {
  const matches = base64Image.match(/^data:image\/\w+;base64,(.+)$/s);
  if (!matches) {
    throw new Error('generateThumbnail: invalid base64 image format');
  }
  const imageBuffer = Buffer.from(matches[1], 'base64');
  const thumbnailBuffer = await sharp(imageBuffer)
      .resize(1200, 630, {fit: 'inside', withoutEnlargement: true})
      .jpeg({quality: 80})
      .toBuffer();
  return `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;
}

/**
 * Decode a recipe reference from ingredient text.
 * Format: [quantity] #recipe:{recipeId}:{recipeName}
 * Returns null if text is not a recipe link.
 */
function decodeRecipeLink(ingredient) {
  if (!ingredient || typeof ingredient !== 'string') {
    return null;
  }
  const match = ingredient.match(/^([^#]*?)\s*#recipe:([^:]+):(.+)$/);
  if (match) {
    const quantityPrefix = match[1].trim();
    return {
      recipeId: match[2],
      recipeName: match[3],
      quantityPrefix: quantityPrefix || null,
    };
  }
  return null;
}

/**
 * Generates an HTML page with dynamic Open Graph meta-tags for a recipe.
 * Regular browsers are redirected immediately to the React app via meta-refresh
 * and a script tag. Social media crawlers read the meta-tags and stop.
 *
 * @param {Object} recipe - Firestore recipe data
 * @param {string} shareId - The share identifier (validated UUID)
 * @param {string} functionUrl - Canonical URL of this page (used for og:url)
 * @param {string} defaultLogoUrl - Fallback image URL when the recipe has no thumbnail
 * @return {string} Full HTML document
 */
function generateRecipeShareHtml(recipe, shareId, functionUrl, defaultLogoUrl = STATIC_FALLBACK_LOGO_URL) {
  const title = escapeHtml(recipe.title || 'Rezept');
  const description = escapeHtml(
      recipe.description ||
      (Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0
        ? recipe.ingredients.slice(0, 5).map((i) => {
            const text = typeof i === 'object' && i !== null && i.text ? i.text : String(i);
            const recipeLink = decodeRecipeLink(text);
            if (recipeLink) {
              return recipeLink.quantityPrefix
                ? `${recipeLink.quantityPrefix} ${recipeLink.recipeName}`
                : recipeLink.recipeName;
            }
            return text;
          }).join(', ')
        : 'Ein leckeres Rezept aus brouBook'),
  );

  // ALWAYS use thumbnail for sharing - never send original image
  // Only use thumbnail if it's a valid HTTP(S) URL, not Base64
  const rawImage = recipe.imageThumbnail &&
                   (recipe.imageThumbnail.startsWith('http://') ||
                    recipe.imageThumbnail.startsWith('https://'))
                   ? recipe.imageThumbnail
                   : '';

  const imageUrl = escapeHtml(
      rawImage || defaultLogoUrl,
  );
  const canonicalUrl = escapeHtml(functionUrl);
  // Derive the app base URL from the canonical function URL so the redirect
  // always targets the same Firebase Hosting domain that served the share link.
  // e.g. https://project.web.app/share/<id> → https://project.web.app/
  const parsedUrl = new URL(functionUrl);
  const appBaseUrl = `${parsedUrl.protocol}//${parsedUrl.host}/`;
  // shareId is a validated UUID so it is safe to interpolate directly.
  const appUrl = `${appBaseUrl}#share/${shareId}`;

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
  <meta http-equiv="refresh" content="0;url=${escapeHtml(appUrl)}">
  <title>${title} - brouBook</title>
</head>
<body>
  <p>Wird weitergeleitet&#8230;</p>
  <script>window.location.href = ${JSON.stringify(appUrl)};</script>
</body>
</html>`;
}

/**
 * HTTPS function that serves dynamic Open Graph meta-tags for recipe share links.
 *
 * - Social media crawlers (Facebook, WhatsApp, Twitter, etc.) receive an HTML
 *   page with og:title, og:description, og:image and og:url populated from the
 *   shared recipe's Firestore document.
 * - Regular browsers are redirected immediately to the React app.
 *
 * Firebase Hosting rewrites /share/** to this function, giving share URLs of
 * the form: https://<project>.web.app/share/<shareId>
 */
exports.shareRecipe = onRequest(
    {cors: false, region: 'us-central1', invoker: 'public'},
    async (req, res) => {
      // Extract shareId from the URL path (/share/<shareId>) or query string.
      const pathParts = req.path.replace(/^\/+/, '').split('/');
      const shareId = (
        pathParts[pathParts.length - 1] ||
        req.query.id ||
        ''
      ).trim();

      // Validate that shareId matches the UUID v4 format used by crypto.randomUUID().
      if (!shareId || !SHARE_ID_REGEX.test(shareId)) {
        res.status(400).send('Invalid or missing share ID');
        return;
      }

      const userAgent = req.get('user-agent') || '';
      const isCrawler = CRAWLER_UA_REGEX.test(userAgent);

      const canonicalUrl = `${req.protocol}://${req.hostname}/share/${shareId}`;

      if (!isCrawler) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.redirect(302, `${req.protocol}://${req.hostname}/#share/${shareId}`);
        return;
      }

      try {
        const db = admin.firestore();
        const snapshot = await db
            .collection('recipes')
            .where('shareId', '==', shareId)
            .limit(1)
            .get();

        if (snapshot.empty) {
          res.status(404).send('Rezept nicht gefunden');
          return;
        }

        const recipeDoc = snapshot.docs[0];
        const recipe = recipeDoc.data();

        // Lazy thumbnail generation: if no thumbnail exists, or if it's Base64
        // (which doesn't work in Open Graph meta-tags for WhatsApp/Facebook),
        // generate a new thumbnail and upload it to Firebase Storage as a
        // public URL.
        const needsThumbnailGeneration =
          !recipe.imageThumbnail ||
          recipe.imageThumbnail.startsWith('data:image/');

        if (needsThumbnailGeneration && recipe.image) {
          try {
            let thumbnailBuffer;

            if (recipe.image.startsWith('data:image/')) {
              // Base64 image → convert to buffer and resize
              const matches =
                recipe.image.match(/^data:image\/\w+;base64,(.+)$/s);
              if (matches) {
                const imageBuffer = Buffer.from(matches[1], 'base64');
                thumbnailBuffer = await sharp(imageBuffer)
                    .resize(1200, 630, {fit: 'inside', withoutEnlargement: true})
                    .jpeg({quality: 80})
                    .toBuffer();
              }
            } else if (
              recipe.image.startsWith(
                  'https://firebasestorage.googleapis.com/') ||
              recipe.image.startsWith('https://storage.googleapis.com/')
            ) {
              // Storage URL → download and resize
              const response = await fetch(recipe.image);
              if (!response.ok) {
                throw new Error(
                    `shareRecipe: failed to fetch image (${response.status})`);
              }
              const arrayBuffer = await response.arrayBuffer();
              const imageBuffer = Buffer.from(arrayBuffer);

              thumbnailBuffer = await sharp(imageBuffer)
                  .resize(1200, 630, {fit: 'inside', withoutEnlargement: true})
                  .jpeg({quality: 80})
                  .toBuffer();
            }

            // Upload thumbnail to Firebase Storage and get public URL
            if (thumbnailBuffer) {
              const bucket = admin.storage().bucket();
              const fileName =
                `thumbnails/${recipeDoc.id}_${crypto.randomUUID()}.jpg`;
              const file = bucket.file(fileName);

              await file.save(thumbnailBuffer, {
                metadata: {
                  contentType: 'image/jpeg',
                  cacheControl: 'public, max-age=31536000',
                },
              });

              // Make the file publicly accessible
              await file.makePublic();

              // Get the public URL
              const publicUrl =
                `https://storage.googleapis.com/${bucket.name}/${fileName}`;

              // Save the public URL to Firestore
              await recipeDoc.ref.update({imageThumbnail: publicUrl});
              recipe.imageThumbnail = publicUrl;

              console.log(
                  `Generated thumbnail for recipe ${recipeDoc.id}: ${publicUrl}`);
            }
          } catch (thumbErr) {
            console.warn('shareRecipe: thumbnail generation failed:', thumbErr);
          }
        }

        // Load the custom app logo URL from settings (uploaded via the Settings UI).
        // Fall back to the static logo if no custom logo has been configured.
        let defaultLogoUrl = STATIC_FALLBACK_LOGO_URL;
        try {
          const settingsDoc = await db.doc('settings/app').get();
          const settingsData = settingsDoc.data();
          if (settingsData?.appLogoImageUrl) {
            defaultLogoUrl = settingsData.appLogoImageUrl;
          }
        } catch (settingsErr) {
          console.warn('shareRecipe: failed to load settings for logo fallback:', settingsErr);
        }

        const html = generateRecipeShareHtml(recipe, shareId, canonicalUrl, defaultLogoUrl);
        res.status(200).set('Content-Type', 'text/html; charset=utf-8').send(html);
      } catch (error) {
        console.error('shareRecipe: error loading recipe:', error);
        res.status(500).send('Fehler beim Laden des Rezepts');
      }
    },
);

/**
 * Validate shareId format for public share endpoints.
 * @param {string} shareId - Share UUID to validate
 * @throws {HttpsError} Throws invalid-argument when shareId is missing/invalid
 */
function assertValidShareId(shareId) {
  if (!shareId || !SHARE_ID_REGEX.test(shareId)) {
    throw new HttpsError('invalid-argument', 'Ungültige shareId');
  }
}

/**
 * Collect all recipe IDs referenced by a menu (sections + legacy recipeIds).
 * @param {Object} menuData - Menu document data
 * @return {Set<string>} Unique recipe IDs referenced by the menu
 */
function collectRecipeIdsFromMenu(menuData) {
  const recipeIds = new Set();

  if (Array.isArray(menuData?.sections)) {
    menuData.sections.forEach((section) => {
      if (Array.isArray(section?.recipeIds)) {
        section.recipeIds.forEach((recipeId) => {
          if (typeof recipeId === 'string' && recipeId.trim()) {
            recipeIds.add(recipeId.trim());
          }
        });
      }
    });
  }

  if (Array.isArray(menuData?.recipeIds)) {
    menuData.recipeIds.forEach((recipeId) => {
      if (typeof recipeId === 'string' && recipeId.trim()) {
        recipeIds.add(recipeId.trim());
      }
    });
  }

  return recipeIds;
}

exports.getSharedRecipeByShareId = onCall(
    {region: 'us-central1', cors: ALLOWED_ORIGINS, invoker: 'public'},
    async (request) => {
      const shareId = typeof request.data?.shareId === 'string' ?
        request.data.shareId.trim() : '';
      assertValidShareId(shareId);

      const snapshot = await admin.firestore()
          .collection('recipes')
          .where('shareId', '==', shareId)
          .limit(1)
          .get();

      if (snapshot.empty) {
        throw new HttpsError('not-found', 'Rezept nicht gefunden');
      }

      const recipeDoc = snapshot.docs[0];
      return {recipe: {id: recipeDoc.id, ...recipeDoc.data()}};
    },
);

exports.getSharedMenuByShareId = onCall(
    {region: 'us-central1', cors: ALLOWED_ORIGINS, invoker: 'public'},
    async (request) => {
      const shareId = typeof request.data?.shareId === 'string' ?
        request.data.shareId.trim() : '';
      assertValidShareId(shareId);

      const snapshot = await admin.firestore()
          .collection('menus')
          .where('shareId', '==', shareId)
          .limit(1)
          .get();

      if (snapshot.empty) {
        throw new HttpsError('not-found', 'Menü nicht gefunden');
      }

      const menuDoc = snapshot.docs[0];
      return {menu: {id: menuDoc.id, ...menuDoc.data()}};
    },
);

exports.getSharedRecipesByIds = onCall(
    {region: 'us-central1', cors: ALLOWED_ORIGINS, invoker: 'public'},
    async (request) => {
      const shareId = typeof request.data?.shareId === 'string' ?
        request.data.shareId.trim() : '';
      assertValidShareId(shareId);

      const requestedRecipeIds = request.data?.recipeIds;
      if (!Array.isArray(requestedRecipeIds)) {
        throw new HttpsError('invalid-argument', 'recipeIds muss ein Array sein');
      }

      if (requestedRecipeIds.length > MAX_SHARED_RECIPE_IDS) {
        throw new HttpsError(
            'invalid-argument',
            `Maximal ${MAX_SHARED_RECIPE_IDS} recipeIds erlaubt`,
        );
      }

      const invalidRecipeId = requestedRecipeIds.find(
          (recipeId) => typeof recipeId !== 'string' || !recipeId.trim(),
      );
      if (invalidRecipeId !== undefined) {
        throw new HttpsError(
            'invalid-argument',
            'recipeIds muss ein Array aus nicht-leeren Strings sein',
        );
      }

      const uniqueRequestedRecipeIds = [...new Set(
          requestedRecipeIds.map((recipeId) => recipeId.trim()),
      )];
      if (uniqueRequestedRecipeIds.length === 0) {
        return {recipes: []};
      }

      const db = admin.firestore();
      const menuSnapshot = await db
          .collection('menus')
          .where('shareId', '==', shareId)
          .limit(1)
          .get();
      if (menuSnapshot.empty) {
        throw new HttpsError('not-found', 'Menü nicht gefunden');
      }

      const allowedRecipeIds = collectRecipeIdsFromMenu(menuSnapshot.docs[0].data());
      const authorizedRecipeIds = uniqueRequestedRecipeIds.filter(
          (recipeId) => allowedRecipeIds.has(recipeId),
      );
      if (authorizedRecipeIds.length === 0) {
        return {recipes: []};
      }

      const recipeSnaps = await Promise.all(
          authorizedRecipeIds.map((recipeId) => db.collection('recipes').doc(recipeId).get()),
      );
      const recipes = recipeSnaps
          .filter((snap) => snap.exists)
          .map((snap) => ({id: snap.id, ...snap.data()}));

      return {recipes};
    },
);


/**
 * Cloud Function: Notify private-list members about a new or added recipe.
 *
 * Called by the client after a recipe is created in (or added to) a private
 * list.  Looks up the list members, fetches their FCM tokens from Firestore,
 * and sends a push notification to every member except the actor.
 *
 * Input data:
 *   - groupId  {string}            Firestore ID of the private list
 *   - recipeId {string}            Firestore ID of the recipe
 *   - actorId  {string}            Firestore ID of the user who acted
 *   - action   {'created'|'added'} Whether the recipe was newly created or added
 *
 * Returns: { success: boolean, sent: number }
 */
exports.notifyPrivateListMembers = onCall(
    {maxInstances: 10},
    async (request) => {
      const callerAuth = request.auth;
      if (!callerAuth) {
        throw new HttpsError(
            'unauthenticated',
            'Sie müssen angemeldet sein.',
        );
      }

      const {groupId, recipeId, actorId, action} = request.data;

      if (!groupId || !recipeId || !actorId) {
        throw new HttpsError(
            'invalid-argument',
            'groupId, recipeId und actorId sind erforderlich.',
        );
      }

      const db = admin.firestore();

      // 1. Load the group to get member list
      const groupSnap = await db.collection('groups').doc(groupId).get();
      if (!groupSnap.exists) {
        throw new HttpsError('not-found', 'Gruppe nicht gefunden.');
      }
      const groupData = groupSnap.data();

      if (groupData.type !== 'private') {
        // Only send notifications for private lists
        return {success: true, sent: 0};
      }

      // Collect all member IDs (owner + memberIds), excluding the actor
      const ownerIdEntry = groupData.ownerId ? [groupData.ownerId] : [];
      const memberIds = Array.isArray(groupData.memberIds)
        ? groupData.memberIds
        : [];
      const allMemberIds = [...new Set([...ownerIdEntry, ...memberIds])].filter(
          (id) => id !== actorId,
      );

      if (allMemberIds.length === 0) {
        return {success: true, sent: 0};
      }

      // 2. Load the recipe title for the notification body
      let recipeTitle = 'Ein Rezept';
      try {
        const recipeSnap = await db.collection('recipes').doc(recipeId).get();
        if (recipeSnap.exists) {
          recipeTitle = recipeSnap.data().title || recipeTitle;
        }
      } catch (recipeErr) {
        console.warn(
            'notifyPrivateListMembers: could not load recipe title',
            recipeErr,
        );
      }

      // 3. Collect FCM tokens for the relevant members
      const tokenFetches = allMemberIds.map((uid) =>
        db.collection('users').doc(uid).get(),
      );
      const userSnaps = await Promise.all(tokenFetches);

      const tokens = [];
      userSnaps.forEach((snap) => {
        if (!snap.exists) return;
        const userData = snap.data();
        if (Array.isArray(userData.fcmTokens)) {
          tokens.push(...userData.fcmTokens.filter(Boolean));
        }
      });

      if (tokens.length === 0) {
        return {success: true, sent: 0};
      }

      // 4. Build the notification payload
      const listName = groupData.name || 'einer privaten Liste';
      const actionLabel =
        action === 'created' ? 'erstellt' : 'hinzugefügt';
      const notificationTitle = `Neues Rezept in „${listName}"`;
      const notificationBody = `„${recipeTitle}" wurde ${actionLabel}.`;
      const notificationPayload = {
        data: {
          title: notificationTitle,
          body: notificationBody,
          icon: '/logo192.png',
          badge: '/favicon.ico',
          groupId,
          recipeId,
          action: action || 'added',
          notificationId: `${groupId}-${recipeId}-${Date.now()}`,
        },
        apns: {
          headers: {
            'apns-push-type': 'alert',
            'apns-priority': '10',
          },
          payload: {
            aps: {
              alert: {
                title: notificationTitle,
                body: notificationBody,
              },
              sound: 'default',
              'mutable-content': 1,
            },
          },
        },
        webpush: {
          fcm_options: {
            link: '/',
          },
        },
      };

      // 5. Send notifications in batches (FCM sendEachForMulticast limit: 500)
      const BATCH_SIZE = 500;
      let sentCount = 0;
      const staleTokens = [];

      for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
        const batch = tokens.slice(i, i + BATCH_SIZE);
        try {
          const response = await admin.messaging().sendEachForMulticast({
            tokens: batch,
            ...notificationPayload,
          });

          sentCount += response.successCount;

          // Collect tokens that are no longer valid
          response.responses.forEach((resp, idx) => {
            if (
              !resp.success &&
              (resp.error?.code ===
                'messaging/registration-token-not-registered' ||
                resp.error?.code === 'messaging/invalid-registration-token')
            ) {
              staleTokens.push(batch[idx]);
            }
          });
        } catch (sendErr) {
          console.error(
              'notifyPrivateListMembers: batch send error',
              sendErr,
          );
        }
      }

      // 6. Remove stale tokens from Firestore (best-effort, non-blocking)
      if (staleTokens.length > 0) {
        const removePromises = userSnaps.map(async (snap) => {
          if (!snap.exists) return;
          const userData = snap.data();
          if (!Array.isArray(userData.fcmTokens)) return;
          const updatedTokens = userData.fcmTokens.filter(
              (t) => !staleTokens.includes(t),
          );
          if (updatedTokens.length !== userData.fcmTokens.length) {
            await snap.ref.update({fcmTokens: updatedTokens});
          }
        });
        await Promise.allSettled(removePromises);
      }

      console.log(
          `notifyPrivateListMembers: sent ${sentCount} notification(s) ` +
          `for recipe ${recipeId} in group ${groupId}`,
      );
      return {success: true, sent: sentCount};
    },
);

/**
 * Backfills thumbnails for all existing recipes that have images but lack
 * a `thumbnailUrl` on one or more of their image entries.
 *
 * The function processes up to `batchSize` (default 50) recipes per invocation
 * to stay within Cloud Functions time limits. Call it multiple times if needed.
 *
 * For each image without a `thumbnailUrl`:
 *  1. Downloads the full image from Firebase Storage (or from a public URL).
 *  2. Resizes it to at most 400 × 300 px using sharp.
 *  3. Uploads the thumbnail to `thumbnails/recipe-thumb-{recipeId}-{idx}.jpg`.
 *  4. Updates the Firestore document with the new `thumbnailUrl` values.
 *
 * Only callable by admin users.
 */
exports.backfillRecipeThumbnails = onCall(
    {
      memory: '1GiB',
      timeoutSeconds: 540,
      maxInstances: 1,
    },
    async (request) => {
      // Only admins may trigger backfill
      const callerUid = request.auth?.uid;
      if (!callerUid) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
      }
      const callerDoc = await admin.firestore().doc(`users/${callerUid}`).get();
      if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
        throw new HttpsError('permission-denied', 'Admin role required.');
      }

      const {batchSize = 50} = request.data || {};
      const db = admin.firestore();
      const bucket = admin.storage().bucket();

      // Fetch recipes in batches
      const snapshot = await db.collection('recipes').limit(batchSize).get();
      const results = {processed: 0, updated: 0, skipped: 0, errors: []};

      for (const doc of snapshot.docs) {
        results.processed++;
        const data = doc.data();

        // Build images list from the `images` array or from the legacy `image` field
        let images = Array.isArray(data.images) && data.images.length > 0
          ? data.images
          : (data.image ? [{url: data.image, isDefault: true}] : []);

        if (images.length === 0) {
          results.skipped++;
          continue;
        }

        // Check if any image is missing a thumbnailUrl
        const needsUpdate = images.some(
            (img) => img.url && !img.thumbnailUrl,
        );
        if (!needsUpdate) {
          results.skipped++;
          continue;
        }

        try {
          const updatedImages = await Promise.all(
              images.map(async (img, idx) => {
                if (!img.url || img.thumbnailUrl) {
                  return img; // Already has thumbnail or has no URL
                }

                try {
                  let imageBuffer;

                  if (img.url.startsWith('data:image/')) {
                    const matches = img.url.match(/^data:image\/\w+;base64,(.+)$/s);
                    if (!matches) return img;
                    imageBuffer = Buffer.from(matches[1], 'base64');
                  } else {
                    const response = await fetch(img.url);
                    if (!response.ok) {
                      throw new Error(`HTTP ${response.status}`);
                    }
                    const arrayBuffer = await response.arrayBuffer();
                    imageBuffer = Buffer.from(arrayBuffer);
                  }

                  const thumbnailBuffer = await sharp(imageBuffer)
                      .resize(400, 300, {fit: 'inside', withoutEnlargement: true})
                      .jpeg({quality: 75})
                      .toBuffer();

                  const fileName =
                    `thumbnails/recipe-thumb-${doc.id}-${idx}.jpg`;
                  const file = bucket.file(fileName);

                  await file.save(thumbnailBuffer, {
                    metadata: {
                      contentType: 'image/jpeg',
                      cacheControl: 'public, max-age=31536000',
                    },
                  });
                  await file.makePublic();

                  const thumbnailUrl =
                    `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                  return {...img, thumbnailUrl};
                } catch (imgErr) {
                  console.warn(
                      `backfillRecipeThumbnails: failed for recipe ` +
                      `${doc.id} image ${idx}:`, imgErr.message,
                  );
                  return img; // Leave unchanged on error
                }
              }),
          );

          // Persist updates to Firestore
          const updatePayload = {images: updatedImages};
          // Also update top-level image if the default image gained a thumbnail
          const defaultImg = updatedImages.find((i) => i.isDefault) ||
            updatedImages[0];
          if (defaultImg?.thumbnailUrl && !data.imageThumbnail) {
            updatePayload.imageThumbnail = defaultImg.thumbnailUrl;
          }

          await doc.ref.update(updatePayload);
          results.updated++;
        } catch (docErr) {
          console.error(
              `backfillRecipeThumbnails: error processing recipe ${doc.id}:`,
              docErr,
          );
          results.errors.push({recipeId: doc.id, error: docErr.message});
        }
      }

      console.log('backfillRecipeThumbnails complete:', results);
      return results;
    },
);

// ---------------------------------------------------------------------------
// Daily AI importer self-test
// ---------------------------------------------------------------------------

/**
 * Minimal HTML snippet used as test input for the daily AI importer test.
 * Kept small to minimise API cost. Contains a clearly structured recipe so
 * the AI can extract all required fields reliably.
 */
const IMPORTER_TEST_HTML = `<!DOCTYPE html>
<html lang="de">
<head><title>Testrezept: Rührei</title></head>
<body>
<h1>Rührei</h1>
<p>Für 2 Personen. Zubereitungszeit: 10 Minuten. Schwierigkeit: 1</p>
<h2>Zutaten</h2>
<ul>
  <li>4 Eier</li>
  <li>2 Esslöffel Butter</li>
  <li>1 Prise Salz</li>
</ul>
<h2>Zubereitung</h2>
<ol>
  <li>Eier in einer Schüssel verquirlen und mit Salz würzen.</li>
  <li>Butter in einer Pfanne bei mittlerer Hitze schmelzen.</li>
  <li>Eimasse hineingeben und unter ständigem Rühren stocken lassen.</li>
  <li>Vom Herd nehmen und sofort servieren.</li>
</ol>
</body>
</html>`;

/**
 * Minimum number of ingredients / steps expected from the HTML test recipe.
 */
const IMPORTER_TEST_MIN_INGREDIENTS = 2;
const IMPORTER_TEST_MIN_STEPS = 2;

/**
 * Load the AI recipe extraction prompt for internal tests.
 * Falls back to the built-in default prompt instead of throwing an HttpsError
 * (which is only appropriate inside onCall handlers).
 *
 * @returns {Promise<string>} The extraction prompt string
 */
async function getAiRecipePromptForTest() {
  try {
    const db = admin.firestore();
    const settingsDoc = await db.collection('settings').doc('app').get();
    if (settingsDoc.exists) {
      const settings = settingsDoc.data();
      if (settings.aiRecipePrompt && settings.aiRecipePrompt.trim()) {
        return settings.aiRecipePrompt;
      }
    }
  } catch (err) {
    console.warn('dailyAiImporterTest: could not load prompt from Firestore:', err);
  }
  return DEFAULT_AI_RECIPE_PROMPT;
}

/**
 * Validate that a normalised recipe object returned by callGeminiTextAPI has
 * all expected fields and meets minimum content thresholds.
 *
 * @param {Object} recipe - Normalised recipe object
 * @returns {{valid: boolean, issues: string[]}}
 */
function validateImporterResult(recipe) {
  const issues = [];

  if (!recipe || typeof recipe !== 'object') {
    return {valid: false, issues: ['Kein Ergebnisobjekt erhalten']};
  }

  if (!recipe.ingredients || !Array.isArray(recipe.ingredients) ||
      recipe.ingredients.length < IMPORTER_TEST_MIN_INGREDIENTS) {
    issues.push(
        `Zu wenige Zutaten: erwartet mind. ${IMPORTER_TEST_MIN_INGREDIENTS}, ` +
        `erhalten ${Array.isArray(recipe.ingredients) ? recipe.ingredients.length : 0}`,
    );
  }

  if (!recipe.steps || !Array.isArray(recipe.steps) ||
      recipe.steps.length < IMPORTER_TEST_MIN_STEPS) {
    issues.push(
        `Zu wenige Zubereitungsschritte: erwartet mind. ${IMPORTER_TEST_MIN_STEPS}, ` +
        `erhalten ${Array.isArray(recipe.steps) ? recipe.steps.length : 0}`,
    );
  }

  return {valid: issues.length === 0, issues};
}

/**
 * Run a single named test and return a structured result.
 * The provided async function must resolve to { details: string } on success
 * and throw an error on failure.
 *
 * @param {string} name - Human-readable test name
 * @param {Function} fn - Async test function
 * @returns {Promise<{name: string, success: boolean, details: string, durationMs: number}>}
 */
async function runTest(name, fn) {
  const start = Date.now();
  try {
    const {details} = await fn();
    return {name, success: true, details, durationMs: Date.now() - start};
  } catch (err) {
    return {
      name,
      success: false,
      details: err.message || String(err),
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Execute all AI recipe importer tests.
 *
 * Tests covered:
 * 1. Configuration – Gemini API key present + prompt accessible
 * 2. processHtmlWithAI – full end-to-end extraction from test HTML
 * 3. fetchRecipeHtml – HTTP connectivity to a public recipe page
 *
 * @param {string} apiKey - Gemini API key value
 * @returns {Promise<Array<{name: string, success: boolean, details: string, durationMs: number}>>}
 */
async function runAllImporterTests(apiKey) {
  const tests = [
    // Test 1: verify Gemini API key is present and prompt is loadable
    runTest('Konfiguration (GEMINI_API_KEY & Prompt)', async () => {
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY-Secret ist nicht konfiguriert');
      }
      const prompt = await getAiRecipePromptForTest();
      if (!prompt || prompt.trim().length === 0) {
        throw new Error('KI-Prompt ist leer oder nicht konfiguriert');
      }
      return {
        details:
          `API-Schlüssel vorhanden. Prompt geladen (${prompt.length} Zeichen).`,
      };
    }),

    // Test 2: full end-to-end HTML processing via Gemini
    runTest('processHtmlWithAI – HTML-Rezept-Extraktion (Gemini)', async () => {
      const result = await callGeminiTextAPI(
          IMPORTER_TEST_HTML, 'de', apiKey, undefined, undefined,
      );
      const {valid, issues} = validateImporterResult(result);
      const title = result.title || '(kein Titel)';
      const ingredientCount = Array.isArray(result.ingredients) ?
        result.ingredients.length : 0;
      const stepCount = Array.isArray(result.steps) ? result.steps.length : 0;
      if (!valid) {
        throw new Error(`Validierungsfehler: ${issues.join('; ')}`);
      }
      return {
        details:
          `Rezept "${title}" extrahiert – ` +
          `${ingredientCount} Zutaten, ${stepCount} Schritte.`,
      };
    }),

    // Test 3: HTTP connectivity for fetchRecipeHtml
    runTest('fetchRecipeHtml – HTTP-Abruf einer Rezept-URL', async () => {
      const testUrl =
        'https://httpbin.org/html';
      const response = await fetch(testUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; RecipebookImporterTest/1.0)',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const html = await response.text();
      if (html.length < 500) {
        throw new Error(
            `Antwort zu kurz (${html.length} Zeichen) – URL möglicherweise nicht erreichbar`,
        );
      }
      return {
        details: `HTTP ${response.status}, ${html.length} Zeichen HTML empfangen.`,
      };
    }),
  ];

  return await Promise.all(tests);
}

/**
 * Build the subject line, plain-text body and HTML body for the test result
 * e-mail that is sent to admins after each daily run.
 *
 * @param {Array<{name: string, success: boolean, details: string, durationMs: number}>} results
 * @param {string} runAt - Human-readable timestamp of the test run
 * @returns {{subject: string, text: string, html: string}}
 */
function buildTestResultEmailContent(results, runAt) {
  const totalCount = results.length;
  const passedCount = results.filter((r) => r.success).length;
  const failedCount = totalCount - passedCount;
  const allPassed = failedCount === 0;

  const subject = allPassed ?
    `✅ KI-Importer-Test: Alle ${totalCount} Tests erfolgreich (${runAt})` :
    `❌ KI-Importer-Test: ${failedCount} von ${totalCount} Tests fehlgeschlagen (${runAt})`;

  // ---- Plain-text body ----
  let text = `KI-Rezeptimporter – Täglicher Testbericht\n`;
  text += `Ausgeführt: ${runAt}\n`;
  text += `Ergebnis: ${passedCount}/${totalCount} Tests bestanden\n\n`;
  for (const r of results) {
    text += `${r.success ? '✅' : '❌'} ${r.name}\n`;
    text += `   ${r.details}\n`;
    text += `   Dauer: ${r.durationMs} ms\n\n`;
  }
  if (!allPassed) {
    text += `\nBitte prüfen Sie die fehlgeschlagenen Tests.\n`;
    text += `Logs: https://console.firebase.google.com/project/_/functions/logs\n`;
  }

  // ---- HTML body ----
  const statusColor = allPassed ? '#2e7d32' : '#c62828';
  const statusText = allPassed ?
    `Alle ${totalCount} Tests bestanden` :
    `${failedCount} von ${totalCount} Tests fehlgeschlagen`;

  let rowsHtml = '';
  for (const r of results) {
    const icon = r.success ? '✅' : '❌';
    const rowBg = r.success ? '#f1f8e9' : '#ffebee';
    rowsHtml +=
      `<tr style="background:${rowBg}">` +
      `<td style="padding:8px 12px;border-bottom:1px solid #eee">` +
        `${icon} ${escapeHtml(r.name)}</td>` +
      `<td style="padding:8px 12px;border-bottom:1px solid #eee">` +
        `${escapeHtml(r.details)}</td>` +
      `<td style="padding:8px 12px;border-bottom:1px solid #eee;` +
        `text-align:right">${r.durationMs} ms</td>` +
      `</tr>`;
  }

  const logsLinkHtml = allPassed ? '' :
    `<p><a href="https://console.firebase.google.com/project/_/functions/logs">` +
    `Firebase-Logs öffnen</a></p>`;

  const html =
    `<div style="font-family:Arial,sans-serif;max-width:700px">` +
    `<h2 style="color:${statusColor}">` +
      `KI-Rezeptimporter – Täglicher Testbericht</h2>` +
    `<p><strong>Ausgeführt:</strong> ${escapeHtml(runAt)}</p>` +
    `<p style="color:${statusColor};font-weight:bold">` +
      `${escapeHtml(statusText)}</p>` +
    `<table style="width:100%;border-collapse:collapse;margin-top:16px">` +
    `<thead><tr style="background:#f5f5f5">` +
    `<th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd">Test</th>` +
    `<th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd">Details</th>` +
    `<th style="padding:8px 12px;text-align:right;border-bottom:2px solid #ddd">Dauer</th>` +
    `</tr></thead>` +
    `<tbody>${rowsHtml}</tbody>` +
    `</table>` +
    logsLinkHtml +
    `</div>`;

  return {subject, text, html};
}

function extractRecipeIngredientItems(recipeData = {}) {
  const rawIngredients = Array.isArray(recipeData?.zutaten) ?
    recipeData.zutaten :
    (Array.isArray(recipeData?.ingredients) ? recipeData.ingredients : []);

  return rawIngredients
      .map((item) => (typeof item === 'string' ? {text: item} : item))
      .filter((item) => item && item.type !== 'heading')
      .filter((item) => item.ignoreNutritionCalculation !== true)
      .map((item) => ({
        ...item,
        text: String(item.text || '').trim(),
      }))
      .filter((item) => item.text !== '');
}

function toMilliseconds(date) {
  if (date == null) return null;
  if (date?.toMillis) return date.toMillis();
  if (date instanceof Date) return date.getTime();
  if (typeof date === 'number') return date;
  return null;
}

function recipeUsesRecalcIngredient(recipeData = {}, recalcIngredientMap = new Map()) {
  if (!recalcIngredientMap || recalcIngredientMap.size === 0) return false;
  const calcCompletedAt = recipeData?.naehrwerte?.calcCompletedAt ?? null;
  if (calcCompletedAt == null) return false; // noch nie berechnet → nicht im Recalc-Job
  const ingredientItems = extractRecipeIngredientItems(recipeData);
  return ingredientItems.some((item) => {
    const ingredientID = String(item.ingredientID || '').trim();
    if (!ingredientID || !recalcIngredientMap.has(ingredientID)) return false;
    const recalcDate = recalcIngredientMap.get(ingredientID);
    if (recalcDate == null) return true; // kein recalcDate → immer recalculieren
    const recalcDateMs = toMilliseconds(recalcDate);
    if (recalcDateMs == null) return true;
    return recalcDateMs > calcCompletedAt;
  });
}

function escapeNutritionRecalcHtml(value) {
  return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}

function buildNutritionRecalcSummaryMail(report, runAt) {
  const updatedCount = report.updatedRecipes.length;
  const failedCount = report.failedRecipes.length;
  const skippedCount = report.skippedRecipes.length;
  const totalAffected = report.affectedRecipeCount;
  const status = failedCount === 0 && !report.fatalError ? '✅ Erfolgreich' : '⚠️ Mit Fehlern';
  const subject = `[RecipeBook] Nährwert-Recalc ${status} (${runAt})`;

  let text = `Nährwert-Recalc Bericht\n`;
  text += `Ausgeführt: ${runAt}\n`;
  text += `Trigger: ${report.triggeredBy}\n`;
  text += `Betroffene Rezepte: ${totalAffected}\n`;
  text += `Aktualisiert: ${updatedCount}\n`;
  text += `Übersprungen: ${skippedCount}\n`;
  text += `Fehlgeschlagen: ${failedCount}\n`;
  text += `recalc zurückgesetzt: ${report.resetRecalcCount}\n`;
  if (report.fatalError) {
    text += `\nFataler Fehler: ${report.fatalError}\n`;
  }
  if (updatedCount > 0) {
    text += `\nAktualisierte Rezepte:\n`;
    report.updatedRecipes.forEach((entry) => {
      text += `- ${entry.title} (${entry.recipeId})\n`;
    });
  }
  if (failedCount > 0) {
    text += `\nFehlgeschlagene Rezepte:\n`;
    report.failedRecipes.forEach((entry) => {
      text += `- ${entry.title} (${entry.recipeId}): ${entry.error}\n`;
    });
  }

  const htmlList = (entries, formatter) => {
    if (!entries || entries.length === 0) return '<p>Keine</p>';
    return `<ul>${entries.map((entry) => `<li>${formatter(entry)}</li>`).join('')}</ul>`;
  };

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:760px">
      <h2>Nährwert-Recalc Bericht</h2>
      <p><strong>Ausgeführt:</strong> ${escapeNutritionRecalcHtml(runAt)}</p>
      <p><strong>Trigger:</strong> ${escapeNutritionRecalcHtml(report.triggeredBy)}</p>
      <p><strong>Betroffene Rezepte:</strong> ${totalAffected}</p>
      <p><strong>Aktualisiert:</strong> ${updatedCount}</p>
      <p><strong>Übersprungen:</strong> ${skippedCount}</p>
      <p><strong>Fehlgeschlagen:</strong> ${failedCount}</p>
      <p><strong>recalc zurückgesetzt:</strong> ${report.resetRecalcCount}</p>
      ${report.fatalError ? `<p style="color:#c62828"><strong>Fataler Fehler:</strong> ${escapeNutritionRecalcHtml(report.fatalError)}</p>` : ''}
      <h3>Aktualisierte Rezepte</h3>
      ${htmlList(report.updatedRecipes, (entry) => `${escapeNutritionRecalcHtml(entry.title)} (${escapeNutritionRecalcHtml(entry.recipeId)})`)}
      <h3>Fehlgeschlagene Rezepte</h3>
      ${htmlList(report.failedRecipes, (entry) => `${escapeNutritionRecalcHtml(entry.title)} (${escapeNutritionRecalcHtml(entry.recipeId)}): ${escapeNutritionRecalcHtml(entry.error)}`)}
    </div>
  `;

  return {subject, text, html};
}

async function sendNutritionRecalcSummary(report) {
  const db = admin.firestore();
  const usersSnapshot = await db.collection('users').where('isAdmin', '==', true).get();
  const adminEmails = [];
  usersSnapshot.forEach((doc) => {
    const data = doc.data();
    if (data.email) adminEmails.push(data.email);
  });

  if (adminEmails.length === 0) {
    console.log('runNutritionRecalcForFlaggedRecipes: no admin emails found, skipping email');
    return;
  }

  const smtpHostVal = smtpHost.value();
  const smtpPortVal = smtpPort.value();
  const smtpUserVal = smtpUser.value();
  const smtpPasswordVal = smtpPassword.value();
  const smtpFromVal = smtpFrom.value();
  if (!smtpHostVal || !smtpUserVal || !smtpPasswordVal || !smtpFromVal) {
    console.warn('runNutritionRecalcForFlaggedRecipes: SMTP not fully configured – skipping email');
    return;
  }

  const smtpPortNum = parseInt(smtpPortVal || '587', 10);
  const transporter = nodemailer.createTransport({
    host: smtpHostVal,
    port: smtpPortNum,
    secure: smtpPortNum === 465,
    auth: {user: smtpUserVal, pass: smtpPasswordVal},
  });

  const runAt = new Date(report.finishedAt || Date.now()).toLocaleString('de-DE', {timeZone: 'Europe/Berlin'});
  const mailContent = buildNutritionRecalcSummaryMail(report, runAt);
  await transporter.sendMail({
    from: smtpFromVal,
    bcc: adminEmails.join(', '),
    subject: mailContent.subject,
    text: mailContent.text,
    html: mailContent.html,
  });
}

async function setRecalcFalseForReferences(referenceDocs = []) {
  if (!Array.isArray(referenceDocs) || referenceDocs.length === 0) {
    return 0;
  }
  const db = admin.firestore();
  let updatedCount = 0;
  let batch = db.batch();
  let operationCount = 0;

  for (const docSnap of referenceDocs) {
    batch.update(docSnap.ref, {recalc: false});
    operationCount += 1;
    if (operationCount >= 450) {
      await batch.commit();
      updatedCount += operationCount;
      batch = db.batch();
      operationCount = 0;
    }
  }

  if (operationCount > 0) {
    await batch.commit();
    updatedCount += operationCount;
  }

  return updatedCount;
}

async function runNutritionRecalcForFlaggedRecipesCore({triggeredBy = 'schedule'} = {}) {
  const db = admin.firestore();
  const report = {
    triggeredBy,
    startedAt: Date.now(),
    finishedAt: null,
    affectedRecipeCount: 0,
    updatedRecipes: [],
    failedRecipes: [],
    skippedRecipes: [],
    resetRecalcCount: 0,
    fatalError: null,
  };

  let recalcReferenceDocs = [];
  try {
    const recalcSnapshot = await db
        .collection(NUTRITION_REFERENCE_COLLECTION)
        .where('recalc', '==', true)
        .get();
    recalcReferenceDocs = recalcSnapshot.docs;

    const recalcIngredientMap = new Map(
        recalcSnapshot.docs
            .map((docSnap) => {
              const data = docSnap.data() || {};
              const ingredientID = String(data?.ingredientID || docSnap.id || '').trim();
              if (!ingredientID) return null;
              return [ingredientID, data?.recalcDate ?? null];
            })
            .filter(Boolean)
    );

    if (recalcIngredientMap.size === 0) {
      console.log('runNutritionRecalcForFlaggedRecipes: no recalc ingredientIDs found');
      return report;
    }

    const recipesSnapshot = await db.collection('recipes').get();
    const affectedRecipes = recipesSnapshot.docs.filter((recipeDoc) =>
      recipeUsesRecalcIngredient(recipeDoc.data() || {}, recalcIngredientMap)
    );
    report.affectedRecipeCount = affectedRecipes.length;

    for (const recipeDoc of affectedRecipes) {
      const recipeData = recipeDoc.data() || {};
      const recipeTitle = String(recipeData.title || recipeDoc.id);
      const ingredientItems = extractRecipeIngredientItems(recipeData);
      const regularIngredients = ingredientItems
          .map((item) => item.text)
          .filter((text) => !/#recipe:[^:]+:/i.test(text));
      const skippedRecipeLinkIngredients = ingredientItems
          .filter((item) => /#recipe:[^:]+:/i.test(item.text))
          .map((item) => item.text);

      if (regularIngredients.length === 0) {
        report.skippedRecipes.push({
          recipeId: recipeDoc.id,
          title: recipeTitle,
          reason: 'Keine berechenbaren Zutaten',
        });
        continue;
      }

      try {
        const calcResult = await calculateNutritionFromOpenFoodFactsCore({
          ingredients: regularIngredients,
          portionen: Number(recipeData.portionen) > 0 ? Number(recipeData.portionen) : 1,
          callerLabel: `nightly job (${recipeDoc.id})`,
          calcYieldGrams: recipeData?.naehrwerte?.calcYieldGrams ?? null,
          calcYieldFactor: recipeData?.naehrwerte?.calcYieldFactor ?? null,
        });
        const notIncluded = calcResult.details
            .filter((entry) => entry.found === false)
            .map((entry) => ({
              ingredient: entry.ingredient,
              error: entry.error || 'Nicht gefunden',
            }));
        skippedRecipeLinkIngredients.forEach((ingredient) => {
          notIncluded.push({
            ingredient,
            error: 'Rezept-Link konnte im Nachtjob nicht automatisch aufgelöst werden.',
            isRecipeLink: true,
          });
        });

        await recipeDoc.ref.set({
          naehrwerte: {
            ...(recipeData.naehrwerte || {}),
            ...calcResult.naehrwerte,
            calcPending: false,
            calcCompletedAt: Date.now(),
            calcError: null,
            calcNotIncluded: notIncluded.length > 0 ? notIncluded : null,
            calcFoundCount: calcResult.foundCount,
            calcTotalCount: calcResult.totalCount + skippedRecipeLinkIngredients.length,
            calcYieldGrams: recipeData?.naehrwerte?.calcYieldGrams ?? null,
            calcYieldFactor: recipeData?.naehrwerte?.calcYieldFactor ?? null,
            calcFinalWeightGrams: calcResult.calcFinalWeightGrams ?? null,
            calcPer100g: calcResult.calcPer100g ?? null,
          },
        }, {merge: true});

        report.updatedRecipes.push({
          recipeId: recipeDoc.id,
          title: recipeTitle,
        });
      } catch (error) {
        const errorMessage = error?.message || 'Unbekannter Fehler';
        report.failedRecipes.push({
          recipeId: recipeDoc.id,
          title: recipeTitle,
          error: errorMessage,
        });
        try {
          await recipeDoc.ref.set({
            naehrwerte: {
              ...(recipeData.naehrwerte || {}),
              calcPending: false,
              calcCompletedAt: Date.now(),
              calcError: errorMessage,
            },
          }, {merge: true});
        } catch (persistError) {
          console.error(`runNutritionRecalcForFlaggedRecipes: could not persist calcError for ${recipeDoc.id}`, persistError);
        }
      }
    }
  } catch (error) {
    report.fatalError = error?.message || 'Unbekannter Fehler im Nachtjob';
    console.error('runNutritionRecalcForFlaggedRecipes: fatal error', error);
  } finally {
    try {
      if (!report.fatalError && report.failedRecipes.length === 0) {
        report.resetRecalcCount = await setRecalcFalseForReferences(recalcReferenceDocs);
      }
    } catch (resetError) {
      report.fatalError = report.fatalError || `recalc-Reset fehlgeschlagen: ${resetError?.message || resetError}`;
      console.error('runNutritionRecalcForFlaggedRecipes: could not reset recalc flags', resetError);
    }
    report.finishedAt = Date.now();
    try {
      await sendNutritionRecalcSummary(report);
    } catch (mailError) {
      console.error('runNutritionRecalcForFlaggedRecipes: could not send summary email', mailError);
    }
  }

  return report;
}

exports.runNutritionRecalcForFlaggedRecipes = onCall(
    {
      timeoutSeconds: 10,
      maxInstances: 1,
      secrets: [geminiApiKey, smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom],
    },
    async (request) => {
      const callerUid = request.auth?.uid;
      if (!callerUid) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
      }

      const callerDoc = await admin.firestore().doc(`users/${callerUid}`).get();
      const callerData = callerDoc.exists ? (callerDoc.data() || {}) : {};
      const canRunManualRecalc = (
        callerData.role === 'admin' ||
        callerData.role === 'moderator' ||
        callerData.isAdmin === true
      );
      if (!canRunManualRecalc) {
        throw new HttpsError('permission-denied', 'Admin or moderator role required.');
      }

      void runNutritionRecalcForFlaggedRecipesCore({triggeredBy: `manual:${callerUid}`})
          .catch((err) => console.error('runNutritionRecalcForFlaggedRecipes: background job error', err));

      return {
        started: true,
        message: 'Recalc-Job gestartet. Ergebnis wird per E-Mail gesendet.',
      };
    }
);

exports.nightlyNutritionRecalc = onSchedule(
    {
      schedule: '0 2 * * *',
      timeZone: 'Europe/Berlin',
      timeoutSeconds: 540,
      maxInstances: 1,
      secrets: [geminiApiKey, smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom],
    },
    async () => {
      await runNutritionRecalcForFlaggedRecipesCore({triggeredBy: 'schedule'});
    }
);

/**
 * Scheduled Cloud Function: run daily AI recipe importer self-tests and send
 * a summary e-mail to all admin users.
 *
 * Schedule: every day at 06:00 Europe/Berlin (MEZ/MESZ).
 *
 * The function can be disabled without redeployment by setting
 *   dailyImporterTestEnabled: false
 * in the `settings/app` Firestore document. Remove the field (or set it to
 * true) to re-enable the tests.
 *
 * Secrets required (same as other email-sending functions):
 *   GEMINI_API_KEY, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
 */
exports.dailyAiImporterTest = onSchedule(
    {
      schedule: '0 6 * * *',
      timeZone: 'Europe/Berlin',
      secrets: [geminiApiKey, smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom],
      memory: '512MiB',
      timeoutSeconds: 300,
    },
    async (_event) => {
      const runAt = new Date().toLocaleString('de-DE', {timeZone: 'Europe/Berlin'});
      console.log(`dailyAiImporterTest: starting test run at ${runAt}`);

      // Check whether the feature is enabled via Firestore configuration
      try {
        const db = admin.firestore();
        const settingsDoc = await db.collection('settings').doc('app').get();
        if (settingsDoc.exists && settingsDoc.data().dailyImporterTestEnabled === false) {
          console.log('dailyAiImporterTest: disabled via settings/app, skipping');
          return;
        }
      } catch (cfgErr) {
        console.warn('dailyAiImporterTest: could not read settings, proceeding:', cfgErr);
      }

      // Run all importer tests
      const apiKeyVal = geminiApiKey.value();
      let results;
      try {
        results = await runAllImporterTests(apiKeyVal);
      } catch (runErr) {
        console.error('dailyAiImporterTest: unexpected error running tests:', runErr);
        results = [{
          name: 'Test-Ausführung',
          success: false,
          details: `Unerwarteter Fehler: ${runErr.message}`,
          durationMs: 0,
        }];
      }

      const passedCount = results.filter((r) => r.success).length;
      console.log(
          `dailyAiImporterTest: ${passedCount}/${results.length} tests passed`,
      );

      // Collect admin e-mail addresses from Firestore
      const db = admin.firestore();
      const usersSnapshot = await db
          .collection('users').where('isAdmin', '==', true).get();
      const adminEmails = [];
      usersSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.email) adminEmails.push(data.email);
      });

      if (adminEmails.length === 0) {
        console.log('dailyAiImporterTest: no admin emails found, skipping email');
        return;
      }

      // Verify SMTP configuration
      const smtpHostVal = smtpHost.value();
      const smtpPortVal = smtpPort.value();
      const smtpUserVal = smtpUser.value();
      const smtpPasswordVal = smtpPassword.value();
      const smtpFromVal = smtpFrom.value();

      if (!smtpHostVal || !smtpUserVal || !smtpPasswordVal || !smtpFromVal) {
        console.warn('dailyAiImporterTest: SMTP not fully configured – skipping email');
        return;
      }

      const smtpPortNum = parseInt(smtpPortVal || '587', 10);
      const transporter = nodemailer.createTransport({
        host: smtpHostVal,
        port: smtpPortNum,
        secure: smtpPortNum === 465,
        auth: {user: smtpUserVal, pass: smtpPasswordVal},
      });

      const {subject, text, html} = buildTestResultEmailContent(results, runAt);

      try {
        await transporter.sendMail({
          from: smtpFromVal,
          bcc: adminEmails.join(', '),
          subject,
          text,
          html,
        });
        console.log(
            `dailyAiImporterTest: email sent to ${adminEmails.length} admin(s)`,
        );
      } catch (mailErr) {
        console.error('dailyAiImporterTest: error sending email:', mailErr);
      }
    },
);

/**
 * Season status constants – must stay in sync with
 * src/utils/seasonMatrix.js CURRENT_SEASON_STATUS.
 */
const CURRENT_SEASON_STATUS = {
  HAUPTSAISON: 'Hauptsaison',
  NEBENSAISON: 'Nebensaison',
  BALD_SAISON: 'Bald_Saison',
  KEINE_SAISON: 'Keine_Saison',
};

/**
 * Computes the current season status for one season matrix entry.
 *
 * @param {Object} entry - Firestore season matrix document data
 * @param {Date} date - Reference date (defaults to today)
 * @returns {string} One of CURRENT_SEASON_STATUS values
 */
function computeCurrentSeasonStatus(entry, date = new Date()) {
  const mainMonths = Array.isArray(entry.mainSeasonMonths) ? entry.mainSeasonMonths : [];
  const secondaryMonths = Array.isArray(entry.secondarySeasonMonths) ?
    entry.secondarySeasonMonths :
    [];

  const currentMonth = date.getMonth() + 1; // 1–12

  if (mainMonths.includes(currentMonth)) return CURRENT_SEASON_STATUS.HAUPTSAISON;
  if (secondaryMonths.includes(currentMonth)) return CURRENT_SEASON_STATUS.NEBENSAISON;

  // Check if a main-season month starts within the next 7 days
  for (let i = 1; i <= 7; i++) {
    const futureDate = new Date(date);
    futureDate.setDate(futureDate.getDate() + i);
    const futureMonth = futureDate.getMonth() + 1;
    if (mainMonths.includes(futureMonth)) return CURRENT_SEASON_STATUS.BALD_SAISON;
  }

  return CURRENT_SEASON_STATUS.KEINE_SAISON;
}

/**
 * Scheduled Cloud Function: update the `currentSeasonStatus` field on every
 * season matrix entry once per day.
 *
 * Schedule: every day at 03:00 Europe/Berlin (MEZ/MESZ).
 */
exports.updateSeasonMatrixStatus = onSchedule(
    {
      schedule: '0 3 * * *',
      timeZone: 'Europe/Berlin',
    },
    async (_event) => {
      const db = admin.firestore();
      const snapshot = await db.collection('seasonMatrix').get();

      if (snapshot.empty) {
        console.log('updateSeasonMatrixStatus: no entries found, nothing to update');
        return;
      }

      const today = new Date();
      const batch = db.batch();

      snapshot.forEach((docSnap) => {
        const entry = docSnap.data();
        const status = computeCurrentSeasonStatus(entry, today);
        batch.update(docSnap.ref, {currentSeasonStatus: status});
      });

      await batch.commit();
      console.log(
          `updateSeasonMatrixStatus: updated ${snapshot.size} entries` +
          ` for ${today.toISOString().slice(0, 10)}`,
      );
    },
);

exports.onNutritionReferenceChanged = onDocumentWritten(
    {document: 'nutritionReferences/{refId}'},
    async () => {
      try {
        await admin.firestore()
            .collection('appConfig')
            .doc('nutritionReferences')
            .set({lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true});
      } catch (err) {
        console.error('onNutritionReferenceChanged: failed to update lastUpdatedAt', err);
      }
    },
);

/**
 * Scheduled Cloud Function: clean up expired calculated swipe flags across all
 * lists once per night.
 *
 * For every document in `recipeSwipeFlags` whose `calculatedExpiresAt` timestamp
 * is in the past the fields `flag` and `expiresAt` are reset to `null`, mirroring
 * the lazy cleanup performed by `cleanupExpiredCalculatedFlagsForList` on write.
 *
 * Schedule: every day at 01:00 Europe/Berlin (MEZ/MESZ).
 */
exports.nightlySwipeFlagsCleanup = onSchedule(
    {
      schedule: '0 1 * * *',
      timeZone: 'Europe/Berlin',
    },
    async (_event) => {
      const db = admin.firestore();
      const snapshot = await db.collection('recipeSwipeFlags').get();

      if (snapshot.empty) {
        console.log('nightlySwipeFlagsCleanup: no documents found, nothing to clean up');
        return;
      }

      const now = Date.now();
      const expiredDocs = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const calculatedExpiresAt = data.calculatedExpiresAt;
        const calculatedExpiresAtMillis = calculatedExpiresAt?.toMillis?.();
        const isExpired =
          calculatedExpiresAt !== null &&
          calculatedExpiresAt !== undefined &&
          typeof calculatedExpiresAtMillis === 'number' &&
          calculatedExpiresAtMillis <= now;

        if (isExpired) {
          expiredDocs.push(docSnap);
        }
      });

      if (expiredDocs.length === 0) {
        console.log('nightlySwipeFlagsCleanup: no expired documents found');
        return;
      }

      let cleanedCount = 0;
      let batch = db.batch();
      let operationCount = 0;

      for (const docSnap of expiredDocs) {
        batch.update(docSnap.ref, {flag: null, expiresAt: null});
        operationCount += 1;
        if (operationCount >= 450) {
          await batch.commit();
          cleanedCount += operationCount;
          batch = db.batch();
          operationCount = 0;
        }
      }

      if (operationCount > 0) {
        await batch.commit();
        cleanedCount += operationCount;
      }

      console.log(`nightlySwipeFlagsCleanup: cleaned up ${cleanedCount} expired swipe flag document(s)`);
    },
);

/**
 * Scheduled Cloud Function: deletes expired Reel/video import protocol
 * entries from failedWebImports (see writeImportProtocolEntry) — only
 * entries logged for a *successful* import carry an expiresAt (7 days out);
 * failed entries have none and are never matched by this query, so they're
 * kept indefinitely for developer review, same as the pre-existing
 * dismissed-web-import log this collection already held.
 */
exports.nightlyImportProtocolCleanup = onSchedule(
    {
      schedule: '30 1 * * *',
      timeZone: 'Europe/Berlin',
    },
    async (_event) => {
      const db = admin.firestore();
      const now = admin.firestore.Timestamp.now();
      const snapshot = await db.collection('failedWebImports')
          .where('expiresAt', '<=', now)
          .get();

      if (snapshot.empty) {
        console.log('nightlyImportProtocolCleanup: no expired protocol entries found');
        return;
      }

      let deletedCount = 0;
      let batch = db.batch();
      let operationCount = 0;

      for (const docSnap of snapshot.docs) {
        batch.delete(docSnap.ref);
        operationCount += 1;
        if (operationCount >= 450) {
          await batch.commit();
          deletedCount += operationCount;
          batch = db.batch();
          operationCount = 0;
        }
      }

      if (operationCount > 0) {
        await batch.commit();
        deletedCount += operationCount;
      }

      console.log(`nightlyImportProtocolCleanup: deleted ${deletedCount} expired import protocol entr${deletedCount === 1 ? 'y' : 'ies'}`);
    },
);

/**
 * Run a batch of images through Gemini Vision concurrently (no per-user rate
 * limiting — recoverStuckImportJobs runs without an auth context, restarting
 * work a user already authorized when the job was first queued). Node-side
 * counterpart of the per-image worker loop in scanRecipesWithAI, minus the
 * rate-limit check that only makes sense for a live onCall request.
 *
 * @param {string[]} images - Base64-encoded images
 * @param {{language?: string, apiKey: string, cuisineTypes?: string[],
 *   mealCategories?: string[], concurrency?: number}} opts
 * @returns {Promise<Array<Object>>} Per-image results, each possibly {error}
 */
async function scanImagesWithGemini(images, {
  language = 'de', apiKey, cuisineTypes, mealCategories, concurrency = BATCH_IMAGE_CONCURRENCY,
} = {}) {
  const results = new Array(images.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < images.length) {
      const i = nextIndex++;
      try {
        const {mimeType, base64Data} = validateImageData(images[i]);
        results[i] = await callGeminiAPI(
            base64Data, mimeType, language, apiKey, cuisineTypes, mealCategories,
        );
      } catch (error) {
        results[i] = {error: error.message};
      }
    }
  };
  const workerCount = Math.min(concurrency, images.length);
  await Promise.all(Array.from({length: workerCount}, worker));
  return results;
}

/**
 * Combine per-leg AI results (url screenshot, text, images) collected for a
 * 'universal' import into one recipe. Node-side port of
 * mergeUniversalAiResults in src/utils/importRunners.js.
 *
 * @param {Array<Object>} results - Per-leg results, each possibly {error}
 * @returns {Object} Merged recipe data
 */
function mergeUniversalAiResultsServer(results) {
  const validResults = results.filter((r) => r && !r.error);
  if (validResults.length === 0) {
    const error = new Error('Keine gültigen OCR-Ergebnisse gefunden');
    error.code = 'invalid-argument';
    throw error;
  }

  const merged = {...validResults[0]};

  const allIngredients = validResults.flatMap((r) => r.ingredients || []);
  const seenIngredients = new Set();
  merged.ingredients = allIngredients.filter((ing) => {
    const key = ing.toLowerCase().trim();
    if (seenIngredients.has(key)) return false;
    seenIngredients.add(key);
    return true;
  });

  merged.steps = validResults.flatMap((r) => r.steps || []);
  merged.tags = [...new Set(validResults.flatMap((r) => r.tags || []))];
  merged.notes = validResults.map((r) => r.notes).filter((n) => n && n.trim()).join('\n\n') || merged.notes;
  merged.servings = merged.servings || validResults.find((r) => r.servings)?.servings;
  merged.prepTime = merged.prepTime || validResults.find((r) => r.prepTime)?.prepTime;
  merged.cookTime = merged.cookTime || validResults.find((r) => r.cookTime)?.cookTime;
  merged.difficulty = merged.difficulty || validResults.find((r) => r.difficulty)?.difficulty;
  merged.cuisine = merged.cuisine || validResults.find((r) => r.cuisine)?.cuisine;
  merged.category = merged.category || validResults.find((r) => r.category)?.category;

  return merged;
}

/**
 * Rebuild the 'web' leg of runImportFromSource: Instagram URLs go through
 * the dedicated scraper (JSON-LD/screenshot parsing doesn't work on
 * Instagram's app-shell markup); every other URL goes through
 * runImportFromUrl's JSON-LD → text → screenshot+vision chain, same as
 * importRecipeCallable. This intentionally skips the client's
 * isRecipeImportPageUrl fast-path (a plain fetchable HTML page, so it still
 * resolves correctly through the generic chain — just via a different phase).
 *
 * @param {{url: string}} source
 * @param {{apiKey: string}} opts
 * @returns {Promise<Object>}
 */
async function runImportFromWebSource(source, {apiKey, steps} = {}) {
  const url = source && source.url;
  if (!url || typeof url !== 'string') {
    const error = new Error('Keine URL für den Web-Import vorhanden');
    error.code = 'invalid-argument';
    throw error;
  }
  if (isInstagramUrl(url)) {
    return runImportFromInstagram(url, {language: 'de', apiKey, steps});
  }
  return runImportFromUrl(url, {apiKey, source: 'sweeper'});
}

/**
 * Rebuilds the 'universal' leg combination (url/text/images) of
 * runImportFromSource, server-side equivalent of runUniversalImport in
 * src/utils/importRunners.js. Two differences from the client version, both
 * because this runs without a browser: the text leg is sent straight to
 * callGeminiTextAPI instead of being rendered onto a canvas first (Gemini
 * doesn't need that detour — it only existed to reuse the vision-only
 * client OCR path), and the url leg reuses runImportFromUrl's multi-phase
 * chain instead of a dedicated screenshot capture.
 *
 * @param {{url?: string, text?: string, images?: string[]}} source
 * @param {{apiKey: string}} opts
 * @returns {Promise<Object>}
 */
async function runImportFromUniversalSource(source, {apiKey} = {}) {
  const url = (source && source.url || '').trim();
  const text = (source && source.text || '').trim();
  const images = Array.isArray(source && source.images) ? source.images : [];
  const results = [];

  if (url) {
    try {
      results.push(await runImportFromUrl(url, {apiKey, source: 'sweeper-universal'}));
    } catch (error) {
      results.push({error: error.message});
    }
  }

  if (text) {
    try {
      results.push(await callGeminiTextAPI(text, 'de', apiKey));
    } catch (error) {
      results.push({error: error.message});
    }
  }

  if (images.length > 0) {
    const imageResults = await scanImagesWithGemini(images, {language: 'de', apiKey});
    const hasValidImageResult = imageResults.some((r) => r && !r.error);
    results.push(hasValidImageResult ? mergePhotoAiResultsServer(imageResults) : {error: 'Keine gültigen OCR-Ergebnisse gefunden'});
  }

  return mergeUniversalAiResultsServer(results);
}

/**
 * Rebuilds the 'photo' leg of runImportFromSource, server-side equivalent of
 * runPhotoScanImport in src/utils/importRunners.js.
 *
 * @param {{images?: string[], language?: string}} source
 * @param {{apiKey: string}} opts
 * @returns {Promise<Object>}
 */
async function runImportFromPhotoSource(source, {apiKey} = {}) {
  const images = Array.isArray(source && source.images) ? source.images : [];
  const language = ['de', 'en'].includes(source && source.language) ? source.language : 'de';
  if (images.length === 0) {
    const error = new Error('Kein Bild für den Foto-Import vorhanden');
    error.code = 'invalid-argument';
    throw error;
  }
  if (images.length === 1) {
    const {mimeType, base64Data} = validateImageData(images[0]);
    return callGeminiAPI(base64Data, mimeType, language, apiKey);
  }
  const results = await scanImagesWithGemini(images, {language, apiKey});
  return mergePhotoAiResultsServer(results);
}

/**
 * Import source leg for user-uploaded Reel videos (see getVideoUploadUrl /
 * processVideoImportUpload in the Hybrid Import Architecture section above).
 * Downloads the video from Storage, transcribes it with Gemini, and combines
 * that transcript with the optional caption text the Shortcut sent along
 * (Instagram's caption often carries exact quantities that aren't spoken
 * aloud in the video, or vice versa — using both together, the way
 * runImportFromInstagram already combines caption + transcription for the
 * scraped leg, catches recipe details either one alone would miss). No
 * Puppeteer/Instagram involved here — the video already sits in our own
 * Storage bucket by the time this runs, and the caption is whatever text the
 * user pasted into the Shortcut, not scraped.
 *
 * @param {{storagePath: string, language?: string, caption?: string}} source
 * @param {{apiKey: string}} opts
 * @returns {Promise<Object>} Structured recipe data (same shape as callGeminiAPI)
 */
async function runImportFromVideoSource(source, {apiKey, steps} = {}) {
  const recordStep = (step, ok, detail) => {
    if (Array.isArray(steps)) steps.push({step, ok: Boolean(ok), detail: detail || '', at: Date.now()});
  };

  const storagePath = source && source.storagePath;
  const language = ['de', 'en'].includes(source && source.language) ? source.language : 'de';
  const caption = typeof (source && source.caption) === 'string' ? source.caption.trim() : '';
  if (!storagePath) {
    const error = new Error('Kein Video für den Video-Import vorhanden');
    error.code = 'invalid-argument';
    throw error;
  }

  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);

  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size) || 0;
  if (size > MAX_REEL_VIDEO_SIZE) {
    const error = new Error(
        `Video ist zu groß (${(size / (1024 * 1024)).toFixed(1)} MB, ` +
        `max. ${(MAX_REEL_VIDEO_SIZE / (1024 * 1024)).toFixed(1)} MB).`,
    );
    error.code = 'invalid-argument';
    recordStep('video_downloaded', false, error.message);
    throw error;
  }
  recordStep('video_downloaded', true, `size=${size} bytes`);

  const [videoBuffer] = await file.download();
  const transcribedText = await transcribeVideoWithGemini(videoBuffer, language, apiKey);
  recordStep(
      'video_transcription',
      Boolean(transcribedText && transcribedText.trim()),
      transcribedText && transcribedText.trim() ? `transcript length=${transcribedText.length}` : 'transcription returned empty',
  );
  recordStep('caption_provided', Boolean(caption), caption ? `caption length=${caption.length}` : 'no caption provided');

  // callGeminiTextAPI's prompt tells the model it's receiving raw HTML from a
  // social-media page ("bereinige alle HTML-Artefakte...") — true for the web
  // and Instagram legs, but this is a plain spoken-word transcript with no
  // HTML at all. Label both parts the same way the Instagram leg labels its
  // own caption/transcription segments, so the model doesn't go looking for
  // markup to strip and skip past the actual recipe content, e.g. only pull
  // a title with empty ingredients/steps.
  const parts = [];
  if (caption) {
    parts.push(`Caption:\n${caption}`);
  }
  if (transcribedText && transcribedText.trim()) {
    const transcriptionLabel = language === 'de' ?
      'Gesprochener Inhalt (Audiotranskription)' :
      'Spoken Content (Audio Transcription)';
    parts.push(`${transcriptionLabel}:\n${transcribedText}`);
  }

  if (parts.length === 0) {
    const error = new Error(
        'Konnte keinen Rezeptinhalt aus dem Video erkennen. Enthält das Video gesprochenen Text, ' +
        'oder war eine Caption angegeben?',
    );
    error.code = 'not-found';
    recordStep('content_combined', false, error.message);
    throw error;
  }
  recordStep('content_combined', true, `combined length=${parts.join('\n\n').length}`);

  const result = await callGeminiTextAPI(parts.join('\n\n'), language, apiKey);
  recordStep('ai_extraction', true, 'Gemini-Extraktion erfolgreich');
  return result;
}

/**
 * Internal dispatcher used by recoverStuckImportJobs to redrive a stuck
 * background-import job purely from its persisted importSource — no auth
 * context, no rate limiting, no HttpsError throwing (that belongs to the
 * onCall wrappers above, not the scheduler). Mirrors buildRunFromSource in
 * src/contexts/RecipeImportQueueContext.js.
 *
 * @param {Object} source - Persisted importSource ({type, ...})
 * @param {string} authorId - Owner of the job (used only for logging here)
 * @param {string} jobId - Firestore recipes/{jobId} doc id (used only for logging here)
 * @param {Array} [steps] - Protocol step collector (see writeImportProtocolEntry), only
 *   populated for Reel-style sources (web/Instagram, video) — ignored otherwise.
 * @returns {Promise<Object>} Structured recipe data (same shape as callGeminiAPI)
 */
async function runImportFromSource(source, authorId, jobId, steps) {
  const apiKey = geminiApiKey.value();
  if (!apiKey) {
    const error = new Error('AI service not configured. Please contact administrator.');
    error.code = 'failed-precondition';
    throw error;
  }

  console.log(`recoverStuckImportJobs: running job=${jobId} author=${authorId} type=${source && source.type}`);

  switch (source && source.type) {
    case 'web':
      return runImportFromWebSource(source, {apiKey, steps});
    case 'universal':
      return runImportFromUniversalSource(source, {apiKey});
    case 'photo':
      return runImportFromPhotoSource(source, {apiKey});
    case 'video':
      return runImportFromVideoSource(source, {apiKey, steps});
    default: {
      const error = new Error(`Unbekannter importSource-Typ: ${source && source.type}`);
      error.code = 'invalid-argument';
      throw error;
    }
  }
}

/**
 * Firestore trigger: instantly processes background-import jobs that were
 * queued by importRecipeShortcut (see below) — there is no browser tab
 * involved for those, so unlike the normal web-import flow (where the
 * client that just created the job immediately starts processing it itself
 * via RecipeImportQueueContext) they would otherwise sit untouched until
 * recoverStuckImportJobs' next sweep, up to STUCK_IMPORT_JOB_MS +
 * (sweep interval) later. Scoped to importOrigin:'shortcut' specifically so
 * it never races the client-driven flow for jobs a live tab already owns.
 */
exports.processShortcutImportJob = onDocumentCreated(
    {
      document: 'recipes/{recipeId}',
      region: 'us-central1',
      secrets: [geminiApiKey],
    },
    async (event) => {
      const jobId = event.params.recipeId;
      const data = event.data ? event.data.data() : null;
      if (!data || data.importOrigin !== 'shortcut' || data.importStatus !== 'queued') {
        return;
      }

      const authorId = data.authorId || 'unknown';
      await event.data.ref.update({
        importStatus: 'processing',
        importHeartbeatAt: Date.now(),
        importAttempts: 1,
      });

      const steps = [];
      const reelMeta = isReelImportSource(data.importSource) ?
        {steps, source: data.importSource} :
        undefined;
      try {
        const result = await runImportFromSource(data.importSource, authorId, jobId, steps);
        await finalizeImportJobBackground(jobId, authorId, result, reelMeta);
      } catch (error) {
        console.error(`processShortcutImportJob: job ${jobId} failed`, error);
        await failImportJobBackground(jobId, authorId, error, reelMeta);
      }
    },
);

/**
 * Threshold above which a queued/processing (or already-failed-but-
 * retryable) import job with a stale importHeartbeatAt is considered
 * orphaned and eligible for server-side recovery. Must stay comfortably
 * above the longest-running import Cloud Function timeout (180s —
 * scanRecipesWithAI / scrapeInstagramReel) so this sweeper never restarts a
 * job while its original attempt could still be legitimately in flight.
 * Deliberately NOT the client's STALE_JOB_MS (60s, RecipeImportQueueContext.js)
 * — that threshold is tuned for same-tab/other-open-tab recovery between
 * live clients, not for restarting a job whose Cloud Function call may
 * still be running.
 */
const STUCK_IMPORT_JOB_MS = 300000; // 5 minutes

/** Maximum number of stuck import jobs redriven per sweeper run. */
const MAX_STUCK_IMPORT_JOBS_PER_RUN = 20;

/** Maximum number of run attempts (fresh + restarts) before giving up for good. */
const MAX_IMPORT_ATTEMPTS = 3;

/**
 * Scheduled Cloud Function: recover background-import jobs (recipes/{id}
 * with isTemp:true and an importStatus) that got stuck because the client
 * tab that owned them closed, reloaded, or crashed before finishing — the
 * only recovery path today is RecipeImportQueueContext's orphan-recovery
 * effect, which only runs while some tab is open. This sweeper redrives the
 * same jobs entirely server-side via runImportFromSource, independent of any
 * open tab.
 *
 * Also redrives jobs already in importStatus:'error' when their
 * importErrorKind is 'retryable' (see failImportJob/classifyImportErrorKind)
 * — jobs classified 'permanent' are left for the user's own "Neu starten".
 *
 * Schedule: every 10 minutes.
 */
exports.recoverStuckImportJobs = onSchedule(
    {
      schedule: '*/10 * * * *',
      timeZone: 'Europe/Berlin',
      timeoutSeconds: 540,
      secrets: [geminiApiKey],
    },
    async (_event) => {
      const db = admin.firestore();
      const cutoff = Date.now() - STUCK_IMPORT_JOB_MS;

      const snapshot = await db.collection('recipes')
          .where('isTemp', '==', true)
          .where('importStatus', 'in', ['queued', 'processing', 'error'])
          .where('importHeartbeatAt', '<', cutoff)
          .limit(MAX_STUCK_IMPORT_JOBS_PER_RUN)
          .get();

      if (snapshot.empty) {
        console.log('recoverStuckImportJobs: nichts zu tun (keine liegengebliebenen Importe gefunden)');
        return;
      }

      let restarted = 0;
      let abandoned = 0;

      for (const docSnap of snapshot.docs) {
        const jobId = docSnap.id;
        const data = docSnap.data() || {};
        const authorId = data.authorId || 'unknown';
        const attempts = data.importAttempts || 0;
        const wasError = data.importStatus === 'error';

        if (wasError && data.importErrorKind !== 'retryable') {
          // Permanent failure (or a legacy error doc from before
          // importErrorKind existed) – leave it for the user's own "Neu
          // starten" action, don't touch it here.
          continue;
        }

        if (!data.importSource) {
          const error = new Error('Import kann nicht wiederhergestellt werden: keine importSource gespeichert');
          error.code = 'failed-precondition';
          await failImportJobBackground(jobId, authorId, error);
          abandoned++;
          continue;
        }

        const reelMeta = isReelImportSource(data.importSource) ?
          {steps: [], source: data.importSource} :
          undefined;

        if (attempts >= MAX_IMPORT_ATTEMPTS) {
          const error = new Error(`Import endgültig fehlgeschlagen nach ${attempts} Versuchen`);
          error.code = 'failed-precondition';
          await failImportJobBackground(jobId, authorId, error, reelMeta);
          abandoned++;
          continue;
        }

        // Claim the job (heartbeat + attempt count) before doing any work,
        // so the next tick 10 minutes from now doesn't pick the same doc
        // again while this attempt is still running.
        await docSnap.ref.update({
          importStatus: 'processing',
          importHeartbeatAt: Date.now(),
          importAttempts: attempts + 1,
          ...(wasError ? {
            importError: admin.firestore.FieldValue.delete(),
            importErrorKind: admin.firestore.FieldValue.delete(),
          } : {}),
        });

        try {
          const result = await runImportFromSource(
              data.importSource, authorId, jobId, reelMeta && reelMeta.steps,
          );
          await finalizeImportJobBackground(jobId, authorId, result, reelMeta);
          restarted++;
        } catch (error) {
          console.error(`recoverStuckImportJobs: job ${jobId} failed`, error);
          await failImportJobBackground(jobId, authorId, error, reelMeta);
          abandoned++;
        }
      }

      console.log(
          `recoverStuckImportJobs: geprüft=${snapshot.size} neu gestartet=${restarted} aufgegeben=${abandoned}`,
      );
    },
);

// Getränke-Kalkulation für Events (Menüpunkt "Events" im Hamburger-Menü).
exports.calculateEventDrinks = require('./calculateEventDrinks').calculateEventDrinks;
exports.submitConsumption = require('./submitConsumption').submitConsumption;
exports.reminderConsumption = require('./reminderConsumption').reminderConsumption;
exports.manageGuestProfile = require('./manageGuestProfile').manageGuestProfile;

// Webimport-PIN: pro Nutzer optionaler PIN-Schutz für den Apple-Kurzbefehl-Import
// (importRecipeShortcut oben ruft requireShortcutPin() mit jedem Request auf,
// da der Kurzbefehl per API-Key ohne Session arbeitet). In-App-Importe über
// die eingeloggte Web-App verlangen den PIN nicht.
exports.setWebImportPin = require('./webImportPin').setWebImportPin;

// Server-seitige Aggregation von ratingAvg/ratingCount auf recipes/{recipeId}
// aus der ratings-Subcollection (ersetzt den bisherigen offenen Client-Write).
exports.aggregateRecipeRating = require('./recipeRatingAggregation').aggregateRecipeRating;
