import {
  normalizeIngredient,
  toStorageFormat,
  isRecipeIngredient,
  getIngredientDisplayValue,
  createRecipeIngredient
} from './ingredientUtils';

describe('ingredientUtils', () => {
  describe('normalizeIngredient', () => {
    it('should normalize string ingredient to text object', () => {
      const result = normalizeIngredient('200g flour');
      expect(result).toEqual({
        type: 'text',
        value: '200g flour'
      });
    });

    it('should return object ingredient as is if already normalized', () => {
      const ingredient = {
        type: 'recipe',
        recipeId: 'recipe-123',
        recipeName: 'Tomato Sauce'
      };
      const result = normalizeIngredient(ingredient);
      expect(result).toEqual(ingredient);
    });

    it('should handle empty string', () => {
      const result = normalizeIngredient('');
      expect(result).toEqual({
        type: 'text',
        value: ''
      });
    });
  });

  describe('toStorageFormat', () => {
    it('should store text ingredients as strings', () => {
      const ingredient = {
        type: 'text',
        value: '200g flour'
      };
      const result = toStorageFormat(ingredient);
      expect(result).toBe('200g flour');
    });

    it('should store recipe ingredients as objects', () => {
      const ingredient = {
        type: 'recipe',
        recipeId: 'recipe-123',
        recipeName: 'Tomato Sauce'
      };
      const result = toStorageFormat(ingredient);
      expect(result).toEqual({
        type: 'recipe',
        recipeId: 'recipe-123',
        recipeName: 'Tomato Sauce'
      });
    });

    it('should convert string to storage format', () => {
      const result = toStorageFormat('200g flour');
      expect(result).toBe('200g flour');
    });
  });

  describe('isRecipeIngredient', () => {
    it('should return true for recipe ingredients', () => {
      const ingredient = {
        type: 'recipe',
        recipeId: 'recipe-123'
      };
      expect(isRecipeIngredient(ingredient)).toBe(true);
    });

    it('should return false for text ingredients', () => {
      const ingredient = {
        type: 'text',
        value: '200g flour'
      };
      expect(isRecipeIngredient(ingredient)).toBe(false);
    });

    it('should return false for string ingredients', () => {
      expect(isRecipeIngredient('200g flour')).toBe(false);
    });

    it('should return false for objects without recipeId', () => {
      const ingredient = {
        type: 'recipe'
      };
      expect(isRecipeIngredient(ingredient)).toBe(false);
    });
  });

  describe('getIngredientDisplayValue', () => {
    const mockRecipes = [
      { id: 'recipe-123', title: 'Tomato Sauce' },
      { id: 'recipe-456', title: 'Pizza Dough' }
    ];

    it('should return value for text ingredients', () => {
      const ingredient = {
        type: 'text',
        value: '200g flour'
      };
      const result = getIngredientDisplayValue(ingredient, mockRecipes);
      expect(result).toBe('200g flour');
    });

    it('should return recipe title for recipe ingredients', () => {
      const ingredient = {
        type: 'recipe',
        recipeId: 'recipe-123',
        recipeName: 'Old Name'
      };
      const result = getIngredientDisplayValue(ingredient, mockRecipes);
      expect(result).toBe('Tomato Sauce');
    });

    it('should fallback to stored name if recipe not found', () => {
      const ingredient = {
        type: 'recipe',
        recipeId: 'recipe-999',
        recipeName: 'Stored Name'
      };
      const result = getIngredientDisplayValue(ingredient, mockRecipes);
      expect(result).toBe('Stored Name');
    });

    it('should handle string ingredients', () => {
      const result = getIngredientDisplayValue('200g flour', mockRecipes);
      expect(result).toBe('200g flour');
    });
  });

  describe('createRecipeIngredient', () => {
    it('should create recipe ingredient object', () => {
      const result = createRecipeIngredient('recipe-123', 'Tomato Sauce');
      expect(result).toEqual({
        type: 'recipe',
        recipeId: 'recipe-123',
        recipeName: 'Tomato Sauce'
      });
    });
  });
});
