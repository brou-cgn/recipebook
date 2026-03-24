import { fileToBase64, isBase64Image, isValidImageSource, compressImage, analyzeImageBrightness, selectMenuGridImages } from './imageUtils';

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

  describe('analyzeImageBrightness', () => {
    let originalCreateElement;
    let originalImage;

    beforeEach(() => {
      originalCreateElement = document.createElement.bind(document);
      originalImage = global.Image;
    });

    afterEach(() => {
      document.createElement = originalCreateElement;
      global.Image = originalImage;
    });

    function mockCanvasWithLuminance(luminance) {
      const pixelValue = Math.round(luminance);
      document.createElement = jest.fn((tag) => {
        if (tag === 'canvas') {
          const mockCtx = {
            drawImage: jest.fn(),
            getImageData: jest.fn(() => ({
              data: new Uint8ClampedArray([
                pixelValue, pixelValue, pixelValue, 255,
                pixelValue, pixelValue, pixelValue, 255,
              ]),
            })),
          };
          return { width: 0, height: 0, getContext: jest.fn(() => mockCtx) };
        }
        return originalCreateElement(tag);
      });
    }

    function mockImageLoad(triggerOnLoad = true) {
      const mockImg = { onload: null, onerror: null, src: '', crossOrigin: null };
      global.Image = jest.fn(() => {
        setTimeout(() => {
          if (triggerOnLoad && mockImg.onload) mockImg.onload();
        }, 0);
        return mockImg;
      });
      return mockImg;
    }

    test('resolves { isBright: true } when both corners exceed the threshold', async () => {
      mockCanvasWithLuminance(200); // well above 180
      mockImageLoad();

      const result = await analyzeImageBrightness('data:image/png;base64,abc');
      expect(result).toEqual({ isBright: true });
    });

    test('resolves { isBright: false } when both corners are below the threshold', async () => {
      mockCanvasWithLuminance(100); // well below 180
      mockImageLoad();

      const result = await analyzeImageBrightness('data:image/png;base64,abc');
      expect(result).toEqual({ isBright: false });
    });

    test('resolves { isBright: false } when imageSrc is empty', async () => {
      const result = await analyzeImageBrightness('');
      expect(result).toEqual({ isBright: false });
    });

    test('resolves { isBright: false } when imageSrc is null', async () => {
      const result = await analyzeImageBrightness(null);
      expect(result).toEqual({ isBright: false });
    });

    test('resolves { isBright: false } when image fails to load', async () => {
      const mockImg = { onload: null, onerror: null, src: '', crossOrigin: null };
      global.Image = jest.fn(() => {
        setTimeout(() => { if (mockImg.onerror) mockImg.onerror(); }, 0);
        return mockImg;
      });

      const result = await analyzeImageBrightness('https://example.com/bad-image.jpg');
      expect(result).toEqual({ isBright: false });
    });

    test('sets crossOrigin to anonymous for non-base64 URLs', async () => {
      mockCanvasWithLuminance(100);
      const mockImg = mockImageLoad();

      await analyzeImageBrightness('https://example.com/photo.jpg');
      expect(mockImg.crossOrigin).toBe('anonymous');
    });

    test('does not set crossOrigin for base64 data URLs', async () => {
      mockCanvasWithLuminance(100);
      const mockImg = mockImageLoad();

      await analyzeImageBrightness('data:image/png;base64,test');
      expect(mockImg.crossOrigin).toBeNull();
    });
  });

  describe('selectMenuGridImages', () => {
    const makeRecipe = (id, imageUrl) => ({ id, image: imageUrl, images: [] });
    const makeRecipeWithImages = (id, imageUrl, isDefault = true) => ({
      id,
      image: imageUrl,
      images: [{ url: imageUrl, isDefault }],
    });

    const catImg = 'data:image/png;base64,CATEGORY_IMAGE';
    const customImg1 = 'data:image/jpeg;base64,CUSTOM_1';
    const customImg2 = 'data:image/jpeg;base64,CUSTOM_2';
    const customImg3 = 'data:image/jpeg;base64,CUSTOM_3';
    const categoryImages = [{ image: catImg }];

    test('returns empty array when no sections or recipes have images', () => {
      const sections = [{ name: 'Hauptspeise', recipeIds: ['r1'] }];
      const recipes = [makeRecipe('r1', '')];
      expect(selectMenuGridImages(sections, recipes, [])).toEqual([]);
    });

    test('returns at most maxImages images', () => {
      const sections = [
        { name: 'A', recipeIds: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'] },
      ];
      const recipes = Array.from({ length: 7 }, (_, i) =>
        makeRecipe(`r${i + 1}`, `data:image/jpeg;base64,IMG${i + 1}`)
      );
      const result = selectMenuGridImages(sections, recipes, [], 6);
      expect(result.length).toBeLessThanOrEqual(6);
    });

    test('prefers custom images over category images', () => {
      const sections = [{ name: 'Hauptspeise', recipeIds: ['r1', 'r2'] }];
      const recipes = [
        makeRecipe('r1', catImg),
        makeRecipe('r2', customImg1),
      ];
      const result = selectMenuGridImages(sections, recipes, categoryImages, 1);
      expect(result).toEqual([customImg1]);
    });

    test('falls back to category image when no custom image is available', () => {
      const sections = [{ name: 'Hauptspeise', recipeIds: ['r1'] }];
      const recipes = [makeRecipe('r1', catImg)];
      const result = selectMenuGridImages(sections, recipes, categoryImages, 6);
      expect(result).toEqual([catImg]);
    });

    test('picks one image per section in first pass', () => {
      const sections = [
        { name: 'Vorspeise', recipeIds: ['r1'] },
        { name: 'Hauptspeise', recipeIds: ['r2'] },
        { name: 'Dessert', recipeIds: ['r3'] },
      ];
      const recipes = [
        makeRecipe('r1', customImg1),
        makeRecipe('r2', customImg2),
        makeRecipe('r3', customImg3),
      ];
      const result = selectMenuGridImages(sections, recipes, [], 6);
      expect(result).toHaveLength(3);
      expect(result).toContain(customImg1);
      expect(result).toContain(customImg2);
      expect(result).toContain(customImg3);
    });

    test('does not include the same recipe image twice', () => {
      const sections = [
        { name: 'A', recipeIds: ['r1'] },
        { name: 'B', recipeIds: ['r1'] }, // same recipe in two sections
      ];
      const recipes = [makeRecipe('r1', customImg1)];
      const result = selectMenuGridImages(sections, recipes, [], 6);
      expect(result).toHaveLength(1);
    });

    test('uses images from recipe.images array (isDefault)', () => {
      const sections = [{ name: 'Hauptspeise', recipeIds: ['r1'] }];
      const recipes = [makeRecipeWithImages('r1', customImg1)];
      const result = selectMenuGridImages(sections, recipes, [], 6);
      expect(result).toEqual([customImg1]);
    });

    test('respects maxImages across sections', () => {
      const sections = [
        { name: 'A', recipeIds: ['r1', 'r2'] },
        { name: 'B', recipeIds: ['r3', 'r4'] },
      ];
      const recipes = Array.from({ length: 4 }, (_, i) =>
        makeRecipe(`r${i + 1}`, `data:image/jpeg;base64,IMG${i + 1}`)
      );
      const result = selectMenuGridImages(sections, recipes, [], 2);
      expect(result).toHaveLength(2);
    });
  });
});
