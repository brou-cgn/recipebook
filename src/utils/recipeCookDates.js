/**
 * Recipe Cook Dates Utilities
 * Handles storing and retrieving the dates when users cooked specific recipes.
 *
 * Data model: stored in cookDates/{cookDateId} global Firestore collection
 *   userId: string (who cooked)
 *   recipeId: string (which recipe)
 *   date: timestamp (when cooked)
 *   createdAt: timestamp (when recorded)
 */

import { db } from '../firebase';
import { collection, addDoc, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';

/**
 * Set the cook date for a recipe for a user.
 * Stores a new document in the global cookDates collection.
 * @param {string} userId - User ID
 * @param {string} recipeId - Recipe ID
 * @param {Date} date - The date to record
 * @returns {Promise<boolean>} true if saved successfully
 */
export const setCookDate = async (userId, recipeId, date) => {
  if (!userId || !recipeId || !date) return false;
  try {
    await addDoc(collection(db, 'cookDates'), {
      userId,
      recipeId,
      date: Timestamp.fromDate(date instanceof Date ? date : new Date(date)),
      createdAt: Timestamp.now(),
    });
    return true;
  } catch (error) {
    console.error('Error setting cook date:', error);
    return false;
  }
};

/**
 * Get all cook dates for a specific recipe across all users.
 * @param {string} recipeId - Recipe ID
 * @returns {Promise<Array<{id: string, userId: string, recipeId: string, date: Date, createdAt: Date}>>}
 */
export const getAllCookDates = async (recipeId) => {
  if (!recipeId) return [];
  try {
    const q = query(
      collection(db, 'cookDates'),
      where('recipeId', '==', recipeId),
      orderBy('date', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        userId: data.userId,
        recipeId: data.recipeId,
        date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
      };
    });
  } catch (error) {
    console.error('Error getting all cook dates:', error);
    return [];
  }
};
