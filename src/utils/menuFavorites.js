/**
 * Menu Favorites Utilities
 * Handles user-specific favorite menus storage and management
 */

const MENU_FAVORITES_KEY = 'menuFavorites';

/**
 * Get all menu favorites from localStorage
 * @returns {Object} Object with userId as keys and arrays of menuIds as values
 */
export const getAllMenuFavorites = () => {
  const favoritesJson = localStorage.getItem(MENU_FAVORITES_KEY);
  return favoritesJson ? JSON.parse(favoritesJson) : {};
};

/**
 * Save all menu favorites to localStorage
 * @param {Object} favorites - Object with userId as keys and arrays of menuIds as values
 */
export const saveAllMenuFavorites = (favorites) => {
  localStorage.setItem(MENU_FAVORITES_KEY, JSON.stringify(favorites));
};

/**
 * Get favorite menu IDs for a specific user
 * @param {string} userId - User ID
 * @returns {Array} Array of menu IDs that are favorites for this user
 */
export const getUserMenuFavorites = (userId) => {
  if (!userId) return [];
  const allFavorites = getAllMenuFavorites();
  return allFavorites[userId] || [];
};

/**
 * Check if a menu is a favorite for a specific user
 * @param {string} userId - User ID
 * @param {string} menuId - Menu ID
 * @returns {boolean} True if the menu is a favorite for this user
 */
export const isMenuFavorite = (userId, menuId) => {
  if (!userId || !menuId) return false;
  const userFavorites = getUserMenuFavorites(userId);
  return userFavorites.includes(menuId);
};

/**
 * Add a menu to user's favorites
 * @param {string} userId - User ID
 * @param {string} menuId - Menu ID
 * @returns {boolean} True if added successfully
 */
export const addMenuFavorite = (userId, menuId) => {
  if (!userId || !menuId) return false;
  
  const allFavorites = getAllMenuFavorites();
  const userFavorites = allFavorites[userId] || [];
  
  // Don't add if already a favorite
  if (userFavorites.includes(menuId)) {
    return true;
  }
  
  // Add menu to user's favorites
  allFavorites[userId] = [...userFavorites, menuId];
  saveAllMenuFavorites(allFavorites);
  
  return true;
};

/**
 * Remove a menu from user's favorites
 * @param {string} userId - User ID
 * @param {string} menuId - Menu ID
 * @returns {boolean} True if removed successfully
 */
export const removeMenuFavorite = (userId, menuId) => {
  if (!userId || !menuId) return false;
  
  const allFavorites = getAllMenuFavorites();
  const userFavorites = allFavorites[userId] || [];
  
  // Remove menu from user's favorites
  allFavorites[userId] = userFavorites.filter(id => id !== menuId);
  saveAllMenuFavorites(allFavorites);
  
  return true;
};

/**
 * Toggle a menu's favorite status for a user
 * @param {string} userId - User ID
 * @param {string} menuId - Menu ID
 * @returns {boolean} New favorite status (true if now favorite, false if not)
 */
export const toggleMenuFavorite = (userId, menuId) => {
  if (!userId || !menuId) return false;
  
  const isFavorite = isMenuFavorite(userId, menuId);
  
  if (isFavorite) {
    removeMenuFavorite(userId, menuId);
    return false;
  } else {
    addMenuFavorite(userId, menuId);
    return true;
  }
};

/**
 * Get all favorite menus for a user from a list of menus
 * @param {string} userId - User ID
 * @param {Array} menus - Array of menu objects
 * @returns {Array} Array of favorite menu objects
 */
export const getFavoriteMenus = (userId, menus) => {
  if (!userId || !menus || !Array.isArray(menus)) return [];
  
  const favoriteIds = getUserMenuFavorites(userId);
  return menus.filter(menu => favoriteIds.includes(menu.id));
};
