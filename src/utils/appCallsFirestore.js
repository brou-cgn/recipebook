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
  orderBy,
  query,
  serverTimestamp
} from 'firebase/firestore';

/**
 * Log an app call (session start) to Firestore
 * @param {Object} user - User object with id, vorname, nachname, email, isGuest
 * @returns {Promise<void>}
 */
export const logAppCall = async (user) => {
  if (!user || !user.id) return;
  try {
    await addDoc(collection(db, 'appCalls'), {
      userId: user.id,
      userVorname: user.vorname || '',
      userNachname: user.nachname || '',
      userEmail: user.email || '',
      isGuest: user.isGuest === true,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Error logging app call:', error);
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
