/**
 * AI-Enhanced OCR Service
 * Extends the existing OCR service with AI-powered recipe recognition
 * Now uses Firebase Cloud Functions as a secure proxy for API calls
 */

import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { getAIRecipePrompt, getCustomLists } from './customLists';

/**
 * Configuration for AI OCR providers
 * 
 * Note: With Cloud Functions, the API key is stored securely server-side.
 * The frontend no longer needs REACT_APP_GEMINI_API_KEY.
 */

/**
 * Retry configuration for transient errors
 */
const MAX_RETRIES = 3;
const RETRY_DELAYS = process.env.NODE_ENV === 'test' ? [0, 0, 0] : [1000, 2000, 4000];
const RETRYABLE_CODES = ['unavailable', 'deadline-exceeded'];

/**
 * Sleep helper for retry delays
 * @param {number} ms - Milliseconds to wait
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get configuration for AI OCR providers
 * Reads from environment variables dynamically
 */
function getAiOcrConfig() {
  return {
    gemini: {
      apiKey: process.env.REACT_APP_GEMINI_API_KEY || '',
      model: 'gemini-1.5-flash', // Free tier model
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    },
    // Future providers can be added here
    openai: {
      apiKey: process.env.REACT_APP_OPENAI_API_KEY || '',
      model: 'gpt-4o',
      endpoint: 'https://api.openai.com/v1/chat/completions',
    }
  };
}

/**
 * Check if AI OCR is available and configured
 * @param {string} provider - The AI provider to check ('gemini' or 'openai')
 * @returns {boolean} True if the provider is configured
 */
export function isAiOcrAvailable(provider = 'gemini') {
  // With Cloud Functions, AI OCR is always available if the user is authenticated
  // The API key is stored server-side, so we can't check it from the frontend
  // For now, we assume it's always available for 'gemini' provider
  return provider === 'gemini';
}

/**
 * Get the recipe extraction prompt in the specified language
 * Loads from Firestore settings, falls back to default prompt
 * @param {string} lang - Language code ('de' or 'en')
 * @returns {Promise<string>} The formatted prompt
 */
async function getRecipeExtractionPrompt(lang = 'de') {
  // Load prompt from Settings
  const prompt = await getAIRecipePrompt();

  // For future multi-language support
  if (lang === 'de') {
    return prompt;
  }

  // Fallback for other languages (not yet implemented)
  return prompt;
}

/**
 * Recognize recipe using Google Gemini Vision API via Cloud Function
 * @param {string} imageBase64 - Base64 encoded image (with or without data URL prefix)
 * @param {string} lang - Language code ('de' or 'en')
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<Object>} Structured recipe data
 */
export async function recognizeRecipeWithGemini(imageBase64, lang = 'de', onProgress = null) {
  if (onProgress) onProgress(10);

  // Validate image data
  if (!imageBase64 || imageBase64.length < 100) {
    throw new Error('Invalid image data');
  }

  if (onProgress) onProgress(20);

  // Load configured cuisine types and meal categories to pass to the Cloud Function
  let cuisineTypes;
  let mealCategories;
  try {
    const lists = await getCustomLists();
    cuisineTypes = lists.cuisineTypes;
    mealCategories = lists.mealCategories;
  } catch (e) {
    // Fallback: omit lists so the Cloud Function uses the base prompt unchanged
    console.warn('Failed to load custom lists for AI prompt, using base prompt:', e);
  }

  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        // Wait before retry with exponential backoff
        await sleep(RETRY_DELAYS[attempt - 1]);
        if (onProgress) onProgress(20 + attempt * 5);
      }

      // Call the Cloud Function
      const scanRecipeWithAI = httpsCallable(functions, 'scanRecipeWithAI');

      if (onProgress) onProgress(30);

      const result = await scanRecipeWithAI({
        imageBase64: imageBase64,
        language: lang,
        cuisineTypes,
        mealCategories,
      });

      if (onProgress) onProgress(90);

      const recipeData = result.data;

      if (!recipeData) {
        throw new Error('No response from AI service');
      }

      if (onProgress) onProgress(100);

      return recipeData;

    } catch (error) {
      lastError = error;
      console.error(`AI OCR attempt ${attempt + 1} failed:`, error);

      // Only retry on transient errors
      const errorCode = error.code;
      if (attempt < MAX_RETRIES && RETRYABLE_CODES.includes(errorCode)) {
        continue;
      }

      // Non-retryable error or max retries reached - translate to user-friendly message
      break;
    }
  }

  // Handle error after all retries exhausted
  if (onProgress) onProgress(0);

  const error = lastError;
  const errorCode = error.code;

  if (errorCode === 'unauthenticated') {
    throw new Error('Bitte melde dich an, um AI-Scan zu nutzen. You must be logged in to use AI recipe scanning.');
  } else if (errorCode === 'resource-exhausted') {
    throw new Error(error.message || 'Tageslimit erreicht. Versuche es morgen erneut oder nutze Standard-OCR.');
  } else if (errorCode === 'invalid-argument') {
    throw new Error(error.message || 'Ungültiges Bild. Bitte verwende JPEG, PNG oder WebP unter 5MB.');
  } else if (errorCode === 'failed-precondition') {
    throw new Error('AI-Service nicht konfiguriert. Bitte kontaktiere den Administrator.');
  } else if (errorCode === 'unavailable') {
    throw new Error('Netzwerkfehler. Bitte überprüfe deine Internetverbindung.');
  } else if (errorCode === 'deadline-exceeded') {
    throw new Error('Zeitüberschreitung. Bitte versuche es erneut.');
  } else if (error.message) {
    throw new Error(error.message);
  }

  throw new Error('KI-Bildverarbeitung fehlgeschlagen. Bitte versuche es erneut.');
}

