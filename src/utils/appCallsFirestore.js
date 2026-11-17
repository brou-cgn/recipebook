/**
 * App Calls Firestore Utilities
 * Handles logging and retrieval of app session records for auditing purposes.
 *
 * Data model: appCalls/{callId}
 *   - userId: string
 *   - userVorname: string
 *   - userNachname: string
 *   - isGuest: boolean  (true for anonymous/guest sessions, false for registered users)
 *   - timestamp: serverTimestamp
 *
 * Tech-Check K2: every night the Cloud Function nightlyCallLogConsolidation
 * consolidates and deletes the raw documents (Berlin calendar, guests together
 * under the key 'gaeste'):
 *   - older than 14 days: appCallDays/{YYYY-MM-DD}, one document per day:
 *     day, year, month, count, users: { [userKey]: { userId, isGuest, userVorname,
 *     userNachname, count } }
 *   - days before the previous month: appCallAggregates/{period}_{user}, one
 *     document per user and month, per user and year for earlier calendar years:
 *     period ('2026-10' or '2025'), periodType ('month' | 'year'), year, month
 *     (months only), userId (null for guests), userVorname, userNachname, isGuest,
 *     count, updatedAt
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
 * Upper bound for getRecentAppCalls, a guard against unbounded reads
 * (AGENTS.md: queries with where and limit). A week of sessions stays far
 * below it today; if it is ever reached, the oldest calls of the window are
 * missing from the result.
 */
export const RECENT_APP_CALLS_LIMIT = 2000;

/**
 * Log an app call (session start) to Firestore
 * @param {Object} user - User object with id, vorname, nachname, isGuest
 * @returns {Promise<void>}
 */
export const logAppCall = async (user) => {
  if (!user || !user.id) return;
  try {
    await addDoc(collection(db, 'appCalls'), {
      userId: user.id,
      userVorname: user.vorname || '',
      userNachname: user.nachname || '',
      // No e-mail: AppCallsPage shows it to admins from the user profiles.
      isGuest: user.isGuest === true,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Error logging app call:', error);
  }
};

/**
 * Fetch app calls from the last N days, ordered by most recent first.
 * Tech-Check K2: the Küche only charts one week, so it must not read the
 * whole history (every session adds a document, none is ever deleted).
 * @param {number} days - Number of days to look back
 * @returns {Promise<Array>} Array of app call objects within the time window
 */
export const getRecentAppCalls = async (days = 7) => {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const q = query(
      collection(db, 'appCalls'),
      where('timestamp', '>=', Timestamp.fromDate(cutoff)),
      orderBy('timestamp', 'desc'),
      limit(RECENT_APP_CALLS_LIMIT)
    );
    const snapshot = await getDocs(q);
    if (snapshot.docs.length >= RECENT_APP_CALLS_LIMIT) {
      console.warn(`getRecentAppCalls: limit of ${RECENT_APP_CALLS_LIMIT} reached, older calls of the window are missing`);
    }
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error fetching recent app calls:', error);
    return [];
  }
};

/**
 * Upper bound for getAppCalls (page Küchenbetrieb). The nightly consolidation
 * leaves only the calls of the last 14 days in appCalls. No time window on
 * purpose: which days are still raw depends on the job, a window computed here
 * would hide calls of a day the job has not reached yet. The limit caps the read
 * in case the job stops running.
 */
export const APP_CALLS_LIMIT = 5000;

/** Upper bound for getAppCallDays: more than a year of days. */
export const APP_CALL_DAYS_LIMIT = 400;

/** Upper bound for getAppCallAggregates: one document per user and month or year. */
export const APP_CALL_AGGREGATES_LIMIT = 2000;

/**
 * Fetch the app calls not yet consolidated, newest first, at most APP_CALLS_LIMIT.
 * @returns {Promise<Array>} Array of app call objects
 */
export const getAppCalls = async () => {
  try {
    const q = query(collection(db, 'appCalls'), orderBy('timestamp', 'desc'), limit(APP_CALLS_LIMIT));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error fetching app calls:', error);
    return [];
  }
};

/**
 * Fetch the day documents of consolidated app calls (older than 14 days),
 * newest day first.
 * @returns {Promise<Array>} Array of day objects
 */
export const getAppCallDays = async () => {
  try {
    const q = query(collection(db, 'appCallDays'), orderBy('day', 'desc'), limit(APP_CALL_DAYS_LIMIT));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error fetching app call days:', error);
    return [];
  }
};

/**
 * Fetch the consolidated app calls (one entry per user and month or year),
 * newest period first.
 * @returns {Promise<Array>} Array of aggregate objects
 */
export const getAppCallAggregates = async () => {
  try {
    const q = query(
      collection(db, 'appCallAggregates'),
      orderBy('period', 'desc'),
      limit(APP_CALL_AGGREGATES_LIMIT)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error fetching app call aggregates:', error);
    return [];
  }
};
