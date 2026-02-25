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
 * Set up real-time listener for menus
 * @param {Function} callback - Callback function that receives menus array
 * @returns {Function} Unsubscribe function
 */
export const subscribeToMenus = (callback) => {
  const menusRef = collection(db, 'menus');
  
  return onSnapshot(menusRef, (snapshot) => {
    const menus = [];
    snapshot.forEach((doc) => {
      menus.push({
        id: doc.id,
        ...doc.data()
      });
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
      ...menu,
      authorId,
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
      ...updates,
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
