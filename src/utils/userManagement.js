/**
 * User Management Utilities
 * Handles user data storage, authentication, and admin management using Firebase
 */

import { auth, db, functions } from '../firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut,
  updatePassword as firebaseUpdatePassword,
  onAuthStateChanged
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { logAppCall } from './appCallsFirestore';

// Permission roles
export const ROLES = {
  ADMIN: 'admin',
  EDIT: 'edit',
  COMMENT: 'comment',
  READ: 'read',
  GUEST: 'guest'
};

// Cache for current user profile data
let currentUserCache = null;

/**
 * Get all registered users from Firestore
 * @returns {Promise<Array>} Promise resolving to array of user objects
 */
export const getUsers = async () => {
  try {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    const users = [];
    snapshot.forEach((doc) => {
      users.push({ id: doc.id, ...doc.data() });
    });
    return users;
  } catch (error) {
    console.error('Error getting users:', error);
    return [];
  }
};

/**
 * Get user profile from Firestore
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User profile data
 */
export const getUserProfile = async (userId) => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      return { id: userDoc.id, ...userDoc.data() };
    }
    return null;
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
};

/**
 * Check if this is the first user (determines admin status)
 * @returns {Promise<boolean>} True if no users exist yet
 */
const isFirstUser = async () => {
  const users = await getUsers();
  return users.length === 0;
};

/**
 * Register a new user
 * @param {Object} userData - User data {vorname, nachname, email, password}
 * @returns {Promise<Object>} Promise resolving to { success: boolean, message: string, user?: Object }
 */
export const registerUser = async (userData) => {
  const { vorname, nachname, email, password } = userData;
  
  // Validation
  if (!vorname || !nachname || !email || !password) {
    return { success: false, message: 'Alle Felder müssen ausgefüllt werden.' };
  }
  
  try {
    // Create Firebase Auth user
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email.toLowerCase().trim(),
      password
    );
    
    const userId = userCredential.user.uid;
    const firstUser = await isFirstUser();
    
    // Create user profile in Firestore
    const userProfile = {
      vorname,
      nachname,
      email: email.toLowerCase().trim(),
      isAdmin: firstUser,
      role: firstUser ? ROLES.ADMIN : ROLES.READ,
      fotoscan: false,
      createdAt: new Date().toISOString()
    };
    
    await setDoc(doc(db, 'users', userId), userProfile);
    
    return {
      success: true,
      message: 'Registrierung erfolgreich!',
      user: { id: userId, ...userProfile }
    };
  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle specific Firebase Auth errors
    if (error.code === 'auth/email-already-in-use') {
      return { success: false, message: 'Diese E-Mail-Adresse ist bereits registriert.' };
    } else if (error.code === 'auth/invalid-email') {
      return { success: false, message: 'Ungültige E-Mail-Adresse.' };
    } else if (error.code === 'auth/weak-password') {
      return { success: false, message: 'Das Passwort ist zu schwach. Mindestens 6 Zeichen erforderlich.' };
    }
    
    return { success: false, message: 'Registrierung fehlgeschlagen. Bitte versuchen Sie es erneut.' };
  }
};

/**
 * Login user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} Promise resolving to { success: boolean, message: string, user?: Object, requiresPasswordChange?: boolean }
 */
export const loginUser = async (email, password) => {
  if (!email || !password) {
    return { success: false, message: 'E-Mail und Passwort erforderlich.' };
  }
  
  try {
    // Sign in with Firebase Auth
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email.toLowerCase().trim(),
      password
    );
    
    const userId = userCredential.user.uid;
    
    // Get user profile from Firestore
    const userProfile = await getUserProfile(userId);
    
    if (!userProfile) {
      return { success: false, message: 'Benutzerprofil nicht gefunden.' };
    }
    
    const currentUser = { id: userId, ...userProfile };
    currentUserCache = currentUser;
    
    return {
      success: true,
      message: 'Anmeldung erfolgreich!',
      user: currentUser,
      requiresPasswordChange: userProfile.requiresPasswordChange || false
    };
  } catch (error) {
    console.error('Login error:', error);
    
    // Handle specific Firebase Auth errors
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      return { success: false, message: 'Ungültige E-Mail oder Passwort.' };
    } else if (error.code === 'auth/invalid-email') {
      return { success: false, message: 'Ungültige E-Mail-Adresse.' };
    } else if (error.code === 'auth/too-many-requests') {
      return { success: false, message: 'Zu viele fehlgeschlagene Anmeldeversuche. Bitte versuchen Sie es später erneut.' };
    }
    
    return { success: false, message: 'Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.' };
  }
};

