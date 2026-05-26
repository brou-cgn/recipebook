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
import { collection, addDoc, query, where, getDocs, onSnapshot, Timestamp, doc, deleteDoc } from 'firebase/firestore';

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
      where('recipeId', '==', recipeId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          userId: data.userId,
          recipeId: data.recipeId,
          date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
        };
      })
      .sort((a, b) => b.date - a.date);
  } catch (error) {
    console.error('Error getting all cook dates:', error);
    return [];
  }
};

/**
 * Delete a cook date entry by its document ID.
 * @param {string} cookDateId - The Firestore document ID of the cook date to delete
 * @returns {Promise<boolean>} true if deleted successfully
 */
export const deleteCookDate = async (cookDateId) => {
  if (!cookDateId) return false;
  try {
    await deleteDoc(doc(db, 'cookDates', cookDateId));
    return true;
  } catch (error) {
    console.error('Error deleting cook date:', error);
    return false;
  }
};

/**
 * Subscribe to real-time cook date updates for a specific recipe.
 * Uses Firestore onSnapshot for live updates.
 * @param {string} recipeId - Recipe ID
 * @param {Function} callback - Called with the current array of cook date objects whenever data changes
 * @returns {Function} Unsubscribe function to stop listening
 */
export const subscribeCookDates = (recipeId, callback) => {
  if (!recipeId) {
    callback([]);
    return () => {};
  }
  const q = query(collection(db, 'cookDates'), where('recipeId', '==', recipeId));
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const dates = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            userId: data.userId,
            recipeId: data.recipeId,
            date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
          };
        })
        .sort((a, b) => b.date - a.date);
      callback(dates);
    },
    (error) => {
      console.error('Error subscribing to cook dates:', error);
      callback([]);
    }
  );
  return unsubscribe;
};
