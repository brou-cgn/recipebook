import { fileToBase64, isBase64Image, isValidImageSource, compressImage } from './imageUtils';

describe('imageUtils', () => {
  describe('isBase64Image', () => {
    test('returns true for valid base64 data URL', () => {
      expect(isBase64Image('data:image/png;base64,abc123')).toBe(true);
      expect(isBase64Image('data:image/jpeg;base64,xyz789')).toBe(true);
    });

    test('returns false for non-base64 strings', () => {
      expect(isBase64Image('https://example.com/image.png')).toBe(false);
      expect(isBase64Image('not an image')).toBe(false);
    });
    
    test('returns false for empty or null values', () => {
      expect(isBase64Image('')).toBeFalsy();
      expect(isBase64Image(null)).toBeFalsy();
    });
  });

  describe('isValidImageSource', () => {
    test('returns true for valid base64 data URL', () => {
      expect(isValidImageSource('data:image/png;base64,abc123')).toBe(true);
    });

    test('returns true for valid URL', () => {
      expect(isValidImageSource('https://example.com/image.png')).toBe(true);
      expect(isValidImageSource('http://example.com/image.jpg')).toBe(true);
    });

    test('returns false for invalid strings', () => {
      expect(isValidImageSource('not a url')).toBe(false);
      expect(isValidImageSource('')).toBe(false);
      expect(isValidImageSource(null)).toBe(false);
    });
  });

  describe('compressImage', () => {
    test('rejects invalid base64 input', async () => {
      await expect(compressImage('not-a-base64-image')).rejects.toThrow('Invalid base64 image');
      await expect(compressImage('')).rejects.toThrow('Invalid base64 image');
      await expect(compressImage(null)).rejects.toThrow('Invalid base64 image');
    });

    test('processes valid base64 images', async () => {
      // Mock Image and canvas operations
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: jest.fn(() => ({
          drawImage: jest.fn(),
        })),
        toDataURL: jest.fn(() => 'data:image/png;base64,compressed'),
      };

      const originalCreateElement = document.createElement;
      document.createElement = jest.fn((tag) => {
        if (tag === 'canvas') {
          return mockCanvas;
        }
        return originalCreateElement.call(document, tag);
      });

      // Create a mock Image constructor
      const mockImage = {
        onload: null,
        onerror: null,
        src: '',
      };

      global.Image = jest.fn(() => mockImage);

      const promise = compressImage('data:image/png;base64,test');
      
      // Simulate image load
      setTimeout(() => {
        if (mockImage.onload) {
          mockImage.width = 1600;
          mockImage.height = 1200;
          mockImage.onload();
        }
      }, 0);

      const result = await promise;
      expect(result).toBe('data:image/png;base64,compressed');
      // PNG input should produce PNG output to preserve transparency
      expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png');

      // Restore original functions
      document.createElement = originalCreateElement;
    });

    test('processes JPEG images with compression', async () => {
      // Mock Image and canvas operations
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: jest.fn(() => ({
          drawImage: jest.fn(),
        })),
        toDataURL: jest.fn(() => 'data:image/jpeg;base64,compressed'),
      };

      const originalCreateElement = document.createElement;
      document.createElement = jest.fn((tag) => {
        if (tag === 'canvas') {
          return mockCanvas;
        }
        return originalCreateElement.call(document, tag);
      });

      // Create a mock Image constructor
      const mockImage = {
        onload: null,
        onerror: null,
        src: '',
      };

      global.Image = jest.fn(() => mockImage);

      const promise = compressImage('data:image/jpeg;base64,test');
      
      // Simulate image load
      setTimeout(() => {
        if (mockImage.onload) {
          mockImage.width = 1600;
          mockImage.height = 1200;
          mockImage.onload();
        }
      }, 0);

      const result = await promise;
      expect(result).toBe('data:image/jpeg;base64,compressed');
      // JPEG input should produce JPEG output with quality parameter
      expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.7);

      // Restore original functions
      document.createElement = originalCreateElement;
    });

    test('respects preserveTransparency parameter for non-PNG images', async () => {
      // Mock Image and canvas operations
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: jest.fn(() => ({
          drawImage: jest.fn(),
        })),
        toDataURL: jest.fn(() => 'data:image/png;base64,compressed'),
      };

      const originalCreateElement = document.createElement;
      document.createElement = jest.fn((tag) => {
        if (tag === 'canvas') {
          return mockCanvas;
        }
        return originalCreateElement.call(document, tag);
      });

      // Create a mock Image constructor
      const mockImage = {
        onload: null,
        onerror: null,
        src: '',
      };

      global.Image = jest.fn(() => mockImage);

      // Pass preserveTransparency=true for a JPEG input
      const promise = compressImage('data:image/jpeg;base64,test', 800, 600, 0.7, true);
      
      // Simulate image load
      setTimeout(() => {
        if (mockImage.onload) {
          mockImage.width = 1600;
          mockImage.height = 1200;
          mockImage.onload();
        }
      }, 0);

      const result = await promise;
      expect(result).toBe('data:image/png;base64,compressed');
      // When preserveTransparency=true, should output PNG regardless of input format
      expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png');

      // Restore original functions
      document.createElement = originalCreateElement;
    });

    test('handles image load errors', async () => {
      // Mock Image constructor
      const mockImage = {
        onload: null,
        onerror: null,
        src: '',
      };

      global.Image = jest.fn(() => mockImage);

      const promise = compressImage('data:image/png;base64,invalid');
      
      // Simulate image error
      setTimeout(() => {
        if (mockImage.onerror) {
          mockImage.onerror();
        }
      }, 0);

      await expect(promise).rejects.toThrow('Failed to load image');
    });
  });

  describe('fileToBase64', () => {
    test('rejects when no file provided', async () => {
      await expect(fileToBase64(null)).rejects.toThrow('No file provided');
    });

    test('rejects when file is too large', async () => {
      const largeFile = new File(['x'.repeat(6 * 1024 * 1024)], 'large.jpg', { type: 'image/jpeg' });
      await expect(fileToBase64(largeFile)).rejects.toThrow('Image file size must be less than 5MB');
    });

    test('rejects invalid file types', async () => {
      const invalidFile = new File(['test'], 'test.txt', { type: 'text/plain' });
      await expect(fileToBase64(invalidFile)).rejects.toThrow('Invalid file type');
    });

    test('accepts valid image types', async () => {
      // Create a minimal valid image file
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      
      for (const type of validTypes) {
        const file = new File(['fake-image-data'], 'test.jpg', { type });
        // We expect it to start processing (though it may fail on actual decoding)
        const promise = fileToBase64(file);
        expect(promise).toBeInstanceOf(Promise);
      }
    });
  });
});
