import {
  getAllUserFavorites,
  saveAllUserFavorites,
  getUserFavorites,
  isRecipeFavorite,
  addFavorite,
  removeFavorite,
  toggleFavorite,
  getFavoriteRecipes,
  migrateGlobalFavorites
} from './userFavorites';

// Clear localStorage before each test
beforeEach(() => {
  localStorage.clear();
});

describe('userFavorites utility functions', () => {
  describe('getAllUserFavorites and saveAllUserFavorites', () => {
    test('returns empty object when no favorites exist', () => {
      expect(getAllUserFavorites()).toEqual({});
    });

    test('saves and retrieves favorites correctly', () => {
      const favorites = {
        'user1': ['recipe1', 'recipe2'],
        'user2': ['recipe3']
      };
      saveAllUserFavorites(favorites);
      expect(getAllUserFavorites()).toEqual(favorites);
    });
  });

  describe('getUserFavorites', () => {
    test('returns empty array for user with no favorites', () => {
      expect(getUserFavorites('user1')).toEqual([]);
    });

    test('returns empty array when userId is null or undefined', () => {
      expect(getUserFavorites(null)).toEqual([]);
      expect(getUserFavorites(undefined)).toEqual([]);
    });

    test('returns user-specific favorites', () => {
      const favorites = {
        'user1': ['recipe1', 'recipe2'],
        'user2': ['recipe3']
      };
      saveAllUserFavorites(favorites);
      
      expect(getUserFavorites('user1')).toEqual(['recipe1', 'recipe2']);
      expect(getUserFavorites('user2')).toEqual(['recipe3']);
    });
  });

  describe('isRecipeFavorite', () => {
    beforeEach(() => {
      const favorites = {
        'user1': ['recipe1', 'recipe2'],
        'user2': ['recipe3']
      };
      saveAllUserFavorites(favorites);
    });

    test('returns true when recipe is a favorite', () => {
      expect(isRecipeFavorite('user1', 'recipe1')).toBe(true);
      expect(isRecipeFavorite('user1', 'recipe2')).toBe(true);
    });

    test('returns false when recipe is not a favorite', () => {
      expect(isRecipeFavorite('user1', 'recipe3')).toBe(false);
      expect(isRecipeFavorite('user2', 'recipe1')).toBe(false);
    });

    test('returns false when userId or recipeId is null/undefined', () => {
      expect(isRecipeFavorite(null, 'recipe1')).toBe(false);
      expect(isRecipeFavorite('user1', null)).toBe(false);
      expect(isRecipeFavorite(undefined, undefined)).toBe(false);
    });
  });

  describe('addFavorite', () => {
    test('adds a recipe to user favorites', () => {
      expect(addFavorite('user1', 'recipe1')).toBe(true);
      expect(getUserFavorites('user1')).toEqual(['recipe1']);
    });

    test('adds multiple recipes to same user', () => {
      addFavorite('user1', 'recipe1');
      addFavorite('user1', 'recipe2');
      expect(getUserFavorites('user1')).toEqual(['recipe1', 'recipe2']);
    });

    test('does not add duplicate favorites', () => {
      addFavorite('user1', 'recipe1');
      addFavorite('user1', 'recipe1');
      expect(getUserFavorites('user1')).toEqual(['recipe1']);
    });

    test('maintains separate favorites for different users', () => {
      addFavorite('user1', 'recipe1');
      addFavorite('user2', 'recipe2');
      
      expect(getUserFavorites('user1')).toEqual(['recipe1']);
      expect(getUserFavorites('user2')).toEqual(['recipe2']);
    });

    test('returns false when userId or recipeId is null/undefined', () => {
      expect(addFavorite(null, 'recipe1')).toBe(false);
      expect(addFavorite('user1', null)).toBe(false);
    });
  });

  describe('removeFavorite', () => {
    beforeEach(() => {
      const favorites = {
        'user1': ['recipe1', 'recipe2', 'recipe3'],
        'user2': ['recipe3']
      };
      saveAllUserFavorites(favorites);
    });

    test('removes a recipe from user favorites', () => {
      expect(removeFavorite('user1', 'recipe2')).toBe(true);
      expect(getUserFavorites('user1')).toEqual(['recipe1', 'recipe3']);
    });

    test('does not affect other users when removing favorite', () => {
      removeFavorite('user1', 'recipe3');
      expect(getUserFavorites('user1')).toEqual(['recipe1', 'recipe2']);
      expect(getUserFavorites('user2')).toEqual(['recipe3']);
    });

    test('handles removing non-existent favorite gracefully', () => {
      expect(removeFavorite('user1', 'recipe999')).toBe(true);
      expect(getUserFavorites('user1')).toEqual(['recipe1', 'recipe2', 'recipe3']);
    });

    test('returns false when userId or recipeId is null/undefined', () => {
      expect(removeFavorite(null, 'recipe1')).toBe(false);
      expect(removeFavorite('user1', null)).toBe(false);
    });
  });

  describe('toggleFavorite', () => {
    test('adds recipe when not a favorite', () => {
      const result = toggleFavorite('user1', 'recipe1');
      expect(result).toBe(true);
      expect(getUserFavorites('user1')).toEqual(['recipe1']);
    });

    test('removes recipe when already a favorite', () => {
      addFavorite('user1', 'recipe1');
      const result = toggleFavorite('user1', 'recipe1');
      expect(result).toBe(false);
      expect(getUserFavorites('user1')).toEqual([]);
    });

    test('toggles favorite status correctly multiple times', () => {
      // Add
      expect(toggleFavorite('user1', 'recipe1')).toBe(true);
      expect(isRecipeFavorite('user1', 'recipe1')).toBe(true);
      
      // Remove
      expect(toggleFavorite('user1', 'recipe1')).toBe(false);
      expect(isRecipeFavorite('user1', 'recipe1')).toBe(false);
      
      // Add again
      expect(toggleFavorite('user1', 'recipe1')).toBe(true);
      expect(isRecipeFavorite('user1', 'recipe1')).toBe(true);
    });

    test('returns false when userId or recipeId is null/undefined', () => {
      expect(toggleFavorite(null, 'recipe1')).toBe(false);
      expect(toggleFavorite('user1', null)).toBe(false);
    });
  });

  describe('getFavoriteRecipes', () => {
    const recipes = [
      { id: 'recipe1', title: 'Recipe 1' },
      { id: 'recipe2', title: 'Recipe 2' },
      { id: 'recipe3', title: 'Recipe 3' },
      { id: 'recipe4', title: 'Recipe 4' }
    ];

    beforeEach(() => {
      const favorites = {
        'user1': ['recipe1', 'recipe3'],
        'user2': ['recipe2', 'recipe4']
      };
      saveAllUserFavorites(favorites);
    });

    test('returns only favorite recipes for user', () => {
      const favoriteRecipes = getFavoriteRecipes('user1', recipes);
      expect(favoriteRecipes).toHaveLength(2);
      expect(favoriteRecipes.map(r => r.id)).toEqual(['recipe1', 'recipe3']);
    });

    test('returns different favorites for different users', () => {
      const user1Favorites = getFavoriteRecipes('user1', recipes);
      const user2Favorites = getFavoriteRecipes('user2', recipes);
      
      expect(user1Favorites.map(r => r.id)).toEqual(['recipe1', 'recipe3']);
      expect(user2Favorites.map(r => r.id)).toEqual(['recipe2', 'recipe4']);
    });

    test('returns empty array when user has no favorites', () => {
      const favoriteRecipes = getFavoriteRecipes('user3', recipes);
      expect(favoriteRecipes).toEqual([]);
    });

    test('returns empty array when userId is null/undefined', () => {
      expect(getFavoriteRecipes(null, recipes)).toEqual([]);
      expect(getFavoriteRecipes(undefined, recipes)).toEqual([]);
    });

    test('returns empty array when recipes is null/undefined', () => {
      expect(getFavoriteRecipes('user1', null)).toEqual([]);
      expect(getFavoriteRecipes('user1', undefined)).toEqual([]);
    });

    test('returns empty array when recipes is not an array', () => {
      expect(getFavoriteRecipes('user1', 'not an array')).toEqual([]);
      expect(getFavoriteRecipes('user1', {})).toEqual([]);
    });
  });

  describe('migrateGlobalFavorites', () => {
    const recipes = [
      { id: 'recipe1', title: 'Recipe 1', isFavorite: true },
      { id: 'recipe2', title: 'Recipe 2', isFavorite: false },
      { id: 'recipe3', title: 'Recipe 3', isFavorite: true },
      { id: 'recipe4', title: 'Recipe 4' }
    ];

    test('migrates global favorites to user-specific favorites', () => {
      migrateGlobalFavorites('user1', recipes);
      
      const userFavorites = getUserFavorites('user1');
      expect(userFavorites).toEqual(['recipe1', 'recipe3']);
    });

    test('does not migrate if user already has favorites', () => {
      // Set up existing favorites for user
      addFavorite('user1', 'recipe4');
      
      // Try to migrate
      migrateGlobalFavorites('user1', recipes);
      
      // Should still have only the original favorite
      expect(getUserFavorites('user1')).toEqual(['recipe4']);
    });

    test('handles recipes with no favorites gracefully', () => {
      const recipesWithoutFavorites = [
        { id: 'recipe1', title: 'Recipe 1', isFavorite: false },
        { id: 'recipe2', title: 'Recipe 2' }
      ];
      
      migrateGlobalFavorites('user1', recipesWithoutFavorites);
      expect(getUserFavorites('user1')).toEqual([]);
    });

    test('handles null/undefined parameters gracefully', () => {
      expect(() => migrateGlobalFavorites(null, recipes)).not.toThrow();
      expect(() => migrateGlobalFavorites('user1', null)).not.toThrow();
      expect(() => migrateGlobalFavorites(undefined, undefined)).not.toThrow();
    });

    test('migrates for multiple users independently', () => {
      migrateGlobalFavorites('user1', recipes);
      
      // Different recipes for user2
      const user2Recipes = [
        { id: 'recipe5', title: 'Recipe 5', isFavorite: true }
      ];
      migrateGlobalFavorites('user2', user2Recipes);
      
      expect(getUserFavorites('user1')).toEqual(['recipe1', 'recipe3']);
      expect(getUserFavorites('user2')).toEqual(['recipe5']);
    });
  });
});
