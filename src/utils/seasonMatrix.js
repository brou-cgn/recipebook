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