/**
 * Logout current user
 * @returns {Promise<void>}
 */
export const logoutUser = async () => {
  try {
    await signOut(auth);
    currentUserCache = null;
  } catch (error) {
    console.error('Logout error:', error);
  }
};

/**
 * Get current logged-in user
 * Returns cached user profile or null
 * @returns {Object|null} Current user object or null
 */
export const getCurrentUser = () => {
  return currentUserCache;
};

/**
 * Set up auth state observer
 * @param {Function} callback - Callback function receiving user object or null
 * @returns {Function} Unsubscribe function
 */
export const onAuthStateChange = (callback) => {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      // Handle anonymous (guest) users - they have no Firestore profile
      if (firebaseUser.isAnonymous) {
        const guestUser = {
          id: firebaseUser.uid,
          vorname: 'Gast',
          nachname: '',
          email: 'guest@local',
          isAdmin: false,
          role: ROLES.GUEST,
          isGuest: true,
          createdAt: new Date().toISOString()
        };
        currentUserCache = guestUser;
        callback(guestUser);
        return;
      }

      // Regular user: load Firestore profile
      const userProfile = await getUserProfile(firebaseUser.uid);
      if (userProfile) {
        const user = { id: firebaseUser.uid, ...userProfile };
        currentUserCache = user;
        // Log only once per browser session to avoid duplicates on token refresh
        const sessionKey = `appCallLogged_${user.id}`;
        if (!sessionStorage.getItem(sessionKey)) {
          sessionStorage.setItem(sessionKey, '1');
          logAppCall(user);
        }
        callback(user);
      } else {
        currentUserCache = null;
        callback(null);
      }
    } else {
      // User is signed out
      currentUserCache = null;
      callback(null);
    }
  });
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
 * @returns {Promise<Object>} Promise resolving to { success: boolean, message: string }
 */
export const updateUserAdminStatus = async (userId, isAdmin) => {
  try {
    // If removing admin status, check if there's at least one other admin
    if (!isAdmin) {
      const users = await getUsers();
      const adminUsers = users.filter(u => u.isAdmin);
      if (adminUsers.length === 1 && adminUsers[0].id === userId) {
        return {
          success: false,
          message: 'Es muss mindestens ein Administrator vorhanden sein.'
        };
      }
    }
    
    // Update user in Firestore
    await updateDoc(doc(db, 'users', userId), { isAdmin });
    
    // Update cache if it's the current user
    if (currentUserCache && currentUserCache.id === userId) {
      currentUserCache = { ...currentUserCache, isAdmin };
    }
    
    return {
      success: true,
      message: 'Admin-Status erfolgreich aktualisiert.'
    };
  } catch (error) {
    console.error('Error updating admin status:', error);
    return {
      success: false,
      message: 'Fehler beim Aktualisieren des Admin-Status.'
    };
  }
};

/**
 * Get count of admin users
 * @returns {Promise<number>} Number of admin users
 */
export const getAdminCount = async () => {
  const users = await getUsers();
  return users.filter(u => u.isAdmin).length;
};

/**
 * Guest login - creates a temporary session without registration
 * @returns {Promise<Object>} Promise resolving to { success: boolean, message: string, user?: Object }
 */
export const loginAsGuest = async () => {
  try {
    // Sign in anonymously with Firebase
    const userCredential = await signInAnonymously(auth);
    
    const guestUser = {
      id: userCredential.user.uid,
      vorname: 'Gast',
      nachname: '',
      email: 'guest@local',
      isAdmin: false,
      role: ROLES.GUEST,
      isGuest: true,
      createdAt: new Date().toISOString()
    };
    
    currentUserCache = guestUser;
    
    return {
      success: true,
      message: 'Als Gast angemeldet.',
      user: guestUser
    };
  } catch (error) {
    console.error('Guest login error:', error);
    return {
      success: false,
      message: 'Gast-Anmeldung fehlgeschlagen.'
    };
  }
};

