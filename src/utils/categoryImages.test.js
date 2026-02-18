import {
  getCategoryImages,
  saveCategoryImages,
  addCategoryImage,
  updateCategoryImage,
  removeCategoryImage,
  getImageForCategory,
  getImageForCategories,
  isCategoryAssigned,
  getAlreadyAssignedCategories,
  _resetMigrationFlag
} from './categoryImages';

// Mock Firebase
jest.mock('../firebase', () => ({
  db: {}
}));

// Mock Firestore functions
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
  updateDoc: jest.fn(),
  collection: jest.fn(() => ({})),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  deleteDoc: jest.fn(),
  deleteField: jest.fn(() => '__DELETE_FIELD__')
}));

import { doc, getDoc, updateDoc, collection, getDocs, setDoc, deleteDoc, deleteField } from 'firebase/firestore';

describe('categoryImages', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    _resetMigrationFlag();
    
    // Default mock: return empty collection
    getDocs.mockResolvedValue({
      empty: true,
      forEach: jest.fn()
    });
    
    // Default mock: settings document doesn't have categoryImages
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({})
    });
  });

  describe('getCategoryImages', () => {
    test('returns empty array when no images stored in collection', async () => {
      expect(await getCategoryImages()).toEqual([]);
    });

    test('returns stored images from collection', async () => {
      const images = [
        { id: '1', image: 'data:image/png;base64,abc', categories: ['Appetizer'] }
      ];
      
      const mockDocs = images.map(img => ({
        id: img.id,
        data: () => ({ image: img.image, categories: img.categories })
      }));
      
      getDocs.mockResolvedValue({
        empty: false,
        forEach: (callback) => mockDocs.forEach(callback)
      });
      
      expect(await getCategoryImages()).toEqual(images);
    });

    test('migrates from settings/app document when collection is empty', async () => {
      const images = [
        { id: '1', image: 'data:image/png;base64,abc', categories: ['Appetizer'] }
      ];
      
      // Empty collection
      getDocs.mockResolvedValue({
        empty: true,
        forEach: jest.fn()
      });
      
      // Settings document has categoryImages
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ categoryImages: images })
      });
      
      const result = await getCategoryImages();
      expect(result).toEqual(images);
      expect(setDoc).toHaveBeenCalled();
      expect(updateDoc).toHaveBeenCalled();
    });

    test('migrates from localStorage when collection and settings are empty', async () => {
      const images = [
        { id: '1', image: 'data:image/png;base64,abc', categories: ['Appetizer'] }
      ];
      localStorage.setItem('categoryImages', JSON.stringify(images));
      
      // Empty collection
      getDocs.mockResolvedValue({
        empty: true,
        forEach: jest.fn()
      });
      
      // Settings document is empty
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({})
      });
      
      const result = await getCategoryImages();
      expect(result).toEqual(images);
      expect(setDoc).toHaveBeenCalled();
      expect(localStorage.getItem('categoryImages')).toBeNull();
    });

    test('falls back to localStorage on Firestore error', async () => {
      const images = [
        { id: '1', image: 'data:image/png;base64,abc', categories: ['Appetizer'] }
      ];
      localStorage.setItem('categoryImages', JSON.stringify(images));
      
      getDocs.mockRejectedValue(new Error('Firestore error'));
      
      expect(await getCategoryImages()).toEqual(images);
    });

    test('handles corrupted localStorage data gracefully', async () => {
      localStorage.setItem('categoryImages', 'invalid json');
      getDocs.mockRejectedValue(new Error('Firestore error'));
      expect(await getCategoryImages()).toEqual([]);
    });
  });

  describe('saveCategoryImages', () => {
    test('saves images to collection', async () => {
      const images = [
        { id: '1', image: 'data:image/png;base64,abc', categories: ['Appetizer'] }
      ];
      
      await saveCategoryImages(images);
      // Just verify setDoc was called with the right data (second argument)
      const calls = setDoc.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0][1]).toEqual({
        image: images[0].image,
        categories: images[0].categories
      });
    });

    test('throws German error message on resource-exhausted error', async () => {
      const error = new Error('Resource exhausted');
      error.code = 'resource-exhausted';
      setDoc.mockRejectedValue(error);

      const images = [
        { id: '1', image: 'data:image/png;base64,abc', categories: ['Appetizer'] }
      ];

      await expect(saveCategoryImages(images)).rejects.toThrow(
        'Speicherplatz voll. Bitte entfernen Sie einige Kategoriebilder oder verwenden Sie kleinere Bilder.'
      );
    });

    test('re-throws other storage errors', async () => {
      const testError = new Error('Some other error');
      setDoc.mockRejectedValue(testError);

      const images = [
        { id: '1', image: 'data:image/png;base64,abc', categories: ['Appetizer'] }
      ];

      await expect(saveCategoryImages(images)).rejects.toThrow('Some other error');
    });
  });

  describe('addCategoryImage', () => {
    test('adds new image with categories', async () => {
      const image = await addCategoryImage('data:image/png;base64,abc', ['Appetizer', 'Dessert']);
      
      expect(image).toMatchObject({
        image: 'data:image/png;base64,abc',
        categories: ['Appetizer', 'Dessert']
      });
      expect(image.id).toBeDefined();
      
      // Verify setDoc was called with the right data
      const calls = setDoc.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0][1]).toEqual({
        image: 'data:image/png;base64,abc',
        categories: ['Appetizer', 'Dessert']
      });
    });

    test('adds image with no categories', async () => {
      const image = await addCategoryImage('data:image/png;base64,xyz');
      
      expect(image.categories).toEqual([]);
      expect(setDoc).toHaveBeenCalled();
    });
  });

  describe('updateCategoryImage', () => {
    test('updates existing image', async () => {
      const imageId = 'test-id-123';
      
      // Mock getDoc to return existing image
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ 
          image: 'data:image/png;base64,abc',
          categories: ['Appetizer'] 
        })
      });
      
      const result = await updateCategoryImage(imageId, { 
        categories: ['Main Course', 'Dessert'] 
      });
      
      expect(result).toBe(true);
      // Verify setDoc was called with the right data
      const calls = setDoc.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[calls.length - 1][1]).toEqual({
        image: 'data:image/png;base64,abc',
        categories: ['Main Course', 'Dessert']
      });
    });

    test('returns false for non-existent image', async () => {
      getDoc.mockResolvedValue({
        exists: () => false
      });
      
      const result = await updateCategoryImage('non-existent', { categories: [] });
      expect(result).toBe(false);
    });
  });

  describe('removeCategoryImage', () => {
    test('removes existing image', async () => {
      const result = await removeCategoryImage('test-id');
      
      expect(result).toBe(true);
      expect(deleteDoc).toHaveBeenCalled();
    });

    test('returns false when deleteDoc throws error', async () => {
      deleteDoc.mockRejectedValue(new Error('Delete failed'));
      const result = await removeCategoryImage('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getImageForCategory', () => {
    test('returns image for assigned category', async () => {
      const images = [
        { id: '1', image: 'data:image/png;base64,abc', categories: ['Appetizer', 'Salad'] },
        { id: '2', image: 'data:image/png;base64,def', categories: ['Dessert'] }
      ];
      
      const mockDocs = images.map(img => ({
        id: img.id,
        data: () => ({ image: img.image, categories: img.categories })
      }));
      
      getDocs.mockResolvedValue({
        empty: false,
        forEach: (callback) => mockDocs.forEach(callback)
      });
      
      expect(await getImageForCategory('Appetizer')).toBe('data:image/png;base64,abc');
      expect(await getImageForCategory('Salad')).toBe('data:image/png;base64,abc');
      expect(await getImageForCategory('Dessert')).toBe('data:image/png;base64,def');
    });

    test('returns null for unassigned category', async () => {
      const images = [
        { id: '1', image: 'data:image/png;base64,abc', categories: ['Appetizer'] }
      ];
      
      const mockDocs = images.map(img => ({
        id: img.id,
        data: () => ({ image: img.image, categories: img.categories })
      }));
      
      getDocs.mockResolvedValue({
        empty: false,
        forEach: (callback) => mockDocs.forEach(callback)
      });
      
      expect(await getImageForCategory('Main Course')).toBeNull();
    });
  });

  describe('getImageForCategories', () => {
    test('returns first matching image for categories', async () => {
      const images = [
        { id: '1', image: 'data:image/png;base64,abc', categories: ['Appetizer'] },
        { id: '2', image: 'data:image/png;base64,def', categories: ['Main Course'] },
        { id: '3', image: 'data:image/png;base64,ghi', categories: ['Dessert'] }
      ];
      
      const mockDocs = images.map(img => ({
        id: img.id,
        data: () => ({ image: img.image, categories: img.categories })
      }));
      
      getDocs.mockResolvedValue({
        empty: false,
        forEach: (callback) => mockDocs.forEach(callback)
      });
      
      expect(await getImageForCategories(['Main Course', 'Dessert'])).toBe('data:image/png;base64,def');
      expect(await getImageForCategories(['Dessert', 'Main Course'])).toBe('data:image/png;base64,ghi');
    });

    test('returns null when no categories match', async () => {
      const images = [
        { id: '1', image: 'data:image/png;base64,abc', categories: ['Appetizer'] }
      ];
      
      const mockDocs = images.map(img => ({
        id: img.id,
        data: () => ({ image: img.image, categories: img.categories })
      }));
      
      getDocs.mockResolvedValue({
        empty: false,
        forEach: (callback) => mockDocs.forEach(callback)
      });
      
      expect(await getImageForCategories(['Main Course', 'Dessert'])).toBeNull();
    });

    test('returns null for empty categories array', async () => {
      expect(await getImageForCategories([])).toBeNull();
    });
  });

  describe('isCategoryAssigned', () => {
    test('returns true if category is assigned', async () => {
      const images = [
        { id: '1', image: 'data:image/png;base64,abc', categories: ['Appetizer', 'Salad'] }
      ];
      
      const mockDocs = images.map(img => ({
        id: img.id,
        data: () => ({ image: img.image, categories: img.categories })
      }));
      
      getDocs.mockResolvedValue({
        empty: false,
        forEach: (callback) => mockDocs.forEach(callback)
      });
      
      expect(await isCategoryAssigned('Appetizer')).toBe(true);
      expect(await isCategoryAssigned('Salad')).toBe(true);
    });

    test('returns false if category is not assigned', async () => {
      const images = [
        { id: '1', image: 'data:image/png;base64,abc', categories: ['Appetizer'] }
      ];
      
      const mockDocs = images.map(img => ({
        id: img.id,
        data: () => ({ image: img.image, categories: img.categories })
      }));
      
      getDocs.mockResolvedValue({
        empty: false,
        forEach: (callback) => mockDocs.forEach(callback)
      });
      
      expect(await isCategoryAssigned('Main Course')).toBe(false);
    });

    test('excludes specified image from check', async () => {
      const images = [
        { id: 'test-id', image: 'data:image/png;base64,abc', categories: ['Appetizer'] }
      ];
      
      const mockDocs = images.map(img => ({
        id: img.id,
        data: () => ({ image: img.image, categories: img.categories })
      }));
      
      getDocs.mockResolvedValue({
        empty: false,
        forEach: (callback) => mockDocs.forEach(callback)
      });
      
      expect(await isCategoryAssigned('Appetizer', 'test-id')).toBe(false);
    });
  });

  describe('getAlreadyAssignedCategories', () => {
    test('returns categories already assigned to other images', async () => {
      const images = [
        { id: 'image1', image: 'data:image/png;base64,abc', categories: ['Appetizer', 'Salad'] },
        { id: 'image2', image: 'data:image/png;base64,def', categories: ['Main Course'] }
      ];
      
      const mockDocs = images.map(img => ({
        id: img.id,
        data: () => ({ image: img.image, categories: img.categories })
      }));
      
      getDocs.mockResolvedValue({
        empty: false,
        forEach: (callback) => mockDocs.forEach(callback)
      });
      
      const assigned = await getAlreadyAssignedCategories(
        ['Appetizer', 'Dessert', 'Main Course'], 
        'image1'
      );
      
      expect(assigned).toEqual(['Main Course']);
    });

    test('returns empty array when no categories are assigned', async () => {
      const images = [
        { id: '1', image: 'data:image/png;base64,abc', categories: ['Appetizer'] }
      ];
      
      const mockDocs = images.map(img => ({
        id: img.id,
        data: () => ({ image: img.image, categories: img.categories })
      }));
      
      getDocs.mockResolvedValue({
        empty: false,
        forEach: (callback) => mockDocs.forEach(callback)
      });
      
      const assigned = await getAlreadyAssignedCategories(['Dessert', 'Main Course']);
      
      expect(assigned).toEqual([]);
    });

    test('excludes own image when checking assignments', async () => {
      const images = [
        { id: 'test-id', image: 'data:image/png;base64,abc', categories: ['Appetizer', 'Salad'] }
      ];
      
      const mockDocs = images.map(img => ({
        id: img.id,
        data: () => ({ image: img.image, categories: img.categories })
      }));
      
      getDocs.mockResolvedValue({
        empty: false,
        forEach: (callback) => mockDocs.forEach(callback)
      });
      
      const assigned = await getAlreadyAssignedCategories(['Appetizer', 'Salad'], 'test-id');
      
      expect(assigned).toEqual([]);
    });
  });
});
