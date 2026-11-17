/**
 * App Calls Firestore Utilities
 * Handles logging and retrieval of app session records for auditing purposes.
 *
 * Data model: appCalls/{callId}
 *   - userId: string
 *   - userVorname: string
 *   - userNachname: string
 *   - userEmail: string
 *   - isGuest: boolean  (true for anonymous/guest sessions, false for registered users)
 *   - timestamp: serverTimestamp
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
 * Fetch all app calls, ordered by most recent first
 * @returns {Promise<Array>} Array of app call objects
 */
export const getAppCalls = async () => {
  try {
    const q = query(collection(db, 'appCalls'), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error fetching app calls:', error);
    return [];
  }
};
