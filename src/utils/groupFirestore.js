/**
 * Group Firestore Utilities
 * Handles group data storage and real-time sync with Firestore
 *
 * Data model: groups/{groupId}
 *   - type: "public" | "private"
 *   - ownerId: string
 *   - name: string
 *   - memberIds: string[]
 *   - memberRoles: { [userId]: string }  // placeholder for future role management
 */

import { db } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';
import { removeUndefinedFields } from './firestoreUtils';

export const PUBLIC_GROUP_NAME = 'Öffentlich';

/**
 * Ensure a system-wide "public" group exists. Creates it if missing.
 * @returns {Promise<string>} The ID of the public group
 */
export const ensurePublicGroup = async () => {
  const groupsRef = collection(db, 'groups');
  const q = query(groupsRef, where('type', '==', 'public'));
  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    return snapshot.docs[0].id;
  }

  const docRef = await addDoc(groupsRef, removeUndefinedFields({
    type: 'public',
    name: PUBLIC_GROUP_NAME,
    ownerId: null,
    memberIds: [],
    memberRoles: {},
    createdAt: serverTimestamp()
  }));
  return docRef.id;
};

/**
 * Set up real-time listener for groups the user belongs to (owner or member)
 * Also includes the public group.
 * @param {string} userId - Current user's ID
 * @param {Function} callback - Callback function that receives groups array
 * @returns {Function} Unsubscribe function
 */
export const subscribeToGroups = (userId, callback) => {
  const groupsRef = collection(db, 'groups');
  const q1 = query(groupsRef, where('type', '==', 'public'));
  const q2 = query(groupsRef, where('memberIds', 'array-contains', userId));

  let results1 = null;
  let results2 = null;

  const merge = () => {
    if (results1 === null || results2 === null) return;
    const map = new Map();
    [...results1, ...results2].forEach(g => map.set(g.id, g));
    callback(Array.from(map.values()));
  };

  let errorCalled = false;
  const handleError = (error) => {
    if (errorCalled) return;
    errorCalled = true;
    console.error('Error subscribing to groups:', error);
    callback([]);
  };

  const unsub1 = onSnapshot(q1, (snapshot) => {
    results1 = [];
    snapshot.forEach(docSnap => results1.push({ id: docSnap.id, ...docSnap.data() }));
    merge();
  }, handleError);

  const unsub2 = onSnapshot(q2, (snapshot) => {
    results2 = [];
    snapshot.forEach(docSnap => results2.push({ id: docSnap.id, ...docSnap.data() }));
    merge();
  }, handleError);

  return () => {
    unsub1();
    unsub2();
  };
};

/**
 * Get all groups visible to the user (one-time fetch)
 * @param {string} userId - Current user's ID
 * @returns {Promise<Array>} Promise resolving to array of groups
 */
export const getGroups = async (userId) => {
  try {
    const groupsRef = collection(db, 'groups');
    const q1 = query(groupsRef, where('type', '==', 'public'));
    const q2 = query(groupsRef, where('memberIds', 'array-contains', userId));
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    const map = new Map();
    [snap1, snap2].forEach(snap => {
      snap.forEach(docSnap => {
        map.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
      });
    });
    return Array.from(map.values());
  } catch (error) {
    console.error('Error getting groups:', error);
    return [];
  }
};

/**
 * Add a new private group to Firestore
 * @param {Object} groupData - Group data (name, memberIds, memberRoles)
 * @param {string} ownerId - ID of the user creating the group
 * @returns {Promise<Object>} Promise resolving to the created group with ID
 */
export const addGroup = async (groupData, ownerId) => {
  try {
    const data = removeUndefinedFields({
      type: 'private',
      name: groupData.name,
      ownerId,
      memberIds: Array.isArray(groupData.memberIds) ? [...new Set([ownerId, ...groupData.memberIds])] : [ownerId],
      memberRoles: groupData.memberRoles || {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    const docRef = await addDoc(collection(db, 'groups'), data);
    return { id: docRef.id, ...data };
  } catch (error) {
    console.error('Error adding group:', error);
    throw error;
  }
};

/**
 * Update an existing group in Firestore
 * @param {string} groupId - ID of the group to update
 * @param {Object} updates - Object containing fields to update
 * @returns {Promise<void>}
 */
export const updateGroup = async (groupId, updates) => {
  try {
    const groupRef = doc(db, 'groups', groupId);
    const updateData = removeUndefinedFields({
      ...updates,
      updatedAt: serverTimestamp()
    });
    await updateDoc(groupRef, updateData);
  } catch (error) {
    console.error('Error updating group:', error);
    throw error;
  }
};

/**
 * Delete a group from Firestore
 * @param {string} groupId - ID of the group to delete
 * @returns {Promise<void>}
 */
export const deleteGroup = async (groupId) => {
  try {
    const groupRef = doc(db, 'groups', groupId);
    await deleteDoc(groupRef);
  } catch (error) {
    console.error('Error deleting group:', error);
    throw error;
  }
};

/**
 * Get a single group by ID
 * @param {string} groupId - ID of the group
 * @returns {Promise<Object|null>} Promise resolving to the group or null
 */
export const getGroup = async (groupId) => {
  try {
    const groupRef = doc(db, 'groups', groupId);
    const docSnap = await getDoc(groupRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  } catch (error) {
    console.error('Error getting group:', error);
    return null;
  }
};
