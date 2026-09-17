/**
 * Tutorials Firestore Utilities
 * Handles the "tutorials" collection - curated links to videos that explain
 * cooking techniques. Structured like faqFirestore.js: a flat, app-wide
 * collection (not scoped per group), since technique videos are useful to
 * every household using the app, not just the one that added them.
 */

import { db } from '../firebase';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { removeUndefinedFields } from './firestoreUtils';

// Mehrfachfelder am Tutorial werden immer als Array normalisiert: alte
// Dokumente haben die Felder gar nicht, und ein fehlendes Feld soll sich wie
// eine leere Auswahl verhalten, nicht wie `undefined` durch die UI wandern.
const toStringArray = (value) => (
  Array.isArray(value) ? value.filter((entry) => typeof entry === 'string' && entry.trim() !== '') : []
);

export const TUTORIAL_CATEGORIES = [
  { id: 'schneiden', label: 'Schneidetechniken' },
  { id: 'sauce', label: 'Saucen & Fonds' },
  { id: 'teig', label: 'Teig & Backen' },
  { id: 'garen', label: 'Garmethoden' },
  { id: 'anrichten', label: 'Plattieren & Anrichten' }
];

/**
 * Set up a real-time listener for tutorials, newest first.
 * @param {Function} callback - Receives the current tutorials array on every change.
 * @returns {Function} Unsubscribe function.
 */
export const subscribeToTutorials = (callback) => {
  const tutorialsRef = query(collection(db, 'tutorials'), orderBy('createdAt', 'desc'));

  return onSnapshot(tutorialsRef, (snapshot) => {
    const tutorials = [];
    snapshot.forEach((docSnap) => {
      tutorials.push({ id: docSnap.id, ...docSnap.data() });
    });
    callback(tutorials);
  }, (error) => {
    console.error('Error subscribing to tutorials:', error);
    callback([]);
  });
};

/**
 * Add a new tutorial to Firestore.
 * @param {Object} tutorialData - { title, videoUrl, category, ingredientIDs, speisekategorie, createdBy, thumbFrame, thumbZoom, thumbPosX, thumbPosY }
 * @returns {Promise<Object>} The created tutorial, including its Firestore ID.
 */
export const addTutorial = async (tutorialData) => {
  const data = removeUndefinedFields({
    title: tutorialData.title,
    videoUrl: tutorialData.videoUrl,
    category: tutorialData.category,
    ingredientIDs: toStringArray(tutorialData.ingredientIDs),
    speisekategorie: toStringArray(tutorialData.speisekategorie),
    createdBy: tutorialData.createdBy,
    thumbFrame: tutorialData.thumbFrame,
    thumbZoom: tutorialData.thumbZoom,
    thumbPosX: tutorialData.thumbPosX,
    thumbPosY: tutorialData.thumbPosY,
    createdAt: serverTimestamp()
  });

  const docRef = await addDoc(collection(db, 'tutorials'), data);

  return { id: docRef.id, ...data };
};

/**
 * Update an existing tutorial.
 * Only the fields the form owns are written - createdAt/createdBy stay as
 * they were. Crop values are always sent (even as null) so that clearing a
 * crop in the edit form actually removes it from the document instead of
 * leaving the previous value behind; aus demselben Grund gehen die beiden
 * Mehrfachfelder auch als leeres Array raus, wenn alle Pillen abgewählt sind.
 * @param {string} tutorialId - ID of the tutorial to update.
 * @param {Object} tutorialData - { title, videoUrl, category, ingredientIDs, speisekategorie, thumbFrame, thumbZoom, thumbPosX, thumbPosY }
 * @returns {Promise<void>}
 */
export const updateTutorial = async (tutorialId, tutorialData) => {
  const data = {
    title: tutorialData.title,
    videoUrl: tutorialData.videoUrl,
    category: tutorialData.category,
    ingredientIDs: toStringArray(tutorialData.ingredientIDs),
    speisekategorie: toStringArray(tutorialData.speisekategorie),
    thumbFrame: tutorialData.thumbFrame ?? null,
    thumbZoom: tutorialData.thumbZoom ?? null,
    thumbPosX: tutorialData.thumbPosX ?? null,
    thumbPosY: tutorialData.thumbPosY ?? null,
    updatedAt: serverTimestamp()
  };

  await updateDoc(doc(db, 'tutorials', tutorialId), data);
};

/**
 * Delete a tutorial from Firestore.
 * @param {string} tutorialId - ID of the tutorial to delete.
 * @returns {Promise<void>}
 */
export const deleteTutorial = async (tutorialId) => {
  await deleteDoc(doc(db, 'tutorials', tutorialId));
};
