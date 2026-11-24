/**
 * applyRecipeVersionChanges: arbeitet eine frei diktierte Beschreibung ("Ich habe
 * statt Butter Olivenöl genommen und 10 Minuten länger gebacken") in ein
 * bestehendes Rezept ein. Wird beim Erstellen einer eigenen Version eines
 * fremden Rezepts genutzt und beim Bearbeiten mit KI im Formular "Rezept
 * bearbeiten" (dort meist als Anweisung: "Ersetze Butter durch Olivenöl");
 * das Ergebnis landet jeweils zur Kontrolle im Rezeptformular.
 */

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {requireAiCaller} = require('../shared/auth');
const {RECIPE_STEP_STYLE_RULE} = require('../shared/gemini');
const {consumeDailyQuota} = require('../shared/rateLimit');
const {geminiApiKey} = require('../shared/secrets');
const {geminiGenerateContentRequest} = require('../shared/geminiConfig');
const {normalisiereSprache} = require('../shared/sprachen');

/** Rolle muss diese Funktion in rolePermissions/{rolle} freigeschaltet haben. */
const VERSION_CHANGES_FEATURE = 'versionDictation';

/** Eigenes Tageslimit (aiVersionLimits), getrennt von Scans und Umformulieren. */
const RATE_LIMITS_VERSION = {
  admin: 1000,
  moderator: 100,
  authenticated: 40,
  guest: 10,
};

const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_ENTRIES = 150;
const MAX_ENTRY_LENGTH = 1500;
const MAX_TITLE_LENGTH = 200;

/**
 * Sprache der Zusammenfassung: die der App beim Aufruf (Mehrsprachigkeit PR 6q). Das Rezept selbst bleibt
 * immer deutsch (Entscheidung „Primärsprache“ in docs/vorhaben/mehrsprachigkeit.md), Regel 9 im Prompt.
 */
const ZUSAMMENFASSUNG_SPRACHE = {de: 'Deutsch', en: 'Englisch', fr: 'Französisch'};

/**
 * @param {string} sprache - de, en oder fr (normalisiereSprache)
 * @return {string} Prompt mit der Sprache der Zusammenfassung
 */
const versionChangesPrompt = (sprache) => `Du bekommst ein Rezept als JSON (titel, portionen, kochdauer, zutaten, schritte) und eine Beschreibung von Änderungen: was jemand bei der Zubereitung anders gemacht hat oder was am Rezept geändert bzw. korrigiert werden soll. Die Beschreibung wurde getippt oder diktiert und kann Füllwörter, Wiederholungen und Erkennungsfehler enthalten.

Arbeite die beschriebenen Änderungen in das Rezept ein und gib das vollständige geänderte Rezept zurück.

REGELN:
1. Ändere NUR, was die Beschreibung ausdrücklich nennt oder zwingend nach sich zieht (z.B. ersetzt eine neue Zutat die alte auch im passenden Zubereitungsschritt). Erfinde keine Zutaten, Mengen, Zeiten oder Temperaturen, die nicht genannt oder daraus ableitbar sind.
2. Alle Einträge, die nicht betroffen sind, bleiben Zeichen für Zeichen unverändert, in derselben Reihenfolge.
3. Jeder Eintrag in "zutaten" und "schritte" hat "typ" und "text". Den "typ" ("ingredient", "step" oder "heading") eines unveränderten Eintrags übernimmst du unverändert; neue Zutaten haben den Typ "ingredient", neue Schritte den Typ "step".
4. Zutaten: Format "Zahl Einheit Zutat" (z.B. "500 g Mehl", "2 Esslöffel Olivenöl"). Verwende "Esslöffel" und "Teelöffel" statt "EL" und "TL", Dezimalzahlen statt Brüchen, metrische Einheiten.
5. Neue oder geänderte Schritte: ${RECIPE_STEP_STYLE_RULE}
6. "portionen" und "kochdauer" (Minuten) nur ändern, wenn die Beschreibung es verlangt, sonst unverändert übernehmen.
7. Beschreibt der Text keine erkennbare Änderung am Rezept, gib das Rezept unverändert zurück und sage das in "zusammenfassung".
8. "zusammenfassung": ein bis drei kurze Sätze auf ${ZUSAMMENFASSUNG_SPRACHE[sprache]}, was du geändert hast. Kein Lob, keine Rückfragen.
9. Das Rezept ist und bleibt deutsch: Schreibe jeden geänderten oder neuen Eintrag und einen geänderten Titel auf Deutsch, auch wenn die Beschreibung auf Englisch, Französisch oder in einer anderen Sprache verfasst ist.

Gib ausschließlich das JSON zurück.`;

