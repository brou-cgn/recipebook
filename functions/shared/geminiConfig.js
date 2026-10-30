/**
 * Gemini-Modell und Aufrufdaten an einer Stelle (Tech-Check F16). Vorher stand der
 * Modellname an sieben Stellen und der API-Key als URL-Parameter in sechs selbst
 * gebauten fetch-Aufrufen. Ein Modellwechsel geschieht hier.
 * Ohne Abhängigkeiten, damit jede Datei es laden kann (auch nutritionNormalization.js).
 */

const GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * URL und Header für einen generateContent-Aufruf über REST. Der API-Key steht im
 * Header x-goog-api-key statt in der URL, damit er nicht mit geloggten URLs mitläuft.
 * @param {string} apiKey - Gemini API key
 * @return {{url: string, headers: object}}
 */
function geminiGenerateContentRequest(apiKey) {
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    headers: {'Content-Type': 'application/json', 'x-goog-api-key': apiKey},
  };
}

module.exports = {GEMINI_MODEL, geminiGenerateContentRequest};
