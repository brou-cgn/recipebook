/**
 * Fuzzy Search Utilities
 * Provides fuzzy string matching for search functionality
 */

/**
 * Calculate fuzzy match score for a string against a query
 * Higher scores indicate better matches
 * @param {string} str - String to test
 * @param {string} query - Search query
 * @returns {number} Match score (0 = no match, higher = better match)
 */
export const fuzzyScore = (str, query) => {
  if (!str || !query) return 0;
  
  const strLower = str.toLowerCase();
  const queryLower = query.toLowerCase();
  
  // Exact match gets highest score
  if (strLower === queryLower) return 1000;
  
  // Starts with query gets high score
  if (strLower.startsWith(queryLower)) return 500;
  
  // Contains query gets medium score
  if (strLower.includes(queryLower)) return 300;
  
  // Fuzzy match - check if all characters in query appear in order
  let queryIndex = 0;
  let matchedIndices = [];
  
  for (let i = 0; i < strLower.length && queryIndex < queryLower.length; i++) {
    if (strLower[i] === queryLower[queryIndex]) {
      matchedIndices.push(i);
      queryIndex++;
    }
  }
  
  // If all characters matched in order, calculate score based on density
  if (queryIndex === queryLower.length) {
    const firstMatch = matchedIndices[0];
    const lastMatch = matchedIndices[matchedIndices.length - 1];
    const matchSpan = lastMatch - firstMatch + 1;
    
    // More compact matches score higher
    const densityScore = (queryLower.length / matchSpan) * 100;
    
    // Earlier matches score higher
    const positionBonus = firstMatch === 0 ? 50 : Math.max(0, 20 - firstMatch);
    
    return densityScore + positionBonus;
  }
  
  return 0;
};

/**
 * Filter and sort array of items by fuzzy matching
 * @param {Array} items - Array of items to filter
 * @param {string} query - Search query
 * @param {Function} getSearchString - Function to extract search string from item
 * @returns {Array} Filtered and sorted items
 */
export const fuzzyFilter = (items, query, getSearchString) => {
  if (!query || !query.trim()) return items;
  
  const queryTrimmed = query.trim();
  
  // Calculate scores for all items
  const scoredItems = items.map(item => ({
    item,
    score: fuzzyScore(getSearchString(item), queryTrimmed)
  }));
  
  // Filter items with non-zero scores and sort by score (descending)
  return scoredItems
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
};
