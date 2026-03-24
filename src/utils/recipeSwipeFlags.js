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

/**
 * Load all active (non-expired) swipe flags for all specified members of a list.
 * Used for group status determination across all list members.
 *
 * Uses a single query filtered by listId so that all members' flags are fetched
 * in one round-trip. Requires the Firestore security rule for recipeSwipeFlags to
 * allow list members to read each other's flags (i.e. any authenticated user who
 * is the owner or a member of the list may read all flags for that list).
 *
 * @param {string} listId      - ID of the interactive list
 * @param {string[]} memberIds - Array of user IDs (all list members including owner)
 * @returns {Promise<Object>} Map of userId → { recipeId → flag } for all active flags
 */
export const getAllMembersSwipeFlags = async (listId, memberIds) => {
  if (!listId || !Array.isArray(memberIds) || memberIds.length === 0) return {};
  try {
    const q = query(
      collection(db, 'recipeSwipeFlags'),
      where('listId', '==', listId)
    );
    const snapshot = await getDocs(q);
    const now = Date.now();

    // Initialise every known member with an empty flags map
    const result = Object.fromEntries(memberIds.map((id) => [id, {}]));

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      // Skip documents for users outside the expected member list
      if (!memberIds.includes(data.userId)) return;
      const expired =
        data.expiresAt !== null &&
        data.expiresAt !== undefined &&
        data.expiresAt.toMillis() <= now;
      if (!expired) {
        result[data.userId][data.recipeId] = data.flag;
      }
    });

    return result;
  } catch (error) {
    console.error('Error loading all members swipe flags:', error);
    return {};
  }
};

/**
 * Compute the shared group status for a single recipe based on all list members' swipes.
 *
 * Logic for missing swipes:
 * - Current user (before they swipe): treated as 'archiv'
 * - Other members (after current user has swiped): treated as 'kandidat'
 * - Other members (before current user has swiped): ignored (not counted)
 *
 * @param {string[]} memberIds       - All member user IDs of the list
 * @param {Object}   allMembersFlags - Map of userId → { recipeId → flag }
 * @param {string}   recipeId        - ID of the recipe to evaluate
 * @param {Object}   thresholds      - Threshold configuration:
 *   - groupThresholdKandidatMinKandidat {number} Min % of kandidat votes for Kandidat status
 *   - groupThresholdKandidatMaxArchiv   {number} Max % of archiv votes for Kandidat status
 *   - groupThresholdArchivMinArchiv     {number} Min % of archiv votes for Archiv status
 *   - groupThresholdArchivMaxKandidat   {number} Max % of kandidat votes for Archiv status
 * @param {string}   [currentUserId] - ID of the current user (to distinguish their missing swipe)
 * @returns {'kandidat'|'archiv'|null} Group status, or null if no threshold is met
 */
export function computeGroupRecipeStatus(memberIds, allMembersFlags, recipeId, thresholds, currentUserId) {
  if (!Array.isArray(memberIds) || memberIds.length === 0) return null;

  let kandidatCount = 0;
  let archivCount = 0;

  const currentUserHasSwiped = currentUserId && allMembersFlags[currentUserId]?.[recipeId] !== undefined;

  for (const uid of memberIds) {
    const flag = allMembersFlags[uid]?.[recipeId];

    if (flag !== undefined) {
      if (flag === 'kandidat') kandidatCount++;
      else if (flag === 'archiv') archivCount++;
      // 'geparkt' is ignored (not counted)
    } else {
      if (uid === currentUserId) {
        // Current user hasn't swiped yet → treat as 'archiv'
        archivCount++;
      } else if (currentUserHasSwiped) {
        // Other member hasn't swiped, but current user has → treat as 'kandidat'
        kandidatCount++;
      }
      // else: neither current user nor other member has swiped → ignore
    }
  }

  const total = memberIds.length;
  const kandidatPct = (kandidatCount / total) * 100;
  const archivPct = (archivCount / total) * 100;

  const {
    groupThresholdKandidatMinKandidat = 50,
    groupThresholdKandidatMaxArchiv = 50,
    groupThresholdArchivMinArchiv = 50,
    groupThresholdArchivMaxKandidat = 50,
  } = thresholds || {};

  if (kandidatPct >= groupThresholdKandidatMinKandidat && archivPct <= groupThresholdKandidatMaxArchiv) {
    return 'kandidat';
  }

  if (archivPct >= groupThresholdArchivMinArchiv && kandidatPct <= groupThresholdArchivMaxKandidat) {
    return 'archiv';
  }

  return null;
}
