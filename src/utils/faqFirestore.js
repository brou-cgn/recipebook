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
 * Import FAQs from parsed Markdown content.
 * Entries with a matching sourceId in existingFaqs are updated; others are created.
 * @param {string} markdownContent - The Markdown string to parse
 * @param {Array} existingFaqs - Currently stored FAQs (used for deduplication by sourceId)
 * @returns {Promise<number>} Total number of entries processed (created + updated)
 */
export const importFaqsFromMarkdown = async (markdownContent, existingFaqs = []) => {
  const lines = markdownContent.split('\n');
  const entries = [];
  let currentTitle = null;
  let currentLevel = 1;
  let currentDescLines = [];
  let currentId = null;

  const flush = () => {
    if (currentTitle) {
      const description = currentDescLines.join('\n').trim();
      entries.push({ title: currentTitle, description, level: currentLevel, sourceId: currentId });
      currentTitle = null;
      currentDescLines = [];
      currentId = null;
    }
  };

  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush();
      currentTitle = line.replace(/^##\s+/, '');
      currentLevel = 0;
      currentId = null;
    } else if (line.startsWith('### ')) {
      flush();
      currentTitle = line.replace(/^###\s+/, '');
      currentLevel = 1;
      currentId = null;
    } else if (currentTitle !== null) {
      if (line.startsWith('#') || line.startsWith('---')) {
        flush();
      } else {
        const idMatch = line.match(/^<!--\s*id:\s*(\S+)\s*-->$/);
        if (idMatch) {
          currentId = idMatch[1];
        } else {
          currentDescLines.push(line);
        }
      }
    }
  }
  flush();

  const currentFaqCount = existingFaqs.length;
  let newEntryIndex = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const existingFaq = entry.sourceId
      ? existingFaqs.find(f => f.sourceId === entry.sourceId)
      : null;

    if (existingFaq) {
      await updateFaq(existingFaq.id, {
        title: entry.title,
        description: entry.description,
        level: entry.level,
        sourceId: entry.sourceId
      });
    } else {
      await addFaq({
        title: entry.title,
        description: entry.description,
        level: entry.level,
        screenshot: null,
        order: currentFaqCount + newEntryIndex,
        ...(entry.sourceId ? { sourceId: entry.sourceId } : {})
      });
      newEntryIndex++;
    }
  }

  return entries.length;
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
