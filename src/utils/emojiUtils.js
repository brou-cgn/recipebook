// Regex pattern to match emojis
// This pattern matches most common emoji ranges in Unicode
const EMOJI_PATTERN = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]|[\u{FE00}-\u{FE0F}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{23E9}-\u{23FF}]/gu;

/**
 * Utility function to remove emojis from text
 * @param {string} text - The text to remove emojis from
 * @returns {string} - The text without emojis
 */
export function removeEmojis(text) {
  if (!text) return text;
  
  return text.replace(EMOJI_PATTERN, '').trim();
}

/**
 * Check if text contains emojis
 * @param {string} text - The text to check
 * @returns {boolean} - True if text contains emojis
 */
export function containsEmojis(text) {
  if (!text) return false;
  
  return EMOJI_PATTERN.test(text);
}
