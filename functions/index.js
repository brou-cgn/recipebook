/**
 * Firebase Cloud Functions for RecipeBook
 * Provides secure server-side API access for AI OCR functionality
 */

const {onCall, onRequest, HttpsError} = require('firebase-functions/v2/https');
const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {onObjectFinalized} = require('firebase-functions/v2/storage');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {defineSecret} = require('firebase-functions/params');
const {launchBrowser} = require('./launchBrowser');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const sharp = require('sharp');
const cheerio = require('cheerio');
const {requireShortcutPin} = require('./webImportPin');
const {normalizeCuisines, suggestNewCuisines} = require('./cuisineNormalization');
const {requireAiCaller, AI_IMPORTER_TEST_UID} = require('./shared/auth');
const {ALLOWED_ORIGINS, escapeHtml} = require('./shared/common');
const {consumeDailyQuota} = require('./shared/rateLimit');
const {smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom, geminiApiKey} = require('./shared/secrets');

// Initialize Firebase Admin
admin.initializeApp();

// API key for Apple Shortcut / external recipe import
// Set with: firebase functions:secrets:set SHORTCUT_API_KEY
const shortcutApiKey = defineSecret('SHORTCUT_API_KEY');

// Firebase Web API key, used only by dailyAiImporterTest to exchange a
// server-minted custom token for an ID token so the nightly test can call
// the public callables (fetchRecipeHtml, processHtmlWithAI, scanRecipeWithAI)
// exactly like a real client does. This is the same non-secret public key
// already shipped in the web app bundle (REACT_APP_FIREBASE_API_KEY) —
// stored as a secret here purely for consistency with the other config
// values above.
// Set with: firebase functions:secrets:set WEB_API_KEY
const firebaseWebApiKey = defineSecret('WEB_API_KEY');

/**
 * Default Firebase Storage bucket for the broubook project.
 * Must be provided explicitly for firebase-functions v7+ storage triggers,
 * since the SDK now validates the bucket name at module load time.
 */
const STORAGE_BUCKET = 'broubook.firebasestorage.app';

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
 * Rate limit for rephraseRecipeSteps - a separate daily quota from the AI
 * photo/web/video scan limits above. A text-only rephrase call is far
 * cheaper and faster than an image/video scan, so it gets its own (higher)
 * budget instead of eating into a user's daily scan quota.
 */
const RATE_LIMITS_REPHRASE = {
  admin: 1000,
  moderator: 100,
  authenticated: 40,
  guest: 10,
};

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
 * Shared authentication for all Shortcut endpoints: validates the X-Api-Key
 * header against SHORTCUT_API_KEY (timing-safe), resolves X-User-Email to a
 * uid and checks the user's role. Writes the error response itself and
 * returns null on failure; the caller just has to `return`.
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {string} fnName - endpoint name, used in log messages
 * @param {{allowShortcutUser?: boolean}} [opts]
 *   allowShortcutUser (default true): users flagged isShortcutUser pass without edit role
 * @return {Promise<{userId: string, userData: object, db: object}|null>}
 */
async function authenticateShortcutRequest(req, res, fnName, {allowShortcutUser = true} = {}) {
  const apiKeyHeader = req.headers['x-api-key'];
  const userEmail = req.headers['x-user-email'];
  if (!apiKeyHeader || !userEmail) {
    res.status(401).json({
      success: false,
      error: 'Missing authentication headers',
      requiredHeaders: ['X-Api-Key', 'X-User-Email'],
    });
    return null;
  }

  const validApiKey = shortcutApiKey.value();
  if (!validApiKey) {
    console.error(`${fnName}: SHORTCUT_API_KEY secret is not set`);
    res.status(500).json({
      success: false,
      error: 'Server misconfiguration: SHORTCUT_API_KEY secret is not set',
    });
    return null;
  }

  let isValidKey = false;
  try {
    isValidKey = crypto.timingSafeEqual(Buffer.from(apiKeyHeader), Buffer.from(validApiKey));
  } catch (_) {
    isValidKey = false;
  }
  if (!isValidKey) {
    console.warn(`${fnName}: invalid API key attempt`);
    res.status(401).json({success: false, error: 'Invalid API key'});
    return null;
  }

  const userId = await resolveShortcutUserId(userEmail);
  const db = admin.firestore();
  try {
    const userDoc = userId ? await db.collection('users').doc(userId).get() : null;
    if (!userId || !userDoc.exists) {
      res.status(403).json({success: false, error: 'Access denied'});
      return null;
    }
    const userData = userDoc.data();
    const role = userData?.role;
    const hasRole = role === 'edit' || role === 'admin' || role === 'moderator';
    const hasFlag = allowShortcutUser && userData?.isShortcutUser === true;
    if (!hasRole && !hasFlag) {
      res.status(403).json({success: false, error: 'Insufficient permissions'});
      return null;
    }
    return {userId, userData, db};
  } catch (err) {
    console.error(`${fnName}: error validating user:`, err);
    res.status(500).json({success: false, error: 'Failed to validate user'});
    return null;
  }
}

/**
 * Webimport-PIN check for Shortcut endpoints (no-op if the user never set a
 * PIN). Writes the error response itself.
 * @param {object} res - Express response
 * @param {string} userId
 * @param {*} pin - PIN as sent by the Shortcut (body field or query param)
 * @return {Promise<boolean>} true if the request may proceed
 */
async function enforceShortcutPin(res, userId, pin) {
  try {
    await requireShortcutPin(userId, pin);
    return true;
  } catch (pinErr) {
    const status = pinErr.code === 'resource-exhausted' ? 429 :
      pinErr.code === 'invalid-argument' ? 400 : 403;
    res.status(status).json({success: false, error: pinErr.message || 'PIN erforderlich.'});
    return false;
  }
}

/**
 * Daily Gemini quota for the Gemini-backed Shortcut endpoints. Shares the
 * aiScanLimits counter with the in-app callables (see checkRateLimit), so the
 * Shortcut is not a second way past the per-user daily limit. Writes the error
 * response itself; call it after authentication and PIN so unauthenticated
 * requests never consume quota.
 * @param {object} res - Express response
 * @param {{userId: string, userData: object}} auth - result of authenticateShortcutRequest
 * @return {Promise<boolean>} true if the request may proceed
 */
async function enforceShortcutAiLimit(res, {userId, userData}) {
  const role = userData?.role;
  const isAdmin = role === 'admin';
  try {
    const rateLimit = await checkRateLimit(userId, true, isAdmin, !isAdmin && role === 'moderator');
    if (rateLimit.allowed) return true;
    res.status(429).json({
      success: false,
      error: `Tageslimit für KI-Importe erreicht (${rateLimit.limit}/${rateLimit.limit}). Versuche es morgen erneut.`,
    });
  } catch (err) {
    // checkRateLimit fails closed: without a checked counter there is no cost ceiling.
    res.status(503).json({success: false, error: err.message});
  }
  return false;
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
 * Shared style + step-boundary rules for the "zubereitung" field, reused by
 * DEFAULT_AI_RECIPE_PROMPT (full recipe extraction, below) and
 * RECIPE_STEP_REPHRASE_PROMPT (rephraseRecipeSteps, which only rewrites
 * already-extracted steps). These two constants must stay in sync with the
 * identical copies in src/utils/customLists.js - extracted into one place so
 * that a future style change (like the Coach-Ton rewrite) only has to touch
 * two files (server + client prompt copy), not three.
 */
const RECIPE_STEP_STYLE_RULE = `Schreibe jeden Schritt beschreibend, in der Du-Form und in einem energiegeladenen, aber sachlichen Du-Ton: Energie gehört in die Handlungsbeschreibung (z.B. "Schneide den Guanciale in Würfel und brate ihn an, bis er knusprig ist.", "Jetzt geht's ans Ausrollen!"), NICHT in lobende Superlative für das Ergebnis oder die Zutat selbst (kein "wunderbar", "perfekt", "super", "wohlverdient") und NICHT in angehängte Motivationssätze am Schrittende (kein "– du schaffst das!").`;

const RECIPE_STEP_BOUNDARY_RULE = `Jeder Eintrag ist EIN in sich abgeschlossener Arbeitsschritt. Ein Schritt bleibt EIN Array-Element, solange die einzelnen Handlungen unmittelbar aufeinander folgen (keine Wartezeit dazwischen) UND auf dasselbe unmittelbare Zwischenziel hinarbeiten (z.B. "Mehl und Eier auf eine Arbeitsfläche geben und 10 Minuten zu einem glatten Teig verkneten" ist EIN Schritt). Ein NEUER Schritt beginnt, sobald: (a) eine Ruhe- oder Wartezeit dazwischenliegt (z.B. Teig ruhen lassen, marinieren, backen), (b) ein anderer Rezeptbestandteil beginnt (z.B. von der Teig- zur Füllungszubereitung), oder (c) zwei unterschiedliche, parallel laufende Handlungsstränge vorliegen (z.B. Fleisch in einer Pfanne anbraten UND gleichzeitig Nudeln in einem anderen Topf kochen – das sind zwei Schritte, auch wenn sie gleichzeitig passieren). Fasse NIEMALS zwei Schritte, die eines dieser Kriterien für einen Bruch erfüllen, in einem Array-Element zusammen.`;

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
3. Zubereitungsschritte: ${RECIPE_STEP_STYLE_RULE} Übernimm NUR Schritte, die tatsächlich in der Quelle beschrieben oder eindeutig erkennbar sind – ergänze KEINE zusätzlichen Arbeitsschritte, Zeiten, Temperaturen oder Reihenfolgen aus allgemeinem Kochwissen, auch wenn sie plausibel wirken. Wenn die Quelle nur eine Zutatenliste ohne Zubereitungsanleitung enthält, lasse "zubereitung" als leeres Array – erfinde KEINE Schritte anhand der Zutaten.
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
8. Schritt-Grenzen: Das Feld "zubereitung" MUSS immer ein JSON-Array von Strings sein. ${RECIPE_STEP_BOUNDARY_RULE} Mindestens 1 Schritt muss vorhanden sein, wenn Zubereitungsinformationen erkennbar sind.

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
    "Bring reichlich Wasser in einem großen Topf zum Kochen und salze es großzügig – das ist deine Basis für alles Weitere.",
    "Schneide den Guanciale in kleine Würfel und brate ihn bei mittlerer Hitze an, bis er knusprig ist.",
    "Verrühr währenddessen das Eigelb mit dem geriebenen Pecorino und reichlich schwarzem Pfeffer.",
    "Koch die Spaghetti nach Packungsanweisung bissfest.",
    "Gieß die Pasta ab und fang dabei etwas Nudelwasser auf – das brauchst du gleich noch.",
    "Gib die Pasta zum Guanciale und nimm die Pfanne von der Hitze.",
    "Rühr die Ei-Käse-Mischung unter und mach sie mit dem Nudelwasser cremig.",
    "Serviere sofort, mit extra Pecorino und Pfeffer obendrauf."
  ],
  "notizen": "Wichtig: Die Pfanne muss von der Hitze genommen werden, bevor die Eier hinzugefügt werden, sonst stocken sie."
}

