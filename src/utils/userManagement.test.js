import { 
  getUsers, 
  saveUsers, 
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
  getRoleDisplayName,
  ROLES
} from './userManagement';

describe('User Management Utilities', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('registerUser', () => {
    test('should register first user as admin', () => {
      const userData = {
        vorname: 'Max',
        nachname: 'Mustermann',
        email: 'max@example.com',
        password: 'password123'
      };

      const result = registerUser(userData);

      expect(result.success).toBe(true);
      expect(result.user.isAdmin).toBe(true);
      expect(result.user.vorname).toBe('Max');
      expect(result.user.nachname).toBe('Mustermann');
      expect(result.user.email).toBe('max@example.com');
    });

    test('should register second user as non-admin', () => {
      // Register first user
      registerUser({
        vorname: 'First',
        nachname: 'User',
        email: 'first@example.com',
        password: 'password123'
      });

      // Register second user
      const result = registerUser({
        vorname: 'Second',
        nachname: 'User',
        email: 'second@example.com',
        password: 'password123'
      });

      expect(result.success).toBe(true);
      expect(result.user.isAdmin).toBe(false);
    });

    test('should not allow duplicate email', () => {
      const userData = {
        vorname: 'Max',
        nachname: 'Mustermann',
        email: 'max@example.com',
        password: 'password123'
      };

      registerUser(userData);
      const result = registerUser(userData);

      expect(result.success).toBe(false);
      expect(result.message).toContain('bereits registriert');
    });

    test('should require all fields', () => {
      const result = registerUser({
        vorname: 'Max',
        nachname: '',
        email: 'max@example.com',
        password: 'password123'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('müssen ausgefüllt');
    });

    test('should normalize email to lowercase', () => {
      const result = registerUser({
        vorname: 'Max',
        nachname: 'Mustermann',
        email: 'MAX@EXAMPLE.COM',
        password: 'password123'
      });

      expect(result.success).toBe(true);
      expect(result.user.email).toBe('max@example.com');
    });
  });

  describe('loginUser', () => {
    beforeEach(() => {
      // Register a user for login tests
      registerUser({
        vorname: 'Test',
        nachname: 'User',
        email: 'test@example.com',
        password: 'password123'
      });
    });

    test('should login with correct credentials', () => {
      const result = loginUser('test@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(result.user.email).toBe('test@example.com');
    });

    test('should fail with incorrect password', () => {
      const result = loginUser('test@example.com', 'wrongpassword');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Ungültige');
    });

    test('should fail with non-existent email', () => {
      const result = loginUser('nonexistent@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Ungültige');
    });

    test('should be case-insensitive for email', () => {
      const result = loginUser('TEST@EXAMPLE.COM', 'password123');

      expect(result.success).toBe(true);
    });

    test('should set current user on successful login', () => {
      loginUser('test@example.com', 'password123');
      const currentUser = getCurrentUser();

      expect(currentUser).not.toBeNull();
      expect(currentUser.email).toBe('test@example.com');
    });
  });

  describe('logoutUser and getCurrentUser', () => {
    test('should clear current user on logout', () => {
      registerUser({
        vorname: 'Test',
        nachname: 'User',
        email: 'test@example.com',
        password: 'password123'
      });
      
      loginUser('test@example.com', 'password123');
      expect(getCurrentUser()).not.toBeNull();
      
      logoutUser();
      expect(getCurrentUser()).toBeNull();
    });
  });

  describe('isCurrentUserAdmin', () => {
    test('should return true if current user is admin', () => {
      registerUser({
        vorname: 'Admin',
        nachname: 'User',
        email: 'admin@example.com',
        password: 'password123'
      });
      
      loginUser('admin@example.com', 'password123');
      expect(isCurrentUserAdmin()).toBe(true);
    });

    test('should return false if current user is not admin', () => {
      // First user (admin)
      registerUser({
        vorname: 'Admin',
        nachname: 'User',
        email: 'admin@example.com',
        password: 'password123'
      });
      
      // Second user (non-admin)
      registerUser({
        vorname: 'Regular',
        nachname: 'User',
        email: 'regular@example.com',
        password: 'password123'
      });
      
      loginUser('regular@example.com', 'password123');
      expect(isCurrentUserAdmin()).toBe(false);
    });

    test('should return false if no user is logged in', () => {
      expect(isCurrentUserAdmin()).toBe(false);
    });
  });

  describe('updateUserAdminStatus', () => {
    let adminUser, regularUser;

    beforeEach(() => {
      // Create admin user (first user)
      const adminResult = registerUser({
        vorname: 'Admin',
        nachname: 'User',
        email: 'admin@example.com',
        password: 'password123'
      });
      adminUser = adminResult.user;

      // Create regular user (second user)
      const regularResult = registerUser({
        vorname: 'Regular',
        nachname: 'User',
        email: 'regular@example.com',
        password: 'password123'
      });
      regularUser = regularResult.user;
    });

    test('should promote regular user to admin', () => {
      const result = updateUserAdminStatus(regularUser.id, true);
      
      expect(result.success).toBe(true);
      
      const users = getUsers();
      const updatedUser = users.find(u => u.id === regularUser.id);
      expect(updatedUser.isAdmin).toBe(true);
    });

    test('should demote admin to regular user when there are multiple admins', () => {
      // First promote regular user to admin
      updateUserAdminStatus(regularUser.id, true);
      
      // Now try to demote original admin
      const result = updateUserAdminStatus(adminUser.id, false);
      
      expect(result.success).toBe(true);
      
      const users = getUsers();
      const updatedUser = users.find(u => u.id === adminUser.id);
      expect(updatedUser.isAdmin).toBe(false);
    });

    test('should not allow removing the last admin', () => {
      const result = updateUserAdminStatus(adminUser.id, false);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('mindestens ein Administrator');
      
      const users = getUsers();
      const unchangedUser = users.find(u => u.id === adminUser.id);
      expect(unchangedUser.isAdmin).toBe(true);
    });

    test('should update current user if they are the one being modified', () => {
      loginUser('admin@example.com', 'password123');
      
      // Promote regular user to admin first
      updateUserAdminStatus(regularUser.id, true);
      
      // Now demote the logged-in admin
      updateUserAdminStatus(adminUser.id, false);
      
      const currentUser = getCurrentUser();
      expect(currentUser.isAdmin).toBe(false);
    });
  });

  describe('getAdminCount', () => {
    test('should return 0 when no users exist', () => {
      expect(getAdminCount()).toBe(0);
    });

    test('should return 1 for first user', () => {
      registerUser({
        vorname: 'Admin',
        nachname: 'User',
        email: 'admin@example.com',
        password: 'password123'
      });
      
      expect(getAdminCount()).toBe(1);
    });

    test('should return correct count when multiple admins exist', () => {
      const admin1 = registerUser({
        vorname: 'Admin1',
        nachname: 'User',
        email: 'admin1@example.com',
        password: 'password123'
      });
      
      const user2 = registerUser({
        vorname: 'User2',
        nachname: 'Name',
        email: 'user2@example.com',
        password: 'password123'
      });
      
      updateUserAdminStatus(user2.user.id, true);
      
      expect(getAdminCount()).toBe(2);
    });
  });

  describe('getUsers and saveUsers', () => {
    test('should return empty array when no users exist', () => {
      expect(getUsers()).toEqual([]);
    });

    test('should save and retrieve users', () => {
      const users = [
        {
          id: '1',
          vorname: 'User1',
          nachname: 'Name1',
          email: 'user1@example.com',
          password: 'password123',
          isAdmin: true
        }
      ];
      
      saveUsers(users);
      const retrieved = getUsers();
      
      expect(retrieved).toEqual(users);
    });
  });

  describe('loginAsGuest', () => {
    test('should create guest user session', () => {
      const result = loginAsGuest();

      expect(result.success).toBe(true);
      expect(result.user.role).toBe(ROLES.GUEST);
      expect(result.user.isGuest).toBe(true);
      expect(result.user.isAdmin).toBe(false);
    });

    test('should set guest as current user', () => {
      loginAsGuest();
      const currentUser = getCurrentUser();

      expect(currentUser).not.toBeNull();
      expect(currentUser.role).toBe(ROLES.GUEST);
      expect(currentUser.isGuest).toBe(true);
    });

    test('should not save guest to users list', () => {
      loginAsGuest();
      const users = getUsers();

      expect(users.length).toBe(0);
    });
  });

  describe('updateUserRole', () => {
    let adminUser, regularUser;

    beforeEach(() => {
      // Create admin user (first user)
      const adminResult = registerUser({
        vorname: 'Admin',
        nachname: 'User',
        email: 'admin@example.com',
        password: 'password123'
      });
      adminUser = adminResult.user;

      // Create regular user (second user)
      const regularResult = registerUser({
        vorname: 'Regular',
        nachname: 'User',
        email: 'regular@example.com',
        password: 'password123'
      });
      regularUser = regularResult.user;
    });

    test('should update user role to edit', () => {
      const result = updateUserRole(regularUser.id, ROLES.EDIT);
      
      expect(result.success).toBe(true);
      
      const users = getUsers();
      const updatedUser = users.find(u => u.id === regularUser.id);
      expect(updatedUser.role).toBe(ROLES.EDIT);
      expect(updatedUser.isAdmin).toBe(false);
    });

    test('should update user role to admin', () => {
      const result = updateUserRole(regularUser.id, ROLES.ADMIN);
      
      expect(result.success).toBe(true);
      
      const users = getUsers();
      const updatedUser = users.find(u => u.id === regularUser.id);
      expect(updatedUser.role).toBe(ROLES.ADMIN);
      expect(updatedUser.isAdmin).toBe(true);
    });

    test('should not allow removing last admin', () => {
      const result = updateUserRole(adminUser.id, ROLES.READ);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('mindestens ein Administrator');
      
      const users = getUsers();
      const unchangedUser = users.find(u => u.id === adminUser.id);
      expect(unchangedUser.isAdmin).toBe(true);
    });

    test('should reject invalid role', () => {
      const result = updateUserRole(regularUser.id, 'invalid_role');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Ungültige Berechtigung');
    });

    test('should update current user if they are being modified', () => {
      loginUser('admin@example.com', 'password123');
      
      // Promote regular user to admin first
      updateUserRole(regularUser.id, ROLES.ADMIN);
      
      // Now change the logged-in admin to read role
      updateUserRole(adminUser.id, ROLES.READ);
      
      const currentUser = getCurrentUser();
      expect(currentUser.role).toBe(ROLES.READ);
      expect(currentUser.isAdmin).toBe(false);
    });
  });

  describe('deleteUser', () => {
    let adminUser, regularUser;

    beforeEach(() => {
      // Create admin user (first user)
      const adminResult = registerUser({
        vorname: 'Admin',
        nachname: 'User',
        email: 'admin@example.com',
        password: 'password123'
      });
      adminUser = adminResult.user;

      // Create regular user (second user)
      const regularResult = registerUser({
        vorname: 'Regular',
        nachname: 'User',
        email: 'regular@example.com',
        password: 'password123'
      });
      regularUser = regularResult.user;
    });

    test('should delete regular user', () => {
      const result = deleteUser(regularUser.id);
      
      expect(result.success).toBe(true);
      
      const users = getUsers();
      expect(users.length).toBe(1);
      expect(users.find(u => u.id === regularUser.id)).toBeUndefined();
    });

    test('should not allow deleting last admin', () => {
      const result = deleteUser(adminUser.id);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('letzte Administrator');
      
      const users = getUsers();
      expect(users.find(u => u.id === adminUser.id)).toBeDefined();
    });

    test('should not allow user to delete themselves', () => {
      // First promote regular user to admin so we have 2 admins
      updateUserRole(regularUser.id, ROLES.ADMIN);
      
      // Login as regular user
      loginUser('regular@example.com', 'password123');
      
      const result = deleteUser(regularUser.id);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('nicht selbst löschen');
    });

    test('should handle non-existent user', () => {
      const result = deleteUser('non-existent-id');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('nicht gefunden');
    });
  });

  describe('canEditRecipes', () => {
    test('should return true for admin users', () => {
      const adminUser = { role: ROLES.ADMIN, isAdmin: true };
      expect(canEditRecipes(adminUser)).toBe(true);
    });

    test('should return true for edit users', () => {
      const editUser = { role: ROLES.EDIT, isAdmin: false };
      expect(canEditRecipes(editUser)).toBe(true);
    });

    test('should return false for read users', () => {
      const readUser = { role: ROLES.READ, isAdmin: false };
      expect(canEditRecipes(readUser)).toBe(false);
    });

    test('should return false for guest users', () => {
      const guestUser = { role: ROLES.GUEST, isAdmin: false };
      expect(canEditRecipes(guestUser)).toBe(false);
    });

    test('should return false for null user', () => {
      expect(canEditRecipes(null)).toBe(false);
    });
  });

  describe('canDeleteRecipes', () => {
    test('should return true for admin users', () => {
      const adminUser = { role: ROLES.ADMIN, isAdmin: true };
      expect(canDeleteRecipes(adminUser)).toBe(true);
    });

    test('should return false for edit users', () => {
      const editUser = { role: ROLES.EDIT, isAdmin: false };
      expect(canDeleteRecipes(editUser)).toBe(false);
    });

    test('should return false for read users', () => {
      const readUser = { role: ROLES.READ, isAdmin: false };
      expect(canDeleteRecipes(readUser)).toBe(false);
    });

    test('should return false for null user', () => {
      expect(canDeleteRecipes(null)).toBe(false);
    });
  });

  describe('getRoleDisplayName', () => {
    test('should return correct display names', () => {
      expect(getRoleDisplayName(ROLES.ADMIN)).toBe('Administrator');
      expect(getRoleDisplayName(ROLES.EDIT)).toBe('Bearbeiten');
      expect(getRoleDisplayName(ROLES.COMMENT)).toBe('Kommentieren');
      expect(getRoleDisplayName(ROLES.READ)).toBe('Lesen');
      expect(getRoleDisplayName(ROLES.GUEST)).toBe('Gast');
    });

    test('should return role itself for unknown role', () => {
      expect(getRoleDisplayName('unknown')).toBe('unknown');
    });
  });
});
