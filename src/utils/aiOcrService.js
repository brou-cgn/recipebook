/**
 * AI-Enhanced OCR Service
 * Extends the existing OCR service with AI-powered recipe recognition
 * Supports Google Gemini Vision API for structured recipe extraction
 */

/**
 * Configuration for AI OCR providers
 * 
 * To use this service, you need to:
 * 1. Get a Gemini API key from https://aistudio.google.com/
 * 2. Add it to your .env.local file as REACT_APP_GEMINI_API_KEY
 * 
 * Note: Gemini API has a generous free tier, but usage limits apply.
 * See: https://ai.google.dev/pricing
 */

const AI_OCR_CONFIG = {
  gemini: {
    apiKey: process.env.REACT_APP_GEMINI_API_KEY,
    model: 'gemini-1.5-flash', // Free tier model
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
  },
  // Future providers can be added here
  openai: {
    apiKey: process.env.REACT_APP_OPENAI_API_KEY,
    model: 'gpt-4o',
    endpoint: 'https://api.openai.com/v1/chat/completions',
  }
};

/**
 * Check if AI OCR is available and configured
 * @param {string} provider - The AI provider to check ('gemini' or 'openai')
 * @returns {boolean} True if the provider is configured
 */
export function isAiOcrAvailable(provider = 'gemini') {
  const config = AI_OCR_CONFIG[provider];
  return config && config.apiKey && config.apiKey !== '';
}

/**
 * Get the recipe extraction prompt in the specified language
 * @param {string} lang - Language code ('de' or 'en')
 * @returns {string} The formatted prompt
 */
function getRecipeExtractionPrompt(lang = 'de') {
  if (lang === 'de') {
    return `Analysiere dieses Rezeptbild und extrahiere alle Informationen als strukturiertes JSON.

Bitte gib das Ergebnis im folgenden JSON-Format zurück:
{
  "titel": "Name des Rezepts",
  "portionen": Anzahl der Portionen als Zahl,
  "zubereitungszeit": "Zeit in Minuten als Zahl oder Text wie '30 min' oder '1 Stunde'",
  "kochzeit": "Kochzeit in Minuten (optional)",
  "schwierigkeit": Schwierigkeitsgrad 1-5 (1=sehr einfach, 5=sehr schwer),
  "kulinarik": "Kulinarische Herkunft (z.B. Italienisch, Asiatisch, Deutsch)",
  "kategorie": "Kategorie (z.B. Hauptgericht, Dessert, Vorspeise, Beilage, Snack)",
  "tags": ["vegetarisch", "vegan", "glutenfrei", etc. - falls zutreffend],
  "zutaten": [
    "Erste Zutat mit Menge",
    "Zweite Zutat mit Menge",
    ...
  ],
  "zubereitung": [
    "Erster Zubereitungsschritt",
    "Zweiter Zubereitungsschritt",
    ...
  ],
  "notizen": "Zusätzliche Hinweise oder Tipps (optional)"
}

Wichtig:
- Extrahiere alle sichtbaren Informationen genau
- Wenn Informationen fehlen, lasse die Felder leer oder null
- Gib NUR das JSON zurück, keine zusätzlichen Erklärungen
- Zahlen ohne Anführungszeichen (außer bei Zeitangaben mit Text)`;
  } else {
    return `Analyze this recipe image and extract all information as structured JSON.

Please return the result in the following JSON format:
{
  "title": "Recipe name",
  "servings": Number of servings as a number,
  "prepTime": "Preparation time in minutes as number or text like '30 min' or '1 hour'",
  "cookTime": "Cooking time in minutes (optional)",
  "difficulty": Difficulty level 1-5 (1=very easy, 5=very hard),
  "cuisine": "Cuisine type (e.g., Italian, Asian, American)",
  "category": "Category (e.g., Main Course, Dessert, Appetizer, Side Dish, Snack)",
  "tags": ["vegetarian", "vegan", "gluten-free", etc. - if applicable],
  "ingredients": [
    "First ingredient with quantity",
    "Second ingredient with quantity",
    ...
  ],
  "steps": [
    "First preparation step",
    "Second preparation step",
    ...
  ],
  "notes": "Additional notes or tips (optional)"
}

Important:
- Extract all visible information accurately
- If information is missing, leave fields empty or null
- Return ONLY the JSON, no additional explanations
- Numbers without quotes (except for time strings with text)`;
  }
}

/**
 * Recognize recipe using Google Gemini Vision API
 * @param {string} imageBase64 - Base64 encoded image (with or without data URL prefix)
 * @param {string} lang - Language code ('de' or 'en')
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<Object>} Structured recipe data
 */
