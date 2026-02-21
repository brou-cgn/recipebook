/**
 * Recipe Firestore Utilities Tests
 * Tests the draft recipe filtering logic
 */

// Mock Firebase
jest.mock('../firebase', () => ({
  db: {}
}));

// Mock Firestore functions
const mockOnSnapshot = jest.fn();
const mockGetDocs = jest.fn();
const mockUpdateDoc = jest.fn();
const mockAddDoc = jest.fn();
const mockGetDoc = jest.fn();
const mockDeleteDoc = jest.fn();
const mockIncrement = jest.fn((val) => ({ __increment: val }));
const mockQuery = jest.fn((...args) => args);
const mockWhere = jest.fn((...args) => args);
const mockDeleteField = jest.fn(() => ({ __deleteField: true }));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  getDocs: (...args) => mockGetDocs(...args),
  doc: jest.fn(),
  addDoc: (...args) => mockAddDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  serverTimestamp: jest.fn(() => 'mock-timestamp'),
  increment: (...args) => mockIncrement(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  deleteField: () => mockDeleteField()
}));

// Mock Storage Utils
jest.mock('./storageUtils', () => ({
  deleteRecipeImage: jest.fn()
}));

// Mock Firestore Utils
jest.mock('./firestoreUtils', () => ({
  removeUndefinedFields: jest.fn((obj) => obj)
}));

import { subscribeToRecipes, getRecipes, addRecipe, updateRecipe, deleteRecipe, initializeRecipeCounts, getRecipeByShareId, enableRecipeSharing, disableRecipeSharing } from './recipeFirestore';

// Reference to the mocked doc function (set up implementation in beforeEach)
const { doc: mockDoc } = jest.requireMock('firebase/firestore');

// Helper to create mock snapshot
const createMockSnapshot = (recipes) => ({
  forEach: (callback) => {
    recipes.forEach(recipe => {
      callback({ 
        id: recipe.id, 
        data: () => {
          const { id, ...rest } = recipe;
          return rest;
        }
      });
    });
  }
});