/**
 * Recognize recipe using OpenAI GPT-4o Vision (future implementation)
 * @param {string} imageBase64 - Base64 encoded image
 * @param {string} lang - Language code ('de' or 'en')
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<Object>} Structured recipe data
 */
export async function recognizeRecipeWithOpenAI(imageBase64, lang = 'de', onProgress = null) {
  // This is a placeholder for future implementation
  throw new Error('OpenAI Vision integration not yet implemented. Use Gemini instead.');
  
  // Future implementation would follow similar pattern:
  /*
  const config = AI_OCR_CONFIG.openai;
  
  if (!config.apiKey) {
    throw new Error('OpenAI API key not configured.');
  }

  const prompt = getRecipeExtractionPrompt(lang);
  
  // OpenAI API call implementation
  // ...
  */
}

/**
 * Main function: Recognize recipe with AI
 * Automatically selects the best available provider
 * 
 * @param {string} imageBase64 - Base64 encoded image
 * @param {Object} options - Recognition options
 * @param {string} options.language - Language code ('de' or 'en')
 * @param {string} options.provider - Preferred provider ('gemini' or 'openai')
 * @param {Function} options.onProgress - Progress callback (0-100)
 * @returns {Promise<Object>} Structured recipe data
 */
export async function recognizeRecipeWithAI(imageBase64, options = {}) {
  const {
    language = 'de',
    provider = 'gemini',
    onProgress = null
  } = options;

  // Validate image data
  if (!imageBase64 || imageBase64.length < 100) {
    throw new Error('Invalid image data');
  }

  // Select provider
  let selectedProvider = provider;
  
  // If requested provider is not available, fall back to available one
  if (!isAiOcrAvailable(selectedProvider)) {
    if (isAiOcrAvailable('gemini')) {
      selectedProvider = 'gemini';
    } else if (isAiOcrAvailable('openai')) {
      selectedProvider = 'openai';
    } else {
      throw new Error('No AI OCR provider is configured. Please add API keys to .env.local');
    }
  }

  // Call the appropriate provider
  switch (selectedProvider) {
    case 'gemini':
      return await recognizeRecipeWithGemini(imageBase64, language, onProgress);
    case 'openai':
      return await recognizeRecipeWithOpenAI(imageBase64, language, onProgress);
    default:
      throw new Error(`Unsupported AI provider: ${selectedProvider}`);
  }
}

/**
 * Get information about available AI OCR providers
 * @returns {Object} Information about each provider
 */
export function getAiOcrProviders() {
  return {
    gemini: {
      name: 'Google Gemini Vision',
      available: isAiOcrAvailable('gemini'),
      model: 'gemini-1.5-flash',
      features: [
        'Strukturierte Rezept-Extraktion',
        'Automatische Kulinarik-Erkennung',
        'Kategorie- und Tag-Erkennung',
        'Handschrift-Unterstützung',
        'Mehrsprachig'
      ],
      freeTier: 'Serverbasiert (Rate Limits: 20/Tag für User, 5/Tag für Gäste)',
      privacy: 'Bilder werden sicher über Firebase Cloud Functions an Google gesendet',
      speed: 'Schnell (2-5 Sekunden)'
    },
    openai: {
      name: 'OpenAI GPT-4o Vision',
      available: false, // Not yet implemented with Cloud Functions
      model: 'gpt-4o',
      features: [
        'Höchste OCR-Qualität',
        'Strukturierte JSON-Ausgabe',
        'Sehr gutes semantisches Verständnis',
        'Handschrift-Unterstützung',
        'Mehrsprachig'
      ],
      freeTier: 'Nicht verfügbar',
      privacy: 'Noch nicht implementiert',
      speed: 'Schnell (2-5 Sekunden)'
    }
  };
}

/**
 * Compare standard OCR (Tesseract) with AI OCR
 * Useful for A/B testing and quality metrics
 * 
 * @param {string} imageBase64 - Base64 encoded image
 * @param {string} language - Language code
 * @returns {Promise<Object>} Comparison results
 */
export async function compareOcrMethods(imageBase64, language = 'de') {
  const results = {
    timestamp: new Date().toISOString(),
    image: imageBase64.substring(0, 100) + '...', // Truncated for logging
  };

  try {
    // Import standard OCR service
    const { recognizeTextAuto } = await import('./ocrService');
    
    // Run standard OCR
    const startTesseract = performance.now();
    const tesseractResult = await recognizeTextAuto(imageBase64);
    const tesseractTime = performance.now() - startTesseract;
    
    results.tesseract = {
      text: tesseractResult.text,
      confidence: tesseractResult.confidence,
      language: tesseractResult.detectedLanguage,
      processingTime: Math.round(tesseractTime),
      structured: false
    };
  } catch (error) {
    results.tesseract = {
      error: error.message
    };
  }

  try {
    // Run AI OCR
    const startAI = performance.now();
    const aiResult = await recognizeRecipeWithAI(imageBase64, { language });
    const aiTime = performance.now() - startAI;
    
    results.ai = {
      provider: aiResult.provider,
      structured: true,
      recipeData: aiResult,
      processingTime: Math.round(aiTime),
      confidence: aiResult.confidence
    };
  } catch (error) {
    results.ai = {
      error: error.message
    };
  }

  return results;
}

// Export configuration for testing purposes
export const __testing__ = {
  getAiOcrConfig,
  getRecipeExtractionPrompt
};
