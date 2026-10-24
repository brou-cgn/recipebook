/**
 * Von mehreren Function-Gruppen genutzte Helfer (importSources; aus index.js, Tech-Check F2).
 */

const {HttpsError} = require('firebase-functions/v2/https');
const {launchBrowser} = require('../launchBrowser');
const {transcribeVideoWithGemini, callGeminiTextAPI, callGeminiAPI} = require('./gemini');
const {extractJsonLdRecipeCandidateFromHtml, extractMicrodataRecipeCandidateFromHtml, jsonLdCandidateToText, extractPlainTextFromHtml, looksLikeIncompleteRecipe} = require('./htmlExtraction');

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

const MAX_FETCH_HTML_SIZE = 1000000; // 1 MB – higher limit for raw HTML fetch to avoid truncating JSON-LD on large pages

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

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

module.exports = {assertPublicUrl, MAX_IMAGE_SIZE, GEMINI_INLINE_REQUEST_LIMIT, MAX_REEL_VIDEO_SIZE, MAX_FETCH_HTML_SIZE, ALLOWED_MIME_TYPES, validateImageData, BATCH_IMAGE_CONCURRENCY, levenshteinDistance, stringSimilarity, removeDuplicateStrings, mergePhotoAiResultsServer, isInstagramUrl, runImportFromInstagram, runImportFromUrl};