/**
 * Update user's role/permission
 * @param {string} userId - ID of user to update
 * @param {string} role - New role (from ROLES constant)
 * @returns {Promise<Object>} Promise resolving to { success: boolean, message: string }
 */
export const updateUserRole = async (userId, role) => {
  // Validate role
  if (!Object.values(ROLES).includes(role)) {
    return {
      success: false,
      message: 'Ungültige Berechtigung.'
    };
  }
  
  try {
    const users = await getUsers();
    
    // Find the user
    const user = users.find(u => u.id === userId);
    if (!user) {
      return {
        success: false,
        message: 'Benutzer nicht gefunden.'
      };
    }
    
    // If changing from admin role, check if there's at least one other admin
    if (user.isAdmin && role !== ROLES.ADMIN) {
      const adminUsers = users.filter(u => u.isAdmin);
      if (adminUsers.length === 1) {
        return {
          success: false,
          message: 'Es muss mindestens ein Administrator vorhanden sein.'
        };
      }
    }
    
    // Update user in Firestore
    const updateData = {
      role,
      isAdmin: role === ROLES.ADMIN
    };
    await updateDoc(doc(db, 'users', userId), updateData);
    
    // Update cache if it's the current user
    if (currentUserCache && currentUserCache.id === userId) {
      currentUserCache = { ...currentUserCache, ...updateData };
    }
    
    return {
      success: true,
      message: 'Berechtigung erfolgreich aktualisiert.'
    };
  } catch (error) {
    console.error('Error updating user role:', error);
    return {
      success: false,
      message: 'Fehler beim Aktualisieren der Berechtigung.'
    };
  }
};

/**
 * Delete a user
 * NOTE: This deletes the user profile from Firestore but does not delete the Firebase Auth account.
 * Deleting the Auth account requires re-authentication and should be done via Firebase Admin SDK.
 * The orphaned Auth account can still log in but will have no profile data.
 * @param {string} userId - ID of user to delete
 * @returns {Promise<Object>} Promise resolving to { success: boolean, message: string }
 */
export const deleteUser = async (userId) => {
  try {
    const users = await getUsers();
    
    // Find the user
    const user = users.find(u => u.id === userId);
    if (!user) {
      return {
        success: false,
        message: 'Benutzer nicht gefunden.'
      };
    }
    
    // If deleting an admin, check if there's at least one other admin
    if (user.isAdmin) {
      const adminUsers = users.filter(u => u.isAdmin);
      if (adminUsers.length === 1) {
        return {
          success: false,
          message: 'Der letzte Administrator kann nicht gelöscht werden.'
        };
      }
    }
    
    // Check if trying to delete current user
    const currentUser = getCurrentUser();
    if (currentUser && currentUser.id === userId) {
      return {
        success: false,
        message: 'Sie können sich nicht selbst löschen.'
      };
    }
    
    // Delete user from Firestore
    await deleteDoc(doc(db, 'users', userId));
    
    // Note: Firebase Auth user deletion requires re-authentication
    // and should be handled separately if needed
    
    return {
      success: true,
      message: 'Benutzer erfolgreich gelöscht.'
    };
  } catch (error) {
    console.error('Error deleting user:', error);
    return {
      success: false,
      message: 'Fehler beim Löschen des Benutzers.'
    };
  }
};

/**
 * Check if user has a specific permission level or higher based on hierarchy
 * Hierarchy: ADMIN > EDIT > COMMENT > READ > GUEST
 * @param {Object} user - User object
 * @param {string} requiredRole - Required role level
 * @returns {boolean}
 */
export const hasPermission = (user, requiredRole) => {
  if (!user || !user.role) return false;
  
  // Define role hierarchy (higher number = more permissions)
  const roleHierarchy = {
    [ROLES.GUEST]: 1,
    [ROLES.READ]: 2,
    [ROLES.COMMENT]: 3,
    [ROLES.EDIT]: 4,
    [ROLES.ADMIN]: 5
  };
  
  const userLevel = roleHierarchy[user.role] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;
  
  return userLevel >= requiredLevel;
};