Extrahiere nun alle sichtbaren Informationen aus dem Bild genau nach diesem Schema.`;

/**
 * Prompt for rephraseRecipeSteps: rewrites already-extracted steps in place
 * (used from the recipe edit form, not the import pipeline). Deliberately
 * NOT Firestore-configurable like DEFAULT_AI_RECIPE_PROMPT - this only ever
 * needs the style + step-boundary rules, not the full extraction prompt's
 * title/ingredients/cuisine logic, and giving it its own admin-editable
 * override would be a second knob for the same two rules with no clear use
 * case.
 */
const RECIPE_STEP_REPHRASE_PROMPT = `Du bekommst eine Liste von Zubereitungsschritten eines Rezepts als JSON-Array von Strings. Formuliere JEDEN Schritt inhaltlich unverändert um, ohne neue Informationen zu erfinden oder vorhandene zu entfernen.

${RECIPE_STEP_STYLE_RULE}

${RECIPE_STEP_BOUNDARY_RULE} Das bedeutet hier konkret: Du darfst Schritte NICHT zusammenlegen oder aufteilen – die Anzahl der Elemente im Ergebnis-Array MUSS exakt der Anzahl der Elemente im Eingabe-Array entsprechen, in identischer Reihenfolge.

Gib ausschließlich das JSON-Array der umformulierten Schritte zurück, keine Erklärungen, keinen zusätzlichen Text.`;

/**
 * Gemini responseSchema enforcing the JSON shape the DEFAULT_AI_RECIPE_PROMPT
 * (and callGeminiAPI/callGeminiTextAPI/callGeminiMultiImageAPI's downstream
 * parsing) actually require, independent of whatever prose an admin edits
 * into the Firestore-configurable prompt text. Only the fields the app can't
 * function without are `required` - everything else keeps the same
 * optional/fallback handling the parsing code already has.
 */
const RECIPE_EXTRACTION_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    titel: {type: 'STRING'},
    portionen: {type: 'INTEGER', nullable: true},
    zubereitungszeit: {type: 'INTEGER', nullable: true},
    kochzeit: {type: 'INTEGER', nullable: true},
    schwierigkeit: {type: 'INTEGER', nullable: true},
    kulinarik: {type: 'STRING', nullable: true},
    kategorie: {type: 'STRING', nullable: true},
    tags: {type: 'ARRAY', items: {type: 'STRING'}},
    zutaten: {type: 'ARRAY', items: {type: 'STRING'}},
    zubereitung: {type: 'ARRAY', items: {type: 'STRING'}},
    notizen: {type: 'STRING', nullable: true},
  },
  required: ['titel', 'zutaten', 'zubereitung'],
};

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
      !aiRecipePrompt.includes('ergänze KEINE zusätzlichen Arbeitsschritte') ||
      !aiRecipePrompt.includes('sachlichen Du-Ton')
    ) {
      console.warn('AI prompt in Firestore is outdated or missing placeholders – migrating to DEFAULT_AI_RECIPE_PROMPT');
      // Archive the outdated prompt before overwriting it, so it isn't lost if it
      // was actually an intentional custom prompt that happened to miss a keyword
      // check (see src/utils/customLists.js: saveAIRecipePrompt for the matching
      // client-side history, and getAIRecipePromptHistory to restore a version).
      // Best-effort: a failure here must not block recipe extraction.
      try {
        await db.collection('settings').doc('app').collection('aiPromptHistory').add({
          prompt: aiRecipePrompt,
          archivedAt: admin.firestore.FieldValue.serverTimestamp(),
          archivedBy: 'system-migration',
        });
      } catch (historyError) {
        console.error('Failed to archive outdated aiRecipePrompt before migration:', historyError);
      }
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

// Configured cuisine types / meal categories from settings/app, cached like
// the prompt above. Imports used to rely on the caller sending these lists -
// Shortcut jobs and the Instagram Shortcut never did, so Gemini got a
// hard-coded "Italienisch/Deutsch" list instead of "Italienische Küche" etc.
let importListsCache = null;
let importListsCacheExpiry = 0;

/**
 * Load cuisineTypes/mealCategories from settings/app (fallback: defaults).
 * @return {Promise<{cuisineTypes: string[], mealCategories: string[]}>}
 */
async function getConfiguredImportLists() {
  if (importListsCache && Date.now() < importListsCacheExpiry) {
    return importListsCache;
  }
  let data = {};
  try {
    const settingsDoc = await admin.firestore().collection('settings').doc('app').get();
    data = settingsDoc.exists ? (settingsDoc.data() || {}) : {};
  } catch (err) {
    console.error('getConfiguredImportLists: could not read settings/app, using defaults:', err);
  }
  const lists = {
    cuisineTypes: Array.isArray(data.cuisineTypes) && data.cuisineTypes.length > 0 ?
      data.cuisineTypes : FALLBACK_CUISINE_TYPES,
    mealCategories: Array.isArray(data.mealCategories) && data.mealCategories.length > 0 ?
      data.mealCategories : FALLBACK_MEAL_CATEGORIES,
  };
  importListsCache = lists;
  importListsCacheExpiry = Date.now() + RECIPE_EXTRACTION_PROMPT_CACHE_TTL_MS;
  return lists;
}

/**
 * Use the lists the caller sent if present, otherwise the configured ones.
 * @param {string[]|undefined} cuisineTypes
 * @param {string[]|undefined} mealCategories
 * @return {Promise<{cuisineTypes: string[], mealCategories: string[]}>}
 */
async function resolveImportLists(cuisineTypes, mealCategories) {
  const hasCuisines = Array.isArray(cuisineTypes) && cuisineTypes.length > 0;
  const hasCategories = Array.isArray(mealCategories) && mealCategories.length > 0;
  if (hasCuisines && hasCategories) return {cuisineTypes, mealCategories};
  const configured = await getConfiguredImportLists();
  return {
    cuisineTypes: hasCuisines ? cuisineTypes : configured.cuisineTypes,
    mealCategories: hasCategories ? mealCategories : configured.mealCategories,
  };
}

/**
 * AI result cuisine fields mapped onto the configured cuisine types:
 * `cuisine` (first match, string - the shape existing consumers expect),
 * `cuisines` (all matches, e.g. ["Italienische Küche", "Vegetarisch"]) and
 * `cuisineSuggestions` (values without a configured type, offered in the
 * import review as a new type - never created automatically).
 * @param {string|string[]|null|undefined} raw - kulinarik as returned by Gemini
 * @param {string[]} cuisineTypes
 * @return {{cuisine: string, cuisines: string[], cuisineSuggestions: string[]}}
 */
function cuisineFields(raw, cuisineTypes) {
  const cuisines = normalizeCuisines(raw, cuisineTypes);
  const cuisineSuggestions = suggestNewCuisines(raw, cuisineTypes);
  return {cuisine: cuisines[0] || '', cuisines, cuisineSuggestions};
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
 * Feature flags that open the import callables. The client shows the import
 * buttons from rolePermissions/{role}: fotoscan (photo scan), webimport (web
 * import) and recipeImport (universal import, which uses every callable). The
 * callables cannot tell the three paths apart - a web import also scans a
 * screenshot - so any one of them is enough.
 */
const IMPORT_FEATURES = ['fotoscan', 'webimport', 'recipeImport'];

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
    // Fail closed: an unchecked request has no cost ceiling.
    throw new HttpsError(
        'unavailable',
        'Das KI-Tageslimit konnte nicht geprüft werden. Bitte versuche es gleich noch einmal.',
    );
  }
}

/**
 * Daily quota of rephraseRecipeSteps: aiRephraseLimits, see RATE_LIMITS_REPHRASE.
 * @param {string} userId - User ID
 * @param {boolean} isAuthenticated - Whether user is authenticated
 * @param {boolean} isAdmin - Whether user is an admin
 * @param {boolean} isModerator - Whether user is a moderator
 * @returns {Promise<{allowed: boolean, remaining: number, limit: number}>}
 */
function checkRephraseRateLimit(userId, isAuthenticated, isAdmin = false, isModerator = false) {
  const limit = isAdmin ? RATE_LIMITS_REPHRASE.admin
    : isModerator ? RATE_LIMITS_REPHRASE.moderator
    : isAuthenticated ? RATE_LIMITS_REPHRASE.authenticated
    : RATE_LIMITS_REPHRASE.guest;
  return consumeDailyQuota('aiRephraseLimits', limit, {userId, isAuthenticated, isAdmin, isModerator});
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
    const match = imageBase64.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (!match) {
      throw new HttpsError('invalid-argument', 'Invalid data URL format');
    }
    mimeType = match[1];
    base64Data = match[2];
  }

  // Strip whitespace/line breaks some sources (e.g. Apple Shortcuts' Base64
  // Encode action, or MIME-style 76-char wrapping) insert into the payload.
  // Gemini's base64 decoder rejects any embedded \r\n, so this must happen
  // unconditionally, not just for the data-URL branch above.
  base64Data = base64Data.replace(/\s/g, '');

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
  ({cuisineTypes, mealCategories} = await resolveImportLists(cuisineTypes, mealCategories));

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
      responseMimeType: 'application/json',
      responseSchema: RECIPE_EXTRACTION_RESPONSE_SCHEMA,
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
        ...cuisineFields(recipeData.kulinarik, cuisineTypes),
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
        ...cuisineFields(recipeData.cuisine, cuisineTypes),
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
  const kulinarikFromCuisine = Array.isArray(aiResult.cuisines) && aiResult.cuisines.length > 0 ?
    aiResult.cuisines : (aiResult.cuisine ? [aiResult.cuisine] : []);
  const kulinarikSet = new Set(kulinarikFromCuisine);
  kulinarikFromTags.forEach((k) => kulinarikSet.add(k));

  const suggestions = Array.isArray(aiResult.cuisineSuggestions) ? aiResult.cuisineSuggestions : [];
  const kulinarikVorschlag = suggestions.filter((s) => !kulinarikSet.has(s));

  return {
    title: aiResult.title || '',
    ingredients: aiResult.ingredients || [],
    steps: aiResult.steps || [],
    portionen: aiResult.servings || 4,
    kochdauer: parseTime(aiResult.prepTime) || parseTime(aiResult.cookTime) || 30,
    kulinarik: [...kulinarikSet],
    ...(kulinarikVorschlag.length > 0 ? {kulinarikVorschlag} : {}),
    schwierigkeit: aiResult.difficulty || 3,
    speisekategorie: aiResult.category || '',
    ...(authorId ? {authorId} : {}),
    ...(aiResult.sourceUrl ? {sourceUrl: aiResult.sourceUrl} : {}),
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

      const {userId, isAuthenticated, isAdmin, isModerator} = await requireAiCaller(auth, IMPORT_FEATURES);

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
 * Rewrites an array of already-extracted recipe steps in place (beschreibend,
 * Du-Form, energiegeladener aber sachlicher Ton), without re-extracting
 * title/ingredients/etc. Used by the
 * "Zubereitungsschritte umformulieren" button in RecipeForm.js so an author
 * can apply the current step style to an older recipe after the fact.
 *
 * Separate, smaller rate limit than scanRecipeWithAI (see
 * RATE_LIMITS_REPHRASE) since a text-only rephrase is much cheaper than an
 * image/video scan.
 */
exports.rephraseRecipeSteps = onCall(
    {
      secrets: [geminiApiKey],
      maxInstances: 10,
      memory: '256MiB',
      timeoutSeconds: 30,
    },
    async (request) => {
      const {steps} = request.data;

      const auth = request.auth;
      if (!auth) {
        throw new HttpsError(
            'unauthenticated',
            'You must be logged in to rephrase recipe steps'
        );
      }

      if (
        !Array.isArray(steps) ||
        steps.length === 0 ||
        !steps.every((step) => typeof step === 'string' && step.trim() !== '')
      ) {
        throw new HttpsError('invalid-argument', 'steps must be a non-empty array of non-empty strings');
      }

      const {userId, isAuthenticated, isAdmin, isModerator} = await requireAiCaller(auth);

      const rateLimitResult = await checkRephraseRateLimit(userId, isAuthenticated, isAdmin, isModerator);
      if (!rateLimitResult.allowed) {
        throw new HttpsError(
            'resource-exhausted',
            `Tageslimit für das Umformulieren erreicht (${rateLimitResult.limit}/${rateLimitResult.limit}). Versuche es morgen erneut.`
        );
      }

      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        console.error('GEMINI_API_KEY secret not configured');
        throw new HttpsError(
            'failed-precondition',
            'AI service not configured. Please contact administrator.'
        );
      }

      const requestBody = {
        contents: [
          {
            parts: [
              {text: RECIPE_STEP_REPHRASE_PROMPT + '\n\nEingabe-Array:\n' + JSON.stringify(steps)},
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: 'application/json',
          responseSchema: {type: 'ARRAY', items: {type: 'STRING'}},
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
          console.error('Gemini API error (rephrase steps):', errorData);
          const errorMessage = errorData.error?.message || response.statusText;
          if (response.status === 429) {
            throw new HttpsError(
                'resource-exhausted',
                'Die KI-API ist momentan ausgelastet. Bitte versuche es in einigen Minuten erneut.'
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

        const rephrasedSteps = JSON.parse(textResponse);
        if (!Array.isArray(rephrasedSteps) || rephrasedSteps.length !== steps.length) {
          throw new HttpsError(
              'internal',
              'Die KI hat eine unerwartete Anzahl an Schritten zurückgegeben.'
          );
        }

        return {
          steps: rephrasedSteps,
          remainingRephrasings: rateLimitResult.remaining,
          dailyLimit: rateLimitResult.limit,
        };
      } catch (error) {
        if (error instanceof HttpsError) {
          throw error;
        }
        console.error(`Rephrase steps failed for user ${userId}:`, error);
        if (error.message?.includes('JSON')) {
          throw new HttpsError('internal', 'Failed to parse rephrased steps.');
        }
        throw new HttpsError('internal', 'Failed to rephrase steps: ' + error.message);
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
  if (!merged.cuisines?.length) {
    merged.cuisines = validResults.find((r) => r.cuisines?.length)?.cuisines;
  }
  if (!merged.cuisines?.length && !merged.cuisineSuggestions?.length) {
    merged.cuisineSuggestions =
      validResults.find((r) => r.cuisineSuggestions?.length)?.cuisineSuggestions;
  }
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

      const {userId, isAuthenticated, isAdmin, isModerator} = await requireAiCaller(auth, IMPORT_FEATURES);

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
  ({cuisineTypes, mealCategories} = await resolveImportLists(cuisineTypes, mealCategories));

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
      responseMimeType: 'application/json',
      responseSchema: RECIPE_EXTRACTION_RESPONSE_SCHEMA,
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
      ...cuisineFields(recipeData.kulinarik || recipeData.cuisine, cuisineTypes),
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
 * @param {Buffer} videoBuffer - Video (or audio-only) data as buffer
 * @param {string} language - Language code ('de' or 'en')
 * @param {string} apiKey - Gemini API key
 * @param {string} [mimeType] - Actual MIME type of videoBuffer, e.g. 'video/mp4'
 *   or 'audio/mp4' for an audio-only upload (see getVideoUploadUrl's
 *   audioOnly option). Must match the real content — Gemini rejects a
 *   video/mp4 declaration for a file with no video frames.
 * @returns {Promise<string|null>} Transcribed text or null
 */
async function transcribeVideoWithGemini(videoBuffer, language, apiKey, mimeType = 'video/mp4') {
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
                mime_type: mimeType,
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

      const {userId, isAuthenticated, isAdmin, isModerator} = await requireAiCaller(auth, IMPORT_FEATURES);

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

  // Appends a step to the caller's protocol array (see writeImportProtocolEntry)
  // when one was passed in; a no-op otherwise so this function works standalone.
  const recordStep = (step, ok, detail) => {
    if (Array.isArray(steps)) steps.push({step, ok: Boolean(ok), detail: detail || '', at: Date.now()});
  };

  let browser = null;
  try {
    browser = await launchBrowser();

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

      const {userId, isAuthenticated, isAdmin, isModerator} = await requireAiCaller(auth, IMPORT_FEATURES);

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

      const {userId, isAuthenticated, isAdmin, isModerator} = await requireAiCaller(auth, IMPORT_FEATURES);

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

      const {userId, isAuthenticated, isAdmin, isModerator} = await requireAiCaller(auth, IMPORT_FEATURES);

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

      let browser;
      let hasFragment = false;
      let fragmentHash = '';
      try {
        browser = await launchBrowser();

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

  let browser;
  let hasFragment = false;
  let fragmentHash = '';
  try {
    browser = await launchBrowser();

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

      const {userId, isAuthenticated, isAdmin, isModerator} = await requireAiCaller(auth, IMPORT_FEATURES);

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

      // Shortcut authentication: API key + user email + role (see authenticateShortcutRequest)
      const auth = await authenticateShortcutRequest(req, res, 'importRecipeShortcut');
      if (!auth) return;
      const {userId} = auth;

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
      if (!(await enforceShortcutPin(res, userId, pin))) return;

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

      if (!(await enforceShortcutAiLimit(res, auth))) return;

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
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
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

/** Maximum number of photos accepted per scanRecipePhotoShortcut request. */
const MAX_SHORTCUT_PHOTO_IMAGES = 5;

/**
 * Maximum combined base64 length of all photos in one scanRecipePhotoShortcut
 * request. Unlike the Reel video upload (getVideoUploadUrl), which uses a
 * signed Storage URL because videos are far larger, photos travel inline in
 * the JSON body — kept comfortably under Cloud Functions' ~32MB request
 * limit so an oversized request fails fast with a clear message instead of a
 * generic platform-level 413.
 */
const MAX_SHORTCUT_PHOTO_TOTAL_BASE64 = 15 * 1024 * 1024;

/**
 * Safe ceiling for the combined base64 length of all *recompressed* photos
 * in one scanRecipePhotoShortcut job, applied after compressPhotoForImportJob.
 * Firestore documents cap out at 1 MiB (1,048,576 bytes) total, and the job
 * doc carries a few other small fields alongside importSource.images —
 * this leaves comfortable headroom under that hard limit.
 */
const MAX_SHORTCUT_PHOTO_FIRESTORE_BASE64 = 900 * 1024;

/**
 * Resize/quality presets tried in order by compressPhotoForImportJob, from
 * highest fidelity to most aggressive. Unlike the client's own
 * buildImportSourceSnapshot compression (RecipeImportQueueContext.js), which
 * only ever produces a *fallback* snapshot for job restarts — the actual OCR
 * call there always runs against the original, uncompressed photo — this
 * endpoint has no such "live" attempt: the persisted Firestore importSource
 * is the only copy Gemini ever sees. Starting at a much higher-fidelity
 * preset (and only stepping down if a photo doesn't fit its budget) keeps
 * text legible for OCR on the common case of 1-3 photos, while still falling
 * back toward the old flat preset when many photos share the budget.
 */
const PHOTO_COMPRESSION_PRESETS = [
  {width: 2000, height: 2800, quality: 80},
  {width: 1600, height: 2200, quality: 70},
  {width: 1200, height: 1700, quality: 60},
  {width: 1000, height: 1400, quality: 50},
  {width: 800, height: 1100, quality: 40},
];

/**
 * Recompresses a validated recipe photo before it's persisted into a
 * Firestore importSource (see MAX_SHORTCUT_PHOTO_FIRESTORE_BASE64 above for
 * why a size budget is needed at all). Tries PHOTO_COMPRESSION_PRESETS from
 * highest fidelity down, keeping the first one that fits maxBase64Length —
 * so a request with fewer photos (more budget to share) keeps noticeably
 * more OCR-relevant detail than one with many.
 * @param {string} base64Data - Pure base64 image data (no data: prefix)
 * @param {number} maxBase64Length - This photo's share of the total budget
 * @returns {Promise<string>} data: URL of the recompressed JPEG
 */
async function compressPhotoForImportJob(base64Data, maxBase64Length) {
  const imageBuffer = Buffer.from(base64Data, 'base64');
  let smallestDataUrl = null;
  for (const {width, height, quality} of PHOTO_COMPRESSION_PRESETS) {
    const compressedBuffer = await sharp(imageBuffer)
        .resize(width, height, {fit: 'inside', withoutEnlargement: true})
        .jpeg({quality})
        .toBuffer();
    const dataUrl = `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`;
    if (!smallestDataUrl || dataUrl.length < smallestDataUrl.length) {
      smallestDataUrl = dataUrl;
    }
    if (dataUrl.length <= maxBase64Length) {
      return dataUrl;
    }
  }
  // Even the most aggressive preset didn't fit — return it anyway; the
  // caller's post-compression total-size check catches a still-too-large
  // result with a clear error instead of a failed Firestore write.
  return smallestDataUrl;
}

/**
 * Cloud Function: Queue up to MAX_SHORTCUT_PHOTO_IMAGES Shortcut-provided
 * recipe photos for AI OCR import (see docs/setup/apple-shortcut.md).
 * Authenticates via SHORTCUT_API_KEY (same mechanism as importRecipeShortcut
 * / addRecipeViaAPI). processShortcutImportJob (Firestore trigger, further
 * below) already knows how to run a 'photo' importSource
 * (runImportFromPhotoSource) — the same code path the in-app Foto-Scan
 * import uses — so queuing the job here is all this endpoint needs to do.
 *
 * POST /scanRecipePhotoShortcut
 *
 * Headers:
 *   X-Api-Key:    <SHORTCUT_API_KEY secret>
 *   X-User-Email: <registrierte E-Mail-Adresse des Users>
 *   Content-Type: application/json
 *
 * Body (JSON):
 *   images {string[]}       Required – 1..MAX_SHORTCUT_PHOTO_IMAGES base64-encoded
 *                             photos (data URL prefix optional, see validateImageData)
 *   language {string}       Optional – 'de' or 'en', defaults to 'de'
 *   pin {string}            Required, wenn der Zielnutzer einen Webimport-PIN
 *                             eingerichtet hat (sonst nicht erforderlich) –
 *                             siehe requireShortcutPin in webImportPin.js
 *
 * Returns:
 *   200 { success: true, jobId: string, status: 'queued' }
 *   400/401/403/429/500 { success: false, error: string }
 */
exports.scanRecipePhotoShortcut = onRequest(
    {
      maxInstances: 10,
      memory: '256MiB',
      timeoutSeconds: 30,
      secrets: [shortcutApiKey],
      invoker: 'public',
    },
    async (req, res) => {
      // CORS – see importRecipeShortcut above for the rationale.
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

      // Shortcut authentication: API key + user email + role (see authenticateShortcutRequest)
      const auth = await authenticateShortcutRequest(req, res, 'scanRecipePhotoShortcut');
      if (!auth) return;
      const {userId, db} = auth;

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

      let {images: rawImages} = body || {};
      const {pin} = body || {};
      const language = ['de', 'en'].includes(body?.language) ? body.language : 'de';

      // Shortcuts' native array-field editor for a JSON request body only
      // supports adding items one at a time by hand — it has no way to bind
      // a whole list *variable* (e.g. the "Fotos" list built up via "Zu
      // Variable hinzufügen" in a loop) as the array's content in one go.
      // The documented workaround (see docs/setup/apple-shortcut.md) is to build
      // a JSON-array-shaped string by hand (Shortcuts has no dedicated
      // "Encode JSON" action) via "Text kombinieren" with separator `","`,
      // wrapped in a `[` / `]` Text action, and send that as a single Text
      // field instead of a native JSON array. Accept that here transparently
      // so the Shortcut doesn't have to fight the array-field UI.
      if (typeof rawImages === 'string') {
        // Shortcuts' "Base64 kodieren" action wraps its output in MIME-style
        // 76-char lines joined by literal CRLF — valid inside a *native*
        // JSON array (Shortcuts serializes each item as a proper escaped
        // string there), but the hand-built `["<b64>","<b64>"]` string this
        // endpoint also accepts embeds those raw \r\n bytes unescaped inside
        // a string literal, which violates the JSON spec and makes
        // JSON.parse throw even though the brackets/quotes are all correct.
        // They're pure line-wrap noise for base64 data, so strip them
        // before parsing (mirrors the equivalent strip in validateImageData
        // below, which only runs on already-parsed individual images).
        const stripped = rawImages.replace(/[\r\n]/g, '');
        try {
          rawImages = JSON.parse(stripped);
        } catch (parseError) {
          // Shortcuts has no reliable way to preview a Text action's exact
          // characters (smart quotes silently substituted by the keyboard's
          // "Intelligente Anführungszeichen" setting are another common
          // invisible cause of this). Echo back a bounded preview of what
          // was actually received so the raw response the Shortcut already
          // displays doubles as a way to see it, without dumping a possibly
          // multi-megabyte base64 string into the error.
          const preview = stripped.length > 200 ?
            `${stripped.slice(0, 100)}…[${stripped.length} Zeichen gesamt]…${stripped.slice(-100)}` :
            stripped;
          res.status(400).json({
            success: false,
            error: 'Field "images" was a string but not valid JSON. Build it as ' +
              '["photo1","photo2"] (see docs/setup/apple-shortcut.md) instead of a native array field.',
            parseError: parseError.message,
            receivedPreview: preview,
          });
          return;
        }
      }

      if (!Array.isArray(rawImages) || rawImages.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: images (non-empty array of base64-encoded photos)',
        });
        return;
      }

      // Some Shortcuts image actions (e.g. converting a Live Photo) can emit
      // the same photo twice as byte-identical base64 strings under
      // different list positions — dedupe here since Shortcuts itself has
      // no built-in "remove duplicates" list action a user could insert
      // upstream to guard against it.
      const images = [...new Set(rawImages)];

      if (images.length > MAX_SHORTCUT_PHOTO_IMAGES) {
        res.status(400).json({
          success: false,
          error: `A maximum of ${MAX_SHORTCUT_PHOTO_IMAGES} images is supported per request`,
        });
        return;
      }

      const totalBase64Length = images.reduce(
          (sum, img) => sum + (typeof img === 'string' ? img.length : 0), 0,
      );
      if (totalBase64Length > MAX_SHORTCUT_PHOTO_TOTAL_BASE64) {
        res.status(400).json({
          success: false,
          error: `Bilder zu groß (~${Math.round(totalBase64Length / 1024 / 1024)} MB, ` +
            `max ~${Math.round(MAX_SHORTCUT_PHOTO_TOTAL_BASE64 / 1024 / 1024)} MB gesamt). ` +
            'Weniger oder kleinere Fotos verwenden.',
        });
        return;
      }

      // Fail fast on malformed/oversized/wrong-type images instead of
      // queuing a job that's doomed to fail once processShortcutImportJob
      // picks it up. Then recompress each photo before it's persisted — see
      // PHOTO_COMPRESSION_PRESETS above for why this endpoint needs its own
      // (higher-fidelity-when-possible) compression rather than reusing the
      // client's fixed low-fidelity restart-snapshot preset. Each photo gets
      // an equal share of the total Firestore budget, so fewer photos in a
      // request buys each of them more OCR-relevant detail.
      const perImageBudget = Math.floor(MAX_SHORTCUT_PHOTO_FIRESTORE_BASE64 / images.length);
      let compressedImages;
      try {
        compressedImages = await Promise.all(images.map(async (img) => {
          const {base64Data} = validateImageData(img);
          return compressPhotoForImportJob(base64Data, perImageBudget);
        }));
      } catch (validationErr) {
        console.error('scanRecipePhotoShortcut: image validation/compression failed:', validationErr);
        res.status(400).json({
          success: false,
          error: validationErr.message || 'Fotos konnten nicht verarbeitet werden.',
        });
        return;
      }

      const compressedTotalLength = compressedImages.reduce((sum, img) => sum + img.length, 0);
      if (compressedTotalLength > MAX_SHORTCUT_PHOTO_FIRESTORE_BASE64) {
        res.status(400).json({
          success: false,
          error: `Bilder auch nach Komprimierung zu groß (~${Math.round(compressedTotalLength / 1024)} KB, ` +
            `max ~${Math.round(MAX_SHORTCUT_PHOTO_FIRESTORE_BASE64 / 1024)} KB gesamt). ` +
            'Weniger Fotos pro Anfrage verwenden.',
        });
        return;
      }

      // Webimport-PIN: no-op if the target user never set one; otherwise the
      // Shortcut must send a matching `pin` field with every request (it has
      // no interactive session to stay "unlocked" like the in-app modals).
      if (!(await enforceShortcutPin(res, userId, pin))) return;

      if (!(await enforceShortcutAiLimit(res, auth))) return;

      console.log(`scanRecipePhotoShortcut: import queued by user ${userId} for ${images.length} image(s)`);

      // Queue the job and respond immediately, same pattern as
      // importRecipeShortcut — processShortcutImportJob (Firestore trigger)
      // picks this up within seconds and runs the OCR scan server-side.
      try {
        const jobRef = db.collection('recipes').doc();
        await jobRef.set({
          title: 'Rezept-Import',
          authorId: userId,
          isTemp: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          importStatus: 'queued',
          importProgress: 0,
          importHeartbeatAt: Date.now(),
          importOrigin: 'shortcut',
          importSource: {type: 'photo', images: compressedImages, language},
        });
        res.status(200).json({success: true, jobId: jobRef.id, status: 'queued'});
      } catch (err) {
        console.error(`scanRecipePhotoShortcut: failed to queue import for user ${userId}:`, err);
        res.status(500).json({success: false, error: 'Import konnte nicht in die Warteschlange gestellt werden.'});
      }
    },
);

/** Storage path prefix for Shortcut-uploaded Reel videos awaiting transcription. */
const VIDEO_IMPORT_STORAGE_PREFIX = 'pending-video-imports';

/**
 * Cloud Function: Issue a signed upload URL for a Shortcut-provided Reel
 * video (see docs/setup/apple-shortcut.md). This exists because Instagram's
 * anti-bot detection blocks our Puppeteer scraper (scrapeInstagramReel) from
 * a meaningful share of requests — a video the user already saved to their
 * own device sidesteps that entirely, at the cost of one extra manual step
 * (saving the video first). The video is uploaded straight to Storage via
 * the signed URL (never through this function's own request body) so a
 * multi-minute Reel doesn't run into Cloud Functions' ~32MB HTTP request
 * limit. processVideoImportUpload (Storage trigger, below) picks the file up
 * once the PUT completes and deletes it again once processing finishes.
 *
 * Input (POST JSON body): { pin, language?, audioOnly? }
 * Returns: { success: true, jobId, uploadUrl } — uploadUrl accepts a single
 * PUT with Content-Type matching what was requested (video/mp4, or
 * audio/mp4 when audioOnly is true), valid for 10 minutes. audioOnly lets
 * the Shortcut send just the extracted audio track instead of the full
 * video — only the soundtrack is ever transcribed (see
 * transcribeVideoWithGemini), so this cuts the upload size drastically for
 * Reels whose video track would otherwise blow past MAX_REEL_VIDEO_SIZE.
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

      // Shortcut authentication: API key + user email + role (see authenticateShortcutRequest)
      const auth = await authenticateShortcutRequest(req, res, 'getVideoUploadUrl');
      if (!auth) return;
      const {userId, db} = auth;

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
      const audioOnly = body?.audioOnly === true;
      const extension = audioOnly ? 'm4a' : 'mp4';
      const contentType = audioOnly ? 'audio/mp4' : 'video/mp4';

      if (!(await enforceShortcutPin(res, userId, pin))) return;

      // The upload is transcribed with Gemini (processVideoImportUpload), so
      // issuing the URL counts against the same daily quota as the other
      // Gemini-backed Shortcut endpoints.
      if (!(await enforceShortcutAiLimit(res, auth))) return;

      try {
        const jobRef = db.collection('recipes').doc();
        const storagePath = `${VIDEO_IMPORT_STORAGE_PREFIX}/${userId}/${jobRef.id}.${extension}`;

        // importStatus is 'awaiting_upload', not 'queued' – processShortcutImportJob
        // (the Firestore trigger for the 'web' shortcut flow above) only acts on
        // importStatus:'queued' and would otherwise try to process this job before
        // any video has actually been uploaded. processVideoImportUpload picks it
        // up once the file lands in Storage instead.
        await jobRef.set({
          title: 'Rezept-Import',
          authorId: userId,
          isTemp: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          importStatus: 'awaiting_upload',
          importProgress: 0,
          importHeartbeatAt: Date.now(),
          importOrigin: 'shortcut',
          importSource: {type: 'video', storagePath, language, caption, mimeType: contentType},
        });

        const bucket = admin.storage().bucket();
        const [uploadUrl] = await bucket.file(storagePath).getSignedUrl({
          version: 'v4',
          action: 'write',
          expires: Date.now() + 10 * 60 * 1000,
          contentType,
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
 * Storage trigger: processes a Reel video (or, when getVideoUploadUrl issued
 * an audioOnly upload URL, just its audio track) once a Shortcut finishes
 * uploading it to the signed URL from getVideoUploadUrl (path
 * pending-video-imports/{userId}/{jobId}.mp4 or .m4a). Transcribes it and
 * runs the transcript through the normal recipe-extraction step, then
 * deletes the upload from Storage regardless of outcome — it has already
 * served its purpose and shouldn't linger (cost, and it's the user's
 * personal upload).
 */
exports.processVideoImportUpload = onObjectFinalized(
    {
      bucket: STORAGE_BUCKET,
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
          new RegExp(`^${VIDEO_IMPORT_STORAGE_PREFIX}/([^/]+)/([^/]+)\\.(?:mp4|m4a)$`),
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

      // Shortcut authentication: API key + user email + role (see authenticateShortcutRequest)
      const auth = await authenticateShortcutRequest(req, res, 'scrapeInstagramReelShortcut');
      if (!auth) return;
      const {userId, db} = auth;

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

      if (!(await enforceShortcutPin(res, userId, pin))) return;

      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        res.status(500).json({
          success: false,
          error: 'AI service not configured. Please contact administrator.',
        });
        return;
      }

      if (!(await enforceShortcutAiLimit(res, auth))) return;

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
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
 *   pin                     {string}   Required only if the target user configured a
 *                            Webimport-PIN (see requireShortcutPin in webImportPin.js) –
 *                            no-op otherwise.
 *
 * The recipe is attached to the caller's configured Inspirationssammlung list
 * (users/{uid}.defaultWebImportListId – same private list RecipeForm.js
 * pre-selects for review-queue imports) when one is set up, and is made
 * shareable immediately via a generated shareId (see enableSharing in
 * src/utils/recipeFirestore.js), matching how recipes created through the
 * normal review flow can be attached/shared.
 *
 * Returns:
 *   200 { success: true, recipeId: string, shareUrl: string }
 *   400 { success: false, error: string }
 *   401 { success: false, error: string, requiredHeaders?: string[] }
 *   403 { success: false, error: string }
 *   405 { success: false, error: string }
 *   429 { success: false, error: string }
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

      // Shortcut authentication: API key + user email + role (see authenticateShortcutRequest)
      const auth = await authenticateShortcutRequest(req, res, 'addRecipeViaAPI', {allowShortcutUser: false});
      if (!auth) return;
      const {userId, userData, db} = auth;
      const defaultWebImportListId = userData?.defaultWebImportListId || null;

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

      // Webimport-PIN: no-op if the target user never set one; otherwise the
      // Shortcut must send a matching `pin` field with every request (it has
      // no interactive session to stay "unlocked" like the in-app modals).
      if (!(await enforceShortcutPin(res, userId, body?.pin))) return;

      // --- Validate & normalise ---
      let recipeData;
      try {
        recipeData = validateAndNormaliseRecipeInput(body);
      } catch (err) {
        res.status(err.code || 400).json({success: false, error: err.message});
        return;
      }

      // Map kulinarik onto the configured cuisine types ("Deutsch" ->
      // "Deutsche Küche"); unknown values are not stored as a look-alike
      // cuisine type no filter finds, but offered in the review as a new one.
      if (recipeData.kulinarik) {
        const {cuisineTypes} = await getConfiguredImportLists();
        const kulinarik = normalizeCuisines(recipeData.kulinarik, cuisineTypes);
        const kulinarikVorschlag = suggestNewCuisines(recipeData.kulinarik, cuisineTypes);
        if (kulinarik.length > 0) {
          recipeData.kulinarik = kulinarik;
        } else {
          delete recipeData.kulinarik;
        }
        if (kulinarikVorschlag.length > 0) recipeData.kulinarikVorschlag = kulinarikVorschlag;
      }

      // --- Save to Firestore ---
      try {
        const now = admin.firestore.FieldValue.serverTimestamp();

        // Attach to the user's configured Inspirationssammlung list (the same
        // private list RecipeForm.js pre-selects for review-queue imports, see
        // resolveImportGroupContext in src/utils/recipeGroupContext.js) so the
        // recipe lands in the same place other import paths put it, instead of
        // floating with no list at all. Falls back to no list if the user never
        // set one up, or if the stored list id no longer exists.
        let groupFields = {};
        if (defaultWebImportListId) {
          const listDoc = await db.collection('groups').doc(defaultWebImportListId).get();
          if (listDoc.exists) {
            groupFields = {groupId: defaultWebImportListId, groupType: 'private'};
          }
        }

        // Generate a shareId up front so the recipe has a working Share-Link
        // immediately (see enableSharing in src/utils/recipeFirestore.js) instead
        // of requiring the user to manually enable sharing after the fact.
        const shareId = crypto.randomUUID();

        const docData = {
          ...recipeData,
          ...groupFields,
          authorId: userId,
          createdAt: now,
          updatedAt: now,
          shareId,
          // Same pending-review treatment as the other Shortcut import paths
          // (see scrapeInstagramReelShortcut above) — the recipe only leaves
          // TEMP status once the user reviews and saves it via RecipeForm.
          isTemp: true,
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
        res.status(200).json({
          success: true,
          recipeId: docRef.id,
          shareUrl: `https://broubook.web.app/share/${shareId}`,
        });
      } catch (err) {
        console.error('addRecipeViaAPI: Firestore error:', err);
        res.status(500).json({success: false, error: 'Fehler beim Speichern des Rezepts'});
      }
    },
);

