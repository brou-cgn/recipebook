/**
 * Background recipe-import job status (Web-Import / Foto-OCR), stored under
 * users/{userId}/importJobs so the header's progress indicator ("Donut")
 * shows the same running/failed jobs in every open session of the owning
 * user, not just the tab that started the import.
 */

import { db } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';

/**
 * Real-time listener for the current user's background import jobs, ordered
 * by creation time.
 * @param {string} userId
 * @param {Function} callback - receives the jobs array
 * @returns {Function} Unsubscribe function
 */
export const subscribeToImportJobs = (userId, callback) => {
  if (!userId) {
    callback([]);
    return () => {};
  }

  const jobsRef = collection(db, 'users', userId, 'importJobs');
  const q = query(jobsRef, orderBy('createdAt', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const jobs = [];
    snapshot.forEach((docSnap) => {
      jobs.push({ id: docSnap.id, ...docSnap.data() });
    });
    callback(jobs);
  }, (error) => {
    console.error('Error subscribing to import jobs:', error);
    callback([]);
  });
};

export const createImportJob = (userId, jobId, label) => {
  return setDoc(doc(db, 'users', userId, 'importJobs', jobId), {
    label: label || 'Rezept-Import',
    status: 'queued',
    progress: 0,
    createdAt: serverTimestamp(),
  });
};

// Uses a merge-set rather than updateDoc so a status/progress patch can't
// race the initial createImportJob() write and fail with "no document to
// update" (both target the same doc; the SDK applies same-doc mutations to
// its local cache in call order, but merge-set is correct either way).
export const updateImportJob = (userId, jobId, patch) => {
  return setDoc(doc(db, 'users', userId, 'importJobs', jobId), patch, { merge: true });
};

export const deleteImportJob = (userId, jobId) => {
  return deleteDoc(doc(db, 'users', userId, 'importJobs', jobId)).catch(() => {});
};
