/**
 * Von mehreren Function-Gruppen genutzte Helfer (htmlExtraction; aus index.js, Tech-Check F2).
 */

/**
 * @param {*} type - A JSON-LD `@type` value (string or array of strings).
 * @returns {boolean} True if the type is (or includes) "Recipe".
 */
function isRecipeType(type) {
  return type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
}

/**
 * @param {Object} node - Candidate JSON-LD node.
 * @returns {boolean} True if the node has enough content to be usable.
 */
function hasUsableRecipeContent(node) {
  if (!node) return false;
  const hasIngredients =
    Array.isArray(node.recipeIngredient) && node.recipeIngredient.length > 0;
  const hasInstructions =
    Array.isArray(node.recipeInstructions) && node.recipeInstructions.length > 0;
  return hasIngredients || hasInstructions;
}

/**
 * Extract the first Schema.org Recipe JSON-LD candidate from raw HTML.
 * Node-safe regex alternative to the browser-side findJsonLdRecipeCandidate.
 * Handles both a bare Recipe node and one wrapped in `@graph` and/or nested
 * under a WebPage's `mainEntity` (a common pattern on recipe blogs).
 *
 * @param {string} html
 * @returns {Object|null}
 */
function extractJsonLdRecipeCandidateFromHtml(html) {
  const scriptPattern =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptPattern.exec(html)) !== null) {
    let json;
    try {
      json = JSON.parse(match[1]);
    } catch {
      continue;
    }
    const roots = Array.isArray(json) ? json : [json];
    const candidates = [];
    for (const node of roots) {
      if (node && Array.isArray(node['@graph'])) {
        candidates.push(...node['@graph']);
      } else if (node) {
        candidates.push(node);
      }
    }
    for (const candidate of candidates) {
      const nodesToCheck = [candidate];
      if (candidate && candidate.mainEntity) {
        const mainEntity = candidate.mainEntity;
        nodesToCheck.push(...(Array.isArray(mainEntity) ? mainEntity : [mainEntity]));
      }
      for (const node of nodesToCheck) {
        if (!node || !isRecipeType(node['@type'])) continue;
        if (!hasUsableRecipeContent(node)) continue;
        return node;
      }
    }
  }
  return null;
}

/**
 * Read a Schema.org microdata `itemprop` element's effective value: the
 * `content` attribute when present (used on `<meta>` and often duplicated
 * elsewhere for machine-readable values), the `datetime` attribute for
 * `<time>` elements (e.g. ISO-8601 durations), the `src` for `<img>`, and
 * otherwise the element's trimmed text content.
 *
 * @param {import('cheerio').Cheerio<any>} $el
 * @returns {string}
 */
function microdataPropValue($el) {
  const tagName = ($el.get(0)?.tagName || '').toLowerCase();
  if (tagName === 'meta') return ($el.attr('content') || '').trim();
  if (tagName === 'time') {
    return ($el.attr('datetime') || $el.attr('content') || $el.text()).trim();
  }
  if (tagName === 'img') return ($el.attr('src') || $el.attr('content') || '').trim();
  if ($el.attr('content') !== undefined) return ($el.attr('content') || '').trim();
  return $el.text().trim();
}

/**
 * Find elements with `[itemprop="name"]` inside `$root` that belong directly
 * to it (skipping any that fall inside a nested `[itemscope]`, e.g. an
 * author, rating or nutrition sub-object, so a Recipe's own `name` isn't
 * confused with the `name` of its author or of an ingredient sub-item).
 *
 * @param {import('cheerio').CheerioAPI} $
 * @param {import('cheerio').Cheerio<any>} $root
 * @param {string} propName
 * @returns {import('cheerio').Cheerio<any>[]}
 */
function directItemProps($, $root, propName) {
  const results = [];
  $root.find(`[itemprop="${propName}"]`).each((_, el) => {
    const $el = $(el);
    let belongsToRoot = true;
    $el.parentsUntil($root).each((__, ancestor) => {
      if ($(ancestor).attr('itemscope') !== undefined) belongsToRoot = false;
    });
    if (belongsToRoot) results.push($el);
  });
  return results;
}

