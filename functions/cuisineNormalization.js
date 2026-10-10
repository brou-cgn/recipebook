/**
 * Maps the cuisine value(s) an import produces (AI result, JSON-LD
 * recipeCuisine, addRecipeViaAPI body) onto the app's configured cuisine
 * types (settings/app.cuisineTypes).
 *
 * The AI regularly answers "Deutsch" or "Italian" although the list says
 * "Deutsche Küche" / "Italienische Küche" - and every such value used to be
 * stored verbatim, looking like a separate cuisine type that no filter finds.
 * Values that can't be mapped onto a configured type are dropped: the user
 * picks the cuisine in the import review instead of the import inventing one.
 */

// English (and other common) names -> German stem as produced by cuisineKey().
const CUISINE_SYNONYMS = {
  german: 'deutsch',
  italian: 'italienisch',
  french: 'französisch',
  austrian: 'österreichisch',
  swiss: 'schweizer',
  schweiz: 'schweizer',
  schweizerisch: 'schweizer',
  turkish: 'türkisch',
  chinese: 'chinesisch',
  indian: 'indisch',
  japanese: 'japanisch',
  oriental: 'orientalisch',
  thai: 'thailändisch',
  thailand: 'thailändisch',
  mexican: 'mexikanisch',
  american: 'amerikanisch',
  usamerican: 'usamerikanisch',
  greek: 'griechisch',
  spanish: 'spanisch',
  mediterranean: 'mediterran',
  asian: 'asiatisch',
  vegetarian: 'vegetarisch',
  veganisch: 'vegan',
  christmas: 'weihnachtlich',
  weihnachten: 'weihnachtlich',
};

/**
 * Comparison key for a cuisine name: lower case, without "Küche"/"cuisine",
 * without spaces/hyphens, adjective endings reduced to the stem
 * ("Deutsche Küche" -> "deutsch", "US-Amerikanische Küche" -> "usamerikanisch").
 * @param {string} name
 * @return {string}
 */
function cuisineKey(name) {
  let key = String(name || '')
      .toLowerCase()
      .replace(/\b(küche|kueche|cuisine|kitchen|food|art)\b/g, '')
      .replace(/[^a-zäöüß]/g, '');
  key = key.replace(/(sch|lich)(e|en|er|es|em)$/, '$1');
  return CUISINE_SYNONYMS[key] || key;
}

/**
 * Resolve one raw value onto a configured cuisine type, or null.
 * Exact (case-insensitive) or key match wins; otherwise one key may end with
 * the other ("Amerikanisch" -> "US-Amerikanische Küche", "Thai" ->
 * "Thailändische Küche" via synonym) - but only if that is unambiguous.
 * @param {string} raw
 * @param {string[]} cuisineTypes
 * @return {string|null}
 */
function matchCuisineType(raw, cuisineTypes) {
  const value = String(raw || '').trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  const exact = cuisineTypes.find((t) => t.toLowerCase() === lower);
  if (exact) return exact;

  const key = cuisineKey(value);
  if (key.length < 3) return null;
  const keyed = cuisineTypes.find((t) => cuisineKey(t) === key);
  if (keyed) return keyed;

  const partial = cuisineTypes.filter((t) => {
    const typeKey = cuisineKey(t);
    if (typeKey.length < 4 || key.length < 4) return false;
    return typeKey.endsWith(key) || key.endsWith(typeKey);
  });
  return partial.length === 1 ? partial[0] : null;
}

/**
 * Normalize raw cuisine input (string, comma/slash separated string, or
 * array, possibly nested) onto configured cuisine types. Unknown values are
 * dropped, duplicates removed, order kept.
 * @param {string|string[]|null|undefined} raw
 * @param {string[]} cuisineTypes
 * @return {string[]}
 */
function normalizeCuisines(raw, cuisineTypes) {
  if (!Array.isArray(cuisineTypes) || cuisineTypes.length === 0) {
    return [];
  }
  const values = (Array.isArray(raw) ? raw.flat(Infinity) : [raw])
      .filter((v) => v !== null && v !== undefined)
      .flatMap((v) => String(v).split(/[,;/]|\s+und\s+|\s*&\s*/i));
  const result = [];
  values.forEach((v) => {
    const match = matchCuisineType(v, cuisineTypes);
    if (match && !result.includes(match)) result.push(match);
  });
  return result;
}

module.exports = {
  cuisineKey,
  matchCuisineType,
  normalizeCuisines,
};
