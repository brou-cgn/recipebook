/**
 * Recipe Cook Dates Utilities
 * Handles storing and retrieving the dates when users cooked specific recipes.
 *
 * Data model: stored in users/{userId} Firestore document
 *   lastCookedDates: { [recipeId]: Timestamp }
 */

import { db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

/**
 * Get the last cooked date for a specific recipe for a user.
 * @param {string} userId - User ID
 * @param {string} recipeId - Recipe ID
 * @returns {Promise<Date|null>} The last cooked date, or null if not set
 */
export const getLastCookDate = async (userId, recipeId) => {
  if (!userId || !recipeId) return null;
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      const data = userDoc.data();
      const dates = data.lastCookedDates || {};
      const ts = dates[recipeId];
      if (!ts) return null;
      return ts.toDate ? ts.toDate() : new Date(ts);
    }
    return null;
  } catch (error) {
    console.error('Error getting last cook date:', error);
    return null;
  }
};

/**
 * Set the cook date for a recipe for a user.
 * @param {string} userId - User ID
 * @param {string} recipeId - Recipe ID
 * @param {Date} date - The date to record
 * @returns {Promise<boolean>} true if saved successfully
 */
export const setCookDate = async (userId, recipeId, date) => {
  if (!userId || !recipeId || !date) return false;
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      [`lastCookedDates.${recipeId}`]: date
    });
    return true;
  } catch (error) {
    console.error('Error setting cook date:', error);
    return false;
  }
};
