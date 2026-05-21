/**
 * Recipe Swipe Flags Firestore Utilities
 *
 * Important:
 * setRecipeSwipeFlag persists swipe data.
 */

import { db } from '../firebase';
import { getDocs, collection, query, where, doc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { getStatusValiditySettings } from '../utils/customLists';

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

const resolveMemberIds = (memberIds, fallbackMemberIds = []) => (
  Array.isArray(memberIds) && memberIds.length > 0
    ? memberIds
    : fallbackMemberIds.filter((id) => id !== null && id !== undefined)
);

const computeExpiresAtFromDays = (days) => {
  if (!days) return null;
  return Timestamp.fromDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
};

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

/**
 * Recalculate and persist calculated swipe fields for all swipe docs of one recipe in one list.
 *
 * @param {string} listId
 * @param {string} recipeId
 * @param {string[]} [memberIds]
 * @param {Object} [thresholds]
 * @returns {Promise<void>}
 */
export const updateCalculatedSwipeFlagsForRecipe = async (listId, recipeId, memberIds, thresholds) => {
  if (!listId || !recipeId) return;

  try {
    const q = query(
      collection(db, 'recipeSwipeFlags'),
      where('listID', '==', listId),
      where('recipeID', '==', recipeId)
    );
    const snapshot = await getDocs(q);
    const docs = [];
    const allMembersFlags = {};

    snapshot.forEach((docSnap) => {
      docs.push(docSnap);
      const data = docSnap.data() || {};
      if (!data.userID) return;
      if (!allMembersFlags[data.userID]) allMembersFlags[data.userID] = {};
      allMembersFlags[data.userID][recipeId] = data.flag;
    });

    if (docs.length === 0) return;

    const resolvedMemberIds = resolveMemberIds(
      memberIds,
      docs.map((docSnap) => docSnap.data()?.userID)
    );

    const calculatedFlag = computeCalculatedRecipeSwipeFlag(
      resolvedMemberIds,
      allMembersFlags,
      recipeId,
      thresholds
    );
    if (!calculatedFlag) return;

    const validitySettings = await getStatusValiditySettings();
    let calculatedExpiresAt;
    if (calculatedFlag === 'archiv') {
      calculatedExpiresAt = computeExpiresAtFromDays(validitySettings.statusValidityDaysArchiv);
    } else if (calculatedFlag === 'geparkt') {
      calculatedExpiresAt = computeExpiresAtFromDays(validitySettings.statusValidityDaysGeparkt);
    } else {
      calculatedExpiresAt = computeExpiresAtFromDays(validitySettings.statusValidityDaysKandidat);
    }

    await Promise.all(
      docs.map((docSnap) => updateDoc(docSnap.ref, { calculatedFlag, calculatedExpiresAt }))
    );
  } catch (error) {
    console.error('Error updating calculated swipe flags for recipe:', error);
  }
};

/**
 * Store/update a swipe flag document for a user/list/recipe combination.
 *
 * @param {string} userId
 * @param {string} listId
 * @param {string} recipeId
 * @param {'kandidat'|'geparkt'|'archiv'} flag
 * @param {Object} [metadata]
 * @param {string} [metadata.userName]
 * @param {string} [metadata.recipeTitle]
 * @param {string[]} [metadata.memberIds]
 * @param {Object} [metadata.thresholds]
 * @returns {Promise<boolean>}
 */
export const setRecipeSwipeFlag = async (userId, listId, recipeId, flag, metadata = {}) => {
  if (!userId || !listId || !recipeId || !flag) return false;

  try {
    const validitySettings = await getStatusValiditySettings();

    const {
      userName = '',
      recipeTitle = '',
      memberIds,
      thresholds,
    } = metadata;

    let expiresAt;
    if (flag === 'archiv') {
      expiresAt = computeExpiresAtFromDays(validitySettings.statusValidityDaysArchiv);
    } else if (flag === 'geparkt') {
      expiresAt = computeExpiresAtFromDays(validitySettings.statusValidityDaysGeparkt);
    } else {
      expiresAt = computeExpiresAtFromDays(validitySettings.statusValidityDaysKandidat);
    }

    const flagDocRef = doc(
      db,
      'recipeSwipeFlags',
      `${encodeURIComponent(userId)}_${encodeURIComponent(listId)}_${encodeURIComponent(recipeId)}`
    );
    await setDoc(flagDocRef, {
      userID: userId,
      userName,
      listID: listId,
      recipeID: recipeId,
      recipeTitle,
      flag,
      createdAt: Timestamp.now(),
      expiresAt,
    });

    await updateCalculatedSwipeFlagsForRecipe(
      listId,
      recipeId,
      resolveMemberIds(memberIds, [userId]),
      thresholds
    );

    return true;
  } catch (error) {
    console.error('Error setting recipe swipe flag:', error);
    return false;
  }
};

/**
 * Load all active (non-expired) swipe flags for a given user and list.
 * A flag is active if calculatedExpiresAt is null (permanent) or calculatedExpiresAt is in the future.
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
      where('userID', '==', userId),
      where('listID', '==', listId)
    );
    const snapshot = await getDocs(q);
    const now = Date.now();
    const activeFlags = {};
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const expired =
        data.calculatedExpiresAt !== null &&
        data.calculatedExpiresAt !== undefined &&
        data.calculatedExpiresAt.toMillis() <= now;
      if (!expired) {
        activeFlags[data.recipeID] = data.calculatedFlag;
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
      where('userID', '==', userId),
      where('listID', '==', listId)
    );
    const snapshot = await getDocs(q);
    const now = Date.now();
    const docsByRecipe = {};

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() || {};
      if (!data.recipeID) return;
      const expiresAtMillis = data.expiresAt?.toMillis?.() ?? null;
      docsByRecipe[data.recipeID] = {
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
 * Uses a single query filtered by listID so that all members' flags are fetched
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
      where('listID', '==', listId)
    );
    const snapshot = await getDocs(q);
    const now = Date.now();

    // Initialise every known member with an empty flags map
    const result = Object.fromEntries(memberIds.map((id) => [id, {}]));

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      // Skip documents for users outside the expected member list
      if (!memberIds.includes(data.userID)) return;
      const expired =
        data.calculatedExpiresAt !== null &&
        data.calculatedExpiresAt !== undefined &&
        data.calculatedExpiresAt.toMillis() <= now;
      if (!expired) {
        result[data.userID][data.recipeID] = data.calculatedFlag;
      }
    });

    return result;
  } catch (error) {
    console.error('Error loading all members swipe flags:', error);
    return {};
  }
};

/**
 * Load all swipe flag docs (including expired) with full metadata for all specified members of a list.
 * Used for swipe-stack prioritization where expired flag timestamps are needed.
 *
 * Uses a single query filtered by listID so that all members' docs are fetched in one round-trip.
 *
 * @param {string} listId      - ID of the interactive list
 * @param {string[]} memberIds - Array of user IDs (all list members including owner)
 * @returns {Promise<Object>} Map of userId → { recipeId → { flag, expiresAt, expiresAtMillis, isExpired } }
 */
export const getAllMembersSwipeFlagDocsForList = async (listId, memberIds) => {
  if (!listId || !Array.isArray(memberIds) || memberIds.length === 0) return {};
  try {
    const q = query(
      collection(db, 'recipeSwipeFlags'),
      where('listID', '==', listId)
    );
    const snapshot = await getDocs(q);
    const now = Date.now();

    const result = Object.fromEntries(memberIds.map((id) => [id, {}]));

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!memberIds.includes(data.userID)) return;
      if (!data.recipeID) return;
      const expiresAtMillis = data.calculatedExpiresAt?.toMillis?.() ?? null;
      result[data.userID][data.recipeID] = {
        flag: data.calculatedFlag,
        expiresAt: data.calculatedExpiresAt ?? null,
        expiresAtMillis,
        isExpired: expiresAtMillis !== null && expiresAtMillis <= now,
      };
    });

    return result;
  } catch (error) {
    console.error('Error loading all members swipe flag docs for list:', error);
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
 * @param {Object}   thresholds      - Threshold configuration
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