const ENTRY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    typ: {type: 'STRING'},
    text: {type: 'STRING'},
  },
  required: ['typ', 'text'],
};

const VERSION_CHANGES_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    titel: {type: 'STRING'},
    portionen: {type: 'INTEGER', nullable: true},
    kochdauer: {type: 'INTEGER', nullable: true},
    zutaten: {type: 'ARRAY', items: ENTRY_SCHEMA},
    schritte: {type: 'ARRAY', items: ENTRY_SCHEMA},
    zusammenfassung: {type: 'STRING'},
  },
  required: ['titel', 'zutaten', 'schritte', 'zusammenfassung'],
};

/**
 * @param {*} list - vom Client geschickte Zutaten- oder Schrittliste
 * @param {string} name - Feldname für Fehlermeldungen
 * @return {Array<{typ: string, text: string}>} geprüfte Liste
 */
function validateEntries(list, name) {
  if (!Array.isArray(list) || list.length > MAX_ENTRIES) {
    throw new HttpsError('invalid-argument', `${name} must be an array with at most ${MAX_ENTRIES} entries`);
  }
  return list.map((entry) => {
    if (!entry || typeof entry.text !== 'string' || entry.text.length > MAX_ENTRY_LENGTH) {
      throw new HttpsError('invalid-argument', `${name} contains an invalid entry`);
    }
    return {typ: typeof entry.typ === 'string' ? entry.typ : 'ingredient', text: entry.text};
  });
}

/**
 * Prüft die Antwort der KI gegen das Schema und baut sie in die Antwortform um.
 * @param {*} parsed - geparstes JSON der KI
 * @return {object} {title, portionen, kochdauer, ingredients, steps, summary}
 */
function normalizeAiResult(parsed) {
  const clean = (list, fallbackType) => {
    if (!Array.isArray(list)) return null;
    return list
        .filter((entry) => entry && typeof entry.text === 'string' && entry.text.trim() !== '')
        .map((entry) => ({
          type: entry.typ === 'heading' ? 'heading' : fallbackType,
          text: entry.text.trim(),
        }));
  };
  const ingredients = clean(parsed?.zutaten, 'ingredient');
  const steps = clean(parsed?.schritte, 'step');
  if (!parsed || typeof parsed.titel !== 'string' || !ingredients || !steps || ingredients.length === 0) {
    throw new HttpsError('internal', 'Die KI hat kein vollständiges Rezept zurückgegeben.');
  }
  return {
    title: parsed.titel.trim(),
    portionen: Number.isInteger(parsed.portionen) ? parsed.portionen : null,
    kochdauer: Number.isInteger(parsed.kochdauer) ? parsed.kochdauer : null,
    ingredients,
    steps,
    summary: typeof parsed.zusammenfassung === 'string' ? parsed.zusammenfassung.trim() : '',
  };
}

/**
 * Cloud Function: Beschreibung der Abwandlung in ein Rezept einarbeiten.
 *
 * Input data:
 * - description: diktierte/getippte Beschreibung der Änderungen
 * - recipe: {title, portionen, kochdauer, ingredients: [{type, text}], steps: [{type, text}]}
 * - sprache (optional): Sprache der App, de/en/fr; nur für die Zusammenfassung, Standard de
 *
 * Nur für Rollen mit Berechtigung `versionDictation` (Funktionen nach Berechtigung).
 */
