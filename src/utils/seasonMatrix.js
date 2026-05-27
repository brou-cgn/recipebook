/**
 * Saisonmatrix Firestore Utilities
 * Handles season matrix storage and real-time sync with Firestore
 */

import { db } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { removeUndefinedFields } from './firestoreUtils';

/**
 * Subscribe to all season matrix entries in realtime
 * @param {Function} callback - Callback receiving entries array
 * @returns {Function} Unsubscribe function
 */
export const subscribeToSeasonMatrix = (callback) => {
  const seasonMatrixRef = query(collection(db, 'seasonMatrix'), orderBy('name', 'asc'));

  return onSnapshot(seasonMatrixRef, (snapshot) => {
    const entries = [];
    snapshot.forEach((entryDoc) => {
      entries.push({
        id: entryDoc.id,
        ...entryDoc.data()
      });
    });
    callback(entries);
  }, (error) => {
    console.error('Error subscribing to season matrix:', error);
    callback([]);
  });
};

/**
 * Load all season matrix entries once (no real-time subscription).
 * @returns {Promise<Array>} Array of season matrix entry objects
 */
export const getSeasonMatrixOnce = async () => {
  try {
    const seasonMatrixRef = query(collection(db, 'seasonMatrix'), orderBy('name', 'asc'));
    const snapshot = await getDocs(seasonMatrixRef);
    return snapshot.docs.map((entryDoc) => ({
      id: entryDoc.id,
      ...entryDoc.data()
    }));
  } catch (error) {
    console.error('Error loading season matrix:', error);
    return [];
  }
};

/**
 * Add a new season matrix entry
 * Document ID equals entry.id
 * @param {Object} entry - season matrix entry
 * @param {string} updatedBy - optional user name / email
 * @returns {Promise<Object>} Created entry data
 */
export const addSeasonMatrixEntry = async (entry, updatedBy) => {
  if (!entry?.id) {
    throw new Error('Season matrix entry id is required');
  }

  try {
    const entryRef = doc(db, 'seasonMatrix', entry.id);
    const data = {
      ...entry,
      updatedAt: serverTimestamp(),
      updatedBy: updatedBy ?? entry.updatedBy
    };
    const cleanedData = removeUndefinedFields(data);
    await setDoc(entryRef, cleanedData);

    return {
      id: entry.id,
      ...cleanedData
    };
  } catch (error) {
    console.error('Error adding season matrix entry:', error);
    throw error;
  }
};

/**
 * Update an existing season matrix entry
 * @param {string} id - document id
 * @param {Object} data - fields to update
 * @param {string} updatedBy - optional user name / email
 * @returns {Promise<void>}
 */
export const updateSeasonMatrixEntry = async (id, data, updatedBy) => {
  try {
    const entryRef = doc(db, 'seasonMatrix', id);
    const updateData = {
      ...data,
      updatedAt: serverTimestamp(),
      updatedBy: updatedBy ?? data?.updatedBy
    };
    const cleanedData = removeUndefinedFields(updateData);
    await updateDoc(entryRef, cleanedData);
  } catch (error) {
    console.error('Error updating season matrix entry:', error);
    throw error;
  }
};

/**
 * Delete a season matrix entry
 * @param {string} id - document id
 * @returns {Promise<void>}
 */
export const deleteSeasonMatrixEntry = async (id) => {
  try {
    const entryRef = doc(db, 'seasonMatrix', id);
    await deleteDoc(entryRef);
  } catch (error) {
    console.error('Error deleting season matrix entry:', error);
    throw error;
  }
};

/**
 * Season status label constants for the computed `currentSeasonStatus` field.
 */
export const CURRENT_SEASON_STATUS = {
  HAUPTSAISON: 'Hauptsaison',
  NEBENSAISON: 'Nebensaison',
  BALD_SAISON: 'Bald_Saison',
  KEINE_SAISON: 'Keine_Saison',
};

/**
 * Computes the current season status for a season matrix entry based on the given date.
 *
 * Priority order:
 * 1. Hauptsaison – if the current month is in mainSeasonMonths
 * 2. Nebensaison – if the current month is in secondarySeasonMonths
 * 3. Bald_Saison – if a main-season month begins within the next 7 days
 * 4. Keine_Saison – otherwise
 *
 * @param {Object} entry - Season matrix entry with mainSeasonMonths and secondarySeasonMonths
 * @param {Date} [date] - Reference date (defaults to today)
 * @returns {string} One of CURRENT_SEASON_STATUS values
 */
export function computeCurrentSeasonStatus(entry, date = new Date()) {
  const mainMonths = Array.isArray(entry.mainSeasonMonths) ? entry.mainSeasonMonths : [];
  const secondaryMonths = Array.isArray(entry.secondarySeasonMonths) ? entry.secondarySeasonMonths : [];

  const currentMonth = date.getMonth() + 1; // 1–12

  if (mainMonths.includes(currentMonth)) return CURRENT_SEASON_STATUS.HAUPTSAISON;
  if (secondaryMonths.includes(currentMonth)) return CURRENT_SEASON_STATUS.NEBENSAISON;

  // Check if a main-season month starts within the next 7 days
  for (let i = 1; i <= 7; i++) {
    const futureDate = new Date(date);
    futureDate.setDate(futureDate.getDate() + i);
    const futureMonth = futureDate.getMonth() + 1;
    if (mainMonths.includes(futureMonth)) return CURRENT_SEASON_STATUS.BALD_SAISON;
  }

  return CURRENT_SEASON_STATUS.KEINE_SAISON;
}
