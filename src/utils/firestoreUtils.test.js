import { removeUndefinedFields } from './firestoreUtils';

describe('Firestore Utilities', () => {
  describe('removeUndefinedFields', () => {
    it('should remove undefined fields from object', () => {
      const input = {
        name: 'Test',
        value: undefined,
        count: 0,
        active: false
      };
      
      const result = removeUndefinedFields(input);
      
      expect(result).toEqual({
        name: 'Test',
        count: 0,
        active: false
      });
      expect(result.value).toBeUndefined();
    });

    it('should keep null values', () => {
      const input = {
        id: undefined,
        parentRecipeId: null,
        versionCreatedFrom: null,
        title: 'Test'
      };
      
      const result = removeUndefinedFields(input);
      
      expect(result).toEqual({
        parentRecipeId: null,
        versionCreatedFrom: null,
        title: 'Test'
      });
      expect(result.id).toBeUndefined();
    });

    it('should keep empty strings', () => {
      const input = {
        title: '',
        image: '',
        description: undefined
      };
      
      const result = removeUndefinedFields(input);
      
      expect(result).toEqual({
        title: '',
        image: ''
      });
    });

    it('should keep falsy values except undefined', () => {
      const input = {
        count: 0,
        active: false,
        value: null,
        empty: '',
        missing: undefined
      };
      
      const result = removeUndefinedFields(input);
      
      expect(result).toEqual({
        count: 0,
        active: false,
        value: null,
        empty: ''
      });
    });

    it('should handle empty object', () => {
      const result = removeUndefinedFields({});
      expect(result).toEqual({});
    });

    it('should handle object with all undefined values', () => {
      const input = {
        a: undefined,
        b: undefined,
        c: undefined
      };
      
      const result = removeUndefinedFields(input);
      expect(result).toEqual({});
    });

    it('should handle arrays in object (arrays themselves are not filtered)', () => {
      const input = {
        ingredients: ['item1', 'item2'],
        steps: [],
        tags: undefined
      };
      
      const result = removeUndefinedFields(input);
      
      expect(result).toEqual({
        ingredients: ['item1', 'item2'],
        steps: []
      });
    });

    it('should preserve object references (shallow copy)', () => {
      const nestedObj = { nested: 'value' };
      const input = {
        data: nestedObj,
        removed: undefined
      };
      
      const result = removeUndefinedFields(input);
      
      expect(result.data).toBe(nestedObj); // Same reference
    });
  });
});