/**
 * Extract `recipeInstructions` from a microdata Recipe root, supporting both
 * plain text list items (`<li itemprop="recipeInstructions">…</li>`, common
 * on WordPress recipe plugins) and nested HowToStep items
 * (`<div itemprop="recipeInstructions" itemscope itemtype=".../HowToStep">`).
 *
 * @param {import('cheerio').CheerioAPI} $
 * @param {import('cheerio').Cheerio<any>} $root
 * @returns {string[]}
 */
function extractMicrodataInstructions($, $root) {
  const steps = [];
  for (const $el of directItemProps($, $root, 'recipeInstructions')) {
    if ($el.attr('itemscope') !== undefined) {
      const textEls = directItemProps($, $el, 'text');
      const nameEls = directItemProps($, $el, 'name');
      const text =
        (textEls[0] && microdataPropValue(textEls[0])) ||
        (nameEls[0] && microdataPropValue(nameEls[0])) ||
        $el.text().trim();
      if (text) steps.push(text);
    } else {
      const text = microdataPropValue($el);
      if (text) steps.push(text);
    }
  }
  return steps;
}

/**
 * Extract a Schema.org Recipe candidate from HTML microdata
 * (`itemscope`/`itemtype`/`itemprop` attributes), for sites that mark up
 * recipes without JSON-LD. Returns the same node shape as
 * {@link extractJsonLdRecipeCandidateFromHtml} so it can be fed through the
 * same `jsonLdCandidateToText` conversion and Gemini normalization step.
 *
 * @param {string} html
 * @returns {Object|null}
 */
function extractMicrodataRecipeCandidateFromHtml(html) {
  let $;
  try {
    const cheerio = require('cheerio');
    $ = cheerio.load(html);
  } catch {
    return null;
  }
  const $root = $('[itemscope][itemtype]')
      .filter((_, el) => /schema\.org\/Recipe\/?$/i.test(($(el).attr('itemtype') || '').trim()))
      .first();
  if (!$root.length) return null;

  const propValue = (name) => {
    const els = directItemProps($, $root, name);
    return els[0] ? microdataPropValue(els[0]) : undefined;
  };
  const propValueList = (name) => {
    const list = directItemProps($, $root, name).map(microdataPropValue).filter(Boolean);
    // Return undefined (not []) when absent, matching the JSON-LD candidate
    // shape: jsonLdCandidateToText treats a present-but-empty array as truthy
    // and would otherwise emit a blank "Küche:"/"Kategorie:" line.
    return list.length ? list : undefined;
  };

  const candidate = {
    '@type': 'Recipe',
    name: propValue('name'),
    description: propValue('description'),
    recipeYield: propValue('recipeYield'),
    prepTime: propValue('prepTime'),
    cookTime: propValue('cookTime'),
    totalTime: propValue('totalTime'),
    recipeCuisine: propValueList('recipeCuisine'),
    recipeCategory: propValueList('recipeCategory'),
    recipeIngredient: propValueList('recipeIngredient'),
    recipeInstructions: extractMicrodataInstructions($, $root),
  };
  return hasUsableRecipeContent(candidate) ? candidate : null;
}

/**
 * Convert a Schema.org Recipe JSON-LD object to human-readable text.
 * Server-side equivalent of the browser-side jsonLdToText function.
 *
 * @param {Object} candidate
 * @returns {string}
 */
