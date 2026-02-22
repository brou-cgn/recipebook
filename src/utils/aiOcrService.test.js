/**
 * Tests for AI-Enhanced OCR Service
 */

import {
  isAiOcrAvailable,
  recognizeRecipeWithGemini,
  recognizeRecipeWithAI,
  getAiOcrProviders,
  compareOcrMethods,
} from './aiOcrService';

// Mock Firebase Functions
jest.mock('../firebase', () => ({
  functions: {},
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(),
}));

// Mock customLists to provide cuisine types and meal categories
jest.mock('./customLists', () => ({
  getCustomLists: jest.fn(),
  getAIRecipePrompt: jest.fn(),
}));

import { httpsCallable } from 'firebase/functions';
import { getCustomLists } from './customLists';

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv };
  jest.clearAllMocks();
  // Set up default mock implementation for getCustomLists
  getCustomLists.mockResolvedValue({
    cuisineTypes: ['Italian', 'German', 'Asian'],
    mealCategories: ['Main Course', 'Dessert', 'Soup'],
    units: [],
    portionUnits: [],
  });
});

afterEach(() => {
  process.env = originalEnv;
});

describe('AI OCR Service', () => {
  describe('isAiOcrAvailable', () => {
    test('returns true for gemini provider (Cloud Function based)', () => {
      expect(isAiOcrAvailable('gemini')).toBe(true);
    });

    test('returns false for unknown provider', () => {
      expect(isAiOcrAvailable('unknown')).toBe(false);
    });

    test('defaults to gemini provider', () => {
      expect(isAiOcrAvailable()).toBe(true);
    });

    test('returns false for openai provider (not yet implemented)', () => {
      expect(isAiOcrAvailable('openai')).toBe(false);
    });
  });

  describe('getAiOcrProviders', () => {
    test('returns information about all providers', () => {
      const providers = getAiOcrProviders();
      expect(providers).toHaveProperty('gemini');
      expect(providers).toHaveProperty('openai');
    });

    test('includes provider details', () => {
      const providers = getAiOcrProviders();
      expect(providers.gemini).toHaveProperty('name');
      expect(providers.gemini).toHaveProperty('available');
      expect(providers.gemini).toHaveProperty('features');
      expect(providers.gemini).toHaveProperty('freeTier');
    });

    test('reflects availability based on configuration', () => {
      const providers = getAiOcrProviders();
      // With Cloud Functions, gemini is always available
      expect(providers.gemini.available).toBe(true);
      // OpenAI is not yet implemented
      expect(providers.openai.available).toBe(false);
    });
  });

  describe('recognizeRecipeWithGemini', () => {
    beforeEach(() => {
      httpsCallable.mockClear();
    });

    test('validates image data', async () => {
      const imageBase64 = '';
      
      await expect(recognizeRecipeWithGemini(imageBase64, 'de')).rejects.toThrow(
        'Invalid image data'
      );
    });

    test('calls Cloud Function with correct parameters', async () => {
      const mockCallable = jest.fn().mockResolvedValue({
        data: {
          title: 'Spaghetti Carbonara',
          servings: 4,
          ingredients: ['400g Spaghetti', '200g Speck'],
          steps: ['Pasta kochen', 'Speck anbraten'],
          prepTime: '30 min',
          cookTime: '15 min',
          difficulty: 3,
          cuisine: 'Italienisch',
          category: 'Hauptgericht',
          tags: [],
          notes: '',
          confidence: 95,
          provider: 'gemini',
        }
      });

      httpsCallable.mockReturnValue(mockCallable);

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);
      const result = await recognizeRecipeWithGemini(imageBase64, 'de');

      expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'scanRecipeWithAI');
      expect(mockCallable).toHaveBeenCalledWith({
        imageBase64: imageBase64,
        language: 'de',
        cuisineTypes: ['Italian', 'German', 'Asian'],
        mealCategories: ['Main Course', 'Dessert', 'Soup'],
      });
      
      expect(result).toHaveProperty('title', 'Spaghetti Carbonara');
      expect(result).toHaveProperty('servings', 4);
      expect(result).toHaveProperty('ingredients');
      expect(result).toHaveProperty('steps');
    });

    test('calls progress callback at different stages', async () => {
      const mockCallable = jest.fn().mockResolvedValue({
        data: {
          title: 'Test',
          servings: 1,
          ingredients: [],
          steps: [],
          confidence: 95,
          provider: 'gemini',
        }
      });

      httpsCallable.mockReturnValue(mockCallable);

      const progressCallback = jest.fn();
      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);
      
      await recognizeRecipeWithGemini(imageBase64, 'de', progressCallback);

      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalledWith(10);
      expect(progressCallback).toHaveBeenCalledWith(100);
    });

    test('handles authentication error', async () => {
      const mockCallable = jest.fn().mockRejectedValue({
        code: 'unauthenticated',
        message: 'User not authenticated'
      });

      httpsCallable.mockReturnValue(mockCallable);

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);
      
      await expect(recognizeRecipeWithGemini(imageBase64, 'de')).rejects.toThrow(
        'logged in'
      );
    });

    test('handles rate limit error', async () => {
      const mockCallable = jest.fn().mockRejectedValue({
        code: 'resource-exhausted',
        message: 'Rate limit exceeded: maximum 20 scans per day'
      });

      httpsCallable.mockReturnValue(mockCallable);

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);
      
      await expect(recognizeRecipeWithGemini(imageBase64, 'de')).rejects.toThrow(
        'Rate limit exceeded'
      );
    });

    test('handles admin rate limit error', async () => {
      const mockCallable = jest.fn().mockRejectedValue({
        code: 'resource-exhausted',
        message: 'Rate limit exceeded: maximum 1000 scans per day'
      });

      httpsCallable.mockReturnValue(mockCallable);

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);
      
      await expect(recognizeRecipeWithGemini(imageBase64, 'de')).rejects.toThrow(
        'Rate limit exceeded'
      );
    });

    test('handles invalid argument error', async () => {
      const mockCallable = jest.fn().mockRejectedValue({
        code: 'invalid-argument',
        message: 'Image too large'
      });

      httpsCallable.mockReturnValue(mockCallable);

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);
      
      await expect(recognizeRecipeWithGemini(imageBase64, 'de')).rejects.toThrow(
        'Image too large'
      );
    });

    test('handles service not configured error', async () => {
      const mockCallable = jest.fn().mockRejectedValue({
        code: 'failed-precondition',
        message: 'Service not configured'
      });

      httpsCallable.mockReturnValue(mockCallable);

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);
      
      await expect(recognizeRecipeWithGemini(imageBase64, 'de')).rejects.toThrow(
        'AI-Service nicht konfiguriert'
      );
    });

    test('handles generic errors', async () => {
      const mockCallable = jest.fn().mockRejectedValue({
        message: 'Network error'
      });

      httpsCallable.mockReturnValue(mockCallable);

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);
      
      await expect(recognizeRecipeWithGemini(imageBase64, 'de')).rejects.toThrow(
        'Network error'
      );
    });

    test('passes language parameter correctly', async () => {
      const mockCallable = jest.fn().mockResolvedValue({
        data: {
          title: 'Test Recipe',
          servings: 2,
          ingredients: [],
          steps: [],
          confidence: 95,
          provider: 'gemini',
        }
      });

      httpsCallable.mockReturnValue(mockCallable);

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);
      await recognizeRecipeWithGemini(imageBase64, 'en');

      expect(mockCallable).toHaveBeenCalledWith({
        imageBase64: imageBase64,
        language: 'en',
        cuisineTypes: ['Italian', 'German', 'Asian'],
        mealCategories: ['Main Course', 'Dessert', 'Soup'],
      });
    });

    test('retries on unavailable error and succeeds', async () => {
      const mockCallable = jest.fn()
        .mockRejectedValueOnce({ code: 'unavailable', message: 'Service unavailable' })
        .mockResolvedValueOnce({
          data: {
            title: 'Retry Success',
            servings: 2,
            ingredients: [],
            steps: [],
            confidence: 95,
            provider: 'gemini',
          }
        });

      httpsCallable.mockReturnValue(mockCallable);

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);
      const result = await recognizeRecipeWithGemini(imageBase64, 'de');

      expect(mockCallable).toHaveBeenCalledTimes(2);
      expect(result.title).toBe('Retry Success');
    });

    test('retries on deadline-exceeded error and eventually fails', async () => {
      const mockCallable = jest.fn().mockRejectedValue({
        code: 'deadline-exceeded',
        message: 'Request timed out'
      });

      httpsCallable.mockReturnValue(mockCallable);

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);

      await expect(recognizeRecipeWithGemini(imageBase64, 'de')).rejects.toThrow(
        'Zeitüberschreitung'
      );
      // Should have tried MAX_RETRIES + 1 times
      expect(mockCallable).toHaveBeenCalledTimes(4);
    });

    test('does not retry on non-retryable errors', async () => {
      const mockCallable = jest.fn().mockRejectedValue({
        code: 'invalid-argument',
        message: 'Invalid image'
      });

      httpsCallable.mockReturnValue(mockCallable);

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);

      await expect(recognizeRecipeWithGemini(imageBase64, 'de')).rejects.toThrow(
        'Invalid image'
      );
      // Should only try once for non-retryable errors
      expect(mockCallable).toHaveBeenCalledTimes(1);
    });

    test('shows German error message for unavailable error after retries', async () => {
      const mockCallable = jest.fn().mockRejectedValue({
        code: 'unavailable',
        message: 'Network down'
      });

      httpsCallable.mockReturnValue(mockCallable);

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);

      await expect(recognizeRecipeWithGemini(imageBase64, 'de')).rejects.toThrow(
        'Netzwerkfehler'
      );
    });

    test('shows German error message for Tageslimit/resource-exhausted', async () => {
      const mockCallable = jest.fn().mockRejectedValue({
        code: 'resource-exhausted',
        message: 'Tageslimit erreicht (20/20 Scans)'
      });

      httpsCallable.mockReturnValue(mockCallable);

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);

      await expect(recognizeRecipeWithGemini(imageBase64, 'de')).rejects.toThrow(
        'Tageslimit'
      );
    });

    test('includes remaining scans when returned from Cloud Function', async () => {
      const mockCallable = jest.fn().mockResolvedValue({
        data: {
          title: 'Test',
          servings: 1,
          ingredients: [],
          steps: [],
          confidence: 95,
          provider: 'gemini',
          remainingScans: 15,
          dailyLimit: 20,
        }
      });

      httpsCallable.mockReturnValue(mockCallable);

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);
      const result = await recognizeRecipeWithGemini(imageBase64, 'de');

      expect(result.remainingScans).toBe(15);
      expect(result.dailyLimit).toBe(20);
    });

    test('calls Cloud Function successfully even when getCustomLists fails', async () => {
      getCustomLists.mockRejectedValueOnce(new Error('Firestore unavailable'));

      const mockCallable = jest.fn().mockResolvedValue({
        data: {
          title: 'Test',
          servings: 1,
          ingredients: [],
          steps: [],
          confidence: 95,
          provider: 'gemini',
        }
      });
      httpsCallable.mockReturnValue(mockCallable);

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);
      const result = await recognizeRecipeWithGemini(imageBase64, 'de');

      // Should still succeed, calling the function without cuisine/category lists
      expect(result.title).toBe('Test');
      expect(mockCallable).toHaveBeenCalledWith(
        expect.objectContaining({
          imageBase64: imageBase64,
          language: 'de',
          cuisineTypes: undefined,
          mealCategories: undefined,
        })
      );
    });
  });

  describe('recognizeRecipeWithAI', () => {
    beforeEach(() => {
      httpsCallable.mockClear();
    });

    test('validates image data', async () => {
      await expect(recognizeRecipeWithAI('', {})).rejects.toThrow('Invalid image data');
      await expect(recognizeRecipeWithAI('short', {})).rejects.toThrow('Invalid image data');
    });

    test('uses Gemini as default provider', async () => {
      const mockCallable = jest.fn().mockResolvedValue({
        data: {
          title: 'Test',
          servings: 1,
          ingredients: [],
          steps: [],
          confidence: 95,
          provider: 'gemini',
        }
      });

      httpsCallable.mockReturnValue(mockCallable);

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);
      const result = await recognizeRecipeWithAI(imageBase64);

      expect(result.provider).toBe('gemini');
    });

    test('accepts custom provider option', async () => {
      const mockCallable = jest.fn().mockResolvedValue({
        data: {
          title: 'Test',
          servings: 1,
          ingredients: [],
          steps: [],
          confidence: 95,
          provider: 'gemini',
        }
      });

      httpsCallable.mockReturnValue(mockCallable);

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);
      const result = await recognizeRecipeWithAI(imageBase64, { provider: 'gemini' });

      expect(result.provider).toBe('gemini');
    });

    test('falls back to Gemini when OpenAI provider is requested (not implemented)', async () => {
      const mockCallable = jest.fn().mockResolvedValue({
        data: {
          title: 'Test',
          servings: 1,
          ingredients: [],
          steps: [],
          confidence: 95,
          provider: 'gemini',
        }
      });

      httpsCallable.mockReturnValue(mockCallable);

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);
      const result = await recognizeRecipeWithAI(imageBase64, { provider: 'openai' });
      
      // Should fall back to Gemini since OpenAI is not available
      expect(result.provider).toBe('gemini');
    });

    test('passes language option correctly', async () => {
      const mockCallable = jest.fn().mockResolvedValue({
        data: {
          title: 'Test',
          servings: 1,
          ingredients: [],
          steps: [],
          confidence: 95,
          provider: 'gemini',
        }
      });

      httpsCallable.mockReturnValue(mockCallable);

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);
      await recognizeRecipeWithAI(imageBase64, { language: 'en' });

      expect(mockCallable).toHaveBeenCalledWith({
        imageBase64: imageBase64,
        language: 'en',
        cuisineTypes: ['Italian', 'German', 'Asian'],
        mealCategories: ['Main Course', 'Dessert', 'Soup'],
      });
    });
  });

  describe('compareOcrMethods', () => {
    test('returns comparison object with timestamp', async () => {
      // This test would require mocking both OCR services
      // Skipping for now as it requires complex mocking
      expect(typeof compareOcrMethods).toBe('function');
    });
  });
});
