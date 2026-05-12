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
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query, where, Timestamp } from 'firebase/firestore';
import { getGroupStatusThresholds } from './customLists';

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

const expiresAtEqual = (a, b) => {
  if (a === b) return true;
  const aIsNullish = a === null || a === undefined;
  const bIsNullish = b === null || b === undefined;
  if (aIsNullish && bIsNullish) return true;
  if (aIsNullish !== bIsNullish) return false;
  const aMillis = typeof a?.toMillis === 'function' ? a.toMillis() : undefined;
  const bMillis = typeof b?.toMillis === 'function' ? b.toMillis() : undefined;
  const aMillisDefined = aMillis !== null && aMillis !== undefined;
  const bMillisDefined = bMillis !== null && bMillis !== undefined;
  if (aMillisDefined && bMillisDefined) return aMillis === bMillis;
  return false;
};

const isExpiredSwipeFlag = (expiresAt, now) => {
  const expiresAtMillis = typeof expiresAt?.toMillis === 'function' ? expiresAt.toMillis() : undefined;
  return expiresAtMillis !== null && expiresAtMillis !== undefined && expiresAtMillis <= now;
};

const DEFAULT_GROUP_THRESHOLDS = {
  groupThresholdKandidatMinKandidat: 50,
  groupThresholdKandidatMaxArchiv: 50,
  groupThresholdArchivMinArchiv: 50,
  groupThresholdArchivMaxKandidat: 50,
};

const normalizeGroupThresholds = (thresholds) => ({
  ...DEFAULT_GROUP_THRESHOLDS,
  ...(thresholds || {}),
});

/**
 * Compute the calculated (expected) flag for a recipe.
 *
 * For this optimistic projection, open votes are treated as "kandidat".
 * Explicit "kandidat" and "archiv" votes are counted as-is, while explicit
 * "geparkt" votes are ignored for both counters. Threshold checks are then
 * applied in the order kandidat → archiv, otherwise "geparkt" is used as
 * fallback.
 *
 * @param {string[]} memberIds
 * @param {Object} allMembersFlags
 * @param {string} recipeId
 * @param {Object} [thresholds]
 * @returns {'kandidat'|'geparkt'|'archiv'|null}
 */
export function computeCalculatedRecipeSwipeFlag(memberIds, allMembersFlags, recipeId, thresholds) {
  if (!Array.isArray(memberIds) || memberIds.length === 0 || !recipeId) return null;

  let kandidatCount = 0;
  let archivCount = 0;

  for (const uid of memberIds) {
    const flag = allMembersFlags[uid]?.[recipeId];
    if (flag === 'kandidat') {
      kandidatCount++;
    } else if (flag === 'archiv') {
      archivCount++;
    } else if (flag === undefined) {
      // Open swipes are optimistically projected as kandidat.
      kandidatCount++;
    }
  }

  const total = memberIds.length;
  const kandidatPct = (kandidatCount / total) * 100;
  const archivPct = (archivCount / total) * 100;
  const {
    groupThresholdKandidatMinKandidat,
    groupThresholdKandidatMaxArchiv,
    groupThresholdArchivMinArchiv,
    groupThresholdArchivMaxKandidat,
  } = normalizeGroupThresholds(thresholds);

  if (kandidatPct >= groupThresholdKandidatMinKandidat && archivPct <= groupThresholdKandidatMaxArchiv) {
    return 'kandidat';
  }
  if (archivPct >= groupThresholdArchivMinArchiv && kandidatPct <= groupThresholdArchivMaxKandidat) {
    return 'archiv';
  }
  return 'geparkt';
}

const getListMemberIds = async (listId) => {
  if (!listId) return [];
  try {
    const groupSnap = await getDoc(doc(db, 'groups', listId));
    if (!groupSnap.exists()) return [];
    const data = groupSnap.data() || {};
    const memberIds = Array.isArray(data.memberIds) ? data.memberIds : [];
    return data.ownerId
      ? [...new Set([data.ownerId, ...memberIds])]
      : [...new Set(memberIds)];
  } catch {
    return [];
  }
};