function jsonLdCandidateToText(candidate) {
  let text = `Rezept: ${candidate.name || ''}\n\n`;
  if (candidate.recipeYield) {
    const yieldVal = Array.isArray(candidate.recipeYield)
      ? candidate.recipeYield[0]
      : candidate.recipeYield;
    text += `Portionen: ${yieldVal}\n`;
  }
  if (candidate.prepTime) text += `Zubereitungszeit: ${candidate.prepTime}\n`;
  if (candidate.cookTime) text += `Kochzeit: ${candidate.cookTime}\n`;
  if (candidate.totalTime) text += `Gesamtzeit: ${candidate.totalTime}\n`;
  if (candidate.recipeCuisine) {
    const cuisine = Array.isArray(candidate.recipeCuisine)
      ? candidate.recipeCuisine.join(', ')
      : candidate.recipeCuisine;
    text += `Küche: ${cuisine}\n`;
  }
  if (candidate.recipeCategory) {
    const category = Array.isArray(candidate.recipeCategory)
      ? candidate.recipeCategory.join(', ')
      : candidate.recipeCategory;
    text += `Kategorie: ${category}\n`;
  }
  text += '\nZutaten:\n';
  for (const ingredient of candidate.recipeIngredient || []) {
    text += `- ${ingredient}\n`;
  }
  text += '\nZubereitung:\n';
  const instructions = Array.isArray(candidate.recipeInstructions)
    ? candidate.recipeInstructions
    : [];
  for (const step of instructions) {
    if (typeof step === 'string') {
      text += `- ${step}\n`;
    } else if (
      step['@type'] === 'HowToSection' &&
      Array.isArray(step.itemListElement)
    ) {
      for (const s of step.itemListElement) {
        const sText =
          s['@type'] === 'HowToStep' ? s.text || s.name || '' : '';
        if (sText) text += `- ${sText}\n`;
      }
    } else {
      const stepText = step.text || step.name || '';
      if (stepText) text += `- ${stepText}\n`;
    }
  }
  if (candidate.description) {
    text += `\nBeschreibung: ${candidate.description}\n`;
  }
  return text;
}

/**
 * Strip HTML tags and decode common entities (Node-safe, no DOMParser).
 * The tag-removal passes run first so that the entity-decoding step only
 * operates on surviving text content and cannot be confused by entity-encoded
 * tag characters.
 *
 * @param {string} html
 * @returns {string} Plain text (max 80,000 chars)
 */
function extractPlainTextFromHtml(html) {
  return html
    // Remove block-level non-content elements including all whitespace before
    // the closing tag to handle variants like </script > or </script\n> (CodeQL js/bad-tag-filter)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg[^>]*>/gi, ' ')
    // Strip remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode a safe, bounded set of HTML entities.
    // Named entities are replaced with a space rather than decoded to the
    // corresponding character so that decoded output can never re-introduce
    // characters that look like HTML markup (avoids double-unescaping).
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d{1,6};/g, ' ')
    .replace(/&[a-zA-Z]{2,32};/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 80000);
}

/**
 * Heuristic check for whether a phase-2/3 (JSON-LD or plain-text) result looks
 * like a genuinely complete recipe, or just a short SEO/social-preview teaser.
 *
 * Many JS-rendered sites (Next.js/React SPAs) only server-render a short
 * summary (title, og:description with a one/two-sentence teaser) in the raw
 * HTML returned by a plain `fetch()`; the full ingredient/step list is only
 * populated client-side after hydration. Gemini can still produce a
 * well-formed-looking recipe object from that teaser text (a title plus 2-3
 * steps), which would otherwise be returned immediately and short-circuit
 * the more thorough (and more expensive) screenshot/vision phase.
 *
 * @param {Object} result - Structured recipe data from callGeminiTextAPI
 * @param {string} sourceText - The text that was sent to Gemini for this phase
 * @returns {boolean} True when the result looks incomplete and the pipeline
 *   should fall through to the next phase instead of returning immediately.
 */
function looksLikeIncompleteRecipe(result, sourceText) {
  const stepsCount = Array.isArray(result?.steps) ? result.steps.length : 0;
  const ingredientsCount = Array.isArray(result?.ingredients) ? result.ingredients.length : 0;
  if (stepsCount === 0 && ingredientsCount === 0) return true;
  // A handful of steps extracted from very little source text is a strong
  // sign the fetched HTML only contained a short teaser, not the full recipe.
  return stepsCount < 4 && (sourceText?.length || 0) < 1200;
}

module.exports = {isRecipeType, hasUsableRecipeContent, extractJsonLdRecipeCandidateFromHtml, microdataPropValue, directItemProps, extractMicrodataInstructions, extractMicrodataRecipeCandidateFromHtml, jsonLdCandidateToText, extractPlainTextFromHtml, looksLikeIncompleteRecipe};
