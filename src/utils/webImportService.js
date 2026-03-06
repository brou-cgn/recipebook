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
    doc.querySelectorAll('script, style, svg, noscript, iframe').forEach(el => el.remove());

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
