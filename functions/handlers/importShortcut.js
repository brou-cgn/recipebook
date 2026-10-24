/**
 * importShortcut: aus index.js ausgelagert (Tech-Check F2).
 */

const {onRequest} = require('firebase-functions/v2/https');
const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const crypto = require('crypto');
const {normalizeCuisines, suggestNewCuisines} = require('../cuisineNormalization');
const {ALLOWED_ORIGINS} = require('../shared/common');
const {buildRecipeFieldsFromResult, writeImportProtocolEntry} = require('../shared/importCore');
const {assertPublicUrl, validateImageData, isInstagramUrl, runImportFromInstagram} = require('../shared/importSources');
const {finalizeImportJobBackground, failImportJobBackground, isReelImportSource, runImportFromSource} = require('../shared/importJobs');
const {getConfiguredImportLists, FALLBACK_CUISINE_TYPES, FALLBACK_MEAL_CATEGORIES} = require('../shared/importLists');
const {geminiApiKey, shortcutApiKey} = require('../shared/secrets');
const {authenticateShortcutRequest, enforceShortcutPin, enforceShortcutAiLimit} = require('../shared/shortcutAuth');

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
    const sharp = require('sharp');
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

