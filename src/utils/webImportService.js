/**
 * Web Import Service
 * Provides functionality to capture screenshots from URLs and process them
 * Uses Firebase Cloud Functions for secure server-side screenshot capture
 */

import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';

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
