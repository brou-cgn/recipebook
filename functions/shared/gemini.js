/**
 * Von mehreren Function-Gruppen genutzte Helfer (gemini; aus index.js, Tech-Check F2).
 */

const {HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const {RECIPE_EXTRACTION_PROMPT_CACHE_TTL_MS, resolveImportLists, cuisineFields, normalizeIngredientUnits} = require('./importLists');

/**
 * Shared style + step-boundary rules for the "zubereitung" field, reused by
 * DEFAULT_AI_RECIPE_PROMPT (full recipe extraction, below) and
 * RECIPE_STEP_REPHRASE_PROMPT (rephraseRecipeSteps, which only rewrites
 * already-extracted steps). These two constants must stay in sync with the
 * identical copies in src/utils/customLists.js - extracted into one place so
 * that a future style change (like the Coach-Ton rewrite) only has to touch
 * two files (server + client prompt copy), not three.
 */
const RECIPE_STEP_STYLE_RULE = `Schreibe jeden Schritt beschreibend, in der Du-Form und in einem energiegeladenen, aber sachlichen Du-Ton: Energie gehört in die Handlungsbeschreibung (z.B. "Schneide den Guanciale in Würfel und brate ihn an, bis er knusprig ist.", "Jetzt geht's ans Ausrollen!"), NICHT in lobende Superlative für das Ergebnis oder die Zutat selbst (kein "wunderbar", "perfekt", "super", "wohlverdient") und NICHT in angehängte Motivationssätze am Schrittende (kein "– du schaffst das!").`;

const RECIPE_STEP_BOUNDARY_RULE = `Jeder Eintrag ist EIN in sich abgeschlossener Arbeitsschritt. Ein Schritt bleibt EIN Array-Element, solange die einzelnen Handlungen unmittelbar aufeinander folgen (keine Wartezeit dazwischen) UND auf dasselbe unmittelbare Zwischenziel hinarbeiten (z.B. "Mehl und Eier auf eine Arbeitsfläche geben und 10 Minuten zu einem glatten Teig verkneten" ist EIN Schritt). Ein NEUER Schritt beginnt, sobald: (a) eine Ruhe- oder Wartezeit dazwischenliegt (z.B. Teig ruhen lassen, marinieren, backen), (b) ein anderer Rezeptbestandteil beginnt (z.B. von der Teig- zur Füllungszubereitung), oder (c) zwei unterschiedliche, parallel laufende Handlungsstränge vorliegen (z.B. Fleisch in einer Pfanne anbraten UND gleichzeitig Nudeln in einem anderen Topf kochen – das sind zwei Schritte, auch wenn sie gleichzeitig passieren). Fasse NIEMALS zwei Schritte, die eines dieser Kriterien für einen Bruch erfüllen, in einem Array-Element zusammen.`;

/**
 * Default AI recipe extraction prompt (must stay in sync with src/utils/customLists.js)
 */
const DEFAULT_AI_RECIPE_PROMPT = `Analysiere dieses Rezeptbild und extrahiere alle Informationen als strukturiertes JSON. Extrahiere nur das Rezept, ignoriere Kommentare, Likes, UI‑Text. Erfinde keine Zutaten/Mengen/Temperaturen/Zubereitungsschritte.

Bitte gib das Ergebnis im folgenden JSON-Format zurück:
{
  "titel": "Name des Rezepts",
  "portionen": Anzahl der Portionen als Zahl (nur die Zahl, z.B. 4),
  "zubereitungszeit": Zeit in Minuten als Zahl (nur die Zahl, z.B. 30),
  "kochzeit": Kochzeit in Minuten als Zahl (optional),
  "schwierigkeit": Schwierigkeitsgrad 1-5 (1=sehr einfach, 5=sehr schwer),
  "kulinarik": "Kulinarische Herkunft (z.B. Italienisch, Asiatisch, Deutsch)",
  "kategorie": "Kategorie (z.B. Hauptgericht, Dessert, Vorspeise, Beilage, Snack)",
  "tags": ["vegetarisch", "vegan", "glutenfrei"], // nur falls explizit erwähnt
  "zutaten": [
    "500 g Spaghetti",
    "200 g Speck",
    "4 Eier"
  ],
  "zubereitung": [
    "Wasser in einem großen Topf zum Kochen bringen und salzen",
    "Spaghetti nach Packungsanweisung kochen",
    "Speck in Würfel schneiden und in einer Pfanne knusprig braten"
  ],
  "notizen": "Zusätzliche Hinweise oder Tipps (optional)"
}

WICHTIGE REGELN:
1. Mengenangaben: Verwende immer das Format "Zahl Einheit Zutat" (z.B. "500 g Mehl", "2 Esslöffel Olivenöl", "1 Prise Salz")
2. Zahlen: portionen, zubereitungszeit, kochzeit und schwierigkeit müssen reine Zahlen sein (kein Text!)
3. Zubereitungsschritte: ${RECIPE_STEP_STYLE_RULE} Übernimm NUR Schritte, die tatsächlich in der Quelle beschrieben oder eindeutig erkennbar sind – ergänze KEINE zusätzlichen Arbeitsschritte, Zeiten, Temperaturen oder Reihenfolgen aus allgemeinem Kochwissen, auch wenn sie plausibel wirken. Wenn die Quelle nur eine Zutatenliste ohne Zubereitungsanleitung enthält, lasse "zubereitung" als leeres Array – erfinde KEINE Schritte anhand der Zutaten.
4. Fehlende Informationen: Wenn eine Information nicht lesbar oder nicht vorhanden ist, verwende null oder lasse das Array leer
5. Einheiten: Standardisiere Einheiten (g statt Gramm, ml statt Milliliter). Verwende IMMER "Esslöffel" statt "EL" und "Teelöffel" statt "TL" – schreibe die Einheit NIE als Abkürzung (z.B. "2 Esslöffel Olivenöl", "1 Teelöffel Salz"). Wandle Brüche in Dezimalzahlen um (z.B. "1/2" wird zu "0,5", "1 1/2" wird zu "1,5"). WICHTIG: Rechne ALLE imperialen Einheiten in metrische Einheiten um! Verwende folgende Umrechnungen: 1 cup (Flüssigkeit) = 240 ml, 1 cup (Mehl) = 130 g, 1 cup (Zucker) = 200 g, 1 cup (Butter) = 227 g, 1 oz = 28 g, 1 lb = 454 g, 1 fl oz = 30 ml, 1 quart = 946 ml, 1 pint = 473 ml, 1 gallon = 3785 ml, 1 stick Butter = 113 g. Für cups: verwende das jeweils passende Gewicht abhängig von der Zutat (z.B. "1 cup flour" = "130 g Mehl", "1 cup milk" = "240 ml Milch"). Runde die Ergebnisse auf sinnvolle Werte (z.B. 454 g → 450 g, 227 g → 225 g).
6. Tags: Füge nur Tags hinzu, die explizit im Rezept erwähnt werden oder eindeutig aus den Zutaten ableitbar sind
7. Wähle für die Felder "kulinarik" und "kategorie" **NUR** Werte aus diesen Listen:
**Verfügbare Kulinarik-Typen:**
{{CUISINE_TYPES}}
Wenn kein Fleisch oder Fisch enthalten ist, setze zusätzlich **immer** "Vegetarisch".
Wenn keine tierischen Produkte enthalten sind (z.B. Butter, Fleisch, Fisch, Eier usw.), setze zusätzlich **immer** "Vegetarisch" und "Vegan".
**Verfügbare Speisekategorien:**
{{MEAL_CATEGORIES}}
Wenn das Rezept zu keiner dieser Kategorien passt, wähle die nächstliegende oder lasse das Feld leer. Mehrfachauswahlen sind möglich
8. Schritt-Grenzen: Das Feld "zubereitung" MUSS immer ein JSON-Array von Strings sein. ${RECIPE_STEP_BOUNDARY_RULE} Mindestens 1 Schritt muss vorhanden sein, wenn Zubereitungsinformationen erkennbar sind.

BEISPIEL GUTE EXTRAKTION:
{
  "titel": "Spaghetti Carbonara",
  "portionen": 4,
  "zubereitungszeit": 30,
  "schwierigkeit": 2,
  "kulinarik": "Italienisch",
  "kategorie": "Hauptgericht",
  "tags": [],
  "zutaten": [
    "400 g Spaghetti",
    "200 g Guanciale oder Pancetta",
    "4 Eigelb",
    "100 g Pecorino Romano",
    "Schwarzer Pfeffer",
    "Salz"
  ],
  "zubereitung": [
    "Bring reichlich Wasser in einem großen Topf zum Kochen und salze es großzügig – das ist deine Basis für alles Weitere.",
    "Schneide den Guanciale in kleine Würfel und brate ihn bei mittlerer Hitze an, bis er knusprig ist.",
    "Verrühr währenddessen das Eigelb mit dem geriebenen Pecorino und reichlich schwarzem Pfeffer.",
    "Koch die Spaghetti nach Packungsanweisung bissfest.",
    "Gieß die Pasta ab und fang dabei etwas Nudelwasser auf – das brauchst du gleich noch.",
    "Gib die Pasta zum Guanciale und nimm die Pfanne von der Hitze.",
    "Rühr die Ei-Käse-Mischung unter und mach sie mit dem Nudelwasser cremig.",
    "Serviere sofort, mit extra Pecorino und Pfeffer obendrauf."
  ],
  "notizen": "Wichtig: Die Pfanne muss von der Hitze genommen werden, bevor die Eier hinzugefügt werden, sonst stocken sie."
}

Extrahiere nun alle sichtbaren Informationen aus dem Bild genau nach diesem Schema.`;

/**
 * Gemini responseSchema enforcing the JSON shape the DEFAULT_AI_RECIPE_PROMPT
 * (and callGeminiAPI/callGeminiTextAPI/callGeminiMultiImageAPI's downstream
 * parsing) actually require, independent of whatever prose an admin edits
 * into the Firestore-configurable prompt text. Only the fields the app can't
 * function without are `required` - everything else keeps the same
 * optional/fallback handling the parsing code already has.
 */
const RECIPE_EXTRACTION_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    titel: {type: 'STRING'},
    portionen: {type: 'INTEGER', nullable: true},
    zubereitungszeit: {type: 'INTEGER', nullable: true},
    kochzeit: {type: 'INTEGER', nullable: true},
    schwierigkeit: {type: 'INTEGER', nullable: true},
    kulinarik: {type: 'STRING', nullable: true},
    kategorie: {type: 'STRING', nullable: true},
    tags: {type: 'ARRAY', items: {type: 'STRING'}},
    zutaten: {type: 'ARRAY', items: {type: 'STRING'}},
    zubereitung: {type: 'ARRAY', items: {type: 'STRING'}},
    notizen: {type: 'STRING', nullable: true},
  },
  required: ['titel', 'zutaten', 'zubereitung'],
};

