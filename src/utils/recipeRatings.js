/**
 * Recipe Ratings Utilities
 * Handles recipe rating storage and retrieval using Firestore.
 * Ratings are stored as subcollections under each recipe document.
 * Both guests (identified by a localStorage key) and registered users can rate.
 */

import { db } from '../firebase';
import {
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';

/**
 * Get or create a persistent guest rater ID stored in localStorage.
 * @returns {string} Guest ID prefixed with 'guest_'
 */
export const getGuestId = () => {
  let guestId = localStorage.getItem('guestRaterId');
  if (!guestId) {
    guestId = 'guest_' + crypto.randomUUID();
    localStorage.setItem('guestRaterId', guestId);
  }
  return guestId;
};

/**
 * Determine the rater key for the current session.
 * Registered users use their user ID; guests use a generated guest ID.
 * @param {Object|null} currentUser - Current user object or null for guests
 * @returns {string} Rater key
 */
export const getRaterKey = (currentUser) => {
  return currentUser?.id || getGuestId();
};

/**
 * Compute and round a rating average to one decimal place.
 * @param {number} sum   - Sum of all rating values
 * @param {number} count - Number of ratings
 * @returns {number} Rounded average
 */
const computeAvg = (sum, count) => Math.round((sum / count) * 10) / 10;

/**
 * Recompute and store the rating summary (avg, count) on the recipe document.
 * Does NOT update the recipe's updatedAt timestamp to avoid polluting update history.
 * @param {string} recipeId - Recipe ID
 * @returns {Promise<void>}
 */
const updateRatingSummary = async (recipeId) => {
  const ratingsRef = collection(db, 'recipes', recipeId, 'ratings');
  const snapshot = await getDocs(ratingsRef);

  const recipeRef = doc(db, 'recipes', recipeId);
  if (snapshot.empty) {
    await updateDoc(recipeRef, { ratingAvg: null, ratingCount: 0 });
    return;
  }

  let sum = 0;
  snapshot.forEach((d) => {
    sum += d.data().rating;
  });
  const count = snapshot.size;
  const avg = computeAvg(sum, count);

  await updateDoc(recipeRef, { ratingAvg: avg, ratingCount: count });
};

/**
 * Submit or update a rating for a recipe.
 * If the rater has already rated this recipe, the previous rating is replaced.
 * @param {string} recipeId - Recipe ID
 * @param {number} rating - Rating value (1–5)
 * @param {Object|null} currentUser - Current user or null for guest
 * @returns {Promise<void>}
 */
export const rateRecipe = async (recipeId, rating, currentUser, comment = null) => {
  if (!recipeId || !rating || rating < 1 || rating > 5) {
    throw new Error('Invalid rating parameters');
  }

  const raterKey = getRaterKey(currentUser);
  const userType = currentUser?.id ? 'user' : 'guest';

  const ratingRef = doc(db, 'recipes', recipeId, 'ratings', raterKey);
  await setDoc(ratingRef, {
    recipeId,
    rating,
    raterKey,
    userType,
    userId: currentUser?.id || null,
    comment: comment || null,
    updatedAt: serverTimestamp()
  });

  await updateRatingSummary(recipeId);
};

/**
 * Get the current rater's existing rating for a recipe.
 * @param {string} recipeId - Recipe ID
 * @param {Object|null} currentUser - Current user or null for guest
 * @returns {Promise<number|null>} Rating (1–5) or null if not yet rated
 */
export const getUserRating = async (recipeId, currentUser) => {
  if (!recipeId) return null;

  const raterKey = getRaterKey(currentUser);
  const ratingRef = doc(db, 'recipes', recipeId, 'ratings', raterKey);

  try {
    const snap = await getDoc(ratingRef);
    return snap.exists() ? snap.data().rating : null;
  } catch (error) {
    console.error('Error getting user rating:', error);
    return null;
  }
};

/**
 * Get the current rater's existing rating and comment for a recipe.
 * @param {string} recipeId - Recipe ID
 * @param {Object|null} currentUser - Current user or null for guest
 * @returns {Promise<{rating: number|null, comment: string|null}>}
 */
export const getUserRatingData = async (recipeId, currentUser) => {
  if (!recipeId) return { rating: null, comment: null };

  const raterKey = getRaterKey(currentUser);
  const ratingRef = doc(db, 'recipes', recipeId, 'ratings', raterKey);

  try {
    const snap = await getDoc(ratingRef);
    if (!snap.exists()) return { rating: null, comment: null };
    const data = snap.data();
    return { rating: data.rating || null, comment: data.comment || null };
  } catch (error) {
    console.error('Error getting user rating data:', error);
    return { rating: null, comment: null };
  }
};

/**
 * Subscribe to real-time rating summary for a recipe.
 * @param {string} recipeId - Recipe ID
 * @param {Function} callback - Called with { avg: number, count: number }
 * @returns {Function} Unsubscribe function
 */
export const subscribeToRatingSummary = (recipeId, callback) => {
  if (!recipeId) {
    callback({ avg: 0, count: 0 });
    return () => {};
  }

  const ratingsRef = collection(db, 'recipes', recipeId, 'ratings');
  return onSnapshot(
    ratingsRef,
    (snapshot) => {
      if (snapshot.empty) {
        callback({ avg: 0, count: 0 });
        return;
      }
      let sum = 0;
      snapshot.forEach((d) => {
        sum += d.data().rating;
      });
      const count = snapshot.size;
      callback({
        avg: computeAvg(sum, count),
        count
      });
    },
    (error) => {
      console.error('Error subscribing to ratings:', error);
      callback({ avg: 0, count: 0 });
    }
  );
};