describe('Recipe Firestore - Draft Recipe Filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('subscribeToRecipes', () => {
    it('should filter out private recipes for non-admin users who are not the author', (done) => {
      const mockRecipes = [
        { id: '1', title: 'Public Recipe', isPrivate: false, authorId: 'user1' },
        { id: '2', title: 'Private Recipe by User1', isPrivate: true, authorId: 'user1' },
        { id: '3', title: 'Private Recipe by User2', isPrivate: true, authorId: 'user2' },
        { id: '4', title: 'Another Public Recipe', isPrivate: false, authorId: 'user2' }
      ];

      mockOnSnapshot.mockImplementation((ref, successCallback) => {
        successCallback(createMockSnapshot(mockRecipes));
        return jest.fn(); // unsubscribe function
      });

      // Test as non-admin user1
      subscribeToRecipes('user1', false, (recipes) => {
        expect(recipes).toHaveLength(3);
        expect(recipes.map(r => r.id)).toEqual(['1', '2', '4']);
        expect(recipes.find(r => r.id === '3')).toBeUndefined();
        done();
      });
    });

    it('should show all recipes to admin users', (done) => {
      const mockRecipes = [
        { id: '1', title: 'Public Recipe', isPrivate: false, authorId: 'user1' },
        { id: '2', title: 'Private Recipe by User1', isPrivate: true, authorId: 'user1' },
        { id: '3', title: 'Private Recipe by User2', isPrivate: true, authorId: 'user2' },
        { id: '4', title: 'Private Recipe by User3', isPrivate: true, authorId: 'user3' }
      ];

      mockOnSnapshot.mockImplementation((ref, successCallback) => {
        successCallback(createMockSnapshot(mockRecipes));
        return jest.fn();
      });

      // Test as admin user1
      subscribeToRecipes('user1', true, (recipes) => {
        expect(recipes).toHaveLength(4);
        expect(recipes.map(r => r.id)).toEqual(['1', '2', '3', '4']);
        done();
      });
    });

    it('should show private recipes to their authors even if not admin', (done) => {
      const mockRecipes = [
        { id: '1', title: 'Public Recipe', isPrivate: false, authorId: 'user1' },
        { id: '2', title: 'My Private Recipe', isPrivate: true, authorId: 'user2' },
        { id: '3', title: 'Other Private Recipe', isPrivate: true, authorId: 'user3' }
      ];

      mockOnSnapshot.mockImplementation((ref, successCallback) => {
        successCallback(createMockSnapshot(mockRecipes));
        return jest.fn();
      });

      // Test as non-admin user2
      subscribeToRecipes('user2', false, (recipes) => {
        expect(recipes).toHaveLength(2);
        expect(recipes.map(r => r.id)).toEqual(['1', '2']);
        expect(recipes.find(r => r.id === '3')).toBeUndefined();
        done();
      });
    });

    it('should show all public recipes to non-admin users', (done) => {
      const mockRecipes = [
        { id: '1', title: 'Public Recipe 1', isPrivate: false, authorId: 'user1' },
        { id: '2', title: 'Public Recipe 2', isPrivate: false, authorId: 'user2' },
        { id: '3', title: 'Public Recipe 3', isPrivate: false, authorId: 'user3' }
      ];

      mockOnSnapshot.mockImplementation((ref, successCallback) => {
        successCallback(createMockSnapshot(mockRecipes));
        return jest.fn();
      });

      // Test as non-admin user1
      subscribeToRecipes('user1', false, (recipes) => {
        expect(recipes).toHaveLength(3);
        expect(recipes.map(r => r.id)).toEqual(['1', '2', '3']);
        done();
      });
    });

    it('should handle error callback', (done) => {
      mockOnSnapshot.mockImplementation((ref, successCallback, errorCallback) => {
        errorCallback(new Error('Firestore error'));
        return jest.fn();
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      subscribeToRecipes('user1', false, (recipes) => {
        expect(recipes).toEqual([]);
        expect(consoleSpy).toHaveBeenCalledWith('Error subscribing to recipes:', expect.any(Error));
        consoleSpy.mockRestore();
        done();
      });
    });
  });

  describe('getRecipes', () => {
    it('should filter out private recipes for non-admin users who are not the author', async () => {
      const mockRecipes = [
        { id: '1', title: 'Public Recipe', isPrivate: false, authorId: 'user1' },
        { id: '2', title: 'Private Recipe by User1', isPrivate: true, authorId: 'user1' },
        { id: '3', title: 'Private Recipe by User2', isPrivate: true, authorId: 'user2' },
        { id: '4', title: 'Another Public Recipe', isPrivate: false, authorId: 'user2' }
      ];

      mockGetDocs.mockResolvedValue(createMockSnapshot(mockRecipes));

      // Test as non-admin user1
      const recipes = await getRecipes('user1', false);
      expect(recipes).toHaveLength(3);
      expect(recipes.map(r => r.id)).toEqual(['1', '2', '4']);
      expect(recipes.find(r => r.id === '3')).toBeUndefined();
    });

    it('should show all recipes to admin users', async () => {
      const mockRecipes = [
        { id: '1', title: 'Public Recipe', isPrivate: false, authorId: 'user1' },
        { id: '2', title: 'Private Recipe by User1', isPrivate: true, authorId: 'user1' },
        { id: '3', title: 'Private Recipe by User2', isPrivate: true, authorId: 'user2' },
        { id: '4', title: 'Private Recipe by User3', isPrivate: true, authorId: 'user3' }
      ];

      mockGetDocs.mockResolvedValue(createMockSnapshot(mockRecipes));

      // Test as admin user1
      const recipes = await getRecipes('user1', true);
      expect(recipes).toHaveLength(4);
      expect(recipes.map(r => r.id)).toEqual(['1', '2', '3', '4']);
    });

    it('should show private recipes to their authors even if not admin', async () => {
      const mockRecipes = [
        { id: '1', title: 'Public Recipe', isPrivate: false, authorId: 'user1' },
        { id: '2', title: 'My Private Recipe', isPrivate: true, authorId: 'user2' },
        { id: '3', title: 'Other Private Recipe', isPrivate: true, authorId: 'user3' }
      ];

      mockGetDocs.mockResolvedValue(createMockSnapshot(mockRecipes));

      // Test as non-admin user2
      const recipes = await getRecipes('user2', false);
      expect(recipes).toHaveLength(2);
      expect(recipes.map(r => r.id)).toEqual(['1', '2']);
      expect(recipes.find(r => r.id === '3')).toBeUndefined();
    });

    it('should handle errors gracefully', async () => {
      mockGetDocs.mockRejectedValue(new Error('Firestore error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const recipes = await getRecipes('user1', false);
      expect(recipes).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith('Error getting recipes:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });
});

describe('Recipe Firestore - Recipe Count', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDoc.mockImplementation((_db, ...path) => path.join('/'));
    mockIncrement.mockImplementation((val) => ({ __increment: val }));
    mockUpdateDoc.mockResolvedValue(undefined);
    mockAddDoc.mockResolvedValue({ id: 'new-recipe-id' });
    mockGetDoc.mockResolvedValue({ exists: () => false });
    mockDeleteDoc.mockResolvedValue(undefined);
  });

  describe('addRecipe', () => {
    it('should increment recipe_count for the author after adding a recipe', async () => {
      await addRecipe({ title: 'Test Recipe' }, 'user1');

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        'users/user1',
        { recipe_count: { __increment: 1 } }
      );
    });

    it('should not update recipe_count when no authorId is provided', async () => {
      await addRecipe({ title: 'Test Recipe' }, null);

      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });
  });

  describe('deleteRecipe', () => {
    it('should decrement recipe_count for the author after deleting a recipe', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ title: 'Test Recipe', authorId: 'user1' })
      });

      await deleteRecipe('recipe1');

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        'users/user1',
        { recipe_count: { __increment: -1 } }
      );
      expect(mockDeleteDoc).toHaveBeenCalledWith('recipes/recipe1');
    });

    it('should not update recipe_count when recipe has no authorId', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ title: 'Test Recipe' })
      });

      await deleteRecipe('recipe1');

      expect(mockUpdateDoc).not.toHaveBeenCalled();
      expect(mockDeleteDoc).toHaveBeenCalled();
    });

    it('should still delete recipe document when recipe does not exist', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });

      await deleteRecipe('recipe1');

      expect(mockUpdateDoc).not.toHaveBeenCalled();
      expect(mockDeleteDoc).toHaveBeenCalledWith('recipes/recipe1');
    });
  });

  describe('initializeRecipeCounts', () => {
    it('should set recipe_count for each user based on existing recipes', async () => {
      const mockRecipes = [
        { id: 'r1', authorId: 'user1' },
        { id: 'r2', authorId: 'user1' },
        { id: 'r3', authorId: 'user2' }
      ];
      const mockUsers = [
        { id: 'user1' },
        { id: 'user2' },
        { id: 'user3' }
      ];

      mockGetDocs
        .mockResolvedValueOnce(createMockSnapshot(mockRecipes))
        .mockResolvedValueOnce(createMockSnapshot(mockUsers));

      await initializeRecipeCounts();

      expect(mockUpdateDoc).toHaveBeenCalledWith('users/user1', { recipe_count: 2 });
      expect(mockUpdateDoc).toHaveBeenCalledWith('users/user2', { recipe_count: 1 });
      expect(mockUpdateDoc).toHaveBeenCalledWith('users/user3', { recipe_count: 0 });
    });

    it('should set recipe_count to 0 for users with no recipes', async () => {
      const mockRecipes = [];
      const mockUsers = [{ id: 'user1' }];

      mockGetDocs
        .mockResolvedValueOnce(createMockSnapshot(mockRecipes))
        .mockResolvedValueOnce(createMockSnapshot(mockUsers));

      await initializeRecipeCounts();

      expect(mockUpdateDoc).toHaveBeenCalledWith('users/user1', { recipe_count: 0 });
    });

    it('should throw on Firestore error', async () => {
      mockGetDocs.mockRejectedValue(new Error('Firestore error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(initializeRecipeCounts()).rejects.toThrow('Firestore error');

      consoleSpy.mockRestore();
    });
  });

  describe('updateRecipe', () => {
    it('should update recipe counts when author changes', async () => {
      await updateRecipe('recipe1', { title: 'Test', authorId: 'user2' }, 'user1');

      expect(mockUpdateDoc).toHaveBeenCalledTimes(3);
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        'users/user1',
        { recipe_count: { __increment: -1 } }
      );
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        'users/user2',
        { recipe_count: { __increment: 1 } }
      );
    });

    it('should not update recipe counts when author has not changed', async () => {
      await updateRecipe('recipe1', { title: 'Test', authorId: 'user1' }, 'user1');

      // Only the recipe document itself should be updated (no user count updates)
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
      expect(mockUpdateDoc).not.toHaveBeenCalledWith('users/user1', expect.anything());
    });

    it('should not update recipe counts when no previousAuthorId is provided', async () => {
      await updateRecipe('recipe1', { title: 'Test', authorId: 'user2' });

      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
      expect(mockUpdateDoc).not.toHaveBeenCalledWith('users/user2', expect.anything());
    });

    it('should not update recipe counts when new authorId is missing from updates', async () => {
      await updateRecipe('recipe1', { title: 'Test' }, 'user1');

      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
      expect(mockUpdateDoc).not.toHaveBeenCalledWith('users/user1', expect.anything());
    });
  });
});

