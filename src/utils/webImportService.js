/**
 * Web Import Service
 * Provides functionality to capture screenshots from URLs and process them
 * Uses Firebase Cloud Functions for secure server-side screenshot capture
 */

import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { recognizeRecipeWithAI, processHtmlWithGemini } from './aiOcrService';
import { parseOcrText } from './ocrParser';

/**
 * Normalize Firebase callable errors so callers can handle both local test
 * stubs and production `functions/...` error codes consistently.
 *
 * @param {Error & {code?: string}} error - Error thrown by a callable function
 * @returns {{code: string, message: string, lowerMessage: string}}
 */
export function getCallableErrorDetails(error) {
  const rawCode = error?.code ? String(error.code) : '';
  const code = rawCode.replace(/^functions\//, '').toLowerCase();
  const message = error?.message ? String(error.message).trim() : '';
  const lowerMessage = message.toLowerCase();

  return { code, message, lowerMessage };
}

const SINGLE_SLASH_PROTOCOL_RE = /^([a-z][a-z0-9+.-]*):\/(?!\/)/i;
const HAS_PROTOCOL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const BARE_HOST_RE = /^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#][^\s]*)?$/i;

/**
 * Normalize user-provided recipe URLs so common mobile/share variants still
 * parse as regular HTTP(S) URLs.
 *
 * @param {string} url - Raw user input
 * @returns {string} Normalized URL candidate
 */
export function normalizeImportedUrl(url) {
  if (typeof url !== 'string') {
    return '';
  }

  // Some mobile share/clipboard flows insert zero-width spaces into pasted URLs.
  let normalizedUrl = url.trim().replace(/\u200B/g, '');
  if (!normalizedUrl) {
    return '';
  }

  // Repair inputs like "https:/example.com" where mobile share/paste lost one slash.
  if (SINGLE_SLASH_PROTOCOL_RE.test(normalizedUrl)) {
    normalizedUrl = normalizedUrl.replace(SINGLE_SLASH_PROTOCOL_RE, '$1://');
  } else if (normalizedUrl.startsWith('//')) {
    normalizedUrl = `https:${normalizedUrl}`;
  } else if (
    // Accept bare host/path inputs like "www.example.com/rezept" and default to HTTPS.
    !HAS_PROTOCOL_RE.test(normalizedUrl) &&
    BARE_HOST_RE.test(normalizedUrl)
  ) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  return normalizedUrl;
}

/**
 * Capture a screenshot of a website
 * @param {string} url - The URL to capture
 * @param {Function} onProgress - Optional progress callback (0-100)
 * @returns {Promise<string>} Base64 encoded screenshot
 */
export async function captureWebsiteScreenshot(url, onProgress = null) {
  const normalizedUrl = normalizeImportedUrl(url);

  // Validate URL
  if (!normalizedUrl) {
    throw new Error('Invalid URL provided');
  }

  try {
    new URL(normalizedUrl); // This will throw if URL is invalid
  } catch {
    throw new Error('Ungültige URL. Bitte geben Sie eine vollständige URL ein (z.B. https://example.com)');
  }

  if (onProgress) onProgress(10);

  let progressInterval = null;

  try {
    // Call the Cloud Function to capture screenshot
    const captureScreenshot = httpsCallable(functions, 'captureWebsiteScreenshot');
    
    let simulatedProgress = 30;
    if (onProgress) {
      onProgress(30);
      progressInterval = setInterval(() => {
        simulatedProgress = Math.min(85, simulatedProgress + 1);
        onProgress(simulatedProgress);
      }, 300);
    }

    const result = await captureScreenshot({
      url: normalizedUrl,
    });

    clearInterval(progressInterval);
    progressInterval = null;
    if (onProgress) onProgress(90);

    const screenshotData = result.data;

    if (!screenshotData || !screenshotData.screenshot) {
      throw new Error('Kein Screenshot von der Cloud Function erhalten');
    }

    if (onProgress) onProgress(100);

    return screenshotData.screenshot;

  } catch (error) {
    clearInterval(progressInterval);
    if (onProgress) onProgress(0);

    const { code, message, lowerMessage } = getCallableErrorDetails(error);

    // Enhance error messages based on Firebase error codes
    if (code === 'unauthenticated') {
      throw new Error('Sie müssen angemeldet sein, um den Webimport zu verwenden.');
    } else if (code === 'resource-exhausted') {
      throw new Error(message || 'Rate-Limit erreicht. Bitte versuchen Sie es später erneut.');
    } else if (code === 'invalid-argument') {
      throw new Error(message || 'Ungültige URL angegeben.');
    } else if (code === 'failed-precondition') {
      throw new Error('Webimport-Service nicht konfiguriert. Bitte kontaktieren Sie den Administrator.');
    } else if (code === 'deadline-exceeded') {
      throw new Error('Zeitüberschreitung beim Laden der Website. Bitte versuchen Sie es erneut.');
    } else if (code === 'internal') {
      if (
        lowerMessage.includes('name_not_resolved') ||
        lowerMessage.includes('enotfound') ||
        lowerMessage.includes('dns')
      ) {
        throw new Error('Die Website konnte nicht erreicht werden. Bitte prüfe die URL und versuche es erneut.');
      }
      throw new Error('Fehler beim Erfassen der Website. Bitte versuchen Sie es erneut.');
    } else if (message) {
      throw new Error(message);
    }

    throw new Error('Fehler beim Erfassen der Website. Bitte versuchen Sie es erneut.');
  }
}

/**
 * Check whether a URL points to an internal recipeImportPage.
 * These pages embed structured JSON-LD data and can be parsed directly
 * without a Puppeteer screenshot or AI OCR step.
 *
 * @param {string} url - URL to test
 * @returns {boolean} True when the URL matches /recipeImportPage?token=…
 */
export function isRecipeImportPageUrl(url) {
  try {
    const urlObj = new URL(normalizeImportedUrl(url));
    return urlObj.pathname === '/recipeImportPage' && urlObj.searchParams.has('token');
  } catch {
    return false;
  }
}

/**
 * Check whether a URL points to an Instagram post, Reel, or IGTV.
 * Accepts both www.instagram.com and instagram.com, and the path patterns
 * /reel/…, /p/…, and /tv/….
 *
 * @param {string} url - URL to test
 * @returns {boolean}
 */
export function isInstagramUrl(url) {
  try {
    const urlObj = new URL(normalizeImportedUrl(url));
    return (
      (urlObj.hostname === 'www.instagram.com' || urlObj.hostname === 'instagram.com') &&
      /^\/(reel|p|tv)\/[A-Za-z0-9_-]+\/?$/.test(urlObj.pathname)
    );
  } catch {
    return false;
  }
}

// Backward-compatibility alias
export const isInstagramReelUrl = isInstagramUrl;

/**
 * Import a recipe from an Instagram Reel.
 * Calls the scrapeInstagramReel Cloud Function which uses Puppeteer to extract
 * the caption and visible page text, then processes it with Gemini AI to
 * produce structured recipe data.
 *
 * @param {string} url - Instagram Reel URL
 * @param {Function} [onProgress] - Optional progress callback (0–100)
 * @param {{jobId?: string, authorId?: string}} [jobMeta] - Background-import
 *   job to finalize server-side so it survives the tab being closed mid-import.
 * @returns {Promise<Object>} Structured recipe data
 */
export async function importInstagramReel(url, onProgress = null, jobMeta = null) {
  const normalizedUrl = normalizeImportedUrl(url);

  if (!isInstagramUrl(normalizedUrl)) {
    throw new Error('Ungültige Instagram-URL');
  }

  if (onProgress) onProgress(10);

  // Load configured cuisine types and meal categories
  let cuisineTypes;
  let mealCategories;
  try {
    const { getCustomLists } = await import('./customLists');
    const lists = await getCustomLists();
    cuisineTypes = lists.cuisineTypes;
    mealCategories = lists.mealCategories;
  } catch (e) {
    console.warn('Failed to load custom lists for Instagram Reel import:', e);
  }

  if (onProgress) onProgress(20);

  let progressInterval = null;
  try {
    const scrapeInstagramReel = httpsCallable(functions, 'scrapeInstagramReel');

    let simulatedProgress = 30;
    if (onProgress) {
      onProgress(30);
      progressInterval = setInterval(() => {
        simulatedProgress = Math.min(85, simulatedProgress + 1);
        onProgress(simulatedProgress);
      }, 600);
    }

    const result = await scrapeInstagramReel({
      url: normalizedUrl,
      language: 'de',
      cuisineTypes,
      mealCategories,
      jobId: jobMeta?.jobId,
      authorId: jobMeta?.authorId,
    });

    clearInterval(progressInterval);
    progressInterval = null;
    if (onProgress) onProgress(100);

    const recipeData = result.data;
    if (!recipeData) {
      throw new Error('Kein Ergebnis vom Instagram-Import-Service');
    }

    return {
      title: recipeData.title || '',
      ingredients: recipeData.ingredients || [],
      steps: recipeData.steps || [],
      servings: recipeData.servings || null,
      cookTime: recipeData.prepTime || recipeData.cookTime || null,
      difficulty: recipeData.difficulty || null,
      cuisine: recipeData.cuisine || null,
      category: recipeData.category || null,
      tags: recipeData.tags || [],
    };
  } catch (error) {
    clearInterval(progressInterval);
    progressInterval = null;
    if (onProgress) onProgress(0);

    const { code, message } = getCallableErrorDetails(error);
    if (code === 'unauthenticated') {
      throw new Error('Bitte melde dich an, um den Instagram-Import zu nutzen.');
    } else if (code === 'resource-exhausted') {
      throw new Error(message || 'Tageslimit erreicht. Versuche es morgen erneut.');
    } else if (code === 'not-found') {
      throw new Error(
        message ||
        'Kein Rezept auf der Instagram-Seite gefunden. Der Beitrag ist möglicherweise privat.',
      );
    } else if (code === 'invalid-argument') {
      throw new Error(message || 'Ungültige Instagram-URL.');
    } else if (code === 'deadline-exceeded') {
      throw new Error('Die Instagram-Seite hat zu lange gebraucht. Bitte versuche es erneut.');
    } else if (code === 'internal') {
      throw new Error('Instagram-Import fehlgeschlagen. Bitte versuche es erneut.');
    } else if (message) {
      throw new Error(message);
    }
    throw new Error('Instagram-Import fehlgeschlagen. Bitte versuche es erneut.');
  }
}

/**
 * Render text onto an HTML canvas and return a base64-encoded PNG data URL.
 * Used to convert plain recipe text into an image for AI processing.
 *
 * @param {string} text - Text to render
 * @returns {string} Base64-encoded PNG data URL
 */
export function textToCanvasBase64(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = Math.min(4000, Math.max(600, text.split('\n').length * 24 + 80));
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    // Canvas not supported in this environment
    return '';
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  ctx.font = '18px Arial, sans-serif';

  const lines = text.split('\n');
  let y = 40;
  for (const line of lines) {
    const words = line.split(' ');
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      if (ctx.measureText(testLine).width > 760 && currentLine) {
        ctx.fillText(currentLine, 20, y);
        y += 26;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      ctx.fillText(currentLine, 20, y);
      y += 26;
    }
  }

  return canvas.toDataURL('image/png');
}

/**
 * Extract plain text from raw HTML, removing scripts, styles and boilerplate.
 * Keeps the content under 80,000 characters so it stays within the Cloud Function limit.
 * @param {string} html - Raw HTML string
 * @returns {string} Cleaned plain text (max 80,000 chars)
 */
export function extractTextFromHtml(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    // Remove clearly non-content elements
    doc.querySelectorAll('script, style, svg, noscript, iframe, nav, header, footer, aside').forEach(el => el.remove());

    let text = (doc.body?.textContent || '').trim();

    // If still empty after removing non-content tags, use raw documentElement textContent
    if (!text) {
      text = (doc.documentElement?.textContent || '').trim();
    }

    // Collapse excessive whitespace and limit size
    return text.replace(/\s{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').slice(0, 80000);
  } catch {
    // If DOMParser fails, do a simple regex strip and truncate
    return html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 80000);
  }
}

/**
 * Fetch a recipeImportPage URL and parse the recipe data directly from its HTML.
 * Extracts the raw text from the embedded JSON-LD (or `<h1>`/`<pre>` as fallback),
 * then uses Gemini AI to produce fully structured recipe data.
 *
 * Returns an object that is compatible with the `aiResult` shape expected by
 * WebImportModal (title, ingredients, steps, servings, cookTime, difficulty,
 * cuisine, category).
 *
 * @param {string} url - A recipeImportPage URL (validated by isRecipeImportPageUrl)
 * @param {Function} [onProgress] - Optional progress callback (0–100)
 * @param {{jobId?: string, authorId?: string}} [jobMeta] - Background-import
 *   job to finalize server-side. Only honored on the raw-HTML branch below
 *   (processHtmlWithGemini); the JSON-LD/canvas-vision branch can still fall
 *   back to local text parsing on AI failure, so it isn't wired up as the
 *   job's authoritative final step.
 * @returns {Promise<Object>} Structured recipe data
 */
export async function parseRecipeImportPage(url, onProgress = null, jobMeta = null) {
  if (onProgress) onProgress(10);

  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error('Import-Seite konnte nicht geladen werden. Bitte prüfen Sie Ihre Verbindung.');
  }

  if (!response.ok) {
    if (response.status === 404) throw new Error('Import nicht gefunden. Möglicherweise wurde er bereits gelöscht.');
    if (response.status === 410) throw new Error('Import ist abgelaufen. Bitte erstellen Sie einen neuen Import.');
    throw new Error(`Fehler beim Laden der Import-Seite (HTTP ${response.status}).`);
  }

  if (onProgress) onProgress(30);

  const html = await response.text();

  // Parse the HTML in the browser
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Prefer JSON-LD as it is the most reliable source
  let title = '';
  let rawText = '';

  const jsonLdScript = doc.querySelector('script[type="application/ld+json"]');
  if (jsonLdScript) {
    try {
      const jsonLd = JSON.parse(jsonLdScript.textContent);
      title = jsonLd.name || '';
      rawText = jsonLd.description || '';
    } catch {
      // fall through to DOM fallback
    }
  }

  // DOM fallback
  if (!title) {
    title = doc.querySelector('h1')?.textContent?.trim() || '';
  }
  if (!rawText) {
    rawText = doc.querySelector('pre')?.textContent?.trim() || '';
  }

  // Detect raw HTML content (e.g. from Instagram or other non-recipe pages).
  // This happens when the share extension captures page HTML instead of recipe data.
  // Process it directly with Gemini AI using a dedicated HTML-cleaning prompt.
  if (/^\s*<!DOCTYPE\s+html/i.test(rawText) || /^\s*<html[\s>]/i.test(rawText)) {
    if (onProgress) onProgress(50);

    // Clean the HTML before sending to the Cloud Function to stay within its size limit
    const cleanedText = extractTextFromHtml(rawText);

    if (!cleanedText || !cleanedText.trim()) {
      throw new Error(
        'Die importierte Seite enthält keinen lesbaren Text. ' +
        'Bitte stelle sicher, dass die Seite ein Rezept enthält.',
      );
    }

    let aiResult;
    try {
      aiResult = await processHtmlWithGemini(cleanedText, 'de',
        onProgress ? (p) => onProgress(50 + Math.round(p * 0.5)) : null,
        jobMeta,
      );
    } catch (htmlAiError) {
      throw new Error(
        'Die importierte Seite konnte nicht als Rezept verarbeitet werden. ' +
        (htmlAiError.message || 'Bitte versuche es erneut.'),
      );
    }

    if (onProgress) onProgress(100);

    return {
      title: aiResult.title || title || '',
      ingredients: aiResult.ingredients || [],
      steps: aiResult.steps || [],
      servings: aiResult.servings || null,
      cookTime: aiResult.prepTime || aiResult.cookTime || null,
      difficulty: aiResult.difficulty || null,
      cuisine: aiResult.cuisine || null,
      category: aiResult.category || null,
      tags: aiResult.tags || [],
    };
  }

  if (onProgress) onProgress(50);

  // Render the raw text onto a canvas image and analyze with Gemini AI.
  // This produces properly structured ingredients, steps and metadata –
  // much more reliably than a keyword-based text parser.
  const imageBase64 = textToCanvasBase64(rawText);

  let aiResult;
  try {
    aiResult = await recognizeRecipeWithAI(imageBase64, {
      language: 'de',
      provider: 'gemini',
      onProgress: onProgress ? (p) => onProgress(50 + Math.round(p * 0.5)) : null,
    });
  } catch (aiError) {
    // When AI processing fails, fall back to keyword-based text parsing so that
    // the import does not fail completely for well-structured recipe texts.
    if (rawText) {
      try {
        const parsed = parseOcrText(rawText, 'de');
        aiResult = {
          title: parsed.title || '',
          ingredients: parsed.ingredients || [],
          steps: parsed.steps || [],
          servings: parsed.portionen || null,
          cookTime: parsed.kochdauer ? `${parsed.kochdauer} min` : null,
          difficulty: parsed.schwierigkeit || null,
          cuisine: Array.isArray(parsed.kulinarik) && parsed.kulinarik.length ? parsed.kulinarik[0] : null,
          category: parsed.speisekategorie || null,
          tags: [],
        };
      } catch {
        // If text parsing also fails, re-throw the original AI error
        throw aiError;
      }
    } else {
      throw aiError;
    }
  }

  if (onProgress) onProgress(100);

  // Prefer the title extracted from JSON-LD/h1 if AI did not detect one
  const resultTitle = aiResult.title || title || '';

  return {
    title: resultTitle,
    ingredients: aiResult.ingredients || [],
    steps: aiResult.steps || [],
    servings: aiResult.servings || null,
    cookTime: aiResult.prepTime || aiResult.cookTime || null,
    difficulty: aiResult.difficulty || null,
    cuisine: aiResult.cuisine || null,
    category: aiResult.category || null,
    tags: aiResult.tags || [],
  };
}

