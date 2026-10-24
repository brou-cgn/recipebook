/**
 * Von mehreren Function-Gruppen genutzte Helfer (importCore; aus index.js, Tech-Check F2).
 */

const admin = require('firebase-admin');

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

module.exports = {buildRecipeFieldsFromResult, IMPORT_PROTOCOL_TTL_MS, writeImportProtocolEntry, finalizeImportJob, PERMANENT_IMPORT_ERROR_CODES, RETRYABLE_IMPORT_ERROR_CODES, classifyImportErrorKind, failImportJob};
