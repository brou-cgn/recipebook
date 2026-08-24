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

    it('should filter out Promise objects', () => {
      const promiseObj = Promise.resolve('test-value');
      const input = {
        title: 'Test Recipe',
        image: promiseObj,
        portionen: 4
      };
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = removeUndefinedFields(input);
      
      expect(result).toEqual({
        title: 'Test Recipe',
        portionen: 4
      });
      expect(result.image).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Promise object')
      );
      
      consoleSpy.mockRestore();
    });

    it('should filter out custom thenable objects', () => {
      // Custom object that looks like a Promise
      const thenableObj = {
        value: 'test',
        then: function(onFulfilled) {
          return onFulfilled(this.value);
        }
      };
      
      const input = {
        title: 'Test Recipe',
        image: thenableObj,
        portionen: 4
      };
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = removeUndefinedFields(input);
      
      expect(result).toEqual({
        title: 'Test Recipe',
        portionen: 4
      });
      expect(result.image).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Promise object')
      );
      
      consoleSpy.mockRestore();
    });

    it('should keep regular objects without then method', () => {
      const regularObj = {
        nested: 'value',
        count: 42
      };

      const input = {
        title: 'Test Recipe',
        metadata: regularObj,
        portionen: 4
      };

      const result = removeUndefinedFields(input);

      expect(result).toEqual({
        title: 'Test Recipe',
        metadata: regularObj,
        portionen: 4
      });
    });

    it('should remove undefined fields nested inside plain objects', () => {
      const input = {
        title: 'Test Recipe',
        nutrition: { calories: 250, protein: undefined }
      };

      const result = removeUndefinedFields(input);

      expect(result).toEqual({
        title: 'Test Recipe',
        nutrition: { calories: 250 }
      });
    });

    it('should remove undefined fields nested inside array items (e.g. AI-imported ingredients)', () => {
      const input = {
        ingredients: [
          { name: 'Salz', amount: undefined },
          { name: 'Mehl', amount: '200g' }
        ]
      };

      const result = removeUndefinedFields(input);

      expect(result).toEqual({
        ingredients: [
          { name: 'Salz' },
          { name: 'Mehl', amount: '200g' }
        ]
      });
    });

    it('should drop undefined entries from plain arrays', () => {
      const input = { tags: ['a', undefined, 'b'] };

      const result = removeUndefinedFields(input);

      expect(result).toEqual({ tags: ['a', 'b'] });
    });

    it('should not touch nested objects/arrays that contain no undefined values', () => {
      const nestedArray = [{ name: 'Mehl', amount: '200g' }];
      const input = { ingredients: nestedArray, title: 'Test' };

      const result = removeUndefinedFields(input);

      expect(result.ingredients).toBe(nestedArray); // same reference, untouched
    });
  });
});
