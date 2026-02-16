import { isStorageUrl } from './storageUtils';

// Mock Firebase modules
jest.mock('../firebase', () => ({
  storage: {}
}));

jest.mock('firebase/storage', () => ({
  ref: jest.fn(),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(),
  deleteObject: jest.fn()
}));

describe('Storage Utilities', () => {
  describe('isStorageUrl', () => {
    it('should return true for Firebase Storage URLs', () => {
      const storageUrl = 'https://firebasestorage.googleapis.com/v0/b/project/o/recipes%2Fimage.jpg?alt=media';
      expect(isStorageUrl(storageUrl)).toBe(true);
    });

    it('should return false for Base64 data URLs', () => {
      const base64Url = 'data:image/jpeg;base64,/9j/4AAQSkZJRg...';
      expect(isStorageUrl(base64Url)).toBe(false);
    });

    it('should return false for external HTTP URLs', () => {
      const externalUrl = 'https://example.com/image.jpg';
      expect(isStorageUrl(externalUrl)).toBe(false);
    });

    it('should return false for Unsplash URLs', () => {
      const unsplashUrl = 'https://images.unsplash.com/photo-12345?w=400';
      expect(isStorageUrl(unsplashUrl)).toBe(false);
    });

    it('should return false for null or undefined', () => {
      expect(isStorageUrl(null)).toBe(false);
      expect(isStorageUrl(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isStorageUrl('')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isStorageUrl(123)).toBe(false);
      expect(isStorageUrl({})).toBe(false);
      expect(isStorageUrl([])).toBe(false);
    });
  });

  describe('uploadRecipeImage', () => {
    let uploadRecipeImage;
    let ref, uploadBytes, getDownloadURL;

    beforeEach(() => {
      jest.clearAllMocks();
      // Re-import to get fresh mocks
      ({ uploadRecipeImage } = require('./storageUtils'));
      ({ ref, uploadBytes, getDownloadURL } = require('firebase/storage'));
    });

    it('should throw error if no file is provided', async () => {
      await expect(uploadRecipeImage(null)).rejects.toThrow('No file provided');
      await expect(uploadRecipeImage(undefined)).rejects.toThrow('No file provided');
    });

    it('should throw error if file size exceeds 5MB', async () => {
      const largeFile = {
        size: 6 * 1024 * 1024, // 6MB
        type: 'image/jpeg',
        name: 'large.jpg'
      };

      await expect(uploadRecipeImage(largeFile)).rejects.toThrow(
        'Image file size must be less than 5MB'
      );
    });

    it('should throw error for invalid file types', async () => {
      const invalidFile = {
        size: 1024,
        type: 'application/pdf',
        name: 'document.pdf'
      };

      await expect(uploadRecipeImage(invalidFile)).rejects.toThrow(
        'Invalid file type. Please upload a JPEG, PNG, GIF, or WebP image'
      );
    });

    it('should successfully upload a valid image', async () => {
      const validFile = {
        size: 1024 * 1024, // 1MB
        type: 'image/jpeg',
        name: 'test.jpg'
      };

      const mockDownloadURL = 'https://firebasestorage.googleapis.com/v0/b/project/o/recipes%2Ftest.jpg?alt=media';
      
      ref.mockReturnValue({ path: 'recipes/test.jpg' });
      uploadBytes.mockResolvedValue({ ref: { path: 'recipes/test.jpg' } });
      getDownloadURL.mockResolvedValue(mockDownloadURL);

      const result = await uploadRecipeImage(validFile);

      expect(result).toBe(mockDownloadURL);
      expect(ref).toHaveBeenCalled();
      expect(uploadBytes).toHaveBeenCalled();
      expect(getDownloadURL).toHaveBeenCalled();
    });

    it('should accept valid image types', async () => {
      const validTypes = [
        { type: 'image/jpeg', name: 'test.jpg' },
        { type: 'image/jpg', name: 'test.jpg' },
        { type: 'image/png', name: 'test.png' },
        { type: 'image/gif', name: 'test.gif' },
        { type: 'image/webp', name: 'test.webp' }
      ];

      for (const fileType of validTypes) {
        const file = {
          size: 1024,
          ...fileType
        };

        ref.mockReturnValue({ path: 'recipes/test' });
        uploadBytes.mockResolvedValue({ ref: { path: 'recipes/test' } });
        getDownloadURL.mockResolvedValue('https://firebasestorage.googleapis.com/test');

        await expect(uploadRecipeImage(file)).resolves.toBeDefined();
      }
    });

    it('should handle upload errors gracefully', async () => {
      const validFile = {
        size: 1024,
        type: 'image/jpeg',
        name: 'test.jpg'
      };

      ref.mockReturnValue({ path: 'recipes/test.jpg' });
      uploadBytes.mockRejectedValue(new Error('Network error'));

      await expect(uploadRecipeImage(validFile)).rejects.toThrow(
        'Failed to upload image. Please try again.'
      );
    });
  });

  describe('deleteRecipeImage', () => {
    let deleteRecipeImage;
    let ref, deleteObject;

    beforeEach(() => {
      jest.clearAllMocks();
      // Re-import to get fresh mocks
      ({ deleteRecipeImage } = require('./storageUtils'));
      ({ ref, deleteObject } = require('firebase/storage'));
    });

    it('should delete image from Firebase Storage', async () => {
      const storageUrl = 'https://firebasestorage.googleapis.com/v0/b/project/o/recipes%2Ftest.jpg?alt=media';
      
      ref.mockReturnValue({ path: 'recipes/test.jpg' });
      deleteObject.mockResolvedValue(undefined);

      await deleteRecipeImage(storageUrl);

      expect(ref).toHaveBeenCalled();
      expect(deleteObject).toHaveBeenCalled();
    });

    it('should not attempt to delete Base64 images', async () => {
      const base64Url = 'data:image/jpeg;base64,/9j/4AAQSkZJRg...';
      
      await deleteRecipeImage(base64Url);

      expect(ref).not.toHaveBeenCalled();
      expect(deleteObject).not.toHaveBeenCalled();
    });

    it('should not attempt to delete external URLs', async () => {
      const externalUrl = 'https://example.com/image.jpg';
      
      await deleteRecipeImage(externalUrl);

      expect(ref).not.toHaveBeenCalled();
      expect(deleteObject).not.toHaveBeenCalled();
    });

    it('should handle null or undefined gracefully', async () => {
      await expect(deleteRecipeImage(null)).resolves.toBeUndefined();
      await expect(deleteRecipeImage(undefined)).resolves.toBeUndefined();
      
      expect(ref).not.toHaveBeenCalled();
      expect(deleteObject).not.toHaveBeenCalled();
    });

    it('should handle deletion errors gracefully without throwing', async () => {
      const storageUrl = 'https://firebasestorage.googleapis.com/v0/b/project/o/recipes%2Ftest.jpg?alt=media';
      
      ref.mockReturnValue({ path: 'recipes/test.jpg' });
      deleteObject.mockRejectedValue(new Error('Permission denied'));

      // Should not throw
      await expect(deleteRecipeImage(storageUrl)).resolves.toBeUndefined();
    });

    it('should handle malformed Storage URLs gracefully', async () => {
      const malformedUrl = 'https://firebasestorage.googleapis.com/invalid';
      
      // Should not throw
      await expect(deleteRecipeImage(malformedUrl)).resolves.toBeUndefined();
    });
  });
});
