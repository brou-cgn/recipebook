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
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';

/**
 * Set up real-time listener for menus
 * Filters private menus to only show those created by the current user
 * @param {string} userId - Current user ID (to filter private menus)
 * @param {Function} callback - Callback function that receives menus array
 * @returns {Function} Unsubscribe function
 */
export const subscribeToMenus = (userId, callback) => {
  const menusRef = collection(db, 'menus');
  
  return onSnapshot(menusRef, (snapshot) => {
    const menus = [];
    snapshot.forEach((doc) => {
      const menu = {
        id: doc.id,
        ...doc.data()
      };
      
      // Include menu if it's public or if it's private and belongs to the current user
      if (!menu.isPrivate || menu.authorId === userId) {
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
 * @param {string} userId - Current user ID (to filter private menus)
 * @returns {Promise<Array>} Promise resolving to array of menus
 */
export const getMenus = async (userId) => {
  try {
    const menusRef = collection(db, 'menus');
    const snapshot = await getDocs(menusRef);
    const menus = [];
    snapshot.forEach((doc) => {
      const menu = {
        id: doc.id,
        ...doc.data()
      };
      
      // Include menu if it's public or if it's private and belongs to the current user
      if (!menu.isPrivate || menu.authorId === userId) {
        menus.push(menu);
      }
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
    
    const docRef = await addDoc(collection(db, 'menus'), menuData);
    
    return {
      id: docRef.id,
      ...menuData
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
    await updateDoc(menuRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
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
