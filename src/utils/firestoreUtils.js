/**
 * Firestore Utility Functions
 * Shared utilities for working with Firestore
 */

// Only recurse into plain objects/arrays — Firestore sentinels (deleteField(),
// serverTimestamp(), increment(), arrayUnion()/arrayRemove()) and Date/Timestamp
// instances are opaque leaf values and must be passed through untouched, since
// walking their internals would strip the properties that make them work.
const isPlainObject = (value) =>
  value !== null &&
  typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const isThenable = (value) => Boolean(value) && typeof value === 'object' && typeof value.then === 'function';

// Returns `value` unchanged (same reference) when nothing needed filtering, so
// callers that don't hit the bug pay no extra cost and unrelated nested
// objects keep their identity.
const cleanValue = (value) => {
  if (Array.isArray(value)) {
    let changed = false;
    const cleaned = [];
    value.forEach((item) => {
      if (item === undefined) {
        changed = true;
        return;
      }
      if (isThenable(item)) {
        console.warn('Attempted to store a Promise object in Firestore. This has been filtered out.');
        changed = true;
        return;
      }
      const cleanedItem = isPlainObject(item) || Array.isArray(item) ? cleanValue(item) : item;
      if (cleanedItem !== item) changed = true;
      cleaned.push(cleanedItem);
    });
    return changed ? cleaned : value;
  }

  if (isPlainObject(value)) {
    let changed = false;
    const cleaned = {};
    Object.entries(value).forEach(([key, entryValue]) => {
      if (entryValue === undefined) {
        changed = true;
        return;
      }
      if (isThenable(entryValue)) {
        console.warn('Attempted to store a Promise object in Firestore. This has been filtered out.');
        changed = true;
        return;
      }
      const cleanedEntry = isPlainObject(entryValue) || Array.isArray(entryValue) ? cleanValue(entryValue) : entryValue;
      if (cleanedEntry !== entryValue) changed = true;
      cleaned[key] = cleanedEntry;
    });
    return changed ? cleaned : value;
  }

  return value;
};

/**
 * Remove undefined fields and Promise objects from an object, recursively —
 * Firestore rejects undefined values and Promise objects anywhere in a
 * document, including inside nested objects and arrays (e.g. an ingredients
 * array of {name, amount} objects where `amount` came back undefined).
 *
 * @param {Object} obj - Object to filter
 * @returns {Object} Object with undefined fields and Promise objects removed, at every depth
 */
export const removeUndefinedFields = (obj) => cleanValue(obj);
