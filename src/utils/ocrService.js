/**
 * OCR Service
 * Provides client-side Optical Character Recognition using Tesseract.js
 * Supports German (deu) and English (eng) languages
 * Works offline in PWA mode after initial language data load
 */

import { createWorker } from 'tesseract.js';

// Global worker instance
let worker = null;
let currentLang = null;

/**
 * Initialize OCR worker for specified language
 * @param {string} lang - Language code ('deu' for German, 'eng' for English)
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Promise<void>}
 */
export async function initOcrWorker(lang = 'eng', progressCallback = null) {
  // Validate language parameter
  const validLanguages = ['deu', 'eng'];
  if (!validLanguages.includes(lang)) {
    throw new Error(`Invalid language: ${lang}. Supported languages: ${validLanguages.join(', ')}`);
  }

  // If worker exists with same language and no new callback, reuse it
  if (worker && currentLang === lang && !progressCallback) {
    return;
  }

  // Terminate existing worker if language changed
  if (worker && currentLang !== lang) {
    await terminateWorker();
  }

  // Create logger function if progress callback provided
  const logger = progressCallback ? (m) => {
    // Tesseract.js logger messages have status and progress properties
    if (m.status === 'recognizing text' && typeof m.progress === 'number') {
      const percentage = Math.round(m.progress * 100);
      progressCallback(percentage);
    }
  } : undefined;

  // Create new worker with logger (or reuse if no logger and same language)
  if (!worker || logger) {
    if (worker) {
      await terminateWorker();
    }
    worker = await createWorker(lang, 1, logger ? { logger } : {});
    currentLang = lang;
  }
}

/**
 * Recognize text from base64 image
 * @param {string} imageBase64 - Base64 encoded image (data URL or base64 string)
 * @param {string} lang - Language code ('deu' for German, 'eng' for English)
 * @param {Function} onProgress - Optional progress callback (receives progress 0-100)
 * @returns {Promise<Object>} - Recognition result with text and confidence
 */
export async function recognizeText(imageBase64, lang = 'eng', onProgress = null) {
  // Validate input
  if (!imageBase64) {
    throw new Error('No image provided for OCR');
  }

  // Validate image format
  if (typeof imageBase64 !== 'string') {
    throw new Error('Image must be a base64 string');
  }

  // Initialize worker with the progress callback
  await initOcrWorker(lang, onProgress);

  // Preprocess image before OCR
  const preprocessedImage = await preprocessImage(imageBase64);

  try {
    // Perform OCR
    const result = await worker.recognize(preprocessedImage);
    
    return {
      text: result.data.text,
      confidence: result.data.confidence,
      words: result.data.words,
      lines: result.data.lines,
      paragraphs: result.data.paragraphs
    };
  } catch (error) {
    throw new Error(`OCR recognition failed: ${error.message}`);
  }
}

/**
 * Preprocess image to improve OCR accuracy
 * Applies grayscale conversion and contrast enhancement
 * @param {string} imageBase64 - Base64 encoded image
 * @returns {Promise<string>} - Preprocessed base64 image
 */
export async function preprocessImage(imageBase64) {
  return new Promise((resolve, reject) => {
    try {
      // Create image element
      const img = new Image();
      
      img.onload = () => {
        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set canvas size to image size
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Draw image on canvas
        ctx.drawImage(img, 0, 0);
        
        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Apply grayscale and contrast enhancement
        for (let i = 0; i < data.length; i += 4) {
          // Convert to grayscale using luminosity method
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          
          // Apply contrast enhancement (simple threshold)
          // This makes text darker and background lighter
          const enhanced = gray < 128 ? gray * 0.5 : gray * 1.2;
          const finalValue = Math.min(255, Math.max(0, enhanced));
          
          data[i] = finalValue;     // Red
          data[i + 1] = finalValue; // Green
          data[i + 2] = finalValue; // Blue
          // Alpha channel (data[i + 3]) remains unchanged
        }
        
        // Put processed data back to canvas
        ctx.putImageData(imageData, 0, 0);
        
        // Convert canvas to base64
        const processedBase64 = canvas.toDataURL('image/png');
        resolve(processedBase64);
      };
      
      img.onerror = (error) => {
        reject(new Error(`Failed to load image for preprocessing: ${error}`));
      };
      
      // Load image
      img.src = imageBase64;
    } catch (error) {
      reject(new Error(`Image preprocessing failed: ${error.message}`));
    }
  });
}

/**
 * Terminate OCR worker and free resources
 * @returns {Promise<void>}
 */
export async function terminateWorker() {
  if (worker) {
    await worker.terminate();
    worker = null;
    currentLang = null;
  }
}

/**
 * Get current worker status
 * @returns {Object} - Status object with worker state and language
 */
export function getWorkerStatus() {
  return {
    isInitialized: worker !== null,
    currentLanguage: currentLang
  };
}

/**
 * Recognize text with automatic language detection
 * Tries English first, then German if confidence is low
 * @param {string} imageBase64 - Base64 encoded image
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<Object>} - Recognition result with detected language
 */
export async function recognizeTextAuto(imageBase64, onProgress = null) {
  // Try English first
  const engResult = await recognizeText(imageBase64, 'eng', (progress) => {
    if (onProgress) onProgress(progress / 2); // First half of progress (0-50)
  });

  // If confidence is low, try German
  if (engResult.confidence < 70) {
    const deuResult = await recognizeText(imageBase64, 'deu', (progress) => {
      if (onProgress) onProgress(50 + progress / 2); // Second half of progress (50-100)
    });

    // Return result with higher confidence
    if (deuResult.confidence > engResult.confidence) {
      return {
        ...deuResult,
        detectedLanguage: 'deu'
      };
    }
  }

  return {
    ...engResult,
    detectedLanguage: 'eng'
  };
}