/**
 * Check if user has permission to edit recipes (general permission)
 * Admins and users with EDIT role can edit recipes.
 * Edit permission includes Comment and Read permissions.
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const canEditRecipes = (user) => {
  if (!user) return false;
  return hasPermission(user, ROLES.EDIT);
};

/**
 * Check if user has permission to comment on recipes
 * Comment permission includes Read permissions.
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const canCommentOnRecipes = (user) => {
  if (!user) return false;
  return hasPermission(user, ROLES.COMMENT);
};

/**
 * Check if user has permission to read recipes
 * All registered users and guests can read recipes.
 * Note: GUEST is a special temporary role that has read-only access but is not
 * part of the assignable role hierarchy.
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const canReadRecipes = (user) => {
  if (!user) return false;
  // All users including guests can read recipes
  // GUEST is a special temporary role for unauthenticated access
  return hasPermission(user, ROLES.READ) || user.role === ROLES.GUEST;
};

/**
 * Check if user has permission to delete recipes (general permission)
 * Only administrators can delete recipes.
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const canDeleteRecipes = (user) => {
  if (!user) return false;
  return user.role === ROLES.ADMIN;
};

/**
 * Check if user can edit a specific recipe
 * Admins can edit any recipe.
 * Users with EDIT permission can only edit their own recipes.
 * @param {Object} user - User object
 * @param {Object} recipe - Recipe object with authorId field
 * @returns {boolean}
 */
export const canEditRecipe = (user, recipe) => {
  if (!user) return false;
  // Admins can edit any recipe
  if (user.role === ROLES.ADMIN) return true;
  // Users with edit permission can only edit their own recipes
  if (hasPermission(user, ROLES.EDIT) && recipe && recipe.authorId === user.id) return true;
  return false;
};

/**
 * Check if user can delete a specific recipe
 * Administrators may delete any recipe.
 * Authors may delete their own recipe as long as it is not in the public list.
 * @param {Object} user - User object
 * @param {Object} recipe - Recipe object with authorId field
 * @param {boolean} [isPublicRecipe=false] - Whether the recipe is assigned to the public list
 * @returns {boolean}
 */
export const canDeleteRecipe = (user, recipe, isPublicRecipe = false) => {
  if (!user) return false;
  // Admins can delete any recipe
  if (user.role === ROLES.ADMIN) return true;
  // Authors can delete their own non-public recipe
  if (!isPublicRecipe && recipe && recipe.authorId === user.id) return true;
  return false;
};

/**
 * Check if user can directly edit a specific recipe (overwrite it)
 * Only admins and the original author can directly edit a recipe.
 * This is a stricter check than canEditRecipe.
 * @param {Object} user - User object
 * @param {Object} recipe - Recipe object with authorId field
 * @returns {boolean}
 */
export const canDirectlyEditRecipe = (user, recipe) => {
  if (!user || !recipe) return false;
  // Admins can directly edit any recipe
  if (user.role === ROLES.ADMIN) return true;
  // Original author can directly edit their own recipe
  if (recipe.authorId === user.id) return true;
  return false;
};

/**
 * Check if user can create a new version of a recipe
 * Users with EDIT permission or higher can create new versions.
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const canCreateNewVersion = (user) => {
  if (!user) return false;
  // Users with EDIT permission or higher (including admins) can create new versions
  return hasPermission(user, ROLES.EDIT);
};

/**
 * Check if user can edit a specific menu
 * Only admins and the original author can edit a menu.
 * @param {Object} user - User object
 * @param {Object} menu - Menu object with authorId field
 * @returns {boolean}
 */
export const canEditMenu = (user, menu) => {
  if (!user || !menu) return false;
  // Admins can edit any menu
  if (user.role === ROLES.ADMIN) return true;
  // Original author can edit their own menu
  if (menu.authorId === user.id) return true;
  return false;
};

/**
 * Check if user can delete a specific menu
 * Only admins and the original author can delete a menu.
 * @param {Object} user - User object
 * @param {Object} menu - Menu object with authorId field
 * @returns {boolean}
 */
export const canDeleteMenu = (user, menu) => {
  if (!user || !menu) return false;
  // Admins can delete any menu
  if (user.role === ROLES.ADMIN) return true;
  // Original author can delete their own menu
  if (menu.authorId === user.id) return true;
  return false;
};

/**
 * Get display name for a role
 * @param {string} role - Role constant
 * @returns {string}
 */
export const getRoleDisplayName = (role) => {
  const roleNames = {
    [ROLES.ADMIN]: 'Administrator',
    [ROLES.EDIT]: 'Bearbeiten',
    [ROLES.COMMENT]: 'Kommentieren',
    [ROLES.READ]: 'Lesen',
    [ROLES.GUEST]: 'Gast'
  };
  return roleNames[role] || role;
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} { valid: boolean, message: string }
 */