// Fallback lists if settings/app has no cuisineTypes/mealCategories yet (kept in
// sync with DEFAULT_CUISINE_TYPES / DEFAULT_MEAL_CATEGORIES in src/utils/customLists.js).
const FALLBACK_CUISINE_TYPES = [
  'Deutsche Küche', 'Französische Küche', 'Italienische Küche', 'Österreichische Küche',
  'Schweizer Küche', 'Türkische Küche', 'Chinesische Küche', 'Indische Küche',
  'Japanische Küche', 'Orientalische Küche', 'Thailändische Küche', 'Mexikanische Küche',
  'US-Amerikanische Küche', 'Vegetarisch', 'Vegan', 'Weihnachtliche Küche',
];
const FALLBACK_MEAL_CATEGORIES = [
  'Appetizer', 'Dips & Saucen', 'Vorspeisen', 'Salate', 'Suppen & Eintöpfe',
  'Hauptspeisen', 'Desserts', 'Drinks', 'Beilagen & Grundrezepte', 'Gebäcke & Teige',
  'Kuchen & Torten', 'Grillrezepte',
];

/**
 * Cloud Function: Return the app's currently configured cuisine types and meal
 * categories (for Apple Shortcuts / external integrations, e.g. Claude, to use
 * the same values as addRecipeViaAPI's `kulinarik`/`speisekategorie` fields).
 *
 * GET /getRecipeOptionsShortcut?pin=<pin>
 *
 * Headers:
 *   X-Api-Key:    <API Key stored as SHORTCUT_API_KEY secret>
 *   X-User-Email: <registrierte E-Mail-Adresse des Users>
 *
 * Query params:
 *   pin {string} Required only if the target user configured a Webimport-PIN
 *       (see requireShortcutPin in webImportPin.js) – no-op otherwise. A GET
 *       request has no body, so the PIN travels as a query param here (all
 *       other pinned endpoints are POST and take it in the JSON body instead).
 *
 * Returns:
 *   200 { success: true, cuisineTypes: string[], mealCategories: string[] }
 *   401 { success: false, error: string, requiredHeaders?: string[] }
 *   403 { success: false, error: string }
 *   405 { success: false, error: string }
 *   429 { success: false, error: string }
 *   500 { success: false, error: string }
 */
