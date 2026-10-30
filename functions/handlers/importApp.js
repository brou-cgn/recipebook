/**
 * importApp: aus index.js ausgelagert (Tech-Check F2).
 */

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {launchBrowser} = require('../launchBrowser');
const {requireAiCaller} = require('../shared/auth');
const {ALLOWED_ORIGINS} = require('../shared/common');
const {RECIPE_STEP_STYLE_RULE, RECIPE_STEP_BOUNDARY_RULE, callGeminiAPI, callGeminiTextAPI} = require('../shared/gemini');
const {finalizeImportJob, failImportJob} = require('../shared/importCore');
const {assertPublicUrl, MAX_FETCH_HTML_SIZE, validateImageData, BATCH_IMAGE_CONCURRENCY, mergePhotoAiResultsServer, isInstagramUrl, runImportFromInstagram, runImportFromUrl} = require('../shared/importSources');
const {consumeDailyQuota, getRateLimit, checkRateLimit} = require('../shared/rateLimit');
const {geminiApiKey} = require('../shared/secrets');
const {geminiGenerateContentRequest} = require('../shared/geminiConfig');

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

const MAX_HTML_SIZE = 500000; // 500 KB in characters – used by processHtmlWithAI input validation

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
 * Feature flags that open the import callables. The client shows the import
 * buttons from rolePermissions/{role}: fotoscan (photo scan), webimport (web
 * import) and recipeImport (universal import, which uses every callable). The
 * callables cannot tell the three paths apart - a web import also scans a
 * screenshot - so any one of them is enough.
 */
const IMPORT_FEATURES = ['fotoscan', 'webimport', 'recipeImport'];

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

      const {url, headers: geminiHeaders} = geminiGenerateContentRequest(apiKey);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: geminiHeaders,
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