// In-memory cache for the AI recipe extraction prompt, shared across warm
// invocations of the same Cloud Functions instance. TTL keeps changes made
// in Settings visible within a few minutes without a Firestore read on
// every single OCR/import call.
let recipeExtractionPromptCache = null;

let recipeExtractionPromptCacheExpiry = 0;

/**
 * Get the recipe extraction prompt
 * Loads from Firestore settings (cached in-memory for a few minutes),
 * throws an error if not configured
 * @returns {Promise<string>} The formatted prompt
 */
async function getRecipeExtractionPrompt() {
  if (recipeExtractionPromptCache && Date.now() < recipeExtractionPromptCacheExpiry) {
    return recipeExtractionPromptCache;
  }

  const db = admin.firestore();

  try {
    const settingsDoc = await db.collection('settings').doc('app').get();

    if (!settingsDoc.exists) {
      console.error('Settings document does not exist in Firestore');
      throw new HttpsError(
        'failed-precondition',
        'AI prompt not configured. Please configure the AI recipe prompt in Settings.'
      );
    }

    const settings = settingsDoc.data();

    if (!settings.aiRecipePrompt || settings.aiRecipePrompt.trim() === '') {
      console.error('aiRecipePrompt field is empty or missing in settings/app');
      throw new HttpsError(
        'failed-precondition',
        'AI prompt not configured. Please configure the AI recipe prompt in Settings.'
      );
    }

    let aiRecipePrompt = settings.aiRecipePrompt;

    // Migration: if the stored prompt is missing required placeholders or outdated rules, reset to default
    if (
      !aiRecipePrompt.includes('{{CUISINE_TYPES}}') ||
      !aiRecipePrompt.includes('{{MEAL_CATEGORIES}}') ||
      !aiRecipePrompt.includes('imperiale') ||
      !aiRecipePrompt.includes('ergänze KEINE zusätzlichen Arbeitsschritte') ||
      !aiRecipePrompt.includes('sachlichen Du-Ton')
    ) {
      console.warn('AI prompt in Firestore is outdated or missing placeholders – migrating to DEFAULT_AI_RECIPE_PROMPT');
      // Archive the outdated prompt before overwriting it, so it isn't lost if it
      // was actually an intentional custom prompt that happened to miss a keyword
      // check (see src/utils/customLists.js: saveAIRecipePrompt for the matching
      // client-side history, and getAIRecipePromptHistory to restore a version).
      // Best-effort: a failure here must not block recipe extraction.
      try {
        await db.collection('settings').doc('app').collection('aiPromptHistory').add({
          prompt: aiRecipePrompt,
          archivedAt: admin.firestore.FieldValue.serverTimestamp(),
          archivedBy: 'system-migration',
        });
      } catch (historyError) {
        console.error('Failed to archive outdated aiRecipePrompt before migration:', historyError);
      }
      aiRecipePrompt = DEFAULT_AI_RECIPE_PROMPT;
      await db.collection('settings').doc('app').update({aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT});
      console.log('Successfully migrated aiRecipePrompt in Firestore to default version');
    }

    console.log('Successfully loaded AI prompt from Firestore settings');
    console.log(`Prompt length: ${aiRecipePrompt.length} characters`);

    recipeExtractionPromptCache = aiRecipePrompt;
    recipeExtractionPromptCacheExpiry = Date.now() + RECIPE_EXTRACTION_PROMPT_CACHE_TTL_MS;

    return aiRecipePrompt;
  } catch (error) {
    // If it's already an HttpsError, rethrow it
    if (error instanceof HttpsError) {
      throw error;
    }

    // Log the actual error
    console.error('Error loading AI prompt from Firestore:', error);

    // Throw a user-friendly error
    throw new HttpsError(
      'internal',
      'Failed to load AI prompt configuration. Please try again or contact support.'
    );
  }
}