export const validatePassword = (password) => {
  if (!password || password.length < 6) {
    return { 
      valid: false, 
      message: 'Das Passwort muss mindestens 6 Zeichen lang sein.' 
    };
  }
  return { valid: true, message: '' };
};

/**
 * Update user's name (first and last name)
 * @param {string} userId - ID of user to update
 * @param {string} vorname - New first name
 * @param {string} nachname - New last name
 * @returns {Promise<Object>} Promise resolving to { success: boolean, message: string }
 */
export const updateUserName = async (userId, vorname, nachname) => {
  // Validation
  if (!vorname || !nachname) {
    return {
      success: false,
      message: 'Vorname und Nachname dürfen nicht leer sein.'
    };
  }

  try {
    const users = await getUsers();
    
    // Find the user
    const user = users.find(u => u.id === userId);
    if (!user) {
      return {
        success: false,
        message: 'Benutzer nicht gefunden.'
      };
    }
    
    // Update user in Firestore
    await updateDoc(doc(db, 'users', userId), { vorname, nachname });
    
    // Update cache if it's the current user
    if (currentUserCache && currentUserCache.id === userId) {
      currentUserCache = { ...currentUserCache, vorname, nachname };
    }
    
    return {
      success: true,
      message: 'Name erfolgreich aktualisiert.'
    };
  } catch (error) {
    console.error('Error updating user name:', error);
    return {
      success: false,
      message: 'Fehler beim Aktualisieren des Namens.'
    };
  }
};

/**
 * Update personal profile data (vorname, nachname, email, signatureSatz) for the current user
 * @param {string} userId - ID of user to update
 * @param {Object} profileData - Profile fields to update { vorname, nachname, email, signatureSatz }
 * @returns {Promise<Object>} Promise resolving to { success: boolean, message: string }
 */
export const updateUserProfile = async (userId, profileData) => {
  const { vorname, nachname, email, signatureSatz } = profileData;

  if (!vorname || !nachname || !email) {
    return {
      success: false,
      message: 'Vorname, Nachname und E-Mail dürfen nicht leer sein.'
    };
  }

  try {
    const updates = {
      vorname,
      nachname,
      email: email.toLowerCase().trim(),
      signatureSatz: signatureSatz || ''
    };

    await updateDoc(doc(db, 'users', userId), updates);

    if (currentUserCache && currentUserCache.id === userId) {
      currentUserCache = { ...currentUserCache, ...updates };
    }

    return {
      success: true,
      message: 'Profil erfolgreich aktualisiert.'
    };
  } catch (error) {
    console.error('Error updating user profile:', error);
    return {
      success: false,
      message: 'Fehler beim Aktualisieren des Profils.'
    };
  }
};

/**
 * Set a temporary password for a user
 * Uses a Firebase Cloud Function to update the password via the Admin SDK.
 * Also sets the requiresPasswordChange flag in Firestore so the user is
 * prompted to choose a new password on next login.
 * @param {string} userId - ID of user to update
 * @param {string} tempPassword - Temporary password (plain text, min 6 chars)
 * @returns {Promise<Object>} Promise resolving to { success: boolean, message: string }
 */
export const setTemporaryPassword = async (userId, tempPassword) => {
  // Validate password
  const validation = validatePassword(tempPassword);
  if (!validation.valid) {
    return {
      success: false,
      message: validation.message
    };
  }

  try {
    const setUserPassword = httpsCallable(functions, 'setUserPassword');
    await setUserPassword({ targetUserId: userId, newPassword: tempPassword });

    return {
      success: true,
      message: 'Temporäres Passwort erfolgreich gesetzt. Der Benutzer wird beim nächsten Login aufgefordert, ein neues Passwort zu vergeben.'
    };
  } catch (error) {
    console.error('Error setting temporary password:', error);

    if (error.code === 'functions/permission-denied') {
      return {
        success: false,
        message: 'Keine Berechtigung. Nur Administratoren können Passwörter zurücksetzen.'
      };
    } else if (error.code === 'functions/invalid-argument') {
      return {
        success: false,
        message: error.message || 'Ungültige Eingabe.'
      };
    }

    return {
      success: false,
      message: 'Fehler beim Setzen des temporären Passworts.'
    };
  }
};

