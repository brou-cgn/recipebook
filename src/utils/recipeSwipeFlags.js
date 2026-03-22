/**
 * Recipe Swipe Flags Firestore Utilities
 * Handles storing swipe-based internal flags for recipes in the Tagesmenü view.
 *
 * Data model: recipeSwipeFlags/{userId}_{listId}_{recipeId}
 *   - userId:    string  – the user who performed the swipe
 *   - listId:    string  – the interactive list the recipe was shown in
 *   - recipeId:  string  – the recipe that was swiped
 *   - flag:      'geparkt' | 'archiv' | 'kandidat'
 *   - expiresAt: Timestamp | null  – null means no expiry (used for 'archiv')
 *   - createdAt: Timestamp
 *
 * Swipe directions:
 *   - Right → 'geparkt'  for 30 days
 *   - Left  → 'archiv'   (no expiry)
 *   - Up    → 'kandidat' for 7 days
 *
 * Flags are internal only and must not be displayed in the UI.
 */

import { db } from '../firebase';
import { doc, setDoc, Timestamp } from 'firebase/firestore';

const GEPARKT_DAYS = 30;
const KANDIDAT_DAYS = 7;

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
 * @returns {Promise<boolean>} true if saved successfully
 */
export const setRecipeSwipeFlag = async (userId, listId, recipeId, flag) => {
  if (!userId || !listId || !recipeId || !flag) return false;
  if (!['geparkt', 'archiv', 'kandidat'].includes(flag)) return false;

  let expiresAt = null;
  if (flag === 'geparkt') {
    expiresAt = timestampInDays(GEPARKT_DAYS);
  } else if (flag === 'kandidat') {
    expiresAt = timestampInDays(KANDIDAT_DAYS);
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
