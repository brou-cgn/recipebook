/**
 * Nutrition ingredient normalization helpers.
 */

/**
 * Parse an ingredient string and return the estimated weight in grams and
 * a clean search name for the OpenFoodFacts API.
 *
 * Handles formats like:
 *   "500 g Mehl", "2 EL Olivenöl", "4 Eier", "1 Prise Salz", "200ml Milch"
 *
 * @param {string} ingredientStr - Raw ingredient string
 * @return {{amountG: number, name: string}|null}
 */
function parseIngredientForNutrition(ingredientStr) {
  if (!ingredientStr || typeof ingredientStr !== 'string') return null;

  const str = ingredientStr.trim();
  if (!str) return null;

  // Conversion factors to grams (approximate)
  const UNIT_GRAMS = {
    g: 1, kg: 1000, mg: 0.001,
    ml: 1, l: 1000, dl: 100, cl: 10,
    EL: 15, el: 15, Esslöffel: 15, esslöffel: 15,
    TL: 5, tl: 5, Teelöffel: 5, teelöffel: 5,
    Prise: 1, prise: 1, Prisen: 1, prisen: 1,
    Tasse: 240, tasse: 240, Tassen: 240, tassen: 240,
    Bund: 30, bund: 30,
  };

  const match = str.match(
      /^([\d.,]+)\s*([a-zA-ZäöüÄÖÜß]+)?\.?\s+(.+)/,
  );

  if (match) {
    const amount = parseFloat(match[1].replace(',', '.'));
    const potentialUnit = match[2] || '';
    const rest = match[3].trim();

    if (potentialUnit && Object.hasOwn(UNIT_GRAMS, potentialUnit)) {
      const amountG = isNaN(amount) ? 100 : amount * UNIT_GRAMS[potentialUnit];
      return {amountG: Math.max(amountG, 1), name: rest};
    } else if (potentialUnit) {
      const name = `${potentialUnit} ${rest}`.trim();
      return {amountG: 100, name};
    } else {
      const amountG = isNaN(amount) ? 60 : amount * 60;
      return {amountG: Math.max(amountG, 10), name: rest};
    }
  }

  return {amountG: 5, name: str};
}

/**
 * @param {string} ingredientStr
 * @return {string}
 */
function buildIngredientNormalizationPrompt(ingredientStr) {
  return `You are a food ingredient parser. Parse the following ingredient string and return ONLY a JSON object.

Input: ${JSON.stringify(ingredientStr)}

Return this exact JSON structure (no markdown, no explanation):
{
  "amount": <number or null>,
  "unit": <string or null>,
  "amountInGrams": <number>,
  "canonicalNameDE": <string - simplified German food name, no modifiers>,
  "canonicalNameEN": <string - simplified English food name for database search, no modifiers>
}

Rules:
- amountInGrams: convert amount+unit to grams. If unit is volume (ml/l), use 1ml=1g approximation. For common cooking units: 1 EL=15g, 1 TL=5g, 1 Tasse=240g, 1 Prise=1g, 1 Bund=30g. If no amount, use 100.
- canonicalNameDE: remove all modifiers (kaltgepresst, gehackt, getrocknet, etc.), keep only the food noun
- canonicalNameEN: translate canonicalNameDE to English, use common food database terms (e.g. "Mehl"→"wheat flour", "Olivenöl"→"olive oil", "Zwiebel"→"onion")
- If input is just a spice/condiment like "Salz" or "Pfeffer", still parse it correctly`;
}

/**
 * @param {string} text
 * @return {string}
 */
function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    throw new Error('Gemini returned an empty response');
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');

  if (start === -1 || end === -1 || end < start) {
    throw new Error('Gemini returned no JSON object');
  }

  return candidate.slice(start, end + 1);
}

/**
 * @param {string} value
 * @return {string}
 */
function normalizeName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

/**
 * @param {number|string} value
 * @return {number|null}
 */
function normalizePositiveNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

/**
 * @param {object} data
 * @return {{amountG: number, name: string, searchName: string}}
 */
function normalizeGeminiPayload(data) {
  const amountG = normalizePositiveNumber(data?.amountInGrams);
  const name = normalizeName(data?.canonicalNameDE);
  const searchName = normalizeName(data?.canonicalNameEN);

  if (!amountG || !name || !searchName) {
    throw new Error('Gemini returned incomplete ingredient JSON');
  }

  return {amountG, name, searchName};
}

/**
 * @param {Promise<*>} promise
 * @param {number} timeoutMs
 * @return {Promise<*>}
 */
async function withTimeout(promise, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }

  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Gemini normalization timeout')), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Creates reusable nutrition normalization helpers.
 *
 * @param {{GoogleGenerativeAI: (Function|undefined), env: (Object|undefined)}} [options]
 * @return {object}
 */
function createNutritionNormalizationUtils({GoogleGenerativeAI, env = process.env} = {}) {
  /**
   * Uses Gemini to normalize a raw ingredient string into a structured object
   * with canonical English food name and amount in grams.
   *
   * @param {string} ingredientStr - Raw ingredient string, e.g. "2 EL Olivenöl, kaltgepresst"
   * @param {object} [options]
   * @return {Promise<{amountG: number, name: string, searchName: string}|null>}
   */
  async function normalizeIngredientWithGemini(ingredientStr, options = {}) {
    if (!ingredientStr || typeof ingredientStr !== 'string') return null;

    const apiKey = options.apiKey ?? env.GEMINI_API_KEY;
    if (!apiKey || !GoogleGenerativeAI) {
      return null;
    }

    const model = options.model || (options.createModel ?
      options.createModel(apiKey) :
      new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0,
        },
      }));

    const result = await withTimeout(
        model.generateContent(buildIngredientNormalizationPrompt(ingredientStr)),
        options.timeoutMs ?? 15000,
    );
    const text = await result.response.text();
    const jsonText = extractJsonObject(text);
    return normalizeGeminiPayload(JSON.parse(jsonText));
  }

  return {
    parseIngredientForNutrition,
    normalizeIngredientWithGemini,
  };
}

module.exports = {
  buildIngredientNormalizationPrompt,
  createNutritionNormalizationUtils,
  extractJsonObject,
  normalizeGeminiPayload,
  parseIngredientForNutrition,
};
