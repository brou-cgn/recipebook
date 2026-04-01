/**
 * Menu Firestore Utilities
 * Handles menu data storage and real-time sync with Firestore
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
  where,
  deleteField
} from 'firebase/firestore';
import { removeUndefinedFields } from './firestoreUtils';

/**
 * Validate that gridImage is a Firebase Storage URL, not a Base64 data-URL.
 * Base64 strings must never be persisted to Firestore to avoid document size limits.
 *
 * @param {string|null|undefined} gridImage - The gridImage value to validate
 * @returns {boolean} True if valid (Storage URL or empty), false if invalid (Base64 or unknown)
 */
export function isValidGridImage(gridImage) {
  if (!gridImage) return true; // null/undefined/empty is OK

  // Reject Base64 data-URLs
  if (gridImage.startsWith('data:image/')) {
    console.error('[menuFirestore] gridImage is a Base64 string - refusing to save to Firestore');
    return false;
  }

  // Accept Firebase Storage URLs
  if (gridImage.startsWith('https://firebasestorage.googleapis.com/')) {
    return true;
  }

  console.warn('[menuFirestore] gridImage has an unexpected format:', gridImage.substring(0, 100));
  return false;
}

/**
 * Sanitize menu data before writing to Firestore.
 * Clears any gridImage that is not a Firebase Storage URL.
 *
 * @param {Object} menuData - Raw menu data
 * @returns {Object} Sanitized menu data safe to persist
 */
function sanitizeMenuData(menuData) {
  if (!isValidGridImage(menuData.gridImage)) {
    console.error('[menuFirestore] Invalid gridImage detected - setting to null before save');
    return { ...menuData, gridImage: null };
  }
  return menuData;
}

/**
 * Set up real-time listener for menus
 * Filters private menus: only the author and admins can see private menus.
 * @param {string} userId - Current user ID
 * @param {boolean} isAdmin - Whether current user is an admin
 * @param {Function} callback - Callback function that receives menus array
 * @returns {Function} Unsubscribe function
 */
export const subscribeToMenus = (userId, isAdmin, callback) => {
  const menusRef = collection(db, 'menus');
  
  return onSnapshot(menusRef, (snapshot) => {
    const menus = [];
    snapshot.forEach((doc) => {
      const menu = {
        id: doc.id,
        ...doc.data()
      };
      // Include menu if it's public OR if it's private and (user is admin OR menu author)
      if (!menu.privat || isAdmin || menu.authorId === userId) {
        menus.push(menu);
      }
    });
    callback(menus);
  }, (error) => {
    console.error('Error subscribing to menus:', error);
    callback([]);
  });
};

/**
 * Get all menus (one-time fetch)
 * @returns {Promise<Array>} Promise resolving to array of menus
 */
export const getMenus = async () => {
  try {
    const menusRef = collection(db, 'menus');
    const snapshot = await getDocs(menusRef);
    const menus = [];
    snapshot.forEach((doc) => {
      menus.push({
        id: doc.id,
        ...doc.data()
      });
    });
    return menus;
  } catch (error) {
    console.error('Error getting menus:', error);
    return [];
  }
};

/**
 * Add a new menu to Firestore
 * @param {Object} menu - Menu object
 * @param {string} authorId - ID of the user creating the menu
 * @returns {Promise<Object>} Promise resolving to the created menu with ID
 */
export const addMenu = async (menu, authorId) => {
  try {
    const menuData = {
      ...sanitizeMenuData(menu),
      authorId,
      privat: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    // Remove undefined fields before sending to Firestore
    const cleanedData = removeUndefinedFields(menuData);
    
    const docRef = await addDoc(collection(db, 'menus'), cleanedData);
    
    return {
      id: docRef.id,
      ...cleanedData
    };
  } catch (error) {
    console.error('Error adding menu:', error);
    throw error;
  }
};

/**
 * Update an existing menu in Firestore
 * @param {string} menuId - ID of the menu to update
 * @param {Object} updates - Object containing fields to update
 * @returns {Promise<void>}
 */
export const updateMenu = async (menuId, updates) => {
  try {
    const menuRef = doc(db, 'menus', menuId);
    const updateData = {
      ...sanitizeMenuData(updates),
      updatedAt: serverTimestamp()
    };
    
    // Remove undefined fields before sending to Firestore
    const cleanedData = removeUndefinedFields(updateData);
    
    await updateDoc(menuRef, cleanedData);
  } catch (error) {
    console.error('Error updating menu:', error);
    throw error;
  }
};

/**
 * Delete a menu from Firestore
 * @param {string} menuId - ID of the menu to delete
 * @returns {Promise<void>}
 */
export const deleteMenu = async (menuId) => {
  try {
    const menuRef = doc(db, 'menus', menuId);
    await deleteDoc(menuRef);
  } catch (error) {
    console.error('Error deleting menu:', error);
    throw error;
  }
};

/**
 * Get a menu by its shareId (public access, no authentication required)
 * @param {string} shareId - The shareId of the menu
 * @returns {Promise<Object|null>} Promise resolving to the menu or null if not found
 */
export const getMenuByShareId = async (shareId) => {
  try {
    const menusRef = collection(db, 'menus');
    const q = query(menusRef, where('shareId', '==', shareId));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const menuDoc = snapshot.docs[0];
    return { id: menuDoc.id, ...menuDoc.data() };
  } catch (error) {
    console.error('Error getting menu by shareId:', error);
    return null;
  }
};

/**
 * Enable sharing for a menu by generating a shareId
 * @param {string} menuId - ID of the menu
 * @returns {Promise<string>} Promise resolving to the generated shareId
 */
export const enableMenuSharing = async (menuId) => {
  const shareId = crypto.randomUUID();
  await updateMenu(menuId, { shareId });
  return shareId;
};

/**
 * Disable sharing for a menu by removing the shareId
 * @param {string} menuId - ID of the menu
 * @returns {Promise<void>}
 */
export const disableMenuSharing = async (menuId) => {
  try {
    const menuRef = doc(db, 'menus', menuId);
    await updateDoc(menuRef, { shareId: deleteField(), updatedAt: serverTimestamp() });
  } catch (error) {
    console.error('Error disabling menu sharing:', error);
    throw error;
  }
};

/**
 * Update the portion count for a specific recipe in a menu
 * @param {string} menuId - ID of the menu
 * @param {string} recipeId - ID of the recipe
 * @param {number} portionCount - Number of portions to store
 * @returns {Promise<void>}
 */
export const updateMenuPortionCount = async (menuId, recipeId, portionCount) => {
  try {
    const menuRef = doc(db, 'menus', menuId);
    await updateDoc(menuRef, {
      [`portionCounts.${recipeId}`]: portionCount,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating menu portion count:', error);
    throw error;
  }
};