/**
 * Parse a Schema.org Recipe from any JSON-LD blocks found in an HTML string.
 * Supports `recipeInstructions` as an array of strings or HowToStep objects.
 * Supports ISO 8601 duration strings (e.g. "PT30M") for time fields.
 *
 * @param {string} html - Raw HTML string
 * @returns {Object|null} Structured recipe data, or null if no Recipe JSON-LD found
 */
export function parseJsonLdRecipe(html) {
  let doc;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(html, 'text/html');
  } catch {
    return null;
  }

  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    let json;
    try {
      json = JSON.parse(script.textContent);
    } catch {
      continue;
    }

    // Support both a single object and @graph arrays
    const candidates = [];
    if (Array.isArray(json)) {
      candidates.push(...json);
    } else if (json['@graph'] && Array.isArray(json['@graph'])) {
      candidates.push(...json['@graph']);
    } else {
      candidates.push(json);
    }

    for (const candidate of candidates) {
      const type = candidate['@type'];
      const isRecipe =
        type === 'Recipe' ||
        (Array.isArray(type) && type.includes('Recipe'));
      if (!isRecipe) continue;

      // Parse ISO 8601 duration like "PT30M" or "PT1H30M" → minutes
      const parseDuration = (str) => {
        if (!str) return null;
        const match = String(str).match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
        if (!match) return null;
        const hours = parseInt(match[1] || '0', 10);
        const minutes = parseInt(match[2] || '0', 10);
        return hours * 60 + minutes || null;
      };

      // Extract ingredients
      const ingredients = Array.isArray(candidate.recipeIngredient)
        ? candidate.recipeIngredient.filter(Boolean).map(String)
        : [];

      // Extract steps – can be strings or HowToStep objects
      let steps = [];
      if (Array.isArray(candidate.recipeInstructions)) {
        steps = candidate.recipeInstructions.flatMap((item) => {
          if (typeof item === 'string') return [item];
          if (item['@type'] === 'HowToStep' && item.text) return [String(item.text)];
          if (item['@type'] === 'HowToSection' && Array.isArray(item.itemListElement)) {
            return item.itemListElement
              .map((s) => (s['@type'] === 'HowToStep' ? String(s.text || '') : ''))
              .filter(Boolean);
          }
          return item.text ? [String(item.text)] : [];
        });
      }

      // Nothing useful extracted – skip this candidate
      if (!ingredients.length && !steps.length) continue;

      // Servings – can be a number or a string like "4 Portionen"
      let servings = null;
      if (candidate.recipeYield) {
        const yieldVal = Array.isArray(candidate.recipeYield)
          ? candidate.recipeYield[0]
          : candidate.recipeYield;
        const numMatch = String(yieldVal).match(/\d+/);
        servings = numMatch ? parseInt(numMatch[0], 10) : null;
      }

      const prepMinutes = parseDuration(candidate.prepTime);
      // cookTime is preferred; fall back to totalTime (may include prepTime) if cookTime is absent
      const cookMinutes = parseDuration(candidate.cookTime) || parseDuration(candidate.totalTime);

      return {
        title: candidate.name || '',
        ingredients,
        steps,
        servings,
        prepTime: prepMinutes ? `${prepMinutes} min` : null,
        cookTime: cookMinutes ? `${cookMinutes} min` : null,
        difficulty: null,
        cuisine: Array.isArray(candidate.recipeCuisine)
          ? candidate.recipeCuisine[0] || null
          : candidate.recipeCuisine || null,
        category: Array.isArray(candidate.recipeCategory)
          ? candidate.recipeCategory[0] || null
          : candidate.recipeCategory || null,
        tags: [],
      };
    }
  }
  return null;
}