/**
 * Recalculate and persist calculatedFlag for all swipe documents of one recipe in one list.
 * Optionally, also synchronize expiresAt for all matching documents.
 *
 * @param {string} listId
 * @param {string} recipeId
 * @param {Object} [thresholds]
 * @param {Timestamp|null} [synchronizedExpiresAt] - When provided, this expiresAt value is written to all docs
 * @returns {Promise<boolean>}
 */
export const recalculateCalculatedFlagForRecipeInList = async (listId, recipeId, thresholds, synchronizedExpiresAt) => {
  if (!listId || !recipeId) return false;

  try {
    const now = Date.now();
    const q = query(
      collection(db, 'recipeSwipeFlags'),
      where('listId', '==', listId),
      where('recipeId', '==', recipeId)
    );
    const snapshot = await getDocs(q);
    const docs = [];
    snapshot.forEach((docSnap) => docs.push(docSnap));
    if (docs.length === 0) return true;

    let memberIds = await getListMemberIds(listId);
    if (memberIds.length === 0) {
      memberIds = [...new Set(docs.map((docSnap) => docSnap.data().userId).filter(Boolean))];
    }
    if (memberIds.length === 0) return false;

    const allMembersFlags = Object.fromEntries(memberIds.map((id) => [id, {}]));
    docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (data?.userId && data?.recipeId && !isExpiredSwipeFlag(data.expiresAt, now)) {
        if (!allMembersFlags[data.userId]) allMembersFlags[data.userId] = {};
        allMembersFlags[data.userId][data.recipeId] = data.flag;
      }
    });

    const calculatedFlag = computeCalculatedRecipeSwipeFlag(memberIds, allMembersFlags, recipeId, thresholds);
    if (!calculatedFlag) return false;

    const shouldSyncExpiresAt = synchronizedExpiresAt !== undefined;
    const updates = docs
      .map((docSnap) => {
        const data = docSnap.data() || {};
        const payload = {};
        if (data.calculatedFlag !== calculatedFlag) {
          payload.calculatedFlag = calculatedFlag;
        }
        if (shouldSyncExpiresAt && !isExpiredSwipeFlag(data.expiresAt, now) && !expiresAtEqual(data.expiresAt, synchronizedExpiresAt)) {
          payload.expiresAt = synchronizedExpiresAt;
        }
        return Object.keys(payload).length > 0
          ? updateDoc(docSnap.ref, payload)
          : null;
      })
      .filter(Boolean);

    await Promise.all(updates);
    return true;
  } catch (error) {
    console.error('Error recalculating calculatedFlag for recipe swipe flags:', error);
    return false;
  }
};

const calculateProjectedCalculatedFlagForPendingSwipe = async (listId, recipeId, userId, flag) => {
  if (!listId || !recipeId || !userId || !flag) return flag;

  const q = query(
    collection(db, 'recipeSwipeFlags'),
    where('listId', '==', listId),
    where('recipeId', '==', recipeId)
  );
  const snapshot = await getDocs(q);
  const docs = [];
  snapshot.forEach((docSnap) => docs.push(docSnap));

  let memberIds = await getListMemberIds(listId);
  if (memberIds.length === 0) {
    memberIds = [...new Set([...docs.map((docSnap) => docSnap.data().userId).filter(Boolean), userId])];
  }
  if (memberIds.length === 0) return flag;

  const allMembersFlags = Object.fromEntries(memberIds.map((id) => [id, {}]));
  docs.forEach((docSnap) => {
    const data = docSnap.data();
    if (data?.userId && data?.recipeId) {
      if (!allMembersFlags[data.userId]) allMembersFlags[data.userId] = {};
      allMembersFlags[data.userId][data.recipeId] = data.flag;
    }
  });
  if (!allMembersFlags[userId]) allMembersFlags[userId] = {};
  allMembersFlags[userId][recipeId] = flag;

  const thresholds = await getGroupStatusThresholds();
  return computeCalculatedRecipeSwipeFlag(memberIds, allMembersFlags, recipeId, thresholds) || flag;
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
    const calculatedFlag = await calculateProjectedCalculatedFlagForPendingSwipe(listId, recipeId, userId, flag);
    const flagId = buildFlagId(userId, listId, recipeId);
    await setDoc(doc(db, 'recipeSwipeFlags', flagId), {
      userId,
      listId,
      recipeId,
      flag,
      calculatedFlag,
      expiresAt,
      createdAt: Timestamp.now(),
    });
    const thresholds = await getGroupStatusThresholds();
    const didRecalculate = await recalculateCalculatedFlagForRecipeInList(listId, recipeId, thresholds, expiresAt);
    if (!didRecalculate) {
      console.error('Failed to recalculate calculatedFlag after setting recipe swipe flag.');
    }
    return true;
  } catch (error) {
    console.error('Error setting recipe swipe flag:', error);
    return false;
  }
};

