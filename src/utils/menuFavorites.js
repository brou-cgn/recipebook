/**
 * Menu Favorites Utilities
 * Handles user-specific favorite menus storage and management using Firestore
 */

import { db } from '../firebase';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

/**
 * Get favorite menu IDs for a specific user from Firestore
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Promise resolving to array of menu IDs that are favorites for this user
 */
export const getUserMenuFavorites = async (userId) => {
  if (!userId) return [];
  
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      return userDoc.data().favoriteMenus || [];
    }
    return [];
  } catch (error) {
    console.error('Error getting user menu favorites:', error);
    return [];
  }
};

/**
 * Check if a menu is a favorite for a specific user
 * @param {string} userId - User ID
 * @param {string} menuId - Menu ID
 * @returns {Promise<boolean>} Promise resolving to true if the menu is a favorite for this user
 */
export const isMenuFavorite = async (userId, menuId) => {
  if (!userId || !menuId) return false;
  
  const userFavorites = await getUserMenuFavorites(userId);
  return userFavorites.includes(menuId);
};

/**
 * Add a menu to user's favorites in Firestore
 * @param {string} userId - User ID
 * @param {string} menuId - Menu ID
 * @returns {Promise<boolean>} Promise resolving to true if added successfully
 */
export const addMenuFavorite = async (userId, menuId) => {
  if (!userId || !menuId) return false;
  
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      favoriteMenus: arrayUnion(menuId)
    });
    return true;
  } catch (error) {
    console.error('Error adding menu favorite:', error);
    return false;
  }
};

/**
 * Remove a menu from user's favorites in Firestore
 * @param {string} userId - User ID
 * @param {string} menuId - Menu ID
 * @returns {Promise<boolean>} Promise resolving to true if removed successfully
 */
export const removeMenuFavorite = async (userId, menuId) => {
  if (!userId || !menuId) return false;
  
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      favoriteMenus: arrayRemove(menuId)
    });
    return true;
  } catch (error) {
    console.error('Error removing menu favorite:', error);
    return false;
  }
};

/**
 * Toggle a menu's favorite status for a user
 * @param {string} userId - User ID
 * @param {string} menuId - Menu ID
 * @returns {Promise<boolean>} Promise resolving to new favorite status (true if now favorite, false if not)
 */
export const toggleMenuFavorite = async (userId, menuId) => {
  if (!userId || !menuId) return false;
  
  const isFavorite = await isMenuFavorite(userId, menuId);
  
  if (isFavorite) {
    await removeMenuFavorite(userId, menuId);
    return false;
  } else {
    await addMenuFavorite(userId, menuId);
    return true;
  }
};

/**
 * Get all favorite menus for a user from a list of menus
 * @param {string} userId - User ID
 * @param {Array} menus - Array of menu objects
 * @returns {Promise<Array>} Promise resolving to array of favorite menu objects
 */
export const getFavoriteMenus = async (userId, menus) => {
  if (!userId || !menus || !Array.isArray(menus)) return [];
  
  const favoriteIds = await getUserMenuFavorites(userId);
  return menus.filter(menu => favoriteIds.includes(menu.id));
};
