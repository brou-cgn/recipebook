/**
 * Recipe Calls Firestore Utilities
 * Handles logging and retrieval of individual recipe view records for auditing purposes.
 *
 * Data model: recipeCalls/{callId}
 *   - recipeId: string
 *   - recipeTitle: string
 *   - userId: string
 *   - userVorname: string
 *   - userNachname: string
 *   - isGuest: boolean  (true for anonymous/guest sessions, false for registered users)
 *   - timestamp: serverTimestamp
 *
 * Tech-Check K2: once a month the Cloud Function monthlyCallLogConsolidation
 * folds every call before the previous month into recipeCallAggregates/{period}_{user}
 * (same fields as appCallAggregates, see appCallsFirestore.js, plus
 * recipeCounts: { [recipeId]: number }) and deletes the raw documents. The trend
 * window (settings/app.trendingDays) always stays raw, so getRecentRecipeCalls
 * keeps counting every call of it.
 */

import { db } from '../firebase';
import {
  collection,
  addDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
  Timestamp
} from 'firebase/firestore';

/**
 * Log a recipe call (recipe view) to Firestore
 * @param {Object} user - User object with id, vorname, nachname, email, isGuest
 * @param {Object} recipe - Recipe object with id, title
 * @returns {Promise<void>}
 */
export const logRecipeCall = async (user, recipe) => {
  if (!user || !user.id || !recipe || !recipe.id) return;
  try {
    await addDoc(collection(db, 'recipeCalls'), {
      recipeId: recipe.id,
      recipeTitle: recipe.title || '',
      userId: user.id,
      userVorname: user.vorname || '',
      userNachname: user.nachname || '',
      // No e-mail here: every member can read recipeCalls (trending), so
      // AppCallsPage shows it to admins from the user profiles instead.
      isGuest: user.isGuest === true,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Error logging recipe call:', error);
  }
};

/**
 * Upper bound for getRecipeCalls (page Küchenbetrieb), see APP_CALLS_LIMIT in
 * appCallsFirestore.js: no time window, because which months are still raw
 * depends on the monthly consolidation.
 */
export const RECIPE_CALLS_LIMIT = 5000;

/** Upper bound for getRecipeCallAggregates: one document per user and month or year. */
export const RECIPE_CALL_AGGREGATES_LIMIT = 2000;

/**
 * Fetch the recipe calls not yet consolidated, newest first, at most RECIPE_CALLS_LIMIT.
 * @returns {Promise<Array>} Array of recipe call objects
 */
export const getRecipeCalls = async () => {
  try {
    const q = query(collection(db, 'recipeCalls'), orderBy('timestamp', 'desc'), limit(RECIPE_CALLS_LIMIT));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error fetching recipe calls:', error);
    return [];
  }
};

/**
 * Fetch the consolidated recipe calls (one entry per user and month or year),
 * newest period first.
 * @returns {Promise<Array>} Array of aggregate objects
 */
export const getRecipeCallAggregates = async () => {
  try {
    const q = query(
      collection(db, 'recipeCallAggregates'),
      orderBy('period', 'desc'),
      limit(RECIPE_CALL_AGGREGATES_LIMIT)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error fetching recipe call aggregates:', error);
    return [];
  }
};

/**
 * Fetch recipe calls from the last N days, ordered by most recent first
 * @param {number} days - Number of days to look back
 * @returns {Promise<Array>} Array of recipe call objects within the time window
 */
export const getRecentRecipeCalls = async (days = 30) => {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const q = query(
      collection(db, 'recipeCalls'),
      where('timestamp', '>=', Timestamp.fromDate(cutoff)),
      orderBy('timestamp', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error fetching recent recipe calls:', error);
    return [];
  }
};