exports.getRecipeOptionsShortcut = onRequest(
    {maxInstances: 10, secrets: [shortcutApiKey], invoker: 'public'},
    async (req, res) => {
      const origin = req.headers.origin;
      if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key, X-User-Email');
        if (req.method === 'OPTIONS') {
          res.status(204).send('');
          return;
        }
      } else if (req.method === 'OPTIONS') {
        res.status(403).send('');
        return;
      }

      if (req.method !== 'GET') {
        res.status(405).json({success: false, error: 'Method not allowed. Use GET.'});
        return;
      }

      // Shortcut authentication: API key + user email + role (see authenticateShortcutRequest)
      const auth = await authenticateShortcutRequest(req, res, 'getRecipeOptionsShortcut', {allowShortcutUser: false});
      if (!auth) return;
      const {userId, db} = auth;

      // Webimport-PIN: no-op if the target user never set one; otherwise the
      // Shortcut must send a matching `pin` query param with every request (it
      // has no interactive session to stay "unlocked" like the in-app modals).
      if (!(await enforceShortcutPin(res, userId, req.query?.pin))) return;

      // --- Read configured lists from settings/app, fall back to defaults ---
      try {
        const settingsDoc = await db.collection('settings').doc('app').get();
        const data = settingsDoc.exists ? settingsDoc.data() : {};
        const cuisineTypes = Array.isArray(data?.cuisineTypes) && data.cuisineTypes.length > 0 ?
          data.cuisineTypes : FALLBACK_CUISINE_TYPES;
        const mealCategories = Array.isArray(data?.mealCategories) && data.mealCategories.length > 0 ?
          data.mealCategories : FALLBACK_MEAL_CATEGORIES;

        res.status(200).json({success: true, cuisineTypes, mealCategories});
      } catch (err) {
        console.error('getRecipeOptionsShortcut: Firestore error:', err);
        res.status(500).json({success: false, error: 'Fehler beim Lesen der Einstellungen'});
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

      // Shortcut authentication: API key + user email + role (see authenticateShortcutRequest)
      const auth = await authenticateShortcutRequest(req, res, 'createRecipeImportFromText');
      if (!auth) return;
      const {userId, db} = auth;

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

      // Webimport-PIN: no-op if the target user never set one (same rule as
      // every other Shortcut endpoint).
      if (!(await enforceShortcutPin(res, userId, body?.pin))) return;

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

      // JSON.stringify does not escape '<', so a text containing "</script>"
      // would break out of the JSON-LD block (Tech-Check F6). \u003c is the
      // same character for JSON parsers but inert for the HTML parser;
      // U+2028/2029 are escaped for older script parsers.
      const jsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Recipe',
        'name': title,
        'description': rawText,
      })
          .replace(/</g, '\\u003c')
          .replace(/\u2028/g, '\\u2028')
          .replace(/\u2029/g, '\\u2029');

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

