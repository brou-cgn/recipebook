/**
 * Getraenke-Gewichtungsmatrizen (Erwachsene + Kinder) Firestore Utilities.
 * Speichert die admin-editierbaren Basiswerte, die functions/drinkRates.js
 * fuer die Event-Getraenkekalkulation laedt (Collections 'drinkWeights' und
 * 'drinkWeightsChildren', Dokument-ID = Kategorie-ID, siehe
 * DEFAULT_DRINK_WEIGHTS / DEFAULT_CHILDREN_DRINK_WEIGHTS fuer die Vorbelegung).
 */
import { db } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { removeUndefinedFields } from './firestoreUtils';

export const DRINK_WEIGHTS_COLLECTION = 'drinkWeights';
export const CHILDREN_DRINK_WEIGHTS_COLLECTION = 'drinkWeightsChildren';

const snapshotToMap = (snapshot) => {
  const entries = {};
  snapshot.forEach((entryDoc) => {
    entries[entryDoc.id] = entryDoc.data();
  });
  return entries;
};

const subscribeToCollection = (collectionName, callback) => {
  return onSnapshot(collection(db, collectionName), (snapshot) => {
    callback(snapshotToMap(snapshot));
  }, (error) => {
    if (error?.code === 'permission-denied') {
      console.warn(`${collectionName} subscription skipped: permission denied`);
    } else {
      console.error(`Error subscribing to ${collectionName}:`, error);
    }
    callback({});
  });
};

const getCollectionOnce = async (collectionName) => {
  try {
    const snapshot = await getDocs(collection(db, collectionName));
    return snapshotToMap(snapshot);
  } catch (error) {
    console.error(`Error loading ${collectionName}:`, error);
    return {};
  }
};

const setCollectionEntry = async (collectionName, categoryId, data, updatedBy) => {
  const entryRef = doc(db, collectionName, categoryId);
  const payload = removeUndefinedFields({
    ...data,
    updatedAt: serverTimestamp(),
    updatedBy: updatedBy ?? data?.updatedBy
  });
  await setDoc(entryRef, payload, { merge: true });
};

/** Subscribe to the adults drink weight matrix in realtime. */
export const subscribeToDrinkWeights = (callback) => subscribeToCollection(DRINK_WEIGHTS_COLLECTION, callback);

/** Subscribe to the children drink weight matrix in realtime. */
export const subscribeToChildrenDrinkWeights = (callback) => subscribeToCollection(CHILDREN_DRINK_WEIGHTS_COLLECTION, callback);

/** Load the adults drink weight matrix once (no realtime subscription). */
export const getDrinkWeightsOnce = () => getCollectionOnce(DRINK_WEIGHTS_COLLECTION);

/** Load the children drink weight matrix once (no realtime subscription). */
export const getChildrenDrinkWeightsOnce = () => getCollectionOnce(CHILDREN_DRINK_WEIGHTS_COLLECTION);

/**
 * Create or update one category entry of the adults drink weight matrix.
 * @param {string} categoryId Category id (document id).
 * @param {Object} data Fields to write (basis, winter, sommer, nachmittag, anteilTrinker).
 * @param {string} [updatedBy] Optional user name / email for the audit field.
 */
export const setDrinkWeightEntry = (categoryId, data, updatedBy) =>
  setCollectionEntry(DRINK_WEIGHTS_COLLECTION, categoryId, data, updatedBy);

/**
 * Create or update one category entry of the children drink weight matrix.
 * @param {string} categoryId Category id (document id).
 * @param {Object} data Fields to write (basis, winter, sommer, nachmittag).
 * @param {string} [updatedBy] Optional user name / email for the audit field.
 */
export const setChildrenDrinkWeightEntry = (categoryId, data, updatedBy) =>
  setCollectionEntry(CHILDREN_DRINK_WEIGHTS_COLLECTION, categoryId, data, updatedBy);
