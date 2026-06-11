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
      return {amountG: 100, name: rest};
    } else {
      const amountG = isNaN(amount) ? 60 : amount * 60;
      return {amountG: Math.max(amountG, 10), name: rest};
    }
  }

  return {amountG: 5, name: str};
}

/**
 * Returns true if an ingredient follows a simple quantity+unit+name pattern
 * without descriptive modifiers.
 *
 * @param {string} ingredientStr
 * @return {boolean}
 */
function isSimpleIngredient(ingredientStr) {
  if (!ingredientStr || typeof ingredientStr !== 'string') return false;

  const str = ingredientStr.trim();
  if (!str) return false;

  const simplePattern = /^[\d.,]+\s*(?:g|kg|mg|ml|l|dl|cl|EL|el|TL|tl|Esslöffel|esslöffel|Teelöffel|teelöffel|Prise|prise|Prisen|prisen|Tasse|tasse|Tassen|tassen|Bund|bund)\.?\s+[^\s,]+$/u;
  if (!simplePattern.test(str)) return false;

  const hasModifiers = /,|\b(?:kaltgepresst|gehackt|getrocknet|bio|frisch|tiefgekühlt)\b/i.test(str);
  return !hasModifiers;
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
 * @param {string} ingredientID
 * @param {string} nutritionFamily
 * @param {string} category
 * @return {string}
 */
function buildReferenceSearchTermPrompt(ingredientID, nutritionFamily, category) {
  return `You are a food database expert. Based on the metadata below, generate the best English search term for finding this food ingredient in the OpenFoodFacts database.

Return ONLY a JSON object (no markdown, no explanation):
{"searchTerm": "<concise English food name>"}

Metadata:
- ingredientID: ${ingredientID}
- nutritionFamily: ${nutritionFamily || ''}
- category: ${category || ''}

Rules:
- Return a simple, generic English food name (e.g. "olive oil", "wheat flour", "tomato")
- Do NOT include modifiers like "organic", "fresh", "dried"
- Use the most common English food database search term`;
}

/**
 * @param {string} ingredientStr
 * @param {object} parsed
 * @param {string} parsed.name
 * @param {string} [parsed.searchName]
 * @return {string}
 */
function buildNutritionEstimationPrompt(ingredientStr, parsed) {
  const canonicalName =
    normalizeName(parsed?.searchName) || normalizeName(parsed?.name) || ingredientStr;
  return `You are a food nutrition expert. Estimate the nutritional values per 100g for the following ingredient.
Return ONLY a JSON object (no markdown, no explanation):
{
  "kalorien": <number - kcal per 100g>,
  "protein": <number - grams per 100g>,
  "fett": <number - grams per 100g>,
  "kohlenhydrate": <number - grams per 100g>,
  "zucker": <number - grams per 100g>,
  "ballaststoffe": <number - grams per 100g>,
  "salz": <number - grams per 100g>
}
Ingredient: ${canonicalName}
Original string: ${ingredientStr}
Use typical/average values for this food.
All values must be non-negative numbers.
If completely unknown, return null.`;
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
 * @param {number|string} value
 * @return {number|null}
 */
function normalizeNonNegativeNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
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
 * @param {object} data
 * @return {{
 *   kalorien: number,
 *   protein: number,
 *   fett: number,
 *   kohlenhydrate: number,
 *   zucker: number,
 *   ballaststoffe: number,
 *   salz: number
 * }|null}
 */
function normalizeGeminiNutritionEstimate(data) {
  const fields = ['kalorien', 'protein', 'fett', 'kohlenhydrate', 'zucker', 'ballaststoffe', 'salz'];
  const per100g = {};

  for (const field of fields) {
    const normalized = normalizeNonNegativeNumber(data?.[field]);
    per100g[field] = normalized ?? 0;
  }

  return per100g;
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
        model: 'gemini-2.5-flash',
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

  /**
   * Uses Gemini to estimate nutritional values per 100g for an ingredient
   * when OpenFoodFacts returns no result.
   *
   * @param {string} ingredientStr - Raw ingredient string
   * @param {object} parsed
   * @param {number} parsed.amountG
   * @param {string} parsed.name
   * @param {string} [parsed.searchName]
   * @param {object} [options]
   * @return {Promise<object|null>}
   */
  async function estimateNutritionWithGemini(ingredientStr, parsed, options = {}) {
    if (!ingredientStr || typeof ingredientStr !== 'string') return null;
    if (
      !parsed ||
      !normalizePositiveNumber(parsed.amountG) ||
      !normalizeName(parsed.name)
    ) {
      return null;
    }

    const apiKey = options.apiKey ?? env.GEMINI_API_KEY;
    if (!apiKey || !GoogleGenerativeAI) {
      return null;
    }

    const model = options.model || (options.createModel ?
      options.createModel(apiKey) :
      new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0,
        },
      }));

    const maxRetries = options.retries ?? 1;
    const totalAttempts = maxRetries + 1;
    const retryDelayMs = options.retryDelayMs ?? 3000;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      try {
        const result = await withTimeout(
            model.generateContent(buildNutritionEstimationPrompt(ingredientStr, parsed)),
            // Align the fallback's default with the 20s timeout used by current callers.
            options.timeoutMs ?? 20000,
        );
        const text = String(await result.response.text() || '').trim();
        if (!text || /^null$/i.test(text)) {
          return null;
        }
        const jsonText = extractJsonObject(text);
        const per100g = normalizeGeminiNutritionEstimate(JSON.parse(jsonText));
        if (!per100g) {
          return null;
        }
        return {
          per100g,
          amountG: parsed.amountG,
          name: parsed.name,
        };
      } catch (error) {
        const isTimeout = /timeout/i.test(String(error?.message || ''));
        if (isTimeout && attempt < totalAttempts) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          continue;
        }
        return null;
      }
    }

    return null;
  }

  /**
   * Uses Gemini to generate an English search term for a nutrition reference entry
   * based on its ingredientID, nutritionFamily, and category metadata.
   *
   * @param {string} ingredientID
   * @param {string} nutritionFamily
   * @param {string} category
   * @param {object} [options]
   * @return {Promise<string|null>}
   */
  async function generateSearchTermWithGemini(ingredientID, nutritionFamily, category, options = {}) {
    const apiKey = options.apiKey ?? env.GEMINI_API_KEY;
    if (!apiKey || !GoogleGenerativeAI) return null;

    const model = options.model || (options.createModel ?
      options.createModel(apiKey) :
      new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {responseMimeType: 'application/json', temperature: 0},
      }));

    try {
      const result = await withTimeout(
        model.generateContent(buildReferenceSearchTermPrompt(ingredientID, nutritionFamily, category)),
        options.timeoutMs ?? 15000,
      );
      const text = await result.response.text();
      const jsonText = extractJsonObject(text);
      const parsed = JSON.parse(jsonText);
      const searchTerm = normalizeName(parsed?.searchTerm);
      return searchTerm || null;
    } catch (e) {
      return null;
    }
  }

  return {
    parseIngredientForNutrition,
    isSimpleIngredient,
    normalizeIngredientWithGemini,
    estimateNutritionWithGemini,
    generateSearchTermWithGemini,
  };
}

module.exports = {
  buildIngredientNormalizationPrompt,
  buildReferenceSearchTermPrompt,
  createNutritionNormalizationUtils,
  extractJsonObject,
  isSimpleIngredient,
  normalizeGeminiPayload,
  parseIngredientForNutrition,
};