// ---------------------------------------------------------------------------
// Daily AI importer self-test
// ---------------------------------------------------------------------------

/**
 * Minimal HTML snippet used as test input for the daily AI importer test.
 * Kept small to minimise API cost. Contains a clearly structured recipe so
 * the AI can extract all required fields reliably. Served over real HTTP by
 * importerTestFixturePage below so the nightly test can fetch it through the
 * exact same fetchRecipeHtml callable real users hit — instead of holding it
 * only in memory and skipping the network fetch entirely.
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
 * Public HTTP endpoint that serves IMPORTER_TEST_HTML as a real, fetchable
 * page. Exists solely as a stable fixture for dailyAiImporterTest below, so
 * that test can exercise the real fetchRecipeHtml callable's network fetch
 * (headers, redirects, timeout, content-type check) against an actual HTTP
 * round trip instead of an unrelated third-party page or an in-memory string.
 */
exports.importerTestFixturePage = onRequest(
    {cors: false, region: 'us-central1', invoker: 'public'},
    (_req, res) => {
      res.set('Cache-Control', 'no-store');
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(IMPORTER_TEST_HTML);
    },
);

/**
 * Minimum number of ingredients / steps expected from the HTML test recipe.
 */
const IMPORTER_TEST_MIN_INGREDIENTS = 2;
const IMPORTER_TEST_MIN_STEPS = 2;

