/**
 * User Favorites Utilities
 * Handles user-specific favorite recipes storage and management using Firestore
 */

import { db } from '../firebase';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

/**
 * Get favorite recipe IDs for a specific user from Firestore
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Promise resolving to array of recipe IDs that are favorites for this user
 */
export const getUserFavorites = async (userId) => {
  if (!userId) return [];
  
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      return userDoc.data().favoriteRecipes || [];
    }
    return [];
  } catch (error) {
    console.error('Error getting user favorites:', error);
    return [];
  }
};

/**
 * Check if a recipe is a favorite for a specific user
 * Note: This is an async operation, so UI components should manage state appropriately
 * @param {string} userId - User ID
 * @param {string} recipeId - Recipe ID
 * @returns {Promise<boolean>} Promise resolving to true if the recipe is a favorite for this user
 */
export const isRecipeFavorite = async (userId, recipeId) => {
  if (!userId || !recipeId) return false;
  
  const userFavorites = await getUserFavorites(userId);
  return userFavorites.includes(recipeId);
};

/**
 * Add a recipe to user's favorites in Firestore
 * @param {string} userId - User ID
 * @param {string} recipeId - Recipe ID
 * @returns {Promise<boolean>} Promise resolving to true if added successfully
 */
export const addFavorite = async (userId, recipeId) => {
  if (!userId || !recipeId) return false;
  
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      favoriteRecipes: arrayUnion(recipeId)
    });
    return true;
  } catch (error) {
    console.error('Error adding favorite:', error);
    return false;
  }
};

/**
 * Remove a recipe from user's favorites in Firestore
 * @param {string} userId - User ID
 * @param {string} recipeId - Recipe ID
 * @returns {Promise<boolean>} Promise resolving to true if removed successfully
 */
export const removeFavorite = async (userId, recipeId) => {
  if (!userId || !recipeId) return false;
  
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      favoriteRecipes: arrayRemove(recipeId)
    });
    return true;
  } catch (error) {
    console.error('Error removing favorite:', error);
    return false;
  }
};

/**
 * Toggle a recipe's favorite status for a user
 * @param {string} userId - User ID
 * @param {string} recipeId - Recipe ID
 * @returns {Promise<boolean>} Promise resolving to new favorite status (true if now favorite, false if not)
 */
export const toggleFavorite = async (userId, recipeId) => {
  if (!userId || !recipeId) return false;
  
  const isFavorite = await isRecipeFavorite(userId, recipeId);
  
  if (isFavorite) {
    await removeFavorite(userId, recipeId);
    return false;
  } else {
    await addFavorite(userId, recipeId);
    return true;
  }
};

/**
 * Get all favorite recipes for a user from a list of recipes
 * @param {string} userId - User ID
 * @param {Array} recipes - Array of recipe objects
 * @returns {Promise<Array>} Promise resolving to array of favorite recipe objects
 */
export const getFavoriteRecipes = async (userId, recipes) => {
  if (!userId || !recipes || !Array.isArray(recipes)) return [];
  
  const favoriteIds = await getUserFavorites(userId);
  return recipes.filter(recipe => favoriteIds.includes(recipe.id));
};

/**
 * Check if any recipe in a group is a favorite for a specific user
 * @param {string} userId - User ID
 * @param {Array} recipeGroup - Array of recipe objects (e.g., from groupRecipesByParent)
 * @returns {Promise<boolean>} Promise resolving to true if any recipe in the group is a favorite for this user
 */
export const hasAnyFavoriteInGroup = async (userId, recipeGroup) => {
  if (!userId || !recipeGroup || !Array.isArray(recipeGroup)) return false;
  
  const favoriteIds = await getUserFavorites(userId);
  return recipeGroup.some(recipe => favoriteIds.includes(recipe.id));
};

/**
 * Migrate old localStorage favorites to Firestore (one-time migration)
 * This function migrates favorites from the old localStorage-based storage to Firestore.
 * It checks the 'userFavorites' key in localStorage for user-specific favorites.
 * @param {string} userId - User ID to migrate favorites to
 * @param {Array} recipes - Array of recipe objects (not used in current implementation but kept for API compatibility)
 */
export const migrateGlobalFavorites = async (userId, recipes) => {
  if (!userId || !recipes || !Array.isArray(recipes)) return;
  
  try {
    // Check if user already has favorites in Firestore
    const currentFavorites = await getUserFavorites(userId);
    if (currentFavorites.length > 0) {
      // Already migrated
      return;
    }
    
    // Check localStorage for old favorites
    const oldFavoritesJson = localStorage.getItem('userFavorites');
    if (!oldFavoritesJson) return;
    
    const oldFavorites = JSON.parse(oldFavoritesJson);
    const userOldFavorites = oldFavorites[userId] || [];
    
    if (userOldFavorites.length === 0) return;
    
    // Migrate to Firestore
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      favoriteRecipes: userOldFavorites
    });
    
    console.log(`Migrated ${userOldFavorites.length} favorites for user ${userId}`);
  } catch (error) {
    console.error('Error migrating favorites:', error);
  }
};
