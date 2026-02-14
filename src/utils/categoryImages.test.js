import {
  getCategoryImages,
  saveCategoryImages,
  addCategoryImage,
  updateCategoryImage,
  removeCategoryImage,
  getImageForCategory,
  getImageForCategories,
  isCategoryAssigned,
  getAlreadyAssignedCategories
} from './categoryImages';

describe('categoryImages', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getCategoryImages', () => {
    test('returns empty array when no images stored', () => {
      expect(getCategoryImages()).toEqual([]);
    });

    test('returns stored images', () => {
      const images = [
        { id: '1', image: 'data:image/png;base64,abc', categories: ['Appetizer'] }
      ];
      localStorage.setItem('categoryImages', JSON.stringify(images));
      expect(getCategoryImages()).toEqual(images);
    });

    test('handles corrupted data gracefully', () => {
      localStorage.setItem('categoryImages', 'invalid json');
      expect(getCategoryImages()).toEqual([]);
    });
  });

  describe('saveCategoryImages', () => {
    test('saves images to localStorage', () => {
      const images = [
        { id: '1', image: 'data:image/png;base64,abc', categories: ['Appetizer'] }
      ];
      saveCategoryImages(images);
      expect(JSON.parse(localStorage.getItem('categoryImages'))).toEqual(images);
    });
  });

  describe('addCategoryImage', () => {
    test('adds new image with categories', () => {
      const image = addCategoryImage('data:image/png;base64,abc', ['Appetizer', 'Dessert']);
      
      expect(image).toMatchObject({
        image: 'data:image/png;base64,abc',
        categories: ['Appetizer', 'Dessert']
      });
      expect(image.id).toBeDefined();
      
      const stored = getCategoryImages();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toEqual(image);
    });

    test('adds image with no categories', () => {
      const image = addCategoryImage('data:image/png;base64,xyz');
      
      expect(image.categories).toEqual([]);
    });
  });

  describe('updateCategoryImage', () => {
    test('updates existing image', () => {
      const image = addCategoryImage('data:image/png;base64,abc', ['Appetizer']);
      
      const result = updateCategoryImage(image.id, { 
        categories: ['Main Course', 'Dessert'] 
      });
      
      expect(result).toBe(true);
      
      const updated = getCategoryImages()[0];
      expect(updated.categories).toEqual(['Main Course', 'Dessert']);
      expect(updated.image).toBe('data:image/png;base64,abc');
    });

    test('returns false for non-existent image', () => {
      const result = updateCategoryImage('non-existent', { categories: [] });
      expect(result).toBe(false);
    });
  });

  describe('removeCategoryImage', () => {
    test('removes existing image', () => {
      const image1 = addCategoryImage('data:image/png;base64,abc', ['Appetizer']);
      const image2 = addCategoryImage('data:image/png;base64,def', ['Dessert']);
      
      const result = removeCategoryImage(image1.id);
      
      expect(result).toBe(true);
      
      const remaining = getCategoryImages();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(image2.id);
    });

    test('returns false for non-existent image', () => {
      const result = removeCategoryImage('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getImageForCategory', () => {
    test('returns image for assigned category', () => {
      addCategoryImage('data:image/png;base64,abc', ['Appetizer', 'Salad']);
      addCategoryImage('data:image/png;base64,def', ['Dessert']);
      
      expect(getImageForCategory('Appetizer')).toBe('data:image/png;base64,abc');
      expect(getImageForCategory('Salad')).toBe('data:image/png;base64,abc');
      expect(getImageForCategory('Dessert')).toBe('data:image/png;base64,def');
    });

    test('returns null for unassigned category', () => {
      addCategoryImage('data:image/png;base64,abc', ['Appetizer']);
      
      expect(getImageForCategory('Main Course')).toBeNull();
    });
  });

  describe('getImageForCategories', () => {
    test('returns first matching image for categories', () => {
      addCategoryImage('data:image/png;base64,abc', ['Appetizer']);
      addCategoryImage('data:image/png;base64,def', ['Main Course']);
      addCategoryImage('data:image/png;base64,ghi', ['Dessert']);
      
      expect(getImageForCategories(['Main Course', 'Dessert'])).toBe('data:image/png;base64,def');
      expect(getImageForCategories(['Dessert', 'Main Course'])).toBe('data:image/png;base64,ghi');
    });

    test('returns null when no categories match', () => {
      addCategoryImage('data:image/png;base64,abc', ['Appetizer']);
      
      expect(getImageForCategories(['Main Course', 'Dessert'])).toBeNull();
    });

    test('returns null for empty categories array', () => {
      addCategoryImage('data:image/png;base64,abc', ['Appetizer']);
      
      expect(getImageForCategories([])).toBeNull();
    });
  });

  describe('isCategoryAssigned', () => {
    test('returns true if category is assigned', () => {
      addCategoryImage('data:image/png;base64,abc', ['Appetizer', 'Salad']);
      
      expect(isCategoryAssigned('Appetizer')).toBe(true);
      expect(isCategoryAssigned('Salad')).toBe(true);
    });

    test('returns false if category is not assigned', () => {
      addCategoryImage('data:image/png;base64,abc', ['Appetizer']);
      
      expect(isCategoryAssigned('Main Course')).toBe(false);
    });

    test('excludes specified image from check', () => {
      const image = addCategoryImage('data:image/png;base64,abc', ['Appetizer']);
      
      expect(isCategoryAssigned('Appetizer', image.id)).toBe(false);
    });
  });

  describe('getAlreadyAssignedCategories', () => {
    test('returns categories already assigned to other images', () => {
      const image1 = addCategoryImage('data:image/png;base64,abc', ['Appetizer', 'Salad']);
      addCategoryImage('data:image/png;base64,def', ['Main Course']);
      
      const assigned = getAlreadyAssignedCategories(
        ['Appetizer', 'Dessert', 'Main Course'], 
        image1.id
      );
      
      expect(assigned).toEqual(['Main Course']);
    });

    test('returns empty array when no categories are assigned', () => {
      addCategoryImage('data:image/png;base64,abc', ['Appetizer']);
      
      const assigned = getAlreadyAssignedCategories(['Dessert', 'Main Course']);
      
      expect(assigned).toEqual([]);
    });

    test('excludes own image when checking assignments', () => {
      const image = addCategoryImage('data:image/png;base64,abc', ['Appetizer', 'Salad']);
      
      const assigned = getAlreadyAssignedCategories(['Appetizer', 'Salad'], image.id);
      
      expect(assigned).toEqual([]);
    });
  });
});