/**
 * Region + project host used to call the deployed callables directly over
 * HTTPS (bypassing the Firebase client SDK, which isn't usable from within a
 * Cloud Function) so the nightly test exercises the exact same auth/IAM
 * boundary a real client hits.
 */
const CALLABLE_BASE_URL = 'https://us-central1-broubook.cloudfunctions.net';

/**
 * Mint a Firebase ID token for AI_IMPORTER_TEST_UID by creating a custom
 * token with the Admin SDK and exchanging it via the Identity Toolkit REST
 * API — the same exchange the client SDK performs internally.
 *
 * @param {string} webApiKey - Firebase Web API key (WEB_API_KEY secret)
 * @returns {Promise<string>} A Firebase ID token for AI_IMPORTER_TEST_UID
 */
async function mintImporterTestIdToken(webApiKey) {
  if (!webApiKey) {
    throw new Error('WEB_API_KEY-Secret ist nicht konfiguriert');
  }
  // The AI callables read the role from users/{uid} (requireAiCaller) and
  // refuse anyone below 'edit'. The throwaway test user has no profile of its
  // own, so provision one - merge keeps this idempotent across nightly runs.
  await admin.firestore().doc(`users/${AI_IMPORTER_TEST_UID}`).set({
    vorname: 'Nightly',
    nachname: 'Importer-Test',
    role: 'edit',
    isTestAccount: true,
  }, {merge: true});
  const customToken = await admin.auth().createCustomToken(AI_IMPORTER_TEST_UID);
  const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${webApiKey}`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({token: customToken, returnSecureToken: true}),
        signal: AbortSignal.timeout(15000),
      },
  );
  const body = await response.json();
  if (!response.ok || !body.idToken) {
    throw new Error(
        `Identity-Toolkit-Token-Exchange fehlgeschlagen: ${body.error?.message || response.status}`,
    );
  }
  return body.idToken;
}

/**
 * Invoke a deployed onCall function directly over HTTPS using the callable
 * protocol, so dailyAiImporterTest exercises the real public entry point
 * (Firebase Auth verification + Cloud Run invoker permissions + rate
 * limiting) instead of calling the underlying helper function in-process.
 * This is the only way to catch an IAM/invoker misconfiguration that makes
 * every real client call fail (see issue #2611).
 *
 * @param {string} functionName - Name of the exported onCall function
 * @param {Object} data - Callable request payload
 * @param {string} idToken - Firebase ID token to send as the caller's identity
 * @returns {Promise<Object>} The callable's `result` payload
 */
async function callPublicCallable(functionName, data, idToken) {
  const response = await fetch(`${CALLABLE_BASE_URL}/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({data}),
    signal: AbortSignal.timeout(60000),
  });
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(`${functionName}: ${body.error?.message || `HTTP ${response.status}`}`);
  }
  return body.result;
}

