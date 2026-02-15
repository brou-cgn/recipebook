/**
 * Firestore Utility Functions
 * Shared utilities for working with Firestore
 */

/**
 * Remove undefined fields from an object
 * Firestore does not accept undefined values, so we need to filter them out.
 * 
 * Note: This function only handles shallow objects. If your data contains
 * nested objects with undefined values, consider implementing a recursive version.
 * However, for typical recipe and menu data structures (which use arrays of strings
 * rather than nested objects), this shallow implementation is sufficient.
 * 
 * @param {Object} obj - Object to filter
 * @returns {Object} Object with undefined fields removed
 */
export const removeUndefinedFields = (obj) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => value !== undefined)
  );
};
