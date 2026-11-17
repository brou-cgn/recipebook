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
 * Tech-Check K2: every night the Cloud Function nightlyCallLogConsolidation
 * consolidates and deletes the raw documents (same levels as appCalls, see
 * appCallsFirestore.js):
 *   - older than 14 days: recipeCallDays/{YYYY-MM-DD}, one document per day:
 *     day, year, month, count, users: { [userKey]: { userId, isGuest, userVorname,
 *     userNachname, count, recipeCounts: { [recipeId]: number } } }
 *   - days before the previous month: recipeCallAggregates/{period}_{user}, per user
 *     and month or year, with recipeCounts: { [recipeId]: number }
 * Days inside the trend window (settings/app.trendingDays) are never folded into
 * months, so getRecentRecipeViewCounts sees every call of the window. Readers of
 * at most 14 days (Küche, Meine Küchenstars, Startseite) keep using
 * getRecentRecipeCalls, which only reads raw calls.
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
 * appCallsFirestore.js: no time window, because which days are still raw
 * depends on the nightly consolidation.
 */
export const RECIPE_CALLS_LIMIT = 5000;

/** Upper bound for the day documents read at once: more than a year of days. */
export const RECIPE_CALL_DAYS_LIMIT = 400;

/** Upper bound for getRecipeCallAggregates: one document per user and month or year. */
export const RECIPE_CALL_AGGREGATES_LIMIT = 2000;

const TIME_ZONE = 'Europe/Berlin';
const berlinDay = (date) => date.toLocaleDateString('sv-SE', { timeZone: TIME_ZONE });

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
 * Fetch the day documents of consolidated recipe calls (older than 14 days),
 * newest day first.
 * @returns {Promise<Array>} Array of day objects
 */
export const getRecipeCallDays = async () => {
  try {
    const q = query(collection(db, 'recipeCallDays'), orderBy('day', 'desc'), limit(RECIPE_CALL_DAYS_LIMIT));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error fetching recipe call days:', error);
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

const cutoffDaysAgo = (days) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
};

const readRawRecipeCallsSince = async (cutoff) => {
  try {
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

/**
 * Fetch the raw recipe calls of the last N days, ordered by most recent first.
 * Only complete for windows up to 14 days: older calls are consolidated into
 * day documents every night (use getRecentRecipeViewCounts for longer windows).
 * @param {number} days - Number of days to look back
 * @returns {Promise<Array>} Array of recipe call objects within the time window
 */
export const getRecentRecipeCalls = async (days = 30) => readRawRecipeCallsSince(cutoffDaysAgo(days));

/**
 * Views per recipe in the last N days ("Im Trend"): raw calls of the window plus
 * the day documents of its older days. A call is either raw or in a day document,
 * never both. Day documents count whole Berlin days, so the oldest day of the
 * window counts completely. If the day documents cannot be read, only the raw
 * calls count.
 * @param {number} days - Number of days to look back
 * @returns {Promise<Map<string, number>>} recipeId -> number of views
 */
export const getRecentRecipeViewCounts = async (days = 30) => {
  const cutoff = cutoffDaysAgo(days);
  const readDays = async () => {
    try {
      const q = query(
        collection(db, 'recipeCallDays'),
        where('day', '>=', berlinDay(cutoff)),
        orderBy('day', 'desc'),
        limit(RECIPE_CALL_DAYS_LIMIT)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => doc.data());
    } catch (error) {
      console.error('Error fetching recipe call days:', error);
      return [];
    }
  };
  const [calls, dayDocs] = await Promise.all([readRawRecipeCallsSince(cutoff), readDays()]);
  const counts = new Map();
  const add = (recipeId, n) => counts.set(recipeId, (counts.get(recipeId) || 0) + n);
  calls.forEach((call) => {
    if (call.recipeId) add(call.recipeId, 1);
  });
  dayDocs.forEach((dayDoc) => {
    Object.values(dayDoc?.users || {}).forEach((entry) => {
      Object.entries(entry?.recipeCounts || {}).forEach(([recipeId, n]) => {
        if (recipeId && Number.isFinite(n) && n > 0) add(recipeId, n);
      });
    });
  });
  return counts;
};