/**
 * Render a small JPEG photo of a printed recipe using sharp, so the nightly
 * test can exercise scanRecipeWithAI's real image/OCR pipeline (Gemini
 * vision) end-to-end without checking a binary fixture into the repo.
 *
 * @returns {Promise<string>} data: URL (base64 JPEG) suitable for scanRecipeWithAI
 */
async function renderImporterTestRecipeImage() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <rect width="800" height="600" fill="white"/>
    <text x="40" y="60" font-size="36" font-family="sans-serif" font-weight="bold">Rührei</text>
    <text x="40" y="110" font-size="20" font-family="sans-serif">Für 2 Personen</text>
    <text x="40" y="160" font-size="24" font-family="sans-serif" font-weight="bold">Zutaten</text>
    <text x="40" y="195" font-size="20" font-family="sans-serif">- 4 Eier</text>
    <text x="40" y="225" font-size="20" font-family="sans-serif">- 2 Esslöffel Butter</text>
    <text x="40" y="255" font-size="20" font-family="sans-serif">- 1 Prise Salz</text>
    <text x="40" y="310" font-size="24" font-family="sans-serif" font-weight="bold">Zubereitung</text>
    <text x="40" y="345" font-size="20" font-family="sans-serif">1. Eier verquirlen und salzen.</text>
    <text x="40" y="375" font-size="20" font-family="sans-serif">2. Butter in der Pfanne schmelzen.</text>
    <text x="40" y="405" font-size="20" font-family="sans-serif">3. Eimasse unter Rühren stocken lassen.</text>
    <text x="40" y="435" font-size="20" font-family="sans-serif">4. Sofort servieren.</text>
  </svg>`;
  const jpegBuffer = await sharp(Buffer.from(svg)).jpeg().toBuffer();
  return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
}

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

  if (typeof recipe.title !== 'string' || recipe.title.trim().length === 0) {
    issues.push('Kein Titel im Ergebnis enthalten');
  }

  if (!recipe.ingredients || !Array.isArray(recipe.ingredients) ||
      recipe.ingredients.length < IMPORTER_TEST_MIN_INGREDIENTS) {
    issues.push(
        `Zu wenige Zutaten: erwartet mind. ${IMPORTER_TEST_MIN_INGREDIENTS}, ` +
        `erhalten ${Array.isArray(recipe.ingredients) ? recipe.ingredients.length : 0}`,
    );
  } else if (recipe.ingredients.some((i) => !String(i || '').trim())) {
    issues.push('Mindestens eine Zutat ist leer');
  }

  if (!recipe.steps || !Array.isArray(recipe.steps) ||
      recipe.steps.length < IMPORTER_TEST_MIN_STEPS) {
    issues.push(
        `Zu wenige Zubereitungsschritte: erwartet mind. ${IMPORTER_TEST_MIN_STEPS}, ` +
        `erhalten ${Array.isArray(recipe.steps) ? recipe.steps.length : 0}`,
    );
  } else if (recipe.steps.some((s) => !String(s || '').trim())) {
    issues.push('Mindestens ein Zubereitungsschritt ist leer');
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
 * Unlike the previous version, tests 2–4 no longer call internal helper
 * functions directly — they go through the real deployed callables over
 * HTTPS with a genuine Firebase ID token, exactly like the web app and the
 * Apple Shortcut integration do. This means the nightly run now also catches
 * an IAM/Cloud-Run-Invoker misconfiguration or an auth-guard regression that
 * previously would have gone unnoticed (see issue #2611) — a
 * `callGeminiTextAPI` call from within the same process could never fail
 * that way.
 *
 * Tests covered:
 * 1. Konfiguration – Gemini API key present + prompt accessible
 * 2. fetchRecipeHtml (öffentliche Schnittstelle) – real HTTP fetch of a
 *    dedicated fixture page (importerTestFixturePage) through the deployed
 *    callable
 * 3. processHtmlWithAI (öffentliche Schnittstelle) – feeds test 2's fetched
 *    HTML into the deployed callable, so fetch + AI extraction are verified
 *    as one connected chain instead of two disjoint checks
 * 4. scanRecipeWithAI (öffentliche Schnittstelle) – the image/OCR import
 *    path, previously never exercised by this nightly run at all
 *
 * @param {string} apiKey - Gemini API key value
 * @param {string} webApiKey - Firebase Web API key value (for the ID-token exchange)
 * @returns {Promise<Array<{name: string, success: boolean, details: string, durationMs: number}>>}
 */
async function runAllImporterTests(apiKey, webApiKey) {
  const results = [];

  // Test 1: verify Gemini API key is present and prompt is loadable
  results.push(await runTest('Konfiguration (GEMINI_API_KEY & Prompt)', async () => {
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
  }));

  // Mint one ID token up front and reuse it for tests 2–4. If this fails
  // (e.g. WEB_API_KEY missing), all three report the same clear
  // cause instead of three unrelated-looking errors.
  let idToken = null;
  let idTokenError = null;
  try {
    idToken = await mintImporterTestIdToken(webApiKey);
  } catch (err) {
    idTokenError = err.message || String(err);
  }

  // Test 2: real HTTP fetch of the fixture page via the public callable
  let fetchedHtml = null;
  results.push(await runTest('fetchRecipeHtml (öffentliche Schnittstelle)', async () => {
    if (idTokenError) throw new Error(`Kein Test-ID-Token: ${idTokenError}`);
    const fixtureUrl = `${CALLABLE_BASE_URL}/importerTestFixturePage`;
    const result = await callPublicCallable('fetchRecipeHtml', {url: fixtureUrl}, idToken);
    const html = result?.html || '';
    if (!html.includes('Rührei') || html.length < 200) {
      throw new Error(`Unerwarteter Seiteninhalt (${html.length} Zeichen empfangen)`);
    }
    fetchedHtml = html;
    return {details: `${html.length} Zeichen HTML über die öffentliche Callable geladen.`};
  }));

  // Test 3: pipe test 2's fetched HTML into processHtmlWithAI — a genuinely
  // connected fetch-then-extract chain, not two independent checks.
  results.push(await runTest('processHtmlWithAI (öffentliche Schnittstelle) – Fetch+Extraktion', async () => {
    if (idTokenError) throw new Error(`Kein Test-ID-Token: ${idTokenError}`);
    if (!fetchedHtml) throw new Error('Übersprungen: fetchRecipeHtml lieferte kein HTML (siehe Test oben)');
    const result = await callPublicCallable(
        'processHtmlWithAI', {rawHtml: fetchedHtml, language: 'de'}, idToken,
    );
    const {valid, issues} = validateImporterResult(result);
    if (!valid) throw new Error(`Validierungsfehler: ${issues.join('; ')}`);
    const ingredientCount = result.ingredients.length;
    const stepCount = result.steps.length;
    return {
      details:
        `Rezept "${result.title}" extrahiert – ` +
        `${ingredientCount} Zutaten, ${stepCount} Schritte.`,
    };
  }));

  // Test 4: image/OCR import path — previously never covered by this test.
  results.push(await runTest('scanRecipeWithAI (öffentliche Schnittstelle) – Bild-/OCR-Import', async () => {
    if (idTokenError) throw new Error(`Kein Test-ID-Token: ${idTokenError}`);
    const imageBase64 = await renderImporterTestRecipeImage();
    const result = await callPublicCallable(
        'scanRecipeWithAI', {imageBase64, language: 'de'}, idToken,
    );
    const {valid, issues} = validateImporterResult(result);
    if (!valid) throw new Error(`Validierungsfehler: ${issues.join('; ')}`);
    const ingredientCount = result.ingredients.length;
    const stepCount = result.steps.length;
    return {
      details:
        `Rezept "${result.title}" aus Testbild erkannt – ` +
        `${ingredientCount} Zutaten, ${stepCount} Schritte.`,
    };
  }));

  return results;
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
      secrets: [geminiApiKey, firebaseWebApiKey, smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom],
      memory: '512MiB',
      timeoutSeconds: 420,
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
      const webApiKeyVal = firebaseWebApiKey.value();
      let results;
      try {
        results = await runAllImporterTests(apiKeyVal, webApiKeyVal);
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
          .collection('users').where('role', '==', 'admin').get();
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
  if (!merged.cuisines?.length) {
    merged.cuisines = validResults.find((r) => r.cuisines?.length)?.cuisines;
  }
  if (!merged.cuisines?.length && !merged.cuisineSuggestions?.length) {
    merged.cuisineSuggestions =
      validResults.find((r) => r.cuisineSuggestions?.length)?.cuisineSuggestions;
  }
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
 * Like callGeminiAPI, but sends multiple photos as separate inline_data
 * parts within a SINGLE Gemini request instead of one request per photo
 * (see scanImagesWithGemini/mergePhotoAiResultsServer above for that
 * approach). runImportFromPhotoSource uses this one instead for the same
 * reason those two exist for scanRecipesWithAI: a multi-page recipe often
 * has a continuation page — more ingredients/steps, no title or context of
 * its own — that doesn't parse as a valid *standalone* recipe when Gemini
 * only ever sees that one photo in isolation. Scanned independently, that
 * photo's Gemini call throws (or returns something that fails JSON
 * parsing) and mergePhotoAiResultsServer silently drops the whole result,
 * losing that photo's content entirely. Giving the model every page in one
 * request lets it read them the way a person flipping through would, so a
 * continuation page's content lands in the combined result instead of
 * being discarded.
 * @param {Array<{mimeType: string, base64Data: string}>} imageInputs
 * @param {string} lang
 * @param {string} apiKey
 * @param {string[]|undefined} cuisineTypes
 * @param {string[]|undefined} mealCategories
 * @returns {Promise<Object>} Structured recipe data (same shape as callGeminiAPI)
 */
async function callGeminiMultiImageAPI(imageInputs, lang, apiKey, cuisineTypes, mealCategories) {
  let prompt = await getRecipeExtractionPrompt();
  ({cuisineTypes, mealCategories} = await resolveImportLists(cuisineTypes, mealCategories));

  if (Array.isArray(cuisineTypes) && cuisineTypes.length > 0) {
    const cuisineList = cuisineTypes.map((c) => `- ${c}`).join('\n');
    prompt = prompt.replaceAll('{{CUISINE_TYPES}}', cuisineList);
  } else {
    prompt = prompt.replaceAll(
        '{{CUISINE_TYPES}}',
        '- Italian\n- Thai\n- Chinese\n- Japanese\n- Indian\n- Mexican\n- French\n- German\n- American\n- Mediterranean',
    );
  }
  if (Array.isArray(mealCategories) && mealCategories.length > 0) {
    const categoryList = mealCategories.map((c) => `- ${c}`).join('\n');
    prompt = prompt.replaceAll('{{MEAL_CATEGORIES}}', categoryList);
  } else {
    prompt = prompt.replaceAll(
        '{{MEAL_CATEGORIES}}',
        '- Appetizer\n- Main Course\n- Dessert\n- Soup\n- Salad\n- Snack\n- Beverage\n- Side Dish',
    );
  }

  // The base prompt (above, from Settings) is written for a single image —
  // it opens with "Analysiere dieses Rezeptbild" and, more importantly,
  // closes with "Extrahiere nun alle sichtbaren Informationen aus dem Bild"
  // (singular "the image"). A prefix alone got diluted by that closing
  // line and the model kept anchoring on one photo, silently dropping a
  // continuation page's content. Appending this note AFTER the base
  // prompt instead makes it the last instruction the model reads before
  // the images themselves, so it overrides the singular framing rather
  // than competing with it.
  const multiPageNote = lang === 'de' ?
    '\n\nWICHTIGER HINWEIS ZU DEN BILDERN: Die obigen Anweisungen sprechen von "dem Bild" (Singular) – ' +
      'tatsächlich erhältst du mehrere Fotos, die zusammen SEITEN DESSELBEN Rezepts zeigen, in der Reihenfolge, ' +
      'in der sie angehängt sind (z. B. Zutatenliste auf einem Foto, Zubereitungsschritte auf einem anderen). ' +
      'Betrachte JEDES einzelne angehängte Foto genau und kombiniere die Informationen aus ALLEN Fotos zu ' +
      'EINEM vollständigen Rezept-JSON. Ignoriere KEIN Foto, auch wenn es für sich allein unvollständig wirkt ' +
      '(z. B. nur Zubereitungsschritte ohne eigenen Titel) – solche Fotos ergänzen die Informationen der anderen.' :
    '\n\nIMPORTANT NOTE ABOUT THE IMAGES: The instructions above refer to "the image" (singular) – ' +
      'you are actually receiving multiple photos that together show PAGES OF THE SAME recipe, in the order ' +
      'they are attached (e.g. ingredient list on one photo, preparation steps on another). Examine EVERY ' +
      'attached photo closely and combine the information from ALL photos into ONE complete recipe JSON. ' +
      'Do not ignore any photo, even if it looks incomplete on its own (e.g. only preparation steps with no ' +
      'title of its own) – such photos complement the information in the others.';

  const parts = [{text: prompt + multiPageNote}];
  for (const {mimeType, base64Data} of imageInputs) {
    parts.push({inline_data: {mime_type: mimeType, data: base64Data}});
  }

  const requestBody = {
    contents: [{parts}],
    generationConfig: {
      temperature: 0.1,
      topK: 32,
      topP: 1,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: RECIPE_EXTRACTION_RESPONSE_SCHEMA,
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
      console.error('Gemini API error (multi-image):', errorData);
      const errorMessage = errorData.error?.message || response.statusText;
      if (response.status === 429) {
        throw new HttpsError(
            'resource-exhausted',
            'Die KI-API ist momentan ausgelastet. Bitte versuche es in einigen Minuten erneut oder nutze Standard-OCR.',
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

    if (lang === 'de') {
      return {
        title: recipeData.titel || '',
        servings: recipeData.portionen || 0,
        prepTime: recipeData.zubereitungszeit || '',
        cookTime: recipeData.kochzeit || '',
        difficulty: recipeData.schwierigkeit || 0,
        ...cuisineFields(recipeData.kulinarik, cuisineTypes),
        category: recipeData.kategorie || '',
        tags: recipeData.tags || [],
        ingredients: normalizeIngredientUnits(recipeData.zutaten || []),
        steps: recipeData.zubereitung || [],
        notes: recipeData.notizen || '',
        confidence: 95,
        provider: 'gemini',
        rawResponse: textResponse,
      };
    }
    return {
      title: recipeData.title || '',
      servings: recipeData.servings || 0,
      prepTime: recipeData.prepTime || '',
      cookTime: recipeData.cookTime || '',
      difficulty: recipeData.difficulty || 0,
      ...cuisineFields(recipeData.cuisine, cuisineTypes),
      category: recipeData.category || '',
      tags: recipeData.tags || [],
      ingredients: normalizeIngredientUnits(recipeData.ingredients || []),
      steps: recipeData.steps || [],
      notes: recipeData.notes || '',
      confidence: 95,
      provider: 'gemini',
      rawResponse: textResponse,
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    console.error('Gemini API call error (multi-image):', error);
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
          'Failed to parse recipe data. The images might not contain a valid recipe.',
      );
    }
    throw new HttpsError('internal', 'Failed to process images with AI: ' + error.message);
  }
}

/**
 * Rebuilds the 'photo' leg of runImportFromSource, server-side equivalent of
 * runPhotoScanImport in src/utils/importRunners.js. Unlike that client path
 * (which calls scanRecipesWithAI's per-image-then-merge approach), multiple
 * photos here go through callGeminiMultiImageAPI as one combined request —
 * see its doc comment for why.
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
  const imageInputs = images.map((img) => validateImageData(img));
  if (imageInputs.length === 1) {
    return callGeminiAPI(imageInputs[0].base64Data, imageInputs[0].mimeType, language, apiKey);
  }
  return callGeminiMultiImageAPI(imageInputs, language, apiKey);
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
 * @param {{storagePath: string, language?: string, caption?: string, mimeType?: string}} source
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
  const mimeType = (source && source.mimeType) || 'video/mp4';
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
  const transcribedText = await transcribeVideoWithGemini(videoBuffer, language, apiKey, mimeType);
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

// Ausgelagerte Function-Gruppen (Tech-Check F2): Für dich entdeckt, Follow, Sharing, Admin, Nutrition.
Object.assign(exports, require('./handlers/discover'), require('./handlers/follow'),
    require('./handlers/sharing'),
    require('./handlers/admin'),
    require('./handlers/nutrition'));
