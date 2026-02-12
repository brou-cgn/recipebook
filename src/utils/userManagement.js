/**
 * User Management Utilities
 * Handles user data storage, authentication, and admin management
 */

const USERS_STORAGE_KEY = 'users';
const CURRENT_USER_KEY = 'currentUser';

/**
 * Simple hash for password storage
 * Note: This is a basic client-side hash for demonstration purposes.
 * In production, use proper server-side authentication with bcrypt or similar.
 * @param {string} password - Plain text password
 * @returns {string} Hashed password
 */
function simpleHash(password) {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

/**
 * Get all registered users from localStorage
 * @returns {Array} Array of user objects
 */
export const getUsers = () => {
  const usersJson = localStorage.getItem(USERS_STORAGE_KEY);
  return usersJson ? JSON.parse(usersJson) : [];
};

/**
 * Save users array to localStorage
 * @param {Array} users - Array of user objects
 */
export const saveUsers = (users) => {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
};

/**
 * Register a new user
 * @param {Object} userData - User data {vorname, nachname, email, password}
 * @returns {Object} { success: boolean, message: string, user?: Object }
 */
export const registerUser = (userData) => {
  const { vorname, nachname, email, password } = userData;
  
  // Validation
  if (!vorname || !nachname || !email || !password) {
    return { success: false, message: 'Alle Felder müssen ausgefüllt werden.' };
  }
  
  // Check if email already exists
  const users = getUsers();
  const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  
  if (existingUser) {
    return { success: false, message: 'Diese E-Mail-Adresse ist bereits registriert.' };
  }
  
  // Create new user
  const newUser = {
    id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
    vorname,
    nachname,
    email: email.toLowerCase(),
    password: simpleHash(password), // Hashed password
    isAdmin: users.length === 0, // First user is automatically admin
    createdAt: new Date().toISOString()
  };
  
  // Save user
  const updatedUsers = [...users, newUser];
  saveUsers(updatedUsers);
  
  return { 
    success: true, 
    message: 'Registrierung erfolgreich!',
    user: { ...newUser, password: undefined } // Don't return password
  };
};

/**
 * Login user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Object} { success: boolean, message: string, user?: Object }
 */
export const loginUser = (email, password) => {
  if (!email || !password) {
    return { success: false, message: 'E-Mail und Passwort erforderlich.' };
  }
  
  const users = getUsers();
  const hashedPassword = simpleHash(password);
  const user = users.find(u => 
    u.email.toLowerCase() === email.toLowerCase() && 
    u.password === hashedPassword
  );
  
  if (!user) {
    return { success: false, message: 'Ungültige E-Mail oder Passwort.' };
  }
  
  // Save current user (without password)
  const currentUser = { ...user, password: undefined };
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
  
  return { 
    success: true, 
    message: 'Anmeldung erfolgreich!',
    user: currentUser
  };
};

/**
 * Logout current user
 */
export const logoutUser = () => {
  localStorage.removeItem(CURRENT_USER_KEY);
};

/**
 * Get current logged-in user
 * @returns {Object|null} Current user object or null
 */
export const getCurrentUser = () => {
  const userJson = localStorage.getItem(CURRENT_USER_KEY);
  return userJson ? JSON.parse(userJson) : null;
};

/**
 * Check if current user is admin
 * @returns {boolean}
 */
export const isCurrentUserAdmin = () => {
  const currentUser = getCurrentUser();
  return currentUser ? currentUser.isAdmin === true : false;
};

/**
 * Update user's admin status
 * @param {string} userId - ID of user to update
 * @param {boolean} isAdmin - New admin status
 * @returns {Object} { success: boolean, message: string }
 */
export const updateUserAdminStatus = (userId, isAdmin) => {
  const users = getUsers();
  
  // If removing admin status, check if there's at least one other admin
  if (!isAdmin) {
    const adminUsers = users.filter(u => u.isAdmin);
    if (adminUsers.length === 1 && adminUsers[0].id === userId) {
      return { 
        success: false, 
        message: 'Es muss mindestens ein Administrator vorhanden sein.' 
      };
    }
  }
  
  // Update user
  const updatedUsers = users.map(u => 
    u.id === userId ? { ...u, isAdmin } : u
  );
  
  saveUsers(updatedUsers);
  
  // Update current user if it's the one being modified
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.id === userId) {
    const updatedCurrentUser = { ...currentUser, isAdmin };
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedCurrentUser));
  }
  
  return { 
    success: true, 
    message: 'Admin-Status erfolgreich aktualisiert.' 
  };
};

/**
 * Get count of admin users
 * @returns {number}
 */
export const getAdminCount = () => {
  const users = getUsers();
  return users.filter(u => u.isAdmin).length;
};