/**
 * Call Gemini API to analyze recipe image
 * @param {string} base64Data - Pure base64 image data (no prefix)
 * @param {string} mimeType - Image MIME type
 * @param {string} lang - Language code
 * @param {string} apiKey - Gemini API key
 * @param {string[]|undefined} cuisineTypes - Configured cuisine types
 * @param {string[]|undefined} mealCategories - Configured meal categories
 * @returns {Promise<Object>} Structured recipe data
 */
async function callGeminiAPI(base64Data, mimeType, lang, apiKey, cuisineTypes, mealCategories) {
  let prompt = await getRecipeExtractionPrompt();
  ({cuisineTypes, mealCategories} = await resolveImportLists(cuisineTypes, mealCategories));

  // Warn if expected placeholders are missing from the prompt
  if (!prompt.includes('{{CUISINE_TYPES}}')) {
    console.warn('WARNING: {{CUISINE_TYPES}} placeholder was not found in prompt!');
  }
  if (!prompt.includes('{{MEAL_CATEGORIES}}')) {
    console.warn('WARNING: {{MEAL_CATEGORIES}} placeholder was not found in prompt!');
  }

  // Replace placeholders with actual configured lists
  if (Array.isArray(cuisineTypes) && cuisineTypes.length > 0) {
    const cuisineList = cuisineTypes.map((c) => `- ${c}`).join('\n');
    prompt = prompt.replaceAll('{{CUISINE_TYPES}}', cuisineList);
  } else {
    // Fallback to default lists if not provided
    prompt = prompt.replaceAll('{{CUISINE_TYPES}}', '- Italian\n- Thai\n- Chinese\n- Japanese\n- Indian\n- Mexican\n- French\n- German\n- American\n- Mediterranean');
  }

  if (Array.isArray(mealCategories) && mealCategories.length > 0) {
    const categoryList = mealCategories.map((c) => `- ${c}`).join('\n');
    prompt = prompt.replaceAll('{{MEAL_CATEGORIES}}', categoryList);
  } else {
    // Fallback to default lists if not provided
    prompt = prompt.replaceAll('{{MEAL_CATEGORIES}}', '- Appetizer\n- Main Course\n- Dessert\n- Soup\n- Salad\n- Snack\n- Beverage\n- Side Dish');
  }

  console.log(`Using AI prompt with replaced placeholders`);
  console.log(`Cuisine types: ${cuisineTypes?.length || 0} items`);
  console.log(`Meal categories: ${mealCategories?.length || 0} items`);

  const requestBody = {
    contents: [
      {
        parts: [
          {text: prompt},
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1, // Low temperature for more consistent outputs
      topK: 32,
      topP: 1,
      maxOutputTokens: 8192, // Erhöht von 2048 für vollständige Rezepte mit Zubereitungsschritten
      responseMimeType: 'application/json',
      responseSchema: RECIPE_EXTRACTION_RESPONSE_SCHEMA,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini API error:', errorData);
      const errorMessage = errorData.error?.message || response.statusText;
      if (response.status === 429) {
        throw new HttpsError(
          'resource-exhausted',
          'Die KI-API ist momentan ausgelastet. Bitte versuche es in einigen Minuten erneut oder nutze Standard-OCR.'
        );
      } else if (response.status === 503 || response.status === 502) {
        throw new HttpsError('unavailable', `Gemini API error: ${errorMessage}`);
      }
      throw new HttpsError('internal', `Gemini API error: ${errorMessage}`);
    }

    const data = await response.json();

    // Extract the text response
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      throw new HttpsError('internal', 'No response from Gemini API');
    }

    // Parse JSON response (handle markdown code blocks and extra text)
    let jsonText = textResponse.trim();

    // Strip markdown code fences (```json ... ``` or ``` ... ```), handling \n and \r\n
    const codeBlockMatch = jsonText.match(/```(?:json)?\r?\n([\s\S]*?)\r?\n```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    } else if (!jsonText.startsWith('{')) {
      // If the response begins with preamble text, extract the first JSON object
      const jsonObjectMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonObjectMatch) {
        jsonText = jsonObjectMatch[0];
      }
    }

    const recipeData = JSON.parse(jsonText);
    
    // Normalize the data structure based on language
    if (lang === 'de') {
      return {
        title: recipeData.titel || '',
        servings: recipeData.portionen || 0,
        prepTime: recipeData.zubereitungszeit || '',
        cookTime: recipeData.kochzeit || '',
        difficulty: recipeData.schwierigkeit || 0,
        ...cuisineFields(recipeData.kulinarik, cuisineTypes),
        category: recipeData.kategorie || '',
        tags: recipeData.tags || [],
        ingredients: normalizeIngredientUnits(recipeData.zutaten || []),
        steps: recipeData.zubereitung || [],
        notes: recipeData.notizen || '',
        confidence: 95,
        provider: 'gemini',
        rawResponse: textResponse,
      };
    } else {
      return {
        title: recipeData.title || '',
        servings: recipeData.servings || 0,
        prepTime: recipeData.prepTime || '',
        cookTime: recipeData.cookTime || '',
        difficulty: recipeData.difficulty || 0,
        ...cuisineFields(recipeData.cuisine, cuisineTypes),
        category: recipeData.category || '',
        tags: recipeData.tags || [],
        ingredients: normalizeIngredientUnits(recipeData.ingredients || []),
        steps: recipeData.steps || [],
        notes: recipeData.notes || '',
        confidence: 95,
        provider: 'gemini',
        rawResponse: textResponse,
      };
    }
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    console.error('Gemini API call error:', error);

    // Enhance error messages based on error type
    if (error.message.includes('quota')) {
      throw new HttpsError('resource-exhausted', 'API quota exceeded. Please try again later.');
    } else if (error.name === 'AbortError' || error.message.includes('timeout')) {
      throw new HttpsError('deadline-exceeded', 'Request timed out. Please try again.');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' ||
               error.message.includes('fetch') || error.message.includes('network')) {
      throw new HttpsError('unavailable', 'Network error. Please check your connection.');
    } else if (error.message.includes('JSON')) {
      throw new HttpsError(
          'invalid-argument',
          'Failed to parse recipe data. The image might not contain a valid recipe.'
      );
    }

    throw new HttpsError('internal', 'Failed to process image with AI: ' + error.message);
  }
}

