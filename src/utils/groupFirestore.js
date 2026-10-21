/**
 * Group Firestore Utilities
 * Handles group data storage and real-time sync with Firestore
 *
 * Data model: groups/{groupId}
 *   - type: "public" | "private"
 *   - ownerId: string
 *   - name: string
 *   - description: string
 *   - memberIds: string[]
 *   - memberRoles: { [userId]: string }  // placeholder for future role management
 *   - listKind: "interactive" | "classic" | null (null for groups created before this attribute was introduced)
 *   - targetListId: string | undefined (only for interactive lists; references the target private list)
 */

import { db, functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
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
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { removeUndefinedFields } from './firestoreUtils';

export const PUBLIC_GROUP_NAME = 'Öffentlich';

/**
 * Available options for the "Art" (kind) attribute of private lists.
 * Used in both list creation and display.
 */
export const LIST_KIND_OPTIONS = [
  { value: 'interactive', label: 'Interaktive Liste' },
  { value: 'classic', label: 'Klassische Sammlung' },
];

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
 * Die drei Abfragen, die zusammen alle für den Nutzer sichtbaren Listen ergeben:
 * die öffentliche, eigene (ownerId) und solche, in denen er Mitglied ist.
 * firestore.rules erlaubt das Lesen von groups nur so (Tech-Check S16): Regeln filtern
 * keine Abfragen, eine ungefilterte Abfrage auf die ganze Collection würde komplett abgewiesen.
 */
const visibleGroupQueries = (userId) => {
  const groupsRef = collection(db, 'groups');
  const queries = [query(groupsRef, where('type', '==', 'public'))];
  if (userId) {
    queries.push(query(groupsRef, where('ownerId', '==', userId)));
    queries.push(query(groupsRef, where('memberIds', 'array-contains', userId)));
  }
  return queries;
};

/**
 * Set up real-time listener for groups the user belongs to (owner or member)
 * Also includes the public group.
 * @param {string} userId - Current user's ID
 * @param {Function} callback - Callback function that receives groups array
 * @returns {Function} Unsubscribe function
 */
export const subscribeToGroups = (userId, callback) => {
  const queries = visibleGroupQueries(userId);
  const results = queries.map(() => null);

  // Erst melden, wenn jede Abfrage einmal geantwortet hat, sonst blitzt eine unvollständige Liste auf.
  const emit = () => {
    if (results.some((r) => r === null)) return;
    const merged = new Map();
    results.forEach((docs) => docs.forEach((g) => merged.set(g.id, g)));
    callback([...merged.values()]);
  };

  const unsubscribes = queries.map((q, index) => onSnapshot(q, (snapshot) => {
    results[index] = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    emit();
  }, (error) => {
    console.error('Error subscribing to groups:', error);
    results[index] = [];
    emit();
  }));

  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
};

/**
 * Get all groups visible to the user (one-time fetch)
 * @param {string} userId - Current user's ID
 * @returns {Promise<Array>} Promise resolving to array of groups
 */
export const getGroups = async (userId) => {
  try {
    const snapshots = await Promise.all(visibleGroupQueries(userId).map((q) => getDocs(q)));
    const merged = new Map();
    snapshots.forEach((snapshot) => snapshot.forEach((docSnap) => {
      merged.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
    }));
    return [...merged.values()];
  } catch (error) {
    console.error('Error getting groups:', error);
    return [];
  }
};

/**
 * Add a new private group to Firestore
 * @param {Object} groupData - Group data (name, description?, memberIds, memberRoles, listKind)
 * @param {string} ownerId - ID of the user creating the group
 * @returns {Promise<Object>} Promise resolving to the created group with ID
 */
export const addGroup = async (groupData, ownerId) => {
  try {
    const data = removeUndefinedFields({
      type: 'private',
      name: groupData.name,
      description: typeof groupData.description === 'string' ? groupData.description.trim() : '',
      ownerId,
      memberIds: Array.isArray(groupData.memberIds) ? [...new Set([ownerId, ...groupData.memberIds])] : [ownerId],
      memberRoles: groupData.memberRoles || {},
      listKind: groupData.listKind || null,
      targetListId: groupData.targetListId || undefined,
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
 * Add a recipe to a group's recipeIds list (persistent assignment)
 * @param {string} groupId - ID of the group
 * @param {string} recipeId - ID of the recipe to add
 * @returns {Promise<void>}
 */
export const addRecipeToGroup = async (groupId, recipeId) => {
  try {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
      recipeIds: arrayUnion(recipeId),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error adding recipe to group:', error);
    throw error;
  }
};

/**
 * Remove a recipe from a group's recipeIds list
 * @param {string} groupId - ID of the group
 * @param {string} recipeId - ID of the recipe to remove
 * @returns {Promise<void>}
 */
export const removeRecipeFromGroup = async (groupId, recipeId) => {
  try {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
      recipeIds: arrayRemove(recipeId),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error removing recipe from group:', error);
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

/**
 * Send an invitation email to a new email address added to a private list.
 * The Cloud Function sends the mail only once per address and only to
 * unregistered addresses, but always answers the same way so the registration
 * status of an address is not revealed. Requires the edit role; limited per day.
 *
 * @param {string} email - The email address to invite
 * @returns {Promise<{success: boolean}>}
 */
export const sendGroupInvitation = async (email) => {
  const sendInvitation = httpsCallable(functions, 'sendGroupInvitationEmail');
  const result = await sendInvitation({ email });
  return result.data;
};