/**
 * Reconcile all recipe swipe flags after member changes in an interactive list:
 * - delete documents for removed members
 * - recalculate calculatedFlag for all remaining recipes in the list
 *
 * @param {string} listId
 * @param {string[]} [removedMemberIds]
 * @returns {Promise<boolean>}
 */
export const reconcileRecipeSwipeFlagsForMemberChange = async (listId, removedMemberIds = []) => {
  if (!listId) return false;
  try {
    const q = query(
      collection(db, 'recipeSwipeFlags'),
      where('listId', '==', listId)
    );
    const snapshot = await getDocs(q);
    const docs = [];
    snapshot.forEach((docSnap) => docs.push(docSnap));
    if (docs.length === 0) return true;

    const removedMemberIdSet = new Set((Array.isArray(removedMemberIds) ? removedMemberIds : []).filter(Boolean));
    if (removedMemberIdSet.size > 0) {
      const deleteOperations = docs
        .filter((docSnap) => removedMemberIdSet.has(docSnap.data()?.userId))
        .map((docSnap) => deleteDoc(docSnap.ref));
      await Promise.all(deleteOperations);
    }

    const affectedRecipeIds = [...new Set(
      docs
        .filter((docSnap) => !removedMemberIdSet.has(docSnap.data()?.userId))
        .map((docSnap) => docSnap.data()?.recipeId)
        .filter(Boolean)
    )];
    if (affectedRecipeIds.length === 0) return true;

    const thresholds = await getGroupStatusThresholds();
    const recalculationResults = await Promise.all(
      affectedRecipeIds.map((recipeId) => recalculateCalculatedFlagForRecipeInList(listId, recipeId, thresholds))
    );
    return recalculationResults.every(Boolean);
  } catch (error) {
    console.error('Error reconciling recipe swipe flags after member change:', error);
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
 * Load all swipe-flag documents (including expired ones) for a given user and list.
 * Used for swipe-stack prioritization where we need to know whether a document exists
 * and (if expired) how old it is.
 *
 * @param {string} userId
 * @param {string} listId
 * @returns {Promise<Object>} Map of recipeId → { flag, calculatedFlag, expiresAt, expiresAtMillis, isExpired }
 */
export const getSwipeFlagDocsByRecipeForUser = async (userId, listId) => {
  if (!userId || !listId) return {};
  try {
    const q = query(
      collection(db, 'recipeSwipeFlags'),
      where('userId', '==', userId),
      where('listId', '==', listId)
    );
    const snapshot = await getDocs(q);
    const now = Date.now();
    const docsByRecipe = {};

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() || {};
      if (!data.recipeId) return;
      const expiresAtMillis =
        data.expiresAt !== null &&
        data.expiresAt !== undefined &&
        typeof data.expiresAt.toMillis === 'function'
          ? data.expiresAt.toMillis()
          : null;
      docsByRecipe[data.recipeId] = {
        flag: data.flag,
        calculatedFlag: data.calculatedFlag,
        expiresAt: data.expiresAt ?? null,
        expiresAtMillis,
        isExpired: expiresAtMillis !== null && expiresAtMillis <= now,
      };
    });

    return docsByRecipe;
  } catch (error) {
    console.error('Error loading swipe flag documents by recipe for user:', error);
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

/**
 * Remove the expiry date from all swipe flag documents for a given recipe in a list.
 * Called when the group status of a recipe is permanently 'archiv' (all members have voted
 * and the result is 'archiv'), ensuring the recipe stays in the archive indefinitely.
 *
 * @param {string} listId    - ID of the interactive list
 * @param {string} recipeId  - ID of the recipe to permanently archive
 * @returns {Promise<boolean>} true if all updates succeeded
 */
export const clearExpiryForArchivedRecipe = async (listId, recipeId) => {
  if (!listId || !recipeId) return false;
  try {
    const q = query(
      collection(db, 'recipeSwipeFlags'),
      where('listId', '==', listId),
      where('recipeId', '==', recipeId)
    );
    const snapshot = await getDocs(q);
    const updates = [];
    snapshot.forEach((docSnap) => {
      updates.push(updateDoc(docSnap.ref, { expiresAt: null }));
    });
    await Promise.all(updates);
    return true;
  } catch (error) {
    console.error('Error clearing expiry for archived recipe:', error);
    return false;
  }
};

/**
 * Set all swipe flag documents for a specific recipe in a list to "archiv".
 * The expiry is re-written based on validityDays (null = permanent archive).
 *
 * @param {string} listId
 * @param {string} recipeId
 * @param {number|null} [validityDays]
 * @returns {Promise<boolean>} true if all updates succeeded
 */
export const archiveRecipeForAllUsersInList = async (listId, recipeId, validityDays) => {
  if (!listId || !recipeId) return false;

  let expiresAt = null;
  if (validityDays != null && Number.isFinite(validityDays) && validityDays > 0) {
    expiresAt = timestampInDays(validityDays);
  }

  try {
    const q = query(
      collection(db, 'recipeSwipeFlags'),
      where('listId', '==', listId),
      where('recipeId', '==', recipeId)
    );
    const snapshot = await getDocs(q);
    const updates = [];
    snapshot.forEach((docSnap) => {
      updates.push(updateDoc(docSnap.ref, { flag: 'archiv', expiresAt }));
    });
    if (updates.length === 0) return false;
    await Promise.all(updates);
    const thresholds = await getGroupStatusThresholds();
    const didRecalculate = await recalculateCalculatedFlagForRecipeInList(listId, recipeId, thresholds);
    if (!didRecalculate) {
      console.error('Failed to recalculate calculatedFlag after archiving recipe swipe flags.');
    }
    return true;
  } catch (error) {
    console.error('Error archiving recipe swipe flags for all users:', error);
    return false;
  }
};

/**
 * Set all existing swipe flags for one recipe within one list to "geparkt"
 * across all users.
 *
 * @param {string} listId      - ID of the interactive list
 * @param {string} recipeId    - ID of the recipe
 * @param {number|null} [validityDays] - Number of days until expiry, or null/undefined for permanent
 * @returns {Promise<boolean>} true if all updates succeeded
 */
export const parkAllRecipeSwipeFlagsForRecipeInList = async (listId, recipeId, validityDays) => {
  if (!listId || !recipeId) return false;

  let expiresAt = null;
  if (validityDays != null && Number.isFinite(validityDays) && validityDays > 0) {
    expiresAt = timestampInDays(validityDays);
  }

  try {
    const q = query(
      collection(db, 'recipeSwipeFlags'),
      where('listId', '==', listId),
      where('recipeId', '==', recipeId)
    );
    const snapshot = await getDocs(q);
    const updates = [];
    snapshot.forEach((docSnap) => {
      updates.push(updateDoc(docSnap.ref, { flag: 'geparkt', expiresAt }));
    });
    await Promise.all(updates);
    const thresholds = await getGroupStatusThresholds();
    const didRecalculate = await recalculateCalculatedFlagForRecipeInList(listId, recipeId, thresholds);
    if (!didRecalculate) {
      console.error('Failed to recalculate calculatedFlag after parking recipe swipe flags.');
    }
    return true;
  } catch (error) {
    console.error('Error parking all recipe swipe flags for recipe in list:', error);
    return false;
  }
};
