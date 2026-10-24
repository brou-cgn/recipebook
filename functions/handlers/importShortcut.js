/**
 * importShortcut: aus index.js ausgelagert (Tech-Check F2).
 */

const {onRequest, HttpsError} = require('firebase-functions/v2/https');
const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {onObjectFinalized} = require('firebase-functions/v2/storage');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const sharp = require('sharp');
const {requireShortcutPin} = require('../webImportPin');
const {normalizeCuisines, suggestNewCuisines} = require('../cuisineNormalization');
const {AI_IMPORTER_TEST_UID} = require('../shared/auth');
const {ALLOWED_ORIGINS, escapeHtml} = require('../shared/common');
const {DEFAULT_AI_RECIPE_PROMPT, RECIPE_EXTRACTION_RESPONSE_SCHEMA, getRecipeExtractionPrompt, callGeminiAPI, callGeminiTextAPI, transcribeVideoWithGemini} = require('../shared/gemini');
const {assertPublicUrl, MAX_REEL_VIDEO_SIZE, validateImageData, buildRecipeFieldsFromResult, writeImportProtocolEntry, finalizeImportJob, failImportJob, BATCH_IMAGE_CONCURRENCY, mergePhotoAiResultsServer, isInstagramUrl, runImportFromInstagram, runImportFromUrl} = require('../shared/importCore');
const {getConfiguredImportLists, resolveImportLists, cuisineFields, normalizeIngredientUnits, FALLBACK_CUISINE_TYPES, FALLBACK_MEAL_CATEGORIES} = require('../shared/importLists');
const {checkRateLimit} = require('../shared/rateLimit');
const {smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom, geminiApiKey} = require('../shared/secrets');

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
