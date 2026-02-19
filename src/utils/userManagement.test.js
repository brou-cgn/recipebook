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

    test('should trim whitespace from email', () => {
      const result = registerUser({
        vorname: 'Benjamin',
        nachname: 'Rousselli',
        email: '  benjamin.rousselli@googlemail.com  ',
        password: 'password123'
      });

      expect(result.success).toBe(true);
      expect(result.user.email).toBe('benjamin.rousselli@googlemail.com');
    });

    test('should prevent duplicate registration with whitespace-trimmed emails', () => {
      registerUser({
        vorname: 'User1',
        nachname: 'Test',
        email: 'duplicate@example.com',
        password: 'password123'
      });

      const result = registerUser({
        vorname: 'User2',
        nachname: 'Test',
        email: '  duplicate@example.com  ',
        password: 'password456'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('bereits registriert');
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

    test('should trim whitespace from email during login', () => {
      const result = loginUser('  test@example.com  ', 'password123');

      expect(result.success).toBe(true);
      expect(result.user.email).toBe('test@example.com');
    });

    test('should handle whitespace in email for user registered with whitespace', () => {
      // Register a user with email containing whitespace
      registerUser({
        vorname: 'Benjamin',
        nachname: 'Rousselli',
        email: '  benjamin.rousselli@googlemail.com  ',
        password: 'testpass123'
      });

      // Should be able to login without whitespace
      const result1 = loginUser('benjamin.rousselli@googlemail.com', 'testpass123');
      expect(result1.success).toBe(true);

      // Should also be able to login with whitespace
      const result2 = loginUser('  benjamin.rousselli@googlemail.com  ', 'testpass123');
      expect(result2.success).toBe(true);
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

  describe('validatePassword', () => {
    test('should accept valid password', () => {
      const result = validatePassword('password123');
      expect(result.valid).toBe(true);
      expect(result.message).toBe('');
    });

    test('should reject password shorter than 6 characters', () => {
      const result = validatePassword('12345');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('mindestens 6 Zeichen');
    });

    test('should reject empty password', () => {
      const result = validatePassword('');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('mindestens 6 Zeichen');
    });

    test('should reject null password', () => {
      const result = validatePassword(null);
      expect(result.valid).toBe(false);
    });
  });

  describe('updateUserName', () => {
    let testUser;

    beforeEach(() => {
      const result = registerUser({
        vorname: 'Original',
        nachname: 'Name',
        email: 'test@example.com',
        password: 'password123'
      });
      testUser = result.user;
    });

    test('should update user name', () => {
      const result = updateUserName(testUser.id, 'New', 'Name');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('erfolgreich aktualisiert');
      
      const users = getUsers();
      const updatedUser = users.find(u => u.id === testUser.id);
      expect(updatedUser.vorname).toBe('New');
      expect(updatedUser.nachname).toBe('Name');
    });

    test('should update current user if they are being modified', () => {
      loginUser('test@example.com', 'password123');
      
      updateUserName(testUser.id, 'Updated', 'User');
      
      const currentUser = getCurrentUser();
      expect(currentUser.vorname).toBe('Updated');
      expect(currentUser.nachname).toBe('User');
    });

    test('should reject empty first name', () => {
      const result = updateUserName(testUser.id, '', 'Name');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('dürfen nicht leer sein');
    });

    test('should reject empty last name', () => {
      const result = updateUserName(testUser.id, 'Name', '');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('dürfen nicht leer sein');
    });

    test('should handle non-existent user', () => {
      const result = updateUserName('non-existent-id', 'New', 'Name');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('nicht gefunden');
    });
  });

  describe('setTemporaryPassword', () => {
    let testUser;

    beforeEach(() => {
      const result = registerUser({
        vorname: 'Test',
        nachname: 'User',
        email: 'test@example.com',
        password: 'password123'
      });
      testUser = result.user;
    });

    test('should set temporary password', () => {
      const result = setTemporaryPassword(testUser.id, 'tempPass123');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('erfolgreich gesetzt');
      
      const users = getUsers();
      const updatedUser = users.find(u => u.id === testUser.id);
      expect(updatedUser.requiresPasswordChange).toBe(true);
    });

    test('should allow login with temporary password', () => {
      setTemporaryPassword(testUser.id, 'tempPass123');
      
      const loginResult = loginUser('test@example.com', 'tempPass123');
      
      expect(loginResult.success).toBe(true);
      expect(loginResult.requiresPasswordChange).toBe(true);
    });

    test('should reject weak password', () => {
      const result = setTemporaryPassword(testUser.id, '12345');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('mindestens 6 Zeichen');
    });

    test('should handle non-existent user', () => {
      const result = setTemporaryPassword('non-existent-id', 'tempPass123');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('nicht gefunden');
    });
  });

  describe('changePassword', () => {
    let testUser;

    beforeEach(() => {
      const result = registerUser({
        vorname: 'Test',
        nachname: 'User',
        email: 'test@example.com',
        password: 'password123'
      });
      testUser = result.user;
    });

    test('should change password', () => {
      const result = changePassword(testUser.id, 'newPassword123');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('erfolgreich geändert');
      
      // Should be able to login with new password
      const loginResult = loginUser('test@example.com', 'newPassword123');
      expect(loginResult.success).toBe(true);
    });

    test('should remove requiresPasswordChange flag', () => {
      // Set temporary password
      setTemporaryPassword(testUser.id, 'tempPass123');
      
      // Change password
      changePassword(testUser.id, 'newPassword123');
      
      const users = getUsers();
      const updatedUser = users.find(u => u.id === testUser.id);
      expect(updatedUser.requiresPasswordChange).toBe(false);
    });

    test('should update current user if they are being modified', () => {
      setTemporaryPassword(testUser.id, 'tempPass123');
      loginUser('test@example.com', 'tempPass123');
      
      changePassword(testUser.id, 'newPassword123');
      
      const currentUser = getCurrentUser();
      expect(currentUser.requiresPasswordChange).toBe(false);
    });

    test('should reject weak password', () => {
      const result = changePassword(testUser.id, '12345');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('mindestens 6 Zeichen');
    });

    test('should handle non-existent user', () => {
      const result = changePassword('non-existent-id', 'newPassword123');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('nicht gefunden');
    });

    test('should not allow login with old password after change', () => {
      changePassword(testUser.id, 'newPassword123');
      
      const loginResult = loginUser('test@example.com', 'password123');
      expect(loginResult.success).toBe(false);
    });
  });

  describe('canEditRecipe', () => {
    let adminUser, editUser, readUser, recipe;

    beforeEach(() => {
      // Create test users
      const adminResult = registerUser({
        vorname: 'Admin',
        nachname: 'User',
        email: 'admin@example.com',
        password: 'password123'
      });
      adminUser = adminResult.user;

      const editResult = registerUser({
        vorname: 'Edit',
        nachname: 'User',
        email: 'edit@example.com',
        password: 'password123'
      });
      editUser = editResult.user;
      updateUserRole(editUser.id, ROLES.EDIT);
      // Refresh user object after role update
      editUser = getUsers().find(u => u.id === editUser.id);

      const readResult = registerUser({
        vorname: 'Read',
        nachname: 'User',
        email: 'read@example.com',
        password: 'password123'
      });
      readUser = readResult.user;

      // Create test recipe with editUser as author
      recipe = {
        id: '1',
        title: 'Test Recipe',
        authorId: editUser.id
      };
    });

    test('should allow admin to edit any recipe', () => {
      expect(canEditRecipe(adminUser, recipe)).toBe(true);
    });

    test('should allow author to edit their own recipe', () => {
      expect(canEditRecipe(editUser, recipe)).toBe(true);
    });

    test('should not allow edit user to edit other users recipes', () => {
      const otherRecipe = { ...recipe, authorId: adminUser.id };
      expect(canEditRecipe(editUser, otherRecipe)).toBe(false);
    });

    test('should not allow read user to edit any recipe', () => {
      expect(canEditRecipe(readUser, recipe)).toBe(false);
    });

    test('should return false for null user', () => {
      expect(canEditRecipe(null, recipe)).toBe(false);
    });

    test('should return false for recipe without author', () => {
      const recipeNoAuthor = { id: '2', title: 'No Author Recipe' };
      expect(canEditRecipe(editUser, recipeNoAuthor)).toBe(false);
    });

    test('should allow admin to edit recipe without author (e.g., sample recipes)', () => {
      const recipeNoAuthor = { id: '2', title: 'Sample Recipe Without Author' };
      expect(canEditRecipe(adminUser, recipeNoAuthor)).toBe(true);
    });
  });

  describe('canDeleteRecipe', () => {
    let adminUser, editUser, recipe;

    beforeEach(() => {
      // Create test users
      const adminResult = registerUser({
        vorname: 'Admin',
        nachname: 'User',
        email: 'admin@example.com',
        password: 'password123'
      });
      adminUser = adminResult.user;

      const editResult = registerUser({
        vorname: 'Edit',
        nachname: 'User',
        email: 'edit@example.com',
        password: 'password123'
      });
      editUser = editResult.user;
      updateUserRole(editUser.id, ROLES.EDIT);
      // Refresh user object after role update
      editUser = getUsers().find(u => u.id === editUser.id);

      // Create test recipe
      recipe = {
        id: '1',
        title: 'Test Recipe',
        authorId: editUser.id
      };
    });

    test('should allow admin to delete any recipe', () => {
      expect(canDeleteRecipe(adminUser, recipe)).toBe(true);
    });

    test('should not allow edit user to delete their own recipe', () => {
      expect(canDeleteRecipe(editUser, recipe)).toBe(false);
    });

    test('should not allow edit user to delete other users recipes', () => {
      const otherRecipe = { ...recipe, authorId: adminUser.id };
      expect(canDeleteRecipe(editUser, otherRecipe)).toBe(false);
    });

    test('should return false for null user', () => {
      expect(canDeleteRecipe(null, recipe)).toBe(false);
    });

    test('should allow admin to delete recipe without author (e.g., sample recipes)', () => {
      const recipeNoAuthor = { id: '2', title: 'Sample Recipe Without Author' };
      expect(canDeleteRecipe(adminUser, recipeNoAuthor)).toBe(true);
    });
  });

  describe('hasPermission', () => {
    test('should allow admin to access any permission level', () => {
      const adminUser = { role: ROLES.ADMIN };
      expect(hasPermission(adminUser, ROLES.READ)).toBe(true);
      expect(hasPermission(adminUser, ROLES.COMMENT)).toBe(true);
      expect(hasPermission(adminUser, ROLES.EDIT)).toBe(true);
      expect(hasPermission(adminUser, ROLES.ADMIN)).toBe(true);
    });

    test('should allow edit user to access edit, comment, and read', () => {
      const editUser = { role: ROLES.EDIT };
      expect(hasPermission(editUser, ROLES.READ)).toBe(true);
      expect(hasPermission(editUser, ROLES.COMMENT)).toBe(true);
      expect(hasPermission(editUser, ROLES.EDIT)).toBe(true);
      expect(hasPermission(editUser, ROLES.ADMIN)).toBe(false);
    });

    test('should allow comment user to access comment and read', () => {
      const commentUser = { role: ROLES.COMMENT };
      expect(hasPermission(commentUser, ROLES.READ)).toBe(true);
      expect(hasPermission(commentUser, ROLES.COMMENT)).toBe(true);
      expect(hasPermission(commentUser, ROLES.EDIT)).toBe(false);
      expect(hasPermission(commentUser, ROLES.ADMIN)).toBe(false);
    });

    test('should allow read user only read access', () => {
      const readUser = { role: ROLES.READ };
      expect(hasPermission(readUser, ROLES.READ)).toBe(true);
      expect(hasPermission(readUser, ROLES.COMMENT)).toBe(false);
      expect(hasPermission(readUser, ROLES.EDIT)).toBe(false);
      expect(hasPermission(readUser, ROLES.ADMIN)).toBe(false);
    });

    test('should not grant guest user any permissions', () => {
      const guestUser = { role: ROLES.GUEST };
      expect(hasPermission(guestUser, ROLES.READ)).toBe(false);
      expect(hasPermission(guestUser, ROLES.COMMENT)).toBe(false);
      expect(hasPermission(guestUser, ROLES.EDIT)).toBe(false);
      expect(hasPermission(guestUser, ROLES.ADMIN)).toBe(false);
    });

    test('should return false for null user', () => {
      expect(hasPermission(null, ROLES.READ)).toBe(false);
    });

    test('should return false for user without role', () => {
      const userWithoutRole = { id: '1' };
      expect(hasPermission(userWithoutRole, ROLES.READ)).toBe(false);
    });
  });

  describe('canCommentOnRecipes', () => {
    test('should return true for admin users', () => {
      const adminUser = { role: ROLES.ADMIN };
      expect(canCommentOnRecipes(adminUser)).toBe(true);
    });

    test('should return true for edit users', () => {
      const editUser = { role: ROLES.EDIT };
      expect(canCommentOnRecipes(editUser)).toBe(true);
    });

    test('should return true for comment users', () => {
      const commentUser = { role: ROLES.COMMENT };
      expect(canCommentOnRecipes(commentUser)).toBe(true);
    });

    test('should return false for read users', () => {
      const readUser = { role: ROLES.READ };
      expect(canCommentOnRecipes(readUser)).toBe(false);
    });

    test('should return false for guest users', () => {
      const guestUser = { role: ROLES.GUEST };
      expect(canCommentOnRecipes(guestUser)).toBe(false);
    });

    test('should return false for null user', () => {
      expect(canCommentOnRecipes(null)).toBe(false);
    });
  });

  describe('canReadRecipes', () => {
    test('should return true for admin users', () => {
      const adminUser = { role: ROLES.ADMIN };
      expect(canReadRecipes(adminUser)).toBe(true);
    });

    test('should return true for edit users', () => {
      const editUser = { role: ROLES.EDIT };
      expect(canReadRecipes(editUser)).toBe(true);
    });

    test('should return true for comment users', () => {
      const commentUser = { role: ROLES.COMMENT };
      expect(canReadRecipes(commentUser)).toBe(true);
    });

    test('should return true for read users', () => {
      const readUser = { role: ROLES.READ };
      expect(canReadRecipes(readUser)).toBe(true);
    });

    // GUEST is a special temporary role for unauthenticated access
    // It's not part of the assignable role hierarchy but has read-only access
    test('should return true for guest users', () => {
      const guestUser = { role: ROLES.GUEST };
      expect(canReadRecipes(guestUser)).toBe(true);
    });

    test('should return false for null user', () => {
      expect(canReadRecipes(null)).toBe(false);
    });
  });

  describe('Permission Hierarchy Integration', () => {
    test('should respect Edit includes Comment and Read', () => {
      const editUser = { role: ROLES.EDIT };
      expect(canEditRecipes(editUser)).toBe(true);
      expect(canCommentOnRecipes(editUser)).toBe(true);
      expect(canReadRecipes(editUser)).toBe(true);
      expect(canDeleteRecipes(editUser)).toBe(false); // Only admin can delete
    });

    test('should respect Comment includes Read', () => {
      const commentUser = { role: ROLES.COMMENT };
      expect(canEditRecipes(commentUser)).toBe(false);
      expect(canCommentOnRecipes(commentUser)).toBe(true);
      expect(canReadRecipes(commentUser)).toBe(true);
      expect(canDeleteRecipes(commentUser)).toBe(false);
    });

    test('should respect Read only has read permission', () => {
      const readUser = { role: ROLES.READ };
      expect(canEditRecipes(readUser)).toBe(false);
      expect(canCommentOnRecipes(readUser)).toBe(false);
      expect(canReadRecipes(readUser)).toBe(true);
      expect(canDeleteRecipes(readUser)).toBe(false);
    });

    test('should respect Admin has all permissions', () => {
      const adminUser = { role: ROLES.ADMIN };
      expect(canEditRecipes(adminUser)).toBe(true);
      expect(canCommentOnRecipes(adminUser)).toBe(true);
      expect(canReadRecipes(adminUser)).toBe(true);
      expect(canDeleteRecipes(adminUser)).toBe(true);
    });

    test('should respect Guest only has read permission', () => {
      const guestUser = { role: ROLES.GUEST };
      expect(canEditRecipes(guestUser)).toBe(false);
      expect(canCommentOnRecipes(guestUser)).toBe(false);
      expect(canReadRecipes(guestUser)).toBe(true);
      expect(canDeleteRecipes(guestUser)).toBe(false);
    });
  });

  describe('Recipe-specific permissions (new versioning)', () => {
    const adminUser = { id: 'admin-1', role: ROLES.ADMIN };
    const editUser = { id: 'user-1', role: ROLES.EDIT };
    const readUser = { id: 'user-2', role: ROLES.READ };
    const recipeByEditUser = { id: 'recipe-1', title: 'Test Recipe', authorId: 'user-1' };
    const recipeByAnotherUser = { id: 'recipe-2', title: 'Other Recipe', authorId: 'other-user' };

    describe('canDirectlyEditRecipe', () => {
      test('should allow admin to directly edit any recipe', () => {
        expect(canDirectlyEditRecipe(adminUser, recipeByEditUser)).toBe(true);
        expect(canDirectlyEditRecipe(adminUser, recipeByAnotherUser)).toBe(true);
      });

      test('should allow author to directly edit their own recipe', () => {
        expect(canDirectlyEditRecipe(editUser, recipeByEditUser)).toBe(true);
      });

      test('should not allow user to directly edit other users recipes', () => {
        expect(canDirectlyEditRecipe(editUser, recipeByAnotherUser)).toBe(false);
      });

      test('should not allow users without edit permission to directly edit any recipe', () => {
        expect(canDirectlyEditRecipe(readUser, recipeByEditUser)).toBe(false);
        expect(canDirectlyEditRecipe(readUser, recipeByAnotherUser)).toBe(false);
      });

      test('should return false if user or recipe is null', () => {
        expect(canDirectlyEditRecipe(null, recipeByEditUser)).toBe(false);
        expect(canDirectlyEditRecipe(editUser, null)).toBe(false);
        expect(canDirectlyEditRecipe(null, null)).toBe(false);
      });
    });

    describe('canCreateNewVersion', () => {
      test('should allow admin to create new versions', () => {
        expect(canCreateNewVersion(adminUser)).toBe(true);
      });

      test('should allow users with EDIT permission to create new versions', () => {
        expect(canCreateNewVersion(editUser)).toBe(true);
      });

      test('should not allow users with only READ permission to create new versions', () => {
        expect(canCreateNewVersion(readUser)).toBe(false);
      });

      test('should not allow users with COMMENT permission to create new versions', () => {
        const commentUser = { id: 'user-3', role: ROLES.COMMENT };
        expect(canCreateNewVersion(commentUser)).toBe(false);
      });

      test('should not allow guest users to create new versions', () => {
        const guestUser = { id: 'guest-1', role: ROLES.GUEST };
        expect(canCreateNewVersion(guestUser)).toBe(false);
      });

      test('should return false if user is null', () => {
        expect(canCreateNewVersion(null)).toBe(false);
      });
    });
  });

  describe('Menu-specific permissions', () => {
    const adminUser = { id: 'admin-1', role: ROLES.ADMIN };
    const editUser = { id: 'user-1', role: ROLES.EDIT };
    const otherUser = { id: 'user-2', role: ROLES.EDIT };
    const readUser = { id: 'user-3', role: ROLES.READ };
    const menuByEditUser = { id: 'menu-1', name: 'Test Menu', authorId: 'user-1' };
    const menuByOtherUser = { id: 'menu-2', name: 'Other Menu', authorId: 'other-user' };

    describe('canEditMenu', () => {
      test('should allow admin to edit any menu', () => {
        expect(canEditMenu(adminUser, menuByEditUser)).toBe(true);
        expect(canEditMenu(adminUser, menuByOtherUser)).toBe(true);
      });

      test('should allow author to edit their own menu', () => {
        expect(canEditMenu(editUser, menuByEditUser)).toBe(true);
      });

      test('should not allow user to edit another user\'s menu', () => {
        expect(canEditMenu(otherUser, menuByEditUser)).toBe(false);
        expect(canEditMenu(editUser, menuByOtherUser)).toBe(false);
      });

      test('should not allow read-only users to edit any menu', () => {
        expect(canEditMenu(readUser, menuByEditUser)).toBe(false);
        expect(canEditMenu(readUser, menuByOtherUser)).toBe(false);
      });

      test('should return false if user or menu is null', () => {
        expect(canEditMenu(null, menuByEditUser)).toBe(false);
        expect(canEditMenu(editUser, null)).toBe(false);
        expect(canEditMenu(null, null)).toBe(false);
      });
    });

    describe('canDeleteMenu', () => {
      test('should allow admin to delete any menu', () => {
        expect(canDeleteMenu(adminUser, menuByEditUser)).toBe(true);
        expect(canDeleteMenu(adminUser, menuByOtherUser)).toBe(true);
      });

      test('should allow author to delete their own menu', () => {
        expect(canDeleteMenu(editUser, menuByEditUser)).toBe(true);
      });

      test('should not allow user to delete another user\'s menu', () => {
        expect(canDeleteMenu(otherUser, menuByEditUser)).toBe(false);
        expect(canDeleteMenu(editUser, menuByOtherUser)).toBe(false);
      });

      test('should not allow read-only users to delete any menu', () => {
        expect(canDeleteMenu(readUser, menuByEditUser)).toBe(false);
        expect(canDeleteMenu(readUser, menuByOtherUser)).toBe(false);
      });

      test('should return false if user or menu is null', () => {
        expect(canDeleteMenu(null, menuByEditUser)).toBe(false);
        expect(canDeleteMenu(editUser, null)).toBe(false);
        expect(canDeleteMenu(null, null)).toBe(false);
      });
    });
  });

  describe('updateUserFotoscan', () => {
    test('should update fotoscan setting for existing user', async () => {
      // Register a user first
      const userData = {
        vorname: 'Max',
        nachname: 'Mustermann',
        email: 'max@example.com',
        password: 'password123'
      };
      
      const registerResult = await registerUser(userData);
      expect(registerResult.success).toBe(true);
      const userId = registerResult.user.id;
      
      // Initially fotoscan should be false
      expect(registerResult.user.fotoscan).toBe(false);
      
      // Update fotoscan to true
      const result = await updateUserFotoscan(userId, true);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Fotoscan-Einstellung erfolgreich aktualisiert.');
      
      // Verify it was updated
      const users = await getUsers();
      const updatedUser = users.find(u => u.id === userId);
      expect(updatedUser.fotoscan).toBe(true);
    });

    test('should update fotoscan to false', async () => {
      // Register a user
      const userData = {
        vorname: 'Anna',
        nachname: 'Schmidt',
        email: 'anna@example.com',
        password: 'password123'
      };
      
      const registerResult = await registerUser(userData);
      const userId = registerResult.user.id;
      
      // Set fotoscan to true first
      await updateUserFotoscan(userId, true);
      
      // Then set it back to false
      const result = await updateUserFotoscan(userId, false);
      expect(result.success).toBe(true);
      
      // Verify it was updated to false
      const users = await getUsers();
      const updatedUser = users.find(u => u.id === userId);
      expect(updatedUser.fotoscan).toBe(false);
    });

    test('should return error for non-existent user', async () => {
      const result = await updateUserFotoscan('non-existent-id', true);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Benutzer nicht gefunden.');
    });
  });

  describe('registerUser fotoscan field', () => {
    test('should set fotoscan to false by default', async () => {
      const userData = {
        vorname: 'Test',
        nachname: 'User',
        email: 'test@example.com',
        password: 'password123'
      };
      
      const result = await registerUser(userData);
      expect(result.success).toBe(true);
      expect(result.user.fotoscan).toBe(false);
    });
  });
});