describe('Recipe Firestore - Share Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDoc.mockImplementation((_db, ...path) => path.join('/'));
    mockUpdateDoc.mockResolvedValue(undefined);
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    // Ensure deleteField mock is set up
    mockDeleteField.mockReturnValue({ __deleteField: true });
  });

  describe('getRecipeByShareId', () => {
    it('should return the recipe with a matching shareId', async () => {
      const mockRecipeDoc = {
        id: 'recipe-shared',
        data: () => ({ title: 'Shared Recipe', shareId: 'test-share-id' })
      };
      mockGetDocs.mockResolvedValue({
        empty: false,
        docs: [mockRecipeDoc]
      });

      const result = await getRecipeByShareId('test-share-id');

      expect(result).toEqual({ id: 'recipe-shared', title: 'Shared Recipe', shareId: 'test-share-id' });
    });

    it('should return null when no recipe with given shareId exists', async () => {
      mockGetDocs.mockResolvedValue({ empty: true, docs: [] });

      const result = await getRecipeByShareId('nonexistent-id');

      expect(result).toBeNull();
    });

    it('should return null on Firestore error', async () => {
      mockGetDocs.mockRejectedValue(new Error('Firestore error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await getRecipeByShareId('some-id');

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  describe('enableRecipeSharing', () => {
    beforeEach(() => {
      // Polyfill crypto.randomUUID for the test environment
      if (!global.crypto) global.crypto = {};
      if (!global.crypto.randomUUID) {
        global.crypto.randomUUID = jest.fn(() => 'mock-uuid-1234-5678-abcd-efghijklmnop');
      }
    });

    it('should call updateDoc with a shareId and return it', async () => {
      const shareId = await enableRecipeSharing('recipe1');

      expect(typeof shareId).toBe('string');
      expect(shareId.length).toBeGreaterThan(0);
      expect(mockUpdateDoc).toHaveBeenCalled();
    });
  });

  describe('disableRecipeSharing', () => {
    it('should call updateDoc to remove the shareId field from the recipe', async () => {
      await disableRecipeSharing('recipe1');

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        'recipes/recipe1',
        expect.objectContaining({ shareId: expect.anything() })
      );
      expect(mockDeleteField).toHaveBeenCalled();
    });
  });
});