exports.applyRecipeVersionChanges = onCall(
    {
      secrets: [geminiApiKey],
      maxInstances: 10,
      memory: '256MiB',
      timeoutSeconds: 60,
    },
    async (request) => {
      const auth = request.auth;
      if (!auth) {
        throw new HttpsError('unauthenticated', 'You must be logged in to create a recipe version');
      }

      const {description, recipe, sprache} = request.data || {};
      const trimmedDescription = typeof description === 'string' ? description.trim() : '';
      if (trimmedDescription.length < 3 || trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
        throw new HttpsError(
            'invalid-argument',
            `description must have 3 to ${MAX_DESCRIPTION_LENGTH} characters`,
        );
      }
      if (!recipe || typeof recipe.title !== 'string' || recipe.title.length > MAX_TITLE_LENGTH) {
        throw new HttpsError('invalid-argument', 'recipe.title is required');
      }
      const ingredients = validateEntries(recipe.ingredients, 'ingredients');
      const steps = validateEntries(recipe.steps, 'steps');

      const {userId, isAuthenticated, isAdmin, isModerator} = await requireAiCaller(auth, [VERSION_CHANGES_FEATURE]);

      const limit = isAdmin ? RATE_LIMITS_VERSION.admin
        : isModerator ? RATE_LIMITS_VERSION.moderator
        : isAuthenticated ? RATE_LIMITS_VERSION.authenticated
        : RATE_LIMITS_VERSION.guest;
      const rateLimitResult = await consumeDailyQuota('aiVersionLimits', limit, {userId, isAuthenticated, isAdmin, isModerator});
      if (!rateLimitResult.allowed) {
        throw new HttpsError(
            'resource-exhausted',
            `Tageslimit für Versionsbeschreibungen erreicht (${rateLimitResult.limit}/${rateLimitResult.limit}). Versuche es morgen erneut.`,
        );
      }

      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        console.error('GEMINI_API_KEY secret not configured');
        throw new HttpsError('failed-precondition', 'AI service not configured. Please contact administrator.');
      }

      const recipeInput = {
        titel: recipe.title,
        portionen: Number.isInteger(recipe.portionen) ? recipe.portionen : null,
        kochdauer: Number.isInteger(recipe.kochdauer) ? recipe.kochdauer : null,
        zutaten: ingredients,
        schritte: steps,
      };

      const requestBody = {
        contents: [{
          parts: [{
            text: `${versionChangesPrompt(normalisiereSprache(sprache))}\n\nREZEPT:\n${JSON.stringify(recipeInput)}\n\nBESCHREIBUNG DER ÄNDERUNGEN:\n${trimmedDescription}`,
          }],
        }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: VERSION_CHANGES_RESPONSE_SCHEMA,
        },
      };

      const {url, headers: geminiHeaders} = geminiGenerateContentRequest(apiKey);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: geminiHeaders,
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('Gemini API error (version changes):', errorData);
          const errorMessage = errorData.error?.message || response.statusText;
          if (response.status === 429) {
            throw new HttpsError(
                'resource-exhausted',
                'Die KI-API ist momentan ausgelastet. Bitte versuche es in einigen Minuten erneut.',
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

        return {
          ...normalizeAiResult(JSON.parse(textResponse)),
          remainingRequests: rateLimitResult.remaining,
          dailyLimit: rateLimitResult.limit,
        };
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error(`Version changes failed for user ${userId}:`, error);
        if (error.message?.includes('JSON')) {
          throw new HttpsError('internal', 'Failed to parse AI response.');
        }
        throw new HttpsError('internal', 'Failed to apply version changes: ' + error.message);
      }
    },
);
