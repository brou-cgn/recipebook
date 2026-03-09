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
 * Capture a screenshot of a website
 * @param {string} url - The URL to capture
 * @param {Function} onProgress - Optional progress callback (0-100)
 * @returns {Promise<string>} Base64 encoded screenshot
 */
export async function captureWebsiteScreenshot(url, onProgress = null) {
  // Validate URL
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid URL provided');
  }

  try {
    new URL(url); // This will throw if URL is invalid
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
      url: url,
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
    
    // Enhance error messages based on Firebase error codes
    if (error.code === 'unauthenticated') {
      throw new Error('Sie müssen angemeldet sein, um den Webimport zu verwenden.');
    } else if (error.code === 'resource-exhausted') {
      throw new Error(error.message || 'Rate-Limit erreicht. Bitte versuchen Sie es später erneut.');
    } else if (error.code === 'invalid-argument') {
      throw new Error(error.message || 'Ungültige URL angegeben.');
    } else if (error.code === 'failed-precondition') {
      throw new Error('Webimport-Service nicht konfiguriert. Bitte kontaktieren Sie den Administrator.');
    } else if (error.code === 'deadline-exceeded') {
      throw new Error('Zeitüberschreitung beim Laden der Website. Bitte versuchen Sie es erneut.');
    } else if (error.message) {
      throw new Error(error.message);
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
    const urlObj = new URL(url);
    return urlObj.pathname === '/recipeImportPage' && urlObj.searchParams.has('token');
  } catch {
    return false;
  }
}

/**
 * Check whether a URL points to an Instagram Reel.
 * Accepts both www.instagram.com/reel/… and instagram.com/reel/…
 *
 * @param {string} url - URL to test
 * @returns {boolean}
 */
export function isInstagramReelUrl(url) {
  try {
    const urlObj = new URL(url);
    return (
      (urlObj.hostname === 'www.instagram.com' || urlObj.hostname === 'instagram.com') &&
      /^\/reel\/[A-Za-z0-9_-]+\/?$/.test(urlObj.pathname)
    );
  } catch {
    return false;
  }
}

/**
 * Import a recipe from an Instagram Reel.
 * Calls the scrapeInstagramReel Cloud Function which uses Puppeteer to extract
 * the caption and visible page text, then processes it with Gemini AI to
 * produce structured recipe data.
 *
 * @param {string} url - Instagram Reel URL
 * @param {Function} [onProgress] - Optional progress callback (0–100)
 * @returns {Promise<Object>} Structured recipe data
 */
export async function importInstagramReel(url, onProgress = null) {
  if (!isInstagramReelUrl(url)) {
    throw new Error('Ungültige Instagram-Reel-URL');
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
      url,
      language: 'de',
      cuisineTypes,
      mealCategories,
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

    const errorCode = error.code;
    if (errorCode === 'unauthenticated') {
      throw new Error('Bitte melde dich an, um den Instagram-Import zu nutzen.');
    } else if (errorCode === 'resource-exhausted') {
      throw new Error(error.message || 'Tageslimit erreicht. Versuche es morgen erneut.');
    } else if (errorCode === 'not-found') {
      throw new Error(
        error.message ||
        'Kein Rezept auf der Instagram-Seite gefunden. Das Reel ist möglicherweise privat.',
      );
    } else if (errorCode === 'invalid-argument') {
      throw new Error(error.message || 'Ungültige Instagram-Reel-URL.');
    } else if (errorCode === 'deadline-exceeded') {
      throw new Error('Die Instagram-Seite hat zu lange gebraucht. Bitte versuche es erneut.');
    } else if (error.message) {
      throw new Error(error.message);
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
 * @returns {Promise<Object>} Structured recipe data
 */
export async function parseRecipeImportPage(url, onProgress = null) {
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
 * Fetch the raw HTML of a URL via the `fetchRecipeHtml` Cloud Function.
 * This bypasses CORS restrictions by performing the request server-side.
 *
 * @param {string} url - URL to fetch
 * @returns {Promise<string>} Raw HTML content
 */
async function fetchRecipeHtml(url) {
  const fetchHtml = httpsCallable(functions, 'fetchRecipeHtml');
  const result = await fetchHtml({ url });
  return result.data.html;
}

/**
 * Import a recipe from any regular URL using a multi-step fallback chain:
 *
 *  1. Fetch page HTML and parse Schema.org Recipe JSON-LD → direct mapping, no AI
 *  2. If no JSON-LD → extract plain text and send to Gemini Text API
 *  3. If both fail → capture screenshot and run Gemini Vision API (existing flow)
 *
 * @param {string} url - The recipe URL to import
 * @param {Function} [onProgress] - Optional progress callback (0–100)
 * @returns {Promise<Object>} Structured recipe data
 */
export async function importRecipeFromUrl(url, onProgress = null) {
  if (onProgress) onProgress(10);

  // ── Step 1 & 2: Try to fetch HTML and parse structured data ───────────────
  let html = null;
  try {
    if (onProgress) onProgress(15);
    html = await fetchRecipeHtml(url);
  } catch (fetchErr) {
    console.warn('fetchRecipeHtml failed, falling back to screenshot:', fetchErr.message);
  }

  if (html) {
    // Step 1: JSON-LD
    if (onProgress) onProgress(30);
    try {
      const jsonLdResult = parseJsonLdRecipe(html);
      if (jsonLdResult) {
        if (onProgress) onProgress(100);
        return jsonLdResult;
      }
    } catch (jsonLdErr) {
      console.warn('JSON-LD parsing error:', jsonLdErr.message);
    }

    // Step 2: Text + Gemini Text API
    if (onProgress) onProgress(40);
    try {
      const cleanedText = extractTextFromHtml(html);
      if (cleanedText && cleanedText.trim()) {
        const aiResult = await processHtmlWithGemini(
          cleanedText,
          'de',
          onProgress ? (p) => onProgress(40 + Math.round(p * 0.55)) : null,
        );
        if (onProgress) onProgress(100);
        return {
          title: aiResult.title || '',
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
    } catch (textAiErr) {
      console.warn('Text+Gemini failed, falling back to screenshot:', textAiErr.message);
    }
  }

  // ── Step 3: Screenshot + Vision API fallback ─────────────────────────────
  if (onProgress) onProgress(70);
  const screenshotBase64 = await captureWebsiteScreenshot(url, (prog) => {
    if (onProgress) onProgress(70 + Math.round(prog * 0.3));
  });
  return await recognizeRecipeWithAI(screenshotBase64, {
    language: 'de',
    provider: 'gemini',
    onProgress: onProgress ? (p) => onProgress(70 + Math.round(p * 0.3)) : null,
  });
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