/**
 * Find and return the first raw Schema.org Recipe JSON-LD candidate object from an HTML string.
 * Unlike parseJsonLdRecipe, this returns the unprocessed JSON-LD object so that
 * all original fields (including description, ISO 8601 durations, etc.) are preserved.
 *
 * @param {string} html - Raw HTML string
 * @returns {Object|null} The first matching Recipe JSON-LD object, or null if not found
 */
function findJsonLdRecipeCandidate(html) {
  let doc;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(html, 'text/html');
  } catch {
    return null;
  }

  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    let json;
    try {
      json = JSON.parse(script.textContent);
    } catch {
      continue;
    }

    const candidates = [];
    if (Array.isArray(json)) {
      candidates.push(...json);
    } else if (json['@graph'] && Array.isArray(json['@graph'])) {
      candidates.push(...json['@graph']);
    } else {
      candidates.push(json);
    }

    for (const candidate of candidates) {
      const type = candidate['@type'];
      const isRecipe =
        type === 'Recipe' ||
        (Array.isArray(type) && type.includes('Recipe'));
      if (!isRecipe) continue;

      // Only return candidates that have at least ingredients or instructions
      const hasIngredients = Array.isArray(candidate.recipeIngredient) && candidate.recipeIngredient.length > 0;
      const hasInstructions = Array.isArray(candidate.recipeInstructions) && candidate.recipeInstructions.length > 0;
      if (!hasIngredients && !hasInstructions) continue;

      return candidate;
    }
  }
  return null;
}

