/**
 * Von mehreren Function-Gruppen genutzte Helfer (importJobs; aus index.js, Tech-Check F2).
 */

const {HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const {finalizeImportJob, failImportJob} = require('./importCore');
const {isInstagramUrl, BATCH_IMAGE_CONCURRENCY, validateImageData, runImportFromInstagram, runImportFromUrl, mergePhotoAiResultsServer, MAX_REEL_VIDEO_SIZE} = require('./importSources');
const {callGeminiAPI, callGeminiTextAPI, getRecipeExtractionPrompt, RECIPE_EXTRACTION_RESPONSE_SCHEMA, transcribeVideoWithGemini} = require('./gemini');
const {resolveImportLists, cuisineFields, normalizeIngredientUnits} = require('./importLists');
const {geminiApiKey} = require('./secrets');
const {geminiGenerateContentRequest} = require('./geminiConfig');

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

  const {url, headers: geminiHeaders} = geminiGenerateContentRequest(apiKey);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: geminiHeaders,
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

module.exports = {sendImportStatusPush, finalizeImportJobBackground, failImportJobBackground, isReelImportSource, scanImagesWithGemini, mergeUniversalAiResultsServer, runImportFromWebSource, runImportFromUniversalSource, callGeminiMultiImageAPI, runImportFromPhotoSource, runImportFromVideoSource, runImportFromSource};