export async function recognizeRecipeWithGemini(imageBase64, lang = 'de', onProgress = null) {
  const config = AI_OCR_CONFIG.gemini;
  
  if (!config.apiKey) {
    throw new Error('Gemini API key not configured. Please add REACT_APP_GEMINI_API_KEY to your .env.local file.');
  }

  if (onProgress) onProgress(10);

  // Remove data URL prefix if present
  const base64Data = imageBase64.includes('base64,') 
    ? imageBase64.split('base64,')[1] 
    : imageBase64;

  // Determine image MIME type from data URL or default to jpeg
  let mimeType = 'image/jpeg';
  if (imageBase64.startsWith('data:')) {
    const match = imageBase64.match(/data:([^;]+);/);
    if (match) mimeType = match[1];
  }

  if (onProgress) onProgress(20);

  const prompt = getRecipeExtractionPrompt(lang);

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1, // Low temperature for more consistent outputs
      topK: 32,
      topP: 1,
      maxOutputTokens: 2048,
    }
  };

  if (onProgress) onProgress(30);

  try {
    const url = `${config.endpoint}/${config.model}:generateContent?key=${config.apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (onProgress) onProgress(70);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Gemini API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    if (onProgress) onProgress(90);

    // Extract the text response
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textResponse) {
      throw new Error('No response from Gemini API');
    }

    // Parse JSON response (handle markdown code blocks if present)
    let jsonText = textResponse.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    const recipeData = JSON.parse(jsonText);

    if (onProgress) onProgress(100);

    // Normalize the data structure based on language
    if (lang === 'de') {
      return {
        title: recipeData.titel || '',
        servings: recipeData.portionen || 0,
        prepTime: recipeData.zubereitungszeit || '',
        cookTime: recipeData.kochzeit || '',
        difficulty: recipeData.schwierigkeit || 0,
        cuisine: recipeData.kulinarik || '',
        category: recipeData.kategorie || '',
        tags: recipeData.tags || [],
        ingredients: recipeData.zutaten || [],
        steps: recipeData.zubereitung || [],
        notes: recipeData.notizen || '',
        confidence: 95, // AI OCR typically has high confidence
        provider: 'gemini',
        rawResponse: textResponse
      };
    } else {
      return {
        title: recipeData.title || '',
        servings: recipeData.servings || 0,
        prepTime: recipeData.prepTime || '',
        cookTime: recipeData.cookTime || '',
        difficulty: recipeData.difficulty || 0,
        cuisine: recipeData.cuisine || '',
        category: recipeData.category || '',
        tags: recipeData.tags || [],
        ingredients: recipeData.ingredients || [],
        steps: recipeData.steps || [],
        notes: recipeData.notes || '',
        confidence: 95,
        provider: 'gemini',
        rawResponse: textResponse
      };
    }

  } catch (error) {
    if (onProgress) onProgress(0);
    
    // Enhance error messages
    if (error.message.includes('API key')) {
      throw new Error('Invalid API key. Please check your Gemini API configuration.');
    } else if (error.message.includes('quota')) {
      throw new Error('API quota exceeded. Please try again later or upgrade your plan.');
    } else if (error.message.includes('JSON')) {
      throw new Error('Failed to parse recipe data. The image might not contain a valid recipe.');
    }
    
    throw error;
  }
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
      model: AI_OCR_CONFIG.gemini.model,
      features: [
        'Strukturierte Rezept-Extraktion',
        'Automatische Kulinarik-Erkennung',
        'Kategorie- und Tag-Erkennung',
        'Handschrift-Unterstützung',
        'Mehrsprachig'
      ],
      freeTier: 'Großzügig (ca. 10.000+ Anfragen/Monat)',
      privacy: 'Bilder werden an Google Server gesendet',
      speed: 'Schnell (2-5 Sekunden)'
    },
    openai: {
      name: 'OpenAI GPT-4o Vision',
      available: isAiOcrAvailable('openai'),
      model: AI_OCR_CONFIG.openai.model,
      features: [
        'Höchste OCR-Qualität',
        'Strukturierte JSON-Ausgabe',
        'Sehr gutes semantisches Verständnis',
        'Handschrift-Unterstützung',
        'Mehrsprachig'
      ],
      freeTier: 'Begrenzt ($5 Guthaben für neue Nutzer)',
      privacy: 'Bilder werden an OpenAI Server gesendet',
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
  AI_OCR_CONFIG,
  getRecipeExtractionPrompt
};
