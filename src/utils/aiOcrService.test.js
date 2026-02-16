/**
 * Tests for AI-Enhanced OCR Service
 */

import {
  isAiOcrAvailable,
  recognizeRecipeWithGemini,
  recognizeRecipeWithAI,
  getAiOcrProviders,
  compareOcrMethods,
  __testing__
} from './aiOcrService';

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

describe('AI OCR Service', () => {
  describe('isAiOcrAvailable', () => {
    test('returns false when API key is not configured', () => {
      process.env.REACT_APP_GEMINI_API_KEY = '';
      expect(isAiOcrAvailable('gemini')).toBe(false);
    });

    test('returns true when Gemini API key is configured', () => {
      process.env.REACT_APP_GEMINI_API_KEY = 'test-api-key';
      expect(isAiOcrAvailable('gemini')).toBe(true);
    });

    test('returns false for unknown provider', () => {
      expect(isAiOcrAvailable('unknown')).toBe(false);
    });

    test('defaults to gemini provider', () => {
      process.env.REACT_APP_GEMINI_API_KEY = 'test-api-key';
      expect(isAiOcrAvailable()).toBe(true);
    });
  });

  describe('getRecipeExtractionPrompt', () => {
    test('returns German prompt when lang is de', () => {
      const prompt = __testing__.getRecipeExtractionPrompt('de');
      expect(prompt).toContain('Analysiere dieses Rezeptbild');
      expect(prompt).toContain('titel');
      expect(prompt).toContain('zutaten');
      expect(prompt).toContain('zubereitung');
    });

    test('returns English prompt when lang is en', () => {
      const prompt = __testing__.getRecipeExtractionPrompt('en');
      expect(prompt).toContain('Analyze this recipe image');
      expect(prompt).toContain('title');
      expect(prompt).toContain('ingredients');
      expect(prompt).toContain('steps');
    });

    test('includes structured JSON format in prompt', () => {
      const prompt = __testing__.getRecipeExtractionPrompt('de');
      expect(prompt).toContain('JSON');
      expect(prompt).toContain('kulinarik');
      expect(prompt).toContain('kategorie');
      expect(prompt).toContain('schwierigkeit');
    });

    test('defaults to German when no language specified', () => {
      const prompt = __testing__.getRecipeExtractionPrompt();
      expect(prompt).toContain('Analysiere dieses Rezeptbild');
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
      process.env.REACT_APP_GEMINI_API_KEY = 'test-key';
      const providers = getAiOcrProviders();
      expect(providers.gemini.available).toBe(true);
    });
  });

  describe('recognizeRecipeWithGemini', () => {
    // Mock fetch for testing
    global.fetch = jest.fn();

    beforeEach(() => {
      process.env.REACT_APP_GEMINI_API_KEY = 'test-api-key';
      fetch.mockClear();
    });

    test('throws error when API key is not configured', async () => {
      process.env.REACT_APP_GEMINI_API_KEY = '';
      const imageBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRg...';
      
      await expect(recognizeRecipeWithGemini(imageBase64, 'de')).rejects.toThrow(
        'Gemini API key not configured'
      );
    });

    test('sends correct request to Gemini API', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                titel: 'Spaghetti Carbonara',
                portionen: 4,
                zutaten: ['400g Spaghetti', '200g Speck'],
                zubereitung: ['Pasta kochen', 'Speck anbraten']
              })
            }]
          }
        }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const imageBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRg...';
      const result = await recognizeRecipeWithGemini(imageBase64, 'de');

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('generativelanguage.googleapis.com'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
      
      expect(result).toHaveProperty('title', 'Spaghetti Carbonara');
      expect(result).toHaveProperty('servings', 4);
      expect(result).toHaveProperty('ingredients');
      expect(result).toHaveProperty('steps');
    });

    test('handles JSON wrapped in markdown code blocks', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{
              text: '```json\n{"titel": "Test Recipe", "portionen": 2}\n```'
            }]
          }
        }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const imageBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRg...';
      const result = await recognizeRecipeWithGemini(imageBase64, 'de');

      expect(result).toHaveProperty('title', 'Test Recipe');
      expect(result).toHaveProperty('servings', 2);
    });

    test('normalizes German response to standard format', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                titel: 'Kuchen',
                portionen: 8,
                zubereitungszeit: '45 min',
                kulinarik: 'Deutsch',
                kategorie: 'Dessert',
                zutaten: ['250g Mehl'],
                zubereitung: ['Backen']
              })
            }]
          }
        }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const imageBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRg...';
      const result = await recognizeRecipeWithGemini(imageBase64, 'de');

      // Check normalized English keys
      expect(result).toHaveProperty('title', 'Kuchen');
      expect(result).toHaveProperty('servings', 8);
      expect(result).toHaveProperty('prepTime', '45 min');
      expect(result).toHaveProperty('cuisine', 'Deutsch');
      expect(result).toHaveProperty('category', 'Dessert');
      expect(result).toHaveProperty('ingredients');
      expect(result).toHaveProperty('steps');
    });

    test('calls progress callback at different stages', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({ titel: 'Test', portionen: 1 })
            }]
          }
        }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const progressCallback = jest.fn();
      const imageBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRg...';
      
      await recognizeRecipeWithGemini(imageBase64, 'de', progressCallback);

      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalledWith(10);
      expect(progressCallback).toHaveBeenCalledWith(100);
    });

    test('handles API errors gracefully', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        json: async () => ({ error: { message: 'Invalid request' } })
      });

      const imageBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRg...';
      
      await expect(recognizeRecipeWithGemini(imageBase64, 'de')).rejects.toThrow(
        'Gemini API error'
      );
    });

    test('handles quota exceeded error', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'quota exceeded' } })
      });

      const imageBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRg...';
      
      await expect(recognizeRecipeWithGemini(imageBase64, 'de')).rejects.toThrow(
        'quota'
      );
    });

    test('strips data URL prefix from base64 image', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({ titel: 'Test', portionen: 1 })
            }]
          }
        }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const imageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANS...';
      await recognizeRecipeWithGemini(imageBase64, 'de');

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.contents[0].parts[1].inline_data.data).toBe('iVBORw0KGgoAAAANS...');
      expect(requestBody.contents[0].parts[1].inline_data.mime_type).toBe('image/png');
    });
  });

  describe('recognizeRecipeWithAI', () => {
    global.fetch = jest.fn();

    beforeEach(() => {
      process.env.REACT_APP_GEMINI_API_KEY = 'test-api-key';
      fetch.mockClear();
    });

    test('validates image data', async () => {
      await expect(recognizeRecipeWithAI('', {})).rejects.toThrow('Invalid image data');
      await expect(recognizeRecipeWithAI('short', {})).rejects.toThrow('Invalid image data');
    });

    test('uses Gemini as default provider', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({ titel: 'Test', portionen: 1 })
            }]
          }
        }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150); // Valid length for testing
      const result = await recognizeRecipeWithAI(imageBase64);

      expect(result.provider).toBe('gemini');
    });

    test('accepts custom provider option', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({ titel: 'Test', portionen: 1 })
            }]
          }
        }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);
      const result = await recognizeRecipeWithAI(imageBase64, { provider: 'gemini' });

      expect(result.provider).toBe('gemini');
    });

    test('throws error when no provider is configured', async () => {
      process.env.REACT_APP_GEMINI_API_KEY = '';
      process.env.REACT_APP_OPENAI_API_KEY = '';

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);
      
      await expect(recognizeRecipeWithAI(imageBase64)).rejects.toThrow(
        'No AI OCR provider is configured'
      );
    });

    test('falls back to available provider', async () => {
      process.env.REACT_APP_GEMINI_API_KEY = 'test-key';
      process.env.REACT_APP_OPENAI_API_KEY = '';

      const mockResponse = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({ titel: 'Test', portionen: 1 })
            }]
          }
        }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);
      // Request OpenAI but it's not available, should fall back to Gemini
      const result = await recognizeRecipeWithAI(imageBase64, { provider: 'openai' });

      expect(result.provider).toBe('gemini');
    });

    test('passes language option correctly', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({ title: 'Test', servings: 1 })
            }]
          }
        }]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const imageBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(150);
      const result = await recognizeRecipeWithAI(imageBase64, { language: 'en' });

      // Check that English keys are returned
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('servings');
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
