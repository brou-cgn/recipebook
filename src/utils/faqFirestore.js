/**
 * FAQ Firestore Utilities
 * Handles FAQ data storage and real-time sync with Firestore
 */

import { db } from '../firebase';
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { removeUndefinedFields } from './firestoreUtils';

/**
 * Set up real-time listener for FAQs ordered by their order field
 * @param {Function} callback - Callback function that receives faqs array
 * @returns {Function} Unsubscribe function
 */
export const subscribeToFaqs = (callback) => {
  const faqsRef = query(collection(db, 'faqs'), orderBy('order', 'asc'));

  return onSnapshot(faqsRef, (snapshot) => {
    const faqs = [];
    snapshot.forEach((doc) => {
      faqs.push({
        id: doc.id,
        ...doc.data()
      });
    });
    callback(faqs);
  }, (error) => {
    console.error('Error subscribing to FAQs:', error);
    callback([]);
  });
};

/**
 * Get all FAQs (one-time fetch)
 * @returns {Promise<Array>} Promise resolving to array of FAQs
 */
export const getFaqs = async () => {
  try {
    const faqsRef = query(collection(db, 'faqs'), orderBy('order', 'asc'));
    const snapshot = await getDocs(faqsRef);
    const faqs = [];
    snapshot.forEach((doc) => {
      faqs.push({
        id: doc.id,
        ...doc.data()
      });
    });
    return faqs;
  } catch (error) {
    console.error('Error getting FAQs:', error);
    return [];
  }
};

/**
 * Add a new FAQ to Firestore
 * @param {Object} faqData - FAQ object { title, description, screenshot, order }
 * @returns {Promise<Object>} Promise resolving to the created FAQ with ID
 */
export const addFaq = async (faqData) => {
  try {
    const data = {
      ...faqData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const cleanedData = removeUndefinedFields(data);
    const docRef = await addDoc(collection(db, 'faqs'), cleanedData);

    return {
      id: docRef.id,
      ...cleanedData
    };
  } catch (error) {
    console.error('Error adding FAQ:', error);
    throw error;
  }
};

/**
 * Update an existing FAQ in Firestore
 * @param {string} faqId - ID of the FAQ to update
 * @param {Object} updates - Object containing fields to update
 * @returns {Promise<void>}
 */
export const updateFaq = async (faqId, updates) => {
  try {
    const faqRef = doc(db, 'faqs', faqId);
    const updateData = {
      ...updates,
      updatedAt: serverTimestamp()
    };

    const cleanedData = removeUndefinedFields(updateData);
    await updateDoc(faqRef, cleanedData);
  } catch (error) {
    console.error('Error updating FAQ:', error);
    throw error;
  }
};

/**
 * Delete a FAQ from Firestore
 * @param {string} faqId - ID of the FAQ to delete
 * @returns {Promise<void>}
 */
export const deleteFaq = async (faqId) => {
  try {
    const faqRef = doc(db, 'faqs', faqId);
    await deleteDoc(faqRef);
  } catch (error) {
    console.error('Error deleting FAQ:', error);
    throw error;
  }
};
