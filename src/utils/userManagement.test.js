// ─────────────────────────────────────────────────────────────────────────────
// Firebase module mocks – must be declared before any imports
// ─────────────────────────────────────────────────────────────────────────────

// Shared in-memory state reset between tests
let _authStore = {};       // email -> { uid, password }
let _firestoreStore = {};  // "collection/docId" -> data
let _uidCounter = 0;

const resetFirebaseState = () => {
  _authStore = {};
  _firestoreStore = {};
  _uidCounter = 0;
};

jest.mock("../firebase", () => ({
  auth: {},
  db: {},
  functions: {},
}));

jest.mock("./appCallsFirestore", () => ({
  logAppCall: jest.fn(),
}));

// Helper that creates a Firestore doc snapshot
const makeSnapshot = (data) => ({
  exists: () => !!data,
  data: () => data,
  id: data ? data.id : undefined,
});

// Helper that creates a Firestore collection snapshot from _firestoreStore prefix
const makeCollectionSnapshot = (prefix) => {
  const items = Object.entries(_firestoreStore)
    .filter(([key]) => key.startsWith(prefix + "/"))
    .map(([key, data]) => {
      const id = key.slice(prefix.length + 1);
      return { id, data: () => data };
    });
  return { forEach: (cb) => items.forEach(cb) };
};

jest.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  signInAnonymously: jest.fn(),
  updatePassword: jest.fn(async () => {}),
  reauthenticateWithCredential: jest.fn(async () => {}),
  EmailAuthProvider: { credential: jest.fn(() => ({})) },
  sendPasswordResetEmail: jest.fn(async () => {}),
  onAuthStateChanged: jest.fn(() => jest.fn()),
}));

jest.mock("firebase/firestore", () => ({
  doc: jest.fn(),
  collection: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  getDocs: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  arrayUnion: jest.fn((...items) => ({ _type: "arrayUnion", items })),
  arrayRemove: jest.fn((...items) => ({ _type: "arrayRemove", items })),
}));

