import {
  hasVersions,
  getRecipeVersions,
  getParentRecipe,
  isRecipeVersion,
  createRecipeVersion,
  getVersionNumber,
  groupRecipesByParent
} from './recipeVersioning';

describe('Recipe Versioning Utilities', () => {
  const originalRecipe = {
    id: 'recipe-1',
    title: 'Original Recipe',
    authorId: 'user-1',
    ingredients: ['ingredient 1', 'ingredient 2'],
    steps: ['step 1', 'step 2'],
    isFavorite: true
  };

  const version1 = {
    id: 'recipe-2',
    title: 'Original Recipe (Modified)',
    parentRecipeId: 'recipe-1',
    authorId: 'user-2',
    ingredients: ['ingredient 1', 'ingredient 2', 'ingredient 3'],
    steps: ['step 1', 'step 2', 'step 3'],
    createdAt: '2024-01-01T10:00:00Z'
  };

  const version2 = {
    id: 'recipe-3',
    title: 'Original Recipe (v2)',
    parentRecipeId: 'recipe-1',
    authorId: 'user-3',
    ingredients: ['ingredient 1', 'ingredient 2'],
    steps: ['step 1', 'step 2', 'step 3', 'step 4'],
    createdAt: '2024-01-02T10:00:00Z'
  };

  const unrelatedRecipe = {
    id: 'recipe-4',
    title: 'Unrelated Recipe',
    authorId: 'user-1'
  };

  const allRecipes = [originalRecipe, version1, version2, unrelatedRecipe];

  describe('hasVersions', () => {
    it('should return true if recipe has versions', () => {
      expect(hasVersions(allRecipes, 'recipe-1')).toBe(true);
    });

    it('should return false if recipe has no versions', () => {
      expect(hasVersions(allRecipes, 'recipe-4')).toBe(false);
    });

    it('should return false for non-existent recipe', () => {
      expect(hasVersions(allRecipes, 'non-existent')).toBe(false);
    });
  });

  describe('getRecipeVersions', () => {
    it('should return all versions of a recipe', () => {
      const versions = getRecipeVersions(allRecipes, 'recipe-1');
      expect(versions).toHaveLength(2);
      expect(versions).toContainEqual(version1);
      expect(versions).toContainEqual(version2);
    });

    it('should return empty array if no versions exist', () => {
      const versions = getRecipeVersions(allRecipes, 'recipe-4');
      expect(versions).toHaveLength(0);
    });

    it('should return empty array for non-existent recipe', () => {
      const versions = getRecipeVersions(allRecipes, 'non-existent');
      expect(versions).toHaveLength(0);
    });
  });

  describe('getParentRecipe', () => {
    it('should return parent recipe for a version', () => {
      const parent = getParentRecipe(allRecipes, version1);
      expect(parent).toEqual(originalRecipe);
    });

    it('should return null if recipe has no parent', () => {
      const parent = getParentRecipe(allRecipes, originalRecipe);
      expect(parent).toBe(null);
    });

    it('should return null if parent recipe not found', () => {
      const orphanVersion = {
        id: 'orphan',
        parentRecipeId: 'non-existent'
      };
      const parent = getParentRecipe(allRecipes, orphanVersion);
      expect(parent).toBe(null);
    });
  });

  describe('isRecipeVersion', () => {
    it('should return true for a recipe version', () => {
      expect(isRecipeVersion(version1)).toBe(true);
    });

    it('should return false for original recipe', () => {
      expect(isRecipeVersion(originalRecipe)).toBe(false);
    });

    it('should return false for recipe without parentRecipeId', () => {
      expect(isRecipeVersion({ id: 'test' })).toBe(false);
    });
  });

  describe('createRecipeVersion', () => {
    it('should create a new version with parent relationship', () => {
      const newVersion = createRecipeVersion(originalRecipe, 'user-2');
      
      expect(newVersion.parentRecipeId).toBe('recipe-1');
      expect(newVersion.authorId).toBe('user-2');
      expect(newVersion.id).toBeUndefined();
      expect(newVersion.title).toBe('Original Recipe');
      expect(newVersion.ingredients).toEqual(originalRecipe.ingredients);
      expect(newVersion.steps).toEqual(originalRecipe.steps);
    });

    it('should clear favorite status on new version', () => {
      const newVersion = createRecipeVersion(originalRecipe, 'user-2');
      expect(newVersion.isFavorite).toBe(false);
    });

    it('should add creation metadata', () => {
      const newVersion = createRecipeVersion(originalRecipe, 'user-2');
      expect(newVersion.createdAt).toBeDefined();
      expect(newVersion.versionCreatedFrom).toBe('Original Recipe');
    });

    it('should copy all recipe fields', () => {
      const fullRecipe = {
        ...originalRecipe,
        portionen: 4,
        kulinarik: ['Italian'],
        schwierigkeit: 3,
        kochdauer: 30,
        speisekategorie: 'Main Course',
        image: 'test.jpg'
      };
      
      const newVersion = createRecipeVersion(fullRecipe, 'user-2');
      expect(newVersion.portionen).toBe(4);
      expect(newVersion.kulinarik).toEqual(['Italian']);
      expect(newVersion.schwierigkeit).toBe(3);
      expect(newVersion.kochdauer).toBe(30);
      expect(newVersion.speisekategorie).toBe('Main Course');
      expect(newVersion.image).toBe('test.jpg');
    });
  });

  describe('getVersionNumber', () => {
    it('should return 0 for original recipe', () => {
      expect(getVersionNumber(allRecipes, originalRecipe)).toBe(0);
    });

    it('should return correct version number based on creation date', () => {
      expect(getVersionNumber(allRecipes, version1)).toBe(1);
      expect(getVersionNumber(allRecipes, version2)).toBe(2);
    });

    it('should return 0 if recipe not found in versions', () => {
      const orphanVersion = {
        id: 'orphan',
        parentRecipeId: 'recipe-1'
      };
      expect(getVersionNumber(allRecipes, orphanVersion)).toBe(0);
    });

    it('should handle recipes without createdAt', () => {
      const versionWithoutDate = {
        id: 'recipe-5',
        parentRecipeId: 'recipe-1',
        authorId: 'user-4'
      };
      const recipesWithNew = [...allRecipes, versionWithoutDate];
      const versionNum = getVersionNumber(recipesWithNew, versionWithoutDate);
      expect(typeof versionNum).toBe('number');
      expect(versionNum).toBeGreaterThanOrEqual(0);
    });
  });

  describe('groupRecipesByParent', () => {
    it('should group original recipe with its versions', () => {
      const groups = groupRecipesByParent(allRecipes);
      
      // Find the group containing the original recipe
      const group = groups.find(g => g.primaryRecipe.id === 'recipe-1');
      
      expect(group).toBeDefined();
      expect(group.versionCount).toBe(3); // original + 2 versions
      expect(group.allRecipes).toHaveLength(3);
      expect(group.allRecipes).toContainEqual(originalRecipe);
      expect(group.allRecipes).toContainEqual(version1);
      expect(group.allRecipes).toContainEqual(version2);
    });

    it('should create separate group for recipe without versions', () => {
      const groups = groupRecipesByParent(allRecipes);
      
      const group = groups.find(g => g.primaryRecipe.id === 'recipe-4');
      
      expect(group).toBeDefined();
      expect(group.versionCount).toBe(1);
      expect(group.allRecipes).toHaveLength(1);
      expect(group.allRecipes).toContainEqual(unrelatedRecipe);
    });

    it('should process each recipe only once', () => {
      const groups = groupRecipesByParent(allRecipes);
      
      // Count total recipes across all groups
      const totalRecipes = groups.reduce((sum, g) => sum + g.allRecipes.length, 0);
      
      expect(totalRecipes).toBe(allRecipes.length);
    });

    it('should handle empty recipe list', () => {
      const groups = groupRecipesByParent([]);
      expect(groups).toHaveLength(0);
    });

    it('should use original recipe as primary recipe', () => {
      const groups = groupRecipesByParent(allRecipes);
      
      const group = groups.find(g => g.primaryRecipe.id === 'recipe-1');
      
      expect(group.primaryRecipe).toEqual(originalRecipe);
      expect(group.primaryRecipe.parentRecipeId).toBeUndefined();
    });
  });
});
