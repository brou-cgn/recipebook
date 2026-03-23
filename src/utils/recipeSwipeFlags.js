/**
 * Recipe Swipe Flags Firestore Utilities
 * Handles storing swipe-based internal flags for recipes in the Tagesmenü view.
 *
 * Data model: recipeSwipeFlags/{userId}_{listId}_{recipeId}
 *   - userId:    string  – the user who performed the swipe
 *   - listId:    string  – the interactive list the recipe was shown in
 *   - recipeId:  string  – the recipe that was swiped
 *   - flag:      'geparkt' | 'archiv' | 'kandidat'
 *   - expiresAt: Timestamp | null  – null means no expiry (permanent)
 *   - createdAt: Timestamp
 *
 * Swipe directions:
 *   - Right → 'geparkt'
 *   - Left  → 'archiv'
 *   - Up    → 'kandidat'
 *
 * Flags are internal only and must not be displayed in the UI.
 */

import { db } from '../firebase';
import { doc, setDoc, getDocs, collection, query, where, Timestamp } from 'firebase/firestore';

/**
 * Build a deterministic Firestore document ID for a flag.
 * Using a composite key ensures at most one flag per user+list+recipe combination.
 * @param {string} userId
 * @param {string} listId
 * @param {string} recipeId
 * @returns {string}
 */
const buildFlagId = (userId, listId, recipeId) =>
  `${userId}_${listId}_${recipeId}`;

/**
 * Add `days` days to the current moment and return a Firestore Timestamp.
 * @param {number} days
 * @returns {Timestamp}
 */
const timestampInDays = (days) => {
  const ms = Date.now() + days * 24 * 60 * 60 * 1000;
  return Timestamp.fromMillis(ms);
};

/**
 * Record a swipe action for a recipe.
 * Overwrites any existing flag for the same user+list+recipe combination.
 *
 * @param {string} userId   - ID of the current user
 * @param {string} listId   - ID of the interactive list
 * @param {string} recipeId - ID of the recipe that was swiped
 * @param {'geparkt'|'archiv'|'kandidat'} flag - The flag to set
 * @param {number|null} [validityDays] - Number of days until the flag expires, or null/undefined for permanent
 * @returns {Promise<boolean>} true if saved successfully
 */
export const setRecipeSwipeFlag = async (userId, listId, recipeId, flag, validityDays) => {
  if (!userId || !listId || !recipeId || !flag) return false;
  if (!['geparkt', 'archiv', 'kandidat'].includes(flag)) return false;

  let expiresAt = null;
  if (validityDays != null && Number.isFinite(validityDays) && validityDays > 0) {
    expiresAt = timestampInDays(validityDays);
  }

  try {
    const flagId = buildFlagId(userId, listId, recipeId);
    await setDoc(doc(db, 'recipeSwipeFlags', flagId), {
      userId,
      listId,
      recipeId,
      flag,
      expiresAt,
      createdAt: Timestamp.now(),
    });
    return true;
  } catch (error) {
    console.error('Error setting recipe swipe flag:', error);
    return false;
  }
};

/**
 * Load all active (non-expired) swipe flags for a given user and list.
 * A flag is active if expiresAt is null (permanent) or expiresAt is in the future.
 *
 * @param {string} userId  - ID of the current user
 * @param {string} listId  - ID of the interactive list
 * @returns {Promise<Object>} Map of recipeId → flag for all active flags
 */
export const getActiveSwipeFlags = async (userId, listId) => {
  if (!userId || !listId) return {};
  try {
    const q = query(
      collection(db, 'recipeSwipeFlags'),
      where('userId', '==', userId),
      where('listId', '==', listId)
    );
    const snapshot = await getDocs(q);
    const now = Date.now();
    const activeFlags = {};
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const expired =
        data.expiresAt !== null &&
        data.expiresAt !== undefined &&
        data.expiresAt.toMillis() <= now;
      if (!expired) {
        activeFlags[data.recipeId] = data.flag;
      }
    });
    return activeFlags;
  } catch (error) {
    console.error('Error loading active swipe flags:', error);
    return {};
  }
};