jest.mock("firebase/functions", () => ({
  httpsCallable: jest.fn(),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Actual imports (after mocks)
// ─────────────────────────────────────────────────────────────────────────────
import {
  getUsers,
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  isCurrentUserAdmin,
  updateUserAdminStatus,
  getAdminCount,
  loginAsGuest,
  updateUserRole,
  deleteUser,
  canEditRecipes,
  canDeleteRecipes,
  canEditRecipe,
  canDeleteRecipe,
  canDirectlyEditRecipe,
  canCreateNewVersion,
  canEditMenu,
  canDeleteMenu,
  canCommentOnRecipes,
  canReadRecipes,
  hasPermission,
  getRoleDisplayName,
  validatePassword,
  updateUserName,
  setTemporaryPassword,
  changePassword,
  updateUserFotoscan,
  ROLES,
  ROLE_PERMISSIONS_DEFAULT,
  updateRolePermission
} from "./userManagement";

const VALID_PASSWORD = "SecurePass12!";

// Helper to set up mock implementations (called in beforeEach)
const setupMocks = () => {
  const { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, signInAnonymously } = require("firebase/auth");

  createUserWithEmailAndPassword.mockImplementation(async (_auth, email, password) => {
    const normEmail = email.toLowerCase().trim();
    if (_authStore[normEmail]) {
      const err = new Error("auth/email-already-in-use");
      err.code = "auth/email-already-in-use";
      throw err;
    }
    const uid = "uid-" + (++_uidCounter);
    _authStore[normEmail] = { uid, password };
    return { user: { uid } };
  });

  signInWithEmailAndPassword.mockImplementation(async (_auth, email, password) => {
    const normEmail = email.toLowerCase().trim();
    const record = _authStore[normEmail];
    if (!record || record.password !== password) {
      const err = new Error("auth/invalid-credential");
      err.code = "auth/invalid-credential";
      throw err;
    }
    return { user: { uid: record.uid } };
  });

  signOut.mockImplementation(async () => {});

  signInAnonymously.mockImplementation(async () => {
    const uid = "guest-uid-" + (++_uidCounter);
    return { user: { uid, isAnonymous: true } };
  });

  const { getDoc, setDoc, getDocs, updateDoc, deleteDoc, doc, collection } = require("firebase/firestore");

  doc.mockImplementation((_db, col, id) => ({ _col: col, _id: id, _key: col + "/" + id }));
  collection.mockImplementation((_db, col) => ({ _col: col }));
  getDoc.mockImplementation(async (ref) => {
    const data = _firestoreStore[ref._key] || null;
    return makeSnapshot(data);
  });
  setDoc.mockImplementation(async (ref, data) => {
    _firestoreStore[ref._key] = { ...data };
  });
  getDocs.mockImplementation(async (ref) => makeCollectionSnapshot(ref._col));
  updateDoc.mockImplementation(async (ref, data) => {
    if (_firestoreStore[ref._key]) {
      _firestoreStore[ref._key] = { ..._firestoreStore[ref._key], ...data };
    }
  });
  deleteDoc.mockImplementation(async (ref) => {
    delete _firestoreStore[ref._key];
  });

  const { httpsCallable } = require("firebase/functions");
  httpsCallable.mockImplementation((_functions, fnName) => {
    if (fnName === "createUserProfile") {
      return jest.fn(async ({ vorname, nachname, email }) => {
        const normEmail = email.toLowerCase().trim();
        const uid = _authStore[normEmail] && _authStore[normEmail].uid;
        if (!uid) throw new Error("User not found in auth store");
        const isFirstUser = Object.keys(_firestoreStore).filter(function(k) { return k.startsWith("users/"); }).length === 0;
        const isAdmin = isFirstUser;
        const userData = {
          id: uid,
          vorname: vorname,
          nachname: nachname,
          email: normEmail,
          isAdmin: isAdmin,
          role: isAdmin ? "admin" : "read",
          createdAt: new Date().toISOString(),
          fotoscan: false,
          requiresPasswordChange: false,
        };
        _firestoreStore["users/" + uid] = userData;
        return { data: { user: userData } };
      });
    }
    return jest.fn(async () => ({ data: {} }));
  });
};

describe("User Management Utilities", () => {
  beforeEach(() => {
    resetFirebaseState();
    setupMocks();
  });

  // ─────────────────────────────────────────────────────────────────────
  describe("registerUser", () => {
    test("should register first user as admin", async () => {
      const result = await registerUser({
        vorname: "Max",
        nachname: "Mustermann",
        email: "max@example.com",
        password: VALID_PASSWORD
      });
      expect(result.success).toBe(true);
      expect(result.user.isAdmin).toBe(true);
      expect(result.user.vorname).toBe("Max");
      expect(result.user.nachname).toBe("Mustermann");
      expect(result.user.email).toBe("max@example.com");
    });

    test("should register second user as non-admin", async () => {
      await registerUser({ vorname: "First", nachname: "User", email: "first@example.com", password: VALID_PASSWORD });
      const result = await registerUser({ vorname: "Second", nachname: "User", email: "second@example.com", password: VALID_PASSWORD });
      expect(result.success).toBe(true);
      expect(result.user.isAdmin).toBe(false);
    });

    test("should not allow duplicate email", async () => {
      const userData = { vorname: "Max", nachname: "Mustermann", email: "max@example.com", password: VALID_PASSWORD };
      await registerUser(userData);
      const result = await registerUser(userData);
      expect(result.success).toBe(false);
      expect(result.message).toContain("bereits registriert");
    });

    test("should require all fields", async () => {
      const result = await registerUser({ vorname: "Max", nachname: "", email: "max@example.com", password: VALID_PASSWORD });
      expect(result.success).toBe(false);
      expect(result.message).toContain("müssen ausgefüllt");
    });

    test("should normalize email to lowercase", async () => {
      const result = await registerUser({ vorname: "Max", nachname: "Mustermann", email: "MAX@EXAMPLE.COM", password: VALID_PASSWORD });
      expect(result.success).toBe(true);
      expect(result.user.email).toBe("max@example.com");
    });

    test("should trim whitespace from email", async () => {
      const result = await registerUser({ vorname: "Benjamin", nachname: "Rousselli", email: "  benjamin.rousselli@googlemail.com  ", password: VALID_PASSWORD });
      expect(result.success).toBe(true);
      expect(result.user.email).toBe("benjamin.rousselli@googlemail.com");
    });

    test("should prevent duplicate registration with whitespace-trimmed emails", async () => {
      await registerUser({ vorname: "User1", nachname: "Test", email: "duplicate@example.com", password: VALID_PASSWORD });
      const result = await registerUser({ vorname: "User2", nachname: "Test", email: "  duplicate@example.com  ", password: "AnotherPass12!" });
      expect(result.success).toBe(false);
      expect(result.message).toContain("bereits registriert");
    });
  });

  describe("loginUser", () => {
    beforeEach(async () => {
      await registerUser({ vorname: "Test", nachname: "User", email: "test@example.com", password: VALID_PASSWORD });
    });

    test("should login with correct credentials", async () => {
      const result = await loginUser("test@example.com", VALID_PASSWORD);
      expect(result.success).toBe(true);
      expect(result.user.email).toBe("test@example.com");
    });

    test("should fail with incorrect password", async () => {
      const result = await loginUser("test@example.com", "wrongpassword");
      expect(result.success).toBe(false);
      expect(result.message).toContain("Ungültige");
    });

    test("should fail with non-existent email", async () => {
      const result = await loginUser("nonexistent@example.com", VALID_PASSWORD);
      expect(result.success).toBe(false);
      expect(result.message).toContain("Ungültige");
    });

    test("should be case-insensitive for email", async () => {
      const result = await loginUser("TEST@EXAMPLE.COM", VALID_PASSWORD);
      expect(result.success).toBe(true);
    });

    test("should trim whitespace from email during login", async () => {
      const result = await loginUser("  test@example.com  ", VALID_PASSWORD);
      expect(result.success).toBe(true);
      expect(result.user.email).toBe("test@example.com");
    });

    test("should handle whitespace in email for user registered with whitespace", async () => {
      await registerUser({ vorname: "Benjamin", nachname: "Rousselli", email: "  benjamin.rousselli@googlemail.com  ", password: VALID_PASSWORD });
      const result1 = await loginUser("benjamin.rousselli@googlemail.com", VALID_PASSWORD);
      expect(result1.success).toBe(true);
      const result2 = await loginUser("  benjamin.rousselli@googlemail.com  ", VALID_PASSWORD);
      expect(result2.success).toBe(true);
    });

    test("should set current user on successful login", async () => {
      await loginUser("test@example.com", VALID_PASSWORD);
      const currentUser = getCurrentUser();
      expect(currentUser).not.toBeNull();
      expect(currentUser.email).toBe("test@example.com");
    });
  });

  describe("logoutUser and getCurrentUser", () => {
    test("should clear current user on logout", async () => {
      await registerUser({ vorname: "Test", nachname: "User", email: "test@example.com", password: VALID_PASSWORD });
      await loginUser("test@example.com", VALID_PASSWORD);
      expect(getCurrentUser()).not.toBeNull();
      await logoutUser();
      expect(getCurrentUser()).toBeNull();
    });
  });

  describe("isCurrentUserAdmin", () => {
    test("should return true if current user is admin", async () => {
      await registerUser({ vorname: "Admin", nachname: "User", email: "admin@example.com", password: VALID_PASSWORD });
      await loginUser("admin@example.com", VALID_PASSWORD);
      expect(isCurrentUserAdmin()).toBe(true);
    });

    test("should return false if current user is not admin", async () => {
      await registerUser({ vorname: "Admin", nachname: "User", email: "admin@example.com", password: VALID_PASSWORD });
      await registerUser({ vorname: "Regular", nachname: "User", email: "regular@example.com", password: VALID_PASSWORD });
      await loginUser("regular@example.com", VALID_PASSWORD);
      expect(isCurrentUserAdmin()).toBe(false);
    });

    test("should return false if no user is logged in", () => {
      expect(isCurrentUserAdmin()).toBe(false);
    });
  });

  describe("updateUserAdminStatus", () => {
    let adminUser, regularUser;

    beforeEach(async () => {
      adminUser = (await registerUser({ vorname: "Admin", nachname: "User", email: "admin@example.com", password: VALID_PASSWORD })).user;
      regularUser = (await registerUser({ vorname: "Regular", nachname: "User", email: "regular@example.com", password: VALID_PASSWORD })).user;
    });

    test("should promote regular user to admin", async () => {
      const result = await updateUserAdminStatus(regularUser.id, true);
      expect(result.success).toBe(true);
      const users = await getUsers();
      const updatedUser = users.find(u => u.id === regularUser.id);
      expect(updatedUser.isAdmin).toBe(true);
    });

    test("should demote admin to regular user when there are multiple admins", async () => {
      await updateUserAdminStatus(regularUser.id, true);
      const result = await updateUserAdminStatus(adminUser.id, false);
      expect(result.success).toBe(true);
      const users = await getUsers();
      expect(users.find(u => u.id === adminUser.id).isAdmin).toBe(false);
    });

    test("should not allow removing the last admin", async () => {
      const result = await updateUserAdminStatus(adminUser.id, false);
      expect(result.success).toBe(false);
      expect(result.message).toContain("mindestens ein Administrator");
      const users = await getUsers();
      expect(users.find(u => u.id === adminUser.id).isAdmin).toBe(true);
    });

    test("should update current user if they are the one being modified", async () => {
      await loginUser("admin@example.com", VALID_PASSWORD);
      await updateUserAdminStatus(regularUser.id, true);
      await updateUserAdminStatus(adminUser.id, false);
      expect(getCurrentUser().isAdmin).toBe(false);
    });
  });

  describe("getAdminCount", () => {
    test("should return 0 when no users exist", async () => {
      expect(await getAdminCount()).toBe(0);
    });

    test("should return 1 for first user", async () => {
      await registerUser({ vorname: "Admin", nachname: "User", email: "admin@example.com", password: VALID_PASSWORD });
      expect(await getAdminCount()).toBe(1);
    });

    test("should return correct count when multiple admins exist", async () => {
      await registerUser({ vorname: "Admin1", nachname: "User", email: "admin1@example.com", password: VALID_PASSWORD });
      const user2 = (await registerUser({ vorname: "User2", nachname: "Name", email: "user2@example.com", password: VALID_PASSWORD })).user;
      await updateUserAdminStatus(user2.id, true);
      expect(await getAdminCount()).toBe(2);
    });
  });

  describe("getUsers", () => {
    test("should return empty array when no users exist", async () => {
      expect(await getUsers()).toEqual([]);
    });

    test("should return registered users", async () => {
      await registerUser({ vorname: "User1", nachname: "Name1", email: "user1@example.com", password: VALID_PASSWORD });
      const users = await getUsers();
      expect(users.length).toBe(1);
      expect(users[0].email).toBe("user1@example.com");
    });
  });

  describe("loginAsGuest", () => {
    test("should create guest user session", async () => {
      const result = await loginAsGuest();
      expect(result.success).toBe(true);
      expect(result.user.role).toBe(ROLES.GUEST);
      expect(result.user.isGuest).toBe(true);
      expect(result.user.isAdmin).toBe(false);
    });

    test("should set guest as current user", async () => {
      await loginAsGuest();
      const currentUser = getCurrentUser();
      expect(currentUser).not.toBeNull();
      expect(currentUser.role).toBe(ROLES.GUEST);
      expect(currentUser.isGuest).toBe(true);
    });

    test("should not save guest to users list", async () => {
      await loginAsGuest();
      const users = await getUsers();
      expect(users.length).toBe(0);
    });
  });

  describe("updateUserRole", () => {
    let adminUser, regularUser;

    beforeEach(async () => {
      adminUser = (await registerUser({ vorname: "Admin", nachname: "User", email: "admin@example.com", password: VALID_PASSWORD })).user;
      regularUser = (await registerUser({ vorname: "Regular", nachname: "User", email: "regular@example.com", password: VALID_PASSWORD })).user;
    });

    test("should update user role to edit", async () => {
      const result = await updateUserRole(regularUser.id, ROLES.EDIT);
      expect(result.success).toBe(true);
      const users = await getUsers();
      const updatedUser = users.find(u => u.id === regularUser.id);
      expect(updatedUser.role).toBe(ROLES.EDIT);
      expect(updatedUser.isAdmin).toBe(false);
    });

    test("should update user role to admin", async () => {
      const result = await updateUserRole(regularUser.id, ROLES.ADMIN);
      expect(result.success).toBe(true);
      const users = await getUsers();
      const updatedUser = users.find(u => u.id === regularUser.id);
      expect(updatedUser.role).toBe(ROLES.ADMIN);
      expect(updatedUser.isAdmin).toBe(true);
    });

    test("should not allow removing last admin", async () => {
      const result = await updateUserRole(adminUser.id, ROLES.READ);
      expect(result.success).toBe(false);
      expect(result.message).toContain("mindestens ein Administrator");
      const users = await getUsers();
      expect(users.find(u => u.id === adminUser.id).isAdmin).toBe(true);
    });

    test("should reject invalid role", async () => {
      const result = await updateUserRole(regularUser.id, "invalid_role");
      expect(result.success).toBe(false);
      expect(result.message).toContain("Ungültige Berechtigung");
    });

    test("should update current user if they are being modified", async () => {
      await loginUser("admin@example.com", VALID_PASSWORD);
      await updateUserRole(regularUser.id, ROLES.ADMIN);
      await updateUserRole(adminUser.id, ROLES.READ);
      const currentUser = getCurrentUser();
      expect(currentUser.role).toBe(ROLES.READ);
      expect(currentUser.isAdmin).toBe(false);
    });
  });

  describe("deleteUser", () => {
    let adminUser, regularUser;

    beforeEach(async () => {
      adminUser = (await registerUser({ vorname: "Admin", nachname: "User", email: "admin@example.com", password: VALID_PASSWORD })).user;
      regularUser = (await registerUser({ vorname: "Regular", nachname: "User", email: "regular@example.com", password: VALID_PASSWORD })).user;
    });

    test("should delete regular user", async () => {
      const result = await deleteUser(regularUser.id);
      expect(result.success).toBe(true);
      const users = await getUsers();
      expect(users.length).toBe(1);
      expect(users.find(u => u.id === regularUser.id)).toBeUndefined();
    });

    test("should not allow deleting last admin", async () => {
      const result = await deleteUser(adminUser.id);
      expect(result.success).toBe(false);
      expect(result.message).toContain("letzte Administrator");
      const users = await getUsers();
      expect(users.find(u => u.id === adminUser.id)).toBeDefined();
    });

    test("should not allow user to delete themselves", async () => {
      await updateUserRole(regularUser.id, ROLES.ADMIN);
      await loginUser("regular@example.com", VALID_PASSWORD);
      const result = await deleteUser(regularUser.id);
      expect(result.success).toBe(false);
      expect(result.message).toContain("nicht selbst löschen");
    });

    test("should handle non-existent user", async () => {
      const result = await deleteUser("non-existent-id");
      expect(result.success).toBe(false);
      expect(result.message).toContain("nicht gefunden");
    });
  });

  describe("canEditRecipes", () => {
    test("should return true for admin users", () => { expect(canEditRecipes({ role: ROLES.ADMIN, isAdmin: true })).toBe(true); });
    test("should return true for moderator users", () => { expect(canEditRecipes({ role: ROLES.MODERATOR, isAdmin: false })).toBe(true); });
    test("should return true for edit users", () => { expect(canEditRecipes({ role: ROLES.EDIT, isAdmin: false })).toBe(true); });
    test("should return false for read users", () => { expect(canEditRecipes({ role: ROLES.READ, isAdmin: false })).toBe(false); });
    test("should return false for guest users", () => { expect(canEditRecipes({ role: ROLES.GUEST, isAdmin: false })).toBe(false); });
    test("should return false for null user", () => { expect(canEditRecipes(null)).toBe(false); });
  });

  describe("canDeleteRecipes", () => {
    test("should return true for admin users", () => { expect(canDeleteRecipes({ role: ROLES.ADMIN, isAdmin: true })).toBe(true); });
    test("should return false for moderator users", () => { expect(canDeleteRecipes({ role: ROLES.MODERATOR, isAdmin: false })).toBe(false); });
    test("should return false for edit users", () => { expect(canDeleteRecipes({ role: ROLES.EDIT, isAdmin: false })).toBe(false); });
    test("should return false for read users", () => { expect(canDeleteRecipes({ role: ROLES.READ, isAdmin: false })).toBe(false); });
    test("should return false for null user", () => { expect(canDeleteRecipes(null)).toBe(false); });
  });

  describe("getRoleDisplayName", () => {
    test("should return correct display names", () => {
      expect(getRoleDisplayName(ROLES.ADMIN)).toBe("Administrator");
      expect(getRoleDisplayName(ROLES.MODERATOR)).toBe("Moderator");
      expect(getRoleDisplayName(ROLES.EDIT)).toBe("Bearbeiten");
      expect(getRoleDisplayName(ROLES.COMMENT)).toBe("Kommentieren");
      expect(getRoleDisplayName(ROLES.READ)).toBe("Lesen");
      expect(getRoleDisplayName(ROLES.GUEST)).toBe("Gast");
    });
    test("should return role itself for unknown role", () => { expect(getRoleDisplayName("unknown")).toBe("unknown"); });
  });

  describe("validatePassword", () => {
    test("should accept valid password with digit", () => {
      const result = validatePassword("SecurePassw0rd");
      expect(result.valid).toBe(true);
      expect(result.message).toBe("");
    });
    test("should accept valid password with special character", () => {
      const result = validatePassword("SecurePassword!");
      expect(result.valid).toBe(true);
    });
    test("should reject password shorter than 12 characters", () => {
      const result = validatePassword("Short1!");
      expect(result.valid).toBe(false);
      expect(result.message).toContain("mindestens 12 Zeichen");
    });
    test("should reject password without digit or special character", () => {
      const result = validatePassword("OnlyLettersHere");
      expect(result.valid).toBe(false);
      expect(result.message).toContain("Zahl oder ein Sonderzeichen");
    });
    test("should reject empty password", () => {
      const result = validatePassword("");
      expect(result.valid).toBe(false);
      expect(result.message).toContain("mindestens 12 Zeichen");
    });
    test("should reject null password", () => { expect(validatePassword(null).valid).toBe(false); });
    test("should reject common passwords", () => { expect(validatePassword("password123").valid).toBe(false); });
  });

  describe("updateUserName", () => {
    let testUser;

    beforeEach(async () => {
      testUser = (await registerUser({ vorname: "Original", nachname: "Name", email: "test@example.com", password: VALID_PASSWORD })).user;
    });

    test("should update user name", async () => {
      const result = await updateUserName(testUser.id, "New", "Name");
      expect(result.success).toBe(true);
      expect(result.message).toContain("erfolgreich aktualisiert");
      const users = await getUsers();
      const updatedUser = users.find(u => u.id === testUser.id);
      expect(updatedUser.vorname).toBe("New");
      expect(updatedUser.nachname).toBe("Name");
    });

    test("should update current user if they are being modified", async () => {
      await loginUser("test@example.com", VALID_PASSWORD);
      await updateUserName(testUser.id, "Updated", "User");
      const currentUser = getCurrentUser();
      expect(currentUser.vorname).toBe("Updated");
      expect(currentUser.nachname).toBe("User");
    });

    test("should reject empty first name", async () => {
      const result = await updateUserName(testUser.id, "", "Name");
      expect(result.success).toBe(false);
      expect(result.message).toContain("dürfen nicht leer sein");
    });

    test("should reject empty last name", async () => {
      const result = await updateUserName(testUser.id, "Name", "");
      expect(result.success).toBe(false);
      expect(result.message).toContain("dürfen nicht leer sein");
    });

    test("should handle non-existent user", async () => {
      const result = await updateUserName("non-existent-id", "New", "Name");
      expect(result.success).toBe(false);
      expect(result.message).toContain("nicht gefunden");
    });
  });

  describe("setTemporaryPassword", () => {
    let testUser;

    beforeEach(async () => {
      testUser = (await registerUser({ vorname: "Test", nachname: "User", email: "test@example.com", password: VALID_PASSWORD })).user;
    });

    test("should set temporary password", async () => {
      const result = await setTemporaryPassword(testUser.id, "TempPass12!3");
      expect(result.success).toBe(true);
      expect(result.message).toContain("erfolgreich gesetzt");
      const users = await getUsers();
      expect(users.find(u => u.id === testUser.id).requiresPasswordChange).toBe(true);
    });

    test("should reject weak password", async () => {
      const result = await setTemporaryPassword(testUser.id, "12345");
      expect(result.success).toBe(false);
      expect(result.message).toContain("mindestens 12 Zeichen");
    });

    test("should handle non-existent user", async () => {
      const result = await setTemporaryPassword("non-existent-id", "TempPass12!3");
      expect(result.success).toBe(false);
      expect(result.message).toContain("nicht gefunden");
    });
  });

  describe("changePassword", () => {
    let testUser;

    beforeEach(async () => {
      testUser = (await registerUser({ vorname: "Test", nachname: "User", email: "test@example.com", password: VALID_PASSWORD })).user;
    });

    test("should change password successfully", async () => {
      await loginUser("test@example.com", VALID_PASSWORD);
      const result = await changePassword(testUser.id, "NewPassword12!");
      expect(result.success).toBe(true);
      expect(result.message).toContain("erfolgreich geändert");
    });

    test("should remove requiresPasswordChange flag", async () => {
      await setTemporaryPassword(testUser.id, "TempPass12!3");
      await loginUser("test@example.com", VALID_PASSWORD);
      await changePassword(testUser.id, "NewPassword12!");
      const users = await getUsers();
      expect(users.find(u => u.id === testUser.id).requiresPasswordChange).toBe(false);
    });

    test("should reject weak password", async () => {
      await loginUser("test@example.com", VALID_PASSWORD);
      const result = await changePassword(testUser.id, "12345");
      expect(result.success).toBe(false);
      expect(result.message).toContain("mindestens 12 Zeichen");
    });

    test("should handle non-existent user", async () => {
      await loginUser("test@example.com", VALID_PASSWORD);
      const result = await changePassword("non-existent-id", "NewPassword12!");
      expect(result.success).toBe(false);
      expect(result.message).toContain("nicht gefunden");
    });
  });

  describe("canEditRecipe", () => {
    let adminUser, editUser, readUser, recipe;

    beforeEach(async () => {
      adminUser = (await registerUser({ vorname: "Admin", nachname: "User", email: "admin@example.com", password: VALID_PASSWORD })).user;
      editUser = (await registerUser({ vorname: "Edit", nachname: "User", email: "edit@example.com", password: VALID_PASSWORD })).user;
      await updateUserRole(editUser.id, ROLES.EDIT);
      editUser = (await getUsers()).find(u => u.id === editUser.id);
      readUser = (await registerUser({ vorname: "Read", nachname: "User", email: "read@example.com", password: VALID_PASSWORD })).user;
      recipe = { id: "1", title: "Test Recipe", authorId: editUser.id };
    });

    test("should allow admin to edit any recipe", () => { expect(canEditRecipe(adminUser, recipe)).toBe(true); });
    test("should allow author to edit their own recipe", () => { expect(canEditRecipe(editUser, recipe)).toBe(true); });
    test("should not allow edit user to edit other users recipes", () => { expect(canEditRecipe(editUser, { ...recipe, authorId: adminUser.id })).toBe(false); });
    test("should not allow read user to edit any recipe", () => { expect(canEditRecipe(readUser, recipe)).toBe(false); });
    test("should return false for null user", () => { expect(canEditRecipe(null, recipe)).toBe(false); });
    test("should return false for recipe without author", () => { expect(canEditRecipe(editUser, { id: "2", title: "No Author" })).toBe(false); });
    test("should allow admin to edit recipe without author", () => { expect(canEditRecipe(adminUser, { id: "2", title: "Sample" })).toBe(true); });
  });

  describe("canDeleteRecipe", () => {
    const adminUser = { id: "admin-1", role: ROLES.ADMIN, isAdmin: true };
    const editUser = { id: "edit-1", role: ROLES.EDIT, isAdmin: false };
    const recipe = { id: "1", title: "Test Recipe", authorId: editUser.id };

    test("should allow admin to delete any recipe", () => { expect(canDeleteRecipe(adminUser, recipe)).toBe(true); });
    test("should allow edit user to delete their own non-public recipe", () => { expect(canDeleteRecipe(editUser, recipe, false)).toBe(true); });
    test("should not allow edit user to delete their own public recipe", () => { expect(canDeleteRecipe(editUser, recipe, true)).toBe(false); });
    test("should not allow edit user to delete other users recipes", () => { expect(canDeleteRecipe(editUser, { ...recipe, authorId: adminUser.id }, false)).toBe(false); });
    test("should return false for null user", () => { expect(canDeleteRecipe(null, recipe)).toBe(false); });
    test("should allow admin to delete recipe without author", () => { expect(canDeleteRecipe(adminUser, { id: "2", title: "Sample" })).toBe(true); });
  });

  describe("hasPermission", () => {
    test("should allow admin to access any permission level", () => {
      const adminUser = { role: ROLES.ADMIN };
      expect(hasPermission(adminUser, ROLES.READ)).toBe(true);
      expect(hasPermission(adminUser, ROLES.COMMENT)).toBe(true);
      expect(hasPermission(adminUser, ROLES.EDIT)).toBe(true);
      expect(hasPermission(adminUser, ROLES.ADMIN)).toBe(true);
    });
    test("should allow edit user to access edit, comment, and read", () => {
      const editUser = { role: ROLES.EDIT };
      expect(hasPermission(editUser, ROLES.READ)).toBe(true);
      expect(hasPermission(editUser, ROLES.COMMENT)).toBe(true);
      expect(hasPermission(editUser, ROLES.EDIT)).toBe(true);
      expect(hasPermission(editUser, ROLES.ADMIN)).toBe(false);
    });
    test("should allow comment user to access comment and read", () => {
      const commentUser = { role: ROLES.COMMENT };
      expect(hasPermission(commentUser, ROLES.READ)).toBe(true);
      expect(hasPermission(commentUser, ROLES.COMMENT)).toBe(true);
      expect(hasPermission(commentUser, ROLES.EDIT)).toBe(false);
    });
    test("should allow read user only read access", () => {
      const readUser = { role: ROLES.READ };
      expect(hasPermission(readUser, ROLES.READ)).toBe(true);
      expect(hasPermission(readUser, ROLES.COMMENT)).toBe(false);
    });
    test("should not grant guest user any permissions", () => {
      const guestUser = { role: ROLES.GUEST };
      expect(hasPermission(guestUser, ROLES.READ)).toBe(false);
    });
    test("should return false for null user", () => { expect(hasPermission(null, ROLES.READ)).toBe(false); });
    test("should return false for user without role", () => { expect(hasPermission({ id: "1" }, ROLES.READ)).toBe(false); });
  });

  describe("canCommentOnRecipes", () => {
    test("should return true for admin users", () => { expect(canCommentOnRecipes({ role: ROLES.ADMIN })).toBe(true); });
    test("should return true for edit users", () => { expect(canCommentOnRecipes({ role: ROLES.EDIT })).toBe(true); });
    test("should return true for comment users", () => { expect(canCommentOnRecipes({ role: ROLES.COMMENT })).toBe(true); });
    test("should return false for read users", () => { expect(canCommentOnRecipes({ role: ROLES.READ })).toBe(false); });
    test("should return false for guest users", () => { expect(canCommentOnRecipes({ role: ROLES.GUEST })).toBe(false); });
    test("should return false for null user", () => { expect(canCommentOnRecipes(null)).toBe(false); });
  });

  describe("canReadRecipes", () => {
    test("should return true for admin users", () => { expect(canReadRecipes({ role: ROLES.ADMIN })).toBe(true); });
    test("should return true for edit users", () => { expect(canReadRecipes({ role: ROLES.EDIT })).toBe(true); });
    test("should return true for comment users", () => { expect(canReadRecipes({ role: ROLES.COMMENT })).toBe(true); });
    test("should return true for read users", () => { expect(canReadRecipes({ role: ROLES.READ })).toBe(true); });
    test("should return true for guest users", () => { expect(canReadRecipes({ role: ROLES.GUEST })).toBe(true); });
    test("should return false for null user", () => { expect(canReadRecipes(null)).toBe(false); });
  });

  describe("Permission Hierarchy Integration", () => {
    test("should respect Edit includes Comment and Read", () => {
      const editUser = { role: ROLES.EDIT };
      expect(canEditRecipes(editUser)).toBe(true);
      expect(canCommentOnRecipes(editUser)).toBe(true);
      expect(canReadRecipes(editUser)).toBe(true);
      expect(canDeleteRecipes(editUser)).toBe(false);
    });
    test("should respect Comment includes Read", () => {
      const commentUser = { role: ROLES.COMMENT };
      expect(canEditRecipes(commentUser)).toBe(false);
      expect(canCommentOnRecipes(commentUser)).toBe(true);
      expect(canReadRecipes(commentUser)).toBe(true);
      expect(canDeleteRecipes(commentUser)).toBe(false);
    });
    test("should respect Read only has read permission", () => {
      const readUser = { role: ROLES.READ };
      expect(canEditRecipes(readUser)).toBe(false);
      expect(canCommentOnRecipes(readUser)).toBe(false);
      expect(canReadRecipes(readUser)).toBe(true);
      expect(canDeleteRecipes(readUser)).toBe(false);
    });
    test("should respect Admin has all permissions", () => {
      const adminUser = { role: ROLES.ADMIN };
      expect(canEditRecipes(adminUser)).toBe(true);
      expect(canCommentOnRecipes(adminUser)).toBe(true);
      expect(canReadRecipes(adminUser)).toBe(true);
      expect(canDeleteRecipes(adminUser)).toBe(true);
    });
    test("should respect Guest only has read permission", () => {
      const guestUser = { role: ROLES.GUEST };
      expect(canEditRecipes(guestUser)).toBe(false);
      expect(canCommentOnRecipes(guestUser)).toBe(false);
      expect(canReadRecipes(guestUser)).toBe(true);
      expect(canDeleteRecipes(guestUser)).toBe(false);
    });
  });

  describe("Recipe-specific permissions (new versioning)", () => {
    const adminUser = { id: "admin-1", role: ROLES.ADMIN };
    const editUser = { id: "user-1", role: ROLES.EDIT };
    const readUser = { id: "user-2", role: ROLES.READ };
    const recipeByEditUser = { id: "recipe-1", title: "Test Recipe", authorId: "user-1" };
    const recipeByAnotherUser = { id: "recipe-2", title: "Other Recipe", authorId: "other-user" };

    describe("canDirectlyEditRecipe", () => {
      test("should allow admin to directly edit any recipe", () => {
        expect(canDirectlyEditRecipe(adminUser, recipeByEditUser)).toBe(true);
        expect(canDirectlyEditRecipe(adminUser, recipeByAnotherUser)).toBe(true);
      });
      test("should allow author to directly edit their own recipe", () => { expect(canDirectlyEditRecipe(editUser, recipeByEditUser)).toBe(true); });
      test("should not allow user to directly edit other users recipes", () => { expect(canDirectlyEditRecipe(editUser, recipeByAnotherUser)).toBe(false); });
      test("should not allow users without edit permission to directly edit any recipe", () => {
        expect(canDirectlyEditRecipe(readUser, recipeByEditUser)).toBe(false);
        expect(canDirectlyEditRecipe(readUser, recipeByAnotherUser)).toBe(false);
      });
      test("should return false if user or recipe is null", () => {
        expect(canDirectlyEditRecipe(null, recipeByEditUser)).toBe(false);
        expect(canDirectlyEditRecipe(editUser, null)).toBe(false);
        expect(canDirectlyEditRecipe(null, null)).toBe(false);
      });
    });

    describe("canCreateNewVersion", () => {
      test("should allow admin to create new versions", () => { expect(canCreateNewVersion(adminUser)).toBe(true); });
      test("should allow users with EDIT permission to create new versions", () => { expect(canCreateNewVersion(editUser)).toBe(true); });
      test("should not allow users with only READ permission to create new versions", () => { expect(canCreateNewVersion(readUser)).toBe(false); });
      test("should not allow users with COMMENT permission to create new versions", () => { expect(canCreateNewVersion({ id: "user-3", role: ROLES.COMMENT })).toBe(false); });
      test("should not allow guest users to create new versions", () => { expect(canCreateNewVersion({ id: "guest-1", role: ROLES.GUEST })).toBe(false); });
      test("should return false if user is null", () => { expect(canCreateNewVersion(null)).toBe(false); });
    });
  });

  describe("Menu-specific permissions", () => {
    const adminUser = { id: "admin-1", role: ROLES.ADMIN };
    const editUser = { id: "user-1", role: ROLES.EDIT };
    const otherUser = { id: "user-2", role: ROLES.EDIT };
    const readUser = { id: "user-3", role: ROLES.READ };
    const privateMenuByEditUser = { id: "menu-1", name: "Test Menu", authorId: "user-1", privat: true };
    const publicMenuByEditUser = { id: "menu-3", name: "Public Menu", authorId: "user-1", privat: false };
    const menuByOtherUser = { id: "menu-2", name: "Other Menu", authorId: "other-user" };

    describe("canEditMenu", () => {
      test("should allow admin to edit any menu", () => {
        expect(canEditMenu(adminUser, privateMenuByEditUser)).toBe(true);
        expect(canEditMenu(adminUser, menuByOtherUser)).toBe(true);
      });
      test("should allow author to edit their own menu", () => { expect(canEditMenu(editUser, privateMenuByEditUser)).toBe(true); });
      test("should not allow non-author edit user to edit other menus", () => { expect(canEditMenu(otherUser, privateMenuByEditUser)).toBe(false); });
      test("should not allow read user to edit any menu", () => { expect(canEditMenu(readUser, privateMenuByEditUser)).toBe(false); });
      test("should return false for null user or menu", () => {
        expect(canEditMenu(null, privateMenuByEditUser)).toBe(false);
        expect(canEditMenu(editUser, null)).toBe(false);
      });
    });

    describe("canDeleteMenu", () => {
      test("should allow admin to delete any menu", () => { expect(canDeleteMenu(adminUser, privateMenuByEditUser)).toBe(true); });
      test("should allow admin to delete public menus too", () => { expect(canDeleteMenu(adminUser, publicMenuByEditUser)).toBe(true); });
      test("should allow author to delete their own private menu", () => { expect(canDeleteMenu(editUser, privateMenuByEditUser)).toBe(true); });
      test("should not allow author to delete their own public menu", () => { expect(canDeleteMenu(editUser, publicMenuByEditUser)).toBe(false); });
      test("should not allow non-author to delete menus", () => { expect(canDeleteMenu(otherUser, privateMenuByEditUser)).toBe(false); });
      test("should not allow read user to delete any menu", () => { expect(canDeleteMenu(readUser, privateMenuByEditUser)).toBe(false); });
      test("should return false for null user or menu", () => {
        expect(canDeleteMenu(null, privateMenuByEditUser)).toBe(false);
        expect(canDeleteMenu(editUser, null)).toBe(false);
      });
    });
  });

  describe("updateUserFotoscan", () => {
    let testUser;

    beforeEach(async () => {
      testUser = (await registerUser({ vorname: "Anna", nachname: "Test", email: "anna@example.com", password: VALID_PASSWORD })).user;
    });

    test("should update fotoscan to true", async () => {
      const result = await updateUserFotoscan(testUser.id, true);
      expect(result.success).toBe(true);
      const users = await getUsers();
      expect(users.find(u => u.id === testUser.id).fotoscan).toBe(true);
    });

    test("should update fotoscan to false", async () => {
      await updateUserFotoscan(testUser.id, true);
      const result = await updateUserFotoscan(testUser.id, false);
      expect(result.success).toBe(true);
      const users = await getUsers();
      expect(users.find(u => u.id === testUser.id).fotoscan).toBe(false);
    });

    test("should return error for non-existent user", async () => {
      const result = await updateUserFotoscan("non-existent-id", true);
      expect(result.success).toBe(false);
      expect(result.message).toBe("Benutzer nicht gefunden.");
    });
  });

  describe("registerUser fotoscan field", () => {
    test("should set fotoscan to false by default", async () => {
      const result = await registerUser({ vorname: "Test", nachname: "User", email: "test@example.com", password: VALID_PASSWORD });
      expect(result.success).toBe(true);
      expect(result.user.fotoscan).toBe(false);
    });
  });

  describe("ROLE_PERMISSIONS_DEFAULT", () => {
    test("should have settingsAccess enabled for admin and moderator", () => {
      expect(ROLE_PERMISSIONS_DEFAULT[ROLES.ADMIN].settingsAccess).toBe(true);
      expect(ROLE_PERMISSIONS_DEFAULT[ROLES.MODERATOR].settingsAccess).toBe(true);
    });
    test("should have settingsAccess disabled for edit/comment/read roles", () => {
      [ROLES.EDIT, ROLES.COMMENT, ROLES.READ].forEach((role) => {
        expect(ROLE_PERMISSIONS_DEFAULT[role].settingsAccess).toBe(false);
      });
    });
    test("should have fotoscan and webimport enabled for admin", () => {
      expect(ROLE_PERMISSIONS_DEFAULT[ROLES.ADMIN].fotoscan).toBe(true);
      expect(ROLE_PERMISSIONS_DEFAULT[ROLES.ADMIN].webimport).toBe(true);
    });
    test("should have fotoscan and webimport disabled for non-admin roles", () => {
      [ROLES.MODERATOR, ROLES.EDIT, ROLES.COMMENT, ROLES.READ].forEach((role) => {
        expect(ROLE_PERMISSIONS_DEFAULT[role].fotoscan).toBe(false);
        expect(ROLE_PERMISSIONS_DEFAULT[role].webimport).toBe(false);
      });
    });
    test("should have sortCarousel enabled for admin", () => { expect(ROLE_PERMISSIONS_DEFAULT[ROLES.ADMIN].sortCarousel).toBe(true); });
    test("should have sortCarousel disabled for non-admin roles", () => {
      [ROLES.MODERATOR, ROLES.EDIT, ROLES.COMMENT, ROLES.READ].forEach((role) => {
        expect(ROLE_PERMISSIONS_DEFAULT[role].sortCarousel).toBe(false);
      });
    });
    test("should have editLists enabled for admin", () => { expect(ROLE_PERMISSIONS_DEFAULT[ROLES.ADMIN].editLists).toBe(true); });
    test("should have editLists disabled for non-admin roles", () => {
      [ROLES.MODERATOR, ROLES.EDIT, ROLES.COMMENT, ROLES.READ].forEach((role) => {
        expect(ROLE_PERMISSIONS_DEFAULT[role].editLists).toBe(false);
      });
    });
    test("should include all assignable roles", () => {
      [ROLES.ADMIN, ROLES.MODERATOR, ROLES.EDIT, ROLES.COMMENT, ROLES.READ].forEach((role) => {
        expect(ROLE_PERMISSIONS_DEFAULT).toHaveProperty(role);
      });
    });
    test("should not include GUEST role", () => { expect(ROLE_PERMISSIONS_DEFAULT).not.toHaveProperty(ROLES.GUEST); });
  });

  describe("updateRolePermission", () => {
    test("should reject GUEST role", async () => {
      const result = await updateRolePermission(ROLES.GUEST, "fotoscan", true);
      expect(result.success).toBe(false);
      expect(result.message).toBe("Ungültige Berechtigung.");
    });
    test("should reject invalid role", async () => {
      const result = await updateRolePermission("invalid-role", "fotoscan", true);
      expect(result.success).toBe(false);
      expect(result.message).toBe("Ungültige Berechtigung.");
    });
  });
});
