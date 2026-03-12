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
      userEmail: user.email || '',
      isGuest: user.isGuest === true,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Error logging recipe call:', error);
  }
};

/**
 * Fetch all recipe calls, ordered by most recent first
 * @returns {Promise<Array>} Array of recipe call objects
 */
export const getRecipeCalls = async () => {
  try {
    const q = query(collection(db, 'recipeCalls'), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error fetching recipe calls:', error);
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