/**
 * Change user's own password
 * @param {string} userId - ID of user
 * @param {string} newPassword - New password (plain text)
 * @returns {Promise<Object>} Promise resolving to { success: boolean, message: string }
 */
export const changePassword = async (userId, newPassword) => {
  // Validate password
  const validation = validatePassword(newPassword);
  if (!validation.valid) {
    return {
      success: false,
      message: validation.message
    };
  }

  try {
    const user = auth.currentUser;
    if (!user || user.uid !== userId) {
      return {
        success: false,
        message: 'Benutzer nicht angemeldet oder IDs stimmen nicht überein.'
      };
    }
    
    // Update password in Firebase Auth
    await firebaseUpdatePassword(user, newPassword);
    
    // Update Firestore to remove temporary password flag
    await updateDoc(doc(db, 'users', userId), { requiresPasswordChange: false });
    
    // Update cache
    if (currentUserCache && currentUserCache.id === userId) {
      currentUserCache = { ...currentUserCache, requiresPasswordChange: false };
    }
    
    return {
      success: true,
      message: 'Passwort erfolgreich geändert.'
    };
  } catch (error) {
    console.error('Error changing password:', error);
    
    if (error.code === 'auth/requires-recent-login') {
      return {
        success: false,
        message: 'Für diese Aktion ist eine erneute Anmeldung erforderlich.'
      };
    }
    
    return {
      success: false,
      message: 'Fehler beim Ändern des Passworts.'
    };
  }
};

/**
 * Update user's fotoscan setting
 * @param {string} userId - ID of user to update
 * @param {boolean} fotoscan - New fotoscan value
 * @returns {Promise<Object>} Promise resolving to { success: boolean, message: string }
 */
export const updateUserFotoscan = async (userId, fotoscan) => {
  try {
    const users = await getUsers();
    
    // Find the user
    const user = users.find(u => u.id === userId);
    if (!user) {
      return {
        success: false,
        message: 'Benutzer nicht gefunden.'
      };
    }
    
    // Update user in Firestore
    await updateDoc(doc(db, 'users', userId), { fotoscan });
    
    // Update cache if it's the current user
    if (currentUserCache && currentUserCache.id === userId) {
      currentUserCache = { ...currentUserCache, fotoscan };
    }
    
    return {
      success: true,
      message: 'Fotoscan-Einstellung erfolgreich aktualisiert.'
    };
  } catch (error) {
    console.error('Error updating fotoscan:', error);
    return {
      success: false,
      message: 'Fehler beim Aktualisieren der Fotoscan-Einstellung.'
    };
  }
};

/**
 * Get the current daily AI-OCR scan count for a user
 * Uses MEZ (Europe/Berlin) timezone to match server-side counter reset at 0 Uhr MEZ
 * @param {string} userId - User ID
 * @returns {Promise<number>} Number of AI-OCR scans today
 */
export const getUserAiOcrScanCount = async (userId) => {
  try {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); // YYYY-MM-DD
    const docRef = doc(db, 'aiScanLimits', `${userId}_${today}`);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data().count || 0;
    }
    return 0;
  } catch (error) {
    console.error('Error getting AI OCR scan count:', error);
    return 0;
  }
};

/**
 * Update user's webimport permission
 * @param {string} userId - User ID
 * @param {boolean} webimport - New webimport value
 * @returns {Promise<{success: boolean, message: string}>} Result object
 */
export const updateUserWebimport = async (userId, webimport) => {
  try {
    const users = await getUsers();
    
    // Find the user
    const user = users.find(u => u.id === userId);
    if (!user) {
      return {
        success: false,
        message: 'Benutzer nicht gefunden.'
      };
    }
    
    // Update user in Firestore
    await updateDoc(doc(db, 'users', userId), { webimport });
    
    // Update cache if it's the current user
    if (currentUserCache && currentUserCache.id === userId) {
      currentUserCache = { ...currentUserCache, webimport };
    }
    
    return {
      success: true,
      message: 'Webimport-Einstellung erfolgreich aktualisiert.'
    };
  } catch (error) {
    console.error('Error updating webimport:', error);
    return {
      success: false,
      message: 'Fehler beim Aktualisieren der Webimport-Einstellung.'
    };
  }
};