/**
 * Convert a raw Schema.org Recipe JSON-LD object to a human-readable text representation.
 * This text is then suitable for processing by the Gemini Text API so that all
 * AI-prompt formatting rules (unit standardisation, fraction→decimal conversion,
 * cuisine/category selection, vegetarian/vegan tagging, etc.) are applied.
 *
 * Handles recipeInstructions as an array of strings, HowToStep objects, or
 * HowToSection objects with nested itemListElement.
 *
 * @param {Object} candidate - Raw Schema.org Recipe JSON-LD object
 * @returns {string} Human-readable recipe text
 */
export function jsonLdToText(candidate) {
  let text = '';
  text += `Rezept: ${candidate.name || ''}\n\n`;

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
    } else if (step['@type'] === 'HowToSection' && Array.isArray(step.itemListElement)) {
      for (const s of step.itemListElement) {
        const sText = s['@type'] === 'HowToStep' ? (s.text || s.name || '') : '';
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
 * Import a recipe from any regular URL by delegating the full pipeline to the
 * `importRecipeCallable` Cloud Function (HTML fetch → JSON-LD → text → screenshot).
 * All processing happens server-side, eliminating browser CORS issues.
 *
 * @param {string} url - The recipe URL to import
 * @param {Function} [onProgress] - Optional progress callback (0–100)
 * @param {{jobId?: string, authorId?: string}} [jobMeta] - Background-import
 *   job to finalize server-side so it survives the tab being closed mid-import.
 * @returns {Promise<Object>} Structured recipe data
 */
export async function importRecipeFromUrl(url, onProgress = null, jobMeta = null) {
  const normalizedUrl = normalizeImportedUrl(url);

  if (onProgress) onProgress(10);

  // Load configured cuisine/category lists for the AI prompt
  let cuisineTypes;
  let mealCategories;
  try {
    const { getCustomLists } = await import('./customLists');
    const lists = await getCustomLists();
    cuisineTypes = lists.cuisineTypes;
    mealCategories = lists.mealCategories;
  } catch (e) {
    console.warn('Failed to load custom lists for web import:', e);
  }

  if (onProgress) onProgress(20);

  const importRecipe = httpsCallable(functions, 'importRecipeCallable');

  let simulatedProgress = 25;
  let progressInterval = null;
  if (onProgress) {
    onProgress(25);
    progressInterval = setInterval(() => {
      simulatedProgress = Math.min(85, simulatedProgress + 1);
      onProgress(simulatedProgress);
    }, 500);
  }

  try {
    const result = await importRecipe({
      url: normalizedUrl,
      cuisineTypes,
      mealCategories,
      jobId: jobMeta?.jobId,
      authorId: jobMeta?.authorId,
    });

    clearInterval(progressInterval);
    progressInterval = null;
    if (onProgress) onProgress(100);

    const data = result.data;
    return {
      title: data.title || '',
      ingredients: data.ingredients || [],
      steps: data.steps || [],
      servings: data.servings || null,
      cookTime: data.prepTime || data.cookTime || null,
      difficulty: data.difficulty || null,
      cuisine: data.cuisine || null,
      category: data.category || null,
      tags: data.tags || [],
    };
  } catch (error) {
    clearInterval(progressInterval);
    if (onProgress) onProgress(0);

    const { code, message, lowerMessage } = getCallableErrorDetails(error);

    if (code === 'unauthenticated') {
      throw new Error('Sie müssen angemeldet sein, um den Webimport zu verwenden.');
    } else if (code === 'resource-exhausted') {
      throw new Error(message || 'Tageslimit erreicht. Versuche es morgen erneut.');
    } else if (code === 'invalid-argument') {
      throw new Error(message || 'Ungültige URL angegeben.');
    } else if (code === 'failed-precondition') {
      throw new Error('Webimport-Service nicht konfiguriert. Bitte kontaktieren Sie den Administrator.');
    } else if (code === 'deadline-exceeded') {
      throw new Error('Zeitüberschreitung beim Laden der Website. Bitte versuchen Sie es erneut.');
    } else if (code === 'internal') {
      if (
        lowerMessage.includes('name_not_resolved') ||
        lowerMessage.includes('enotfound') ||
        lowerMessage.includes('dns')
      ) {
        throw new Error('Die Website konnte nicht erreicht werden. Bitte prüfe die URL und versuche es erneut.');
      }
      throw new Error('Fehler beim Importieren des Rezepts. Bitte versuchen Sie es erneut.');
    } else if (message) {
      throw new Error(message);
    }

    throw new Error('Fehler beim Importieren des Rezepts. Bitte versuchen Sie es erneut.');
  }
}

/**
 * Check if a recipe from this URL already exists
 * (Optional feature for duplicate detection)
 * @param {string} url - The URL to check
 * @param {Array} recipes - Array of existing recipes
 * @returns {Array} Array of matching recipes
 */
export function findRecipesByUrl(url, recipes) {
  if (!url || !recipes || !Array.isArray(recipes)) {
    return [];
  }

  // Normalize URL for comparison (remove trailing slashes, query params, etc.)
  const normalizeUrl = (urlString) => {
    try {
      const urlObj = new URL(urlString);
      // Use origin + pathname, ignore search params and hash
      return `${urlObj.origin}${urlObj.pathname}`.replace(/\/$/, '');
    } catch {
      return urlString;
    }
  };

  const normalizedUrl = normalizeUrl(url);

  return recipes.filter(recipe => {
    // Check if recipe has a sourceUrl field
    if (recipe.sourceUrl) {
      return normalizeUrl(recipe.sourceUrl) === normalizedUrl;
    }
    return false;
  });
}
