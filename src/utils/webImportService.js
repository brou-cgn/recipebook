/**
 * Web Import Service
 * Provides functionality to capture screenshots from URLs and process them
 * Uses Firebase Cloud Functions for secure server-side screenshot capture
 */

import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { parseOcrTextSmart } from './ocrParser';

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
 * Fetch a recipeImportPage URL and parse the recipe data directly from its HTML.
 * Extracts title and raw text from the embedded JSON-LD (or `<h1>`/`<pre>`
 * as fallback), then uses the local OCR parser to produce structured data.
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

  if (onProgress) onProgress(40);

  const html = await response.text();

  if (onProgress) onProgress(60);

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

  if (onProgress) onProgress(80);

  // Parse raw text into structured recipe using the existing OCR parser
  const { recipe } = parseOcrTextSmart(rawText, 'de');

  // Use the title from JSON-LD/h1 when the parser could not detect one
  if (title && (!recipe.title || recipe.title === 'OCR-Rezept')) {
    recipe.title = title;
  }

  if (onProgress) onProgress(100);

  // Helper: return first array element, non-empty string, or null
  const firstOrNull = (value) => {
    if (Array.isArray(value)) return value.length > 0 ? value[0] : null;
    if (typeof value === 'string') return value || null;
    return null;
  };

  // Convert to the aiResult format expected by WebImportModal
  return {
    title: recipe.title || title || '',
    ingredients: recipe.ingredients || [],
    steps: recipe.steps || [],
    servings: recipe.portionen || null,
    cookTime: recipe.kochdauer ? `${recipe.kochdauer} min` : null,
    difficulty: recipe.schwierigkeit || null,
    cuisine: firstOrNull(recipe.kulinarik),
    category: firstOrNull(recipe.speisekategorie),
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
