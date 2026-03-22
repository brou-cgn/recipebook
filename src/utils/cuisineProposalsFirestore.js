/**
 * Cuisine Proposals Firestore Utilities
 * Handles creation, editing, and release of user-proposed cuisine types.
 *
 * Data model: cuisineProposals/{proposalId}
 *   - name:       string  – proposed cuisine type name
 *   - groupName:  string | null – Kulinarikgruppe the type should be assigned to
 *   - released:   boolean – true once the type has been "freigegeben" (approved)
 *   - createdAt:  serverTimestamp
 *   - createdBy:  string – userId of the proposing user
 */

import { db } from '../firebase';
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';

/**
 * Fetch all non-released cuisine proposals, ordered by creation date (newest first).
 * @returns {Promise<Array>} Array of proposal objects (includes Firestore id)
 */
export const getCuisineProposals = async () => {
  try {
    const q = query(
      collection(db, 'cuisineProposals'),
      where('released', '==', false),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Error fetching cuisine proposals:', error);
    return [];
  }
};

/**
 * Add a new cuisine proposal.
 * @param {Object} proposal - Proposal data
 * @param {string} proposal.name - Cuisine type name
 * @param {string|null} proposal.groupName - Kulinarikgruppe name (optional)
 * @param {string} proposal.createdBy - User ID of the creator
 * @returns {Promise<string>} ID of the created document
 */
export const addCuisineProposal = async ({ name, groupName = null, createdBy }) => {
  const docRef = await addDoc(collection(db, 'cuisineProposals'), {
    name: name.trim(),
    groupName: groupName || null,
    released: false,
    createdAt: serverTimestamp(),
    createdBy,
  });
  return docRef.id;
};

/**
 * Update a cuisine proposal (name and/or groupName).
 * @param {string} id - Document ID
 * @param {Object} updates - Fields to update (name, groupName)
 * @returns {Promise<void>}
 */
export const updateCuisineProposal = async (id, updates) => {
  const ref = doc(db, 'cuisineProposals', id);
  await updateDoc(ref, updates);
};

/**
 * Mark a cuisine proposal as released (freigegeben).
 * The caller is responsible for also adding the name to the main cuisineTypes list.
 * @param {string} id - Document ID
 * @returns {Promise<void>}
 */
export const releaseCuisineProposal = async (id) => {
  const ref = doc(db, 'cuisineProposals', id);
  await updateDoc(ref, { released: true });
};