/**
 * Call Gemini API with plain text input (no image) to process raw HTML content.
 * Returns the same structured recipe shape as callGeminiAPI.
 *
 * @param {string} rawHtml - Raw HTML string to process
 * @param {string} lang - Language code ('de' or 'en')
 * @param {string} apiKey - Gemini API key
 * @param {string[]|undefined} cuisineTypes - Configured cuisine types
 * @param {string[]|undefined} mealCategories - Configured meal categories
 * @returns {Promise<Object>} Structured recipe data
 */
async function callGeminiTextAPI(rawHtml, lang, apiKey, cuisineTypes, mealCategories) {
  // Load the configured prompt from Firestore (like callGeminiAPI does)
  let prompt = await getRecipeExtractionPrompt();
  ({cuisineTypes, mealCategories} = await resolveImportLists(cuisineTypes, mealCategories));

  // Warn if expected placeholders are missing from the prompt
  if (!prompt.includes('{{CUISINE_TYPES}}')) {
    console.warn('WARNING: {{CUISINE_TYPES}} placeholder was not found in prompt!');
  }

  if (!prompt.includes('{{MEAL_CATEGORIES}}')) {
    console.warn('WARNING: {{MEAL_CATEGORIES}} placeholder was not found in prompt!');
  }

  // Replace placeholders with actual configured lists
  if (Array.isArray(cuisineTypes) && cuisineTypes.length > 0) {
    const cuisineList = cuisineTypes.map((c) => `- ${c}`).join('\n');
    prompt = prompt.replaceAll('{{CUISINE_TYPES}}', cuisineList);
  } else {
    // Fallback to default lists if not provided
    prompt = prompt.replaceAll('{{CUISINE_TYPES}}', '- Italienisch\n- Asiatisch\n- Deutsch\n- Amerikanisch\n- Mediterran\n- Mexikanisch\n- Französisch\n- Japanisch\n- Indisch\n- Griechisch');
  }

  if (Array.isArray(mealCategories) && mealCategories.length > 0) {
    const categoryList = mealCategories.map((c) => `- ${c}`).join('\n');
    prompt = prompt.replaceAll('{{MEAL_CATEGORIES}}', categoryList);
  } else {
    // Fallback to default lists if not provided
    prompt = prompt.replaceAll('{{MEAL_CATEGORIES}}', '- Hauptgericht\n- Dessert\n- Vorspeise\n- Beilage\n- Snack\n- Suppe\n- Salat\n- Getränk');
  }

  console.log(`Using AI prompt for HTML processing with replaced placeholders`);
  console.log(`Cuisine types: ${cuisineTypes?.length || 0} items`);
  console.log(`Meal categories: ${mealCategories?.length || 0} items`);

  // HTML-specific instructions as prefix
  const htmlSpecificInstructions = `Der folgende Inhalt ist unverarbeitetes HTML aus einem Social-Media-Reel oder einer Webseite. Bereinige allen Code und sämtliche HTML-Artefakte und extrahiere das Rezept und die Zutaten. Wenn es nicht auf Deutsch ist, übersetze es auf Deutsch.

`;

  // Combine HTML-specific instructions with the configured prompt and the HTML content
  const fullPrompt = htmlSpecificInstructions + prompt + `\n\nHTML-Inhalt:\n${rawHtml}`;

  const requestBody = {
    contents: [
      {
        parts: [
          {text: fullPrompt},
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      topK: 32,
      topP: 1,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: RECIPE_EXTRACTION_RESPONSE_SCHEMA,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini text API error:', errorData);
      const errorMessage = errorData.error?.message || response.statusText;
      if (response.status === 429) {
        throw new HttpsError(
          'resource-exhausted',
          'Die KI-API ist momentan ausgelastet. Bitte versuche es in einigen Minuten erneut oder nutze Standard-OCR.'
        );
      } else if (response.status === 503 || response.status === 502) {
        throw new HttpsError('unavailable', `Gemini API error: ${errorMessage}`);
      }
      throw new HttpsError('internal', `Gemini API error: ${errorMessage}`);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      throw new HttpsError('internal', 'No response from Gemini API');
    }

    // Parse JSON response (handle markdown code blocks)
    let jsonText = textResponse.trim();
    const codeBlockMatch = jsonText.match(/```(?:json)?\r?\n([\s\S]*?)\r?\n```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    } else if (!jsonText.startsWith('{')) {
      const jsonObjectMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonObjectMatch) {
        jsonText = jsonObjectMatch[0];
      }
    }

    const recipeData = JSON.parse(jsonText);

    return {
      title: recipeData.titel || recipeData.title || '',
      servings: recipeData.portionen || recipeData.servings || 0,
      prepTime: recipeData.zubereitungszeit || recipeData.prepTime || '',
      cookTime: recipeData.kochzeit || recipeData.cookTime || '',
      difficulty: recipeData.schwierigkeit || recipeData.difficulty || 0,
      ...cuisineFields(recipeData.kulinarik || recipeData.cuisine, cuisineTypes),
      category: recipeData.kategorie || recipeData.category || '',
      tags: recipeData.tags || [],
      ingredients: normalizeIngredientUnits(recipeData.zutaten || recipeData.ingredients || []),
      steps: recipeData.zubereitung || recipeData.steps || [],
      notes: recipeData.notizen || recipeData.notes || '',
      confidence: 95,
      provider: 'gemini',
      rawResponse: textResponse,
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    console.error('Gemini text API call error:', error);
    if (error.message.includes('quota')) {
      throw new HttpsError('resource-exhausted', 'API quota exceeded. Please try again later.');
    } else if (error.name === 'AbortError' || error.message.includes('timeout')) {
      throw new HttpsError('deadline-exceeded', 'Request timed out. Please try again.');
    } else if (error.message.includes('JSON')) {
      throw new HttpsError(
          'invalid-argument',
          'Failed to parse recipe data. The HTML might not contain a valid recipe.',
      );
    }
    throw new HttpsError('internal', 'Failed to process HTML with AI: ' + error.message);
  }
}

/**
 * Transcribe spoken text from a video buffer using Gemini.
 * Fail-safe: returns null on errors.
 *
 * @param {Buffer} videoBuffer - Video (or audio-only) data as buffer
 * @param {string} language - Language code ('de' or 'en')
 * @param {string} apiKey - Gemini API key
 * @param {string} [mimeType] - Actual MIME type of videoBuffer, e.g. 'video/mp4'
 *   or 'audio/mp4' for an audio-only upload (see getVideoUploadUrl's
 *   audioOnly option). Must match the real content — Gemini rejects a
 *   video/mp4 declaration for a file with no video frames.
 * @returns {Promise<string|null>} Transcribed text or null
 */
async function transcribeVideoWithGemini(videoBuffer, language, apiKey, mimeType = 'video/mp4') {
  try {
    if (!videoBuffer || !Buffer.isBuffer(videoBuffer) || videoBuffer.length === 0) {
      return null;
    }

    const base64Video = videoBuffer.toString('base64');
    const prompt = language === 'de' ?
      'Transkribiere den gesprochenen Text dieses Videos vollständig. ' +
      'Extrahiere dabei besonders alle Rezeptinformationen wie Zutaten, ' +
      'Mengenangaben und Zubereitungsschritte. ' +
      'Gib nur den transkribierten Text zurück, keine Kommentare.' :
      'Transcribe all spoken text from this video completely. Focus on extracting ' +
      'recipe information like ingredients, amounts, and preparation steps. ' +
      'Return only the transcribed text.';

    const requestBody = {
      contents: [
        {
          parts: [
            {text: prompt},
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Video,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.warn(
          `Gemini video transcription failed with status ${response.status}: ${response.statusText}` +
          (errorBody ? ` - ${errorBody.slice(0, 1000)}` : ''),
      );
      return null;
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (error) {
    console.warn('Gemini video transcription warning:', error.message || error);
    return null;
  }
}

module.exports = {RECIPE_STEP_STYLE_RULE, RECIPE_STEP_BOUNDARY_RULE, DEFAULT_AI_RECIPE_PROMPT, RECIPE_EXTRACTION_RESPONSE_SCHEMA, recipeExtractionPromptCache, recipeExtractionPromptCacheExpiry, getRecipeExtractionPrompt, callGeminiAPI, callGeminiTextAPI, transcribeVideoWithGemini};
