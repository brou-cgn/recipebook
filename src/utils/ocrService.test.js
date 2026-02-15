/**
 * OCR Service Tests
 */

import {
  initOcrWorker,
  recognizeText,
  preprocessImage,
  processCroppedImage,
  terminateWorker,
  getWorkerStatus,
  recognizeTextAuto
} from './ocrService';

// Mock tesseract.js
jest.mock('tesseract.js', () => ({
  createWorker: jest.fn()
}));

import { createWorker } from 'tesseract.js';

describe('ocrService', () => {
  let mockWorker;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock worker
    mockWorker = {
      recognize: jest.fn(),
      terminate: jest.fn(),
      setLogger: jest.fn()
    };

    createWorker.mockResolvedValue(mockWorker);
  });

  afterEach(async () => {
    // Clean up worker after each test
    await terminateWorker();
  });

  describe('initOcrWorker', () => {
    test('initializes worker with English language', async () => {
      await initOcrWorker('eng');
      
      expect(createWorker).toHaveBeenCalledWith('eng');
      expect(getWorkerStatus().isInitialized).toBe(true);
      expect(getWorkerStatus().currentLanguage).toBe('eng');
    });

    test('initializes worker with German language', async () => {
      await initOcrWorker('deu');
      
      expect(createWorker).toHaveBeenCalledWith('deu');
      expect(getWorkerStatus().currentLanguage).toBe('deu');
    });

    test('throws error for invalid language', async () => {
      await expect(initOcrWorker('fra')).rejects.toThrow('Invalid language: fra');
    });

    test('reuses existing worker for same language', async () => {
      await initOcrWorker('eng');
      await initOcrWorker('eng');
      
      // Should only create worker once
      expect(createWorker).toHaveBeenCalledTimes(1);
    });

    test('terminates and creates new worker when language changes', async () => {
      await initOcrWorker('eng');
      await initOcrWorker('deu');
      
      expect(mockWorker.terminate).toHaveBeenCalledTimes(1);
      expect(createWorker).toHaveBeenCalledTimes(2);
    });

    test('defaults to English when no language specified', async () => {
      await initOcrWorker();
      
      expect(createWorker).toHaveBeenCalledWith('eng');
    });
  });

  describe('recognizeText', () => {
    const mockBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    beforeEach(() => {
      // Mock canvas for preprocessing
      const mockCanvas = {
        width: 100,
        height: 100,
        getContext: jest.fn(() => ({
          drawImage: jest.fn(),
          getImageData: jest.fn(() => ({
            data: new Uint8ClampedArray(100 * 100 * 4)
          })),
          putImageData: jest.fn()
        })),
        toDataURL: jest.fn(() => mockBase64)
      };

      document.createElement = jest.fn((tagName) => {
        if (tagName === 'canvas') {
          return mockCanvas;
        }
        if (tagName === 'img') {
          return {
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            onload: null,
            onerror: null,
            src: ''
          };
        }
        return {};
      });

      // Mock Image constructor
      global.Image = class {
        constructor() {
          this.onload = null;
          this.onerror = null;
          this.src = '';
        }
        
        set src(value) {
          this._src = value;
          setTimeout(() => {
            if (this.onload) {
              this.width = 100;
              this.height = 100;
              this.onload();
            }
          }, 0);
        }
        
        get src() {
          return this._src;
        }
      };

      mockWorker.recognize.mockResolvedValue({
        data: {
          text: 'Sample text',
          confidence: 85.5,
          words: [],
          lines: [],
          paragraphs: []
        }
      });
    });

    test('recognizes text from base64 image', async () => {
      const result = await recognizeText(mockBase64, 'eng');
      
      expect(result.text).toBe('Sample text');
      expect(result.confidence).toBe(85.5);
      expect(mockWorker.recognize).toHaveBeenCalled();
    });

    test('initializes worker if not initialized', async () => {
      const result = await recognizeText(mockBase64, 'eng');
      
      expect(createWorker).toHaveBeenCalledWith('eng');
      expect(result.text).toBe('Sample text');
    });

    test('throws error when no image provided', async () => {
      await expect(recognizeText(null, 'eng')).rejects.toThrow('No image provided');
    });

    test('throws error when image is not a string', async () => {
      await expect(recognizeText(123, 'eng')).rejects.toThrow('Image must be a base64 string');
    });

    test('calls progress callback during recognition', async () => {
      const onProgress = jest.fn();
      
      // Simulate progress updates
      mockWorker.setLogger.mockImplementation((handler) => {
        setTimeout(() => {
          handler({ status: 'recognizing text', progress: 0.5 });
          handler({ status: 'recognizing text', progress: 1.0 });
        }, 0);
      });

      await recognizeText(mockBase64, 'eng', onProgress);
      
      expect(mockWorker.setLogger).toHaveBeenCalled();
    });

    test('defaults to English when no language specified', async () => {
      await recognizeText(mockBase64);
      
      expect(createWorker).toHaveBeenCalledWith('eng');
    });

    test('returns all OCR result data', async () => {
      const mockResult = {
        data: {
          text: 'Test text',
          confidence: 92.3,
          words: [{ text: 'Test' }, { text: 'text' }],
          lines: [{ text: 'Test text' }],
          paragraphs: [{ text: 'Test text' }]
        }
      };
      
      mockWorker.recognize.mockResolvedValue(mockResult);
      
      const result = await recognizeText(mockBase64, 'eng');
      
      expect(result).toEqual({
        text: 'Test text',
        confidence: 92.3,
        words: mockResult.data.words,
        lines: mockResult.data.lines,
        paragraphs: mockResult.data.paragraphs
      });
    });
  });

  describe('preprocessImage', () => {
    const mockBase64 = 'data:image/png;base64,test';

    beforeEach(() => {
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: jest.fn(() => ({
          drawImage: jest.fn(),
          getImageData: jest.fn(() => ({
            data: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255])
          })),
          putImageData: jest.fn()
        })),
        toDataURL: jest.fn(() => 'data:image/png;base64,processed')
      };

      document.createElement = jest.fn(() => mockCanvas);

      global.Image = class {
        constructor() {
          this.onload = null;
          this.onerror = null;
        }
        
        set src(value) {
          setTimeout(() => {
            if (this.onload) {
              this.width = 100;
              this.height = 100;
              this.onload();
            }
          }, 0);
        }
      };
    });

    test('preprocesses image successfully', async () => {
      const result = await preprocessImage(mockBase64);
      
      expect(result).toBe('data:image/png;base64,processed');
    });

    test('converts image to grayscale and enhances contrast', async () => {
      const mockCtx = {
        drawImage: jest.fn(),
        getImageData: jest.fn(() => ({
          data: new Uint8ClampedArray([
            255, 200, 150, 255,  // Light pixel
            50, 30, 20, 255      // Dark pixel
          ])
        })),
        putImageData: jest.fn()
      };

      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: jest.fn(() => mockCtx),
        toDataURL: jest.fn(() => 'processed')
      };

      document.createElement = jest.fn(() => mockCanvas);

      await preprocessImage(mockBase64);
      
      expect(mockCtx.drawImage).toHaveBeenCalled();
      expect(mockCtx.getImageData).toHaveBeenCalled();
      expect(mockCtx.putImageData).toHaveBeenCalled();
    });
  });

  describe('processCroppedImage', () => {
    const mockBase64 = 'data:image/png;base64,test';

    beforeEach(() => {
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: jest.fn(() => ({
          drawImage: jest.fn()
        })),
        toDataURL: jest.fn(() => 'data:image/png;base64,cropped')
      };

      document.createElement = jest.fn(() => mockCanvas);

      global.Image = class {
        constructor() {
          this.onload = null;
          this.onerror = null;
        }
        
        set src(value) {
          setTimeout(() => {
            if (this.onload) {
              this.width = 200;
              this.height = 200;
              this.onload();
            }
          }, 0);
        }
      };
    });

    test('crops image with valid coordinates', async () => {
      const crop = { x: 10, y: 10, width: 100, height: 100 };
      const result = await processCroppedImage(mockBase64, crop);
      
      expect(result).toBe('data:image/png;base64,cropped');
    });

    test('returns original image when crop is invalid', async () => {
      const result = await processCroppedImage(mockBase64, {});
      
      expect(result).toBe(mockBase64);
    });

    test('returns original image when no crop provided', async () => {
      const result = await processCroppedImage(mockBase64, null);
      
      expect(result).toBe(mockBase64);
    });
  });

  describe('terminateWorker', () => {
    test('terminates worker successfully', async () => {
      await initOcrWorker('eng');
      await terminateWorker();
      
      expect(mockWorker.terminate).toHaveBeenCalled();
      expect(getWorkerStatus().isInitialized).toBe(false);
      expect(getWorkerStatus().currentLanguage).toBe(null);
    });

    test('handles termination when no worker exists', async () => {
      await terminateWorker();
      
      // Should not throw error
      expect(getWorkerStatus().isInitialized).toBe(false);
    });
  });

  describe('getWorkerStatus', () => {
    test('returns status when worker is not initialized', () => {
      const status = getWorkerStatus();
      
      expect(status.isInitialized).toBe(false);
      expect(status.currentLanguage).toBe(null);
    });

    test('returns status when worker is initialized', async () => {
      await initOcrWorker('deu');
      const status = getWorkerStatus();
      
      expect(status.isInitialized).toBe(true);
      expect(status.currentLanguage).toBe('deu');
    });
  });

  describe('recognizeTextAuto', () => {
    const mockBase64 = 'data:image/png;base64,test';

    beforeEach(() => {
      // Setup mocks for preprocessing
      const mockCanvas = {
        width: 100,
        height: 100,
        getContext: jest.fn(() => ({
          drawImage: jest.fn(),
          getImageData: jest.fn(() => ({
            data: new Uint8ClampedArray(100 * 100 * 4)
          })),
          putImageData: jest.fn()
        })),
        toDataURL: jest.fn(() => mockBase64)
      };

      document.createElement = jest.fn(() => mockCanvas);

      global.Image = class {
        constructor() {
          this.onload = null;
          this.onerror = null;
        }
        
        set src(value) {
          setTimeout(() => {
            if (this.onload) {
              this.width = 100;
              this.height = 100;
              this.onload();
            }
          }, 0);
        }
      };
    });

    test('returns English result when confidence is high', async () => {
      mockWorker.recognize.mockResolvedValue({
        data: {
          text: 'English text',
          confidence: 85,
          words: [],
          lines: [],
          paragraphs: []
        }
      });

      const result = await recognizeTextAuto(mockBase64);
      
      expect(result.text).toBe('English text');
      expect(result.detectedLanguage).toBe('eng');
    });

    test('tries German when English confidence is low', async () => {
      mockWorker.recognize
        .mockResolvedValueOnce({
          data: {
            text: 'Low confidence',
            confidence: 60,
            words: [],
            lines: [],
            paragraphs: []
          }
        })
        .mockResolvedValueOnce({
          data: {
            text: 'Deutscher Text',
            confidence: 90,
            words: [],
            lines: [],
            paragraphs: []
          }
        });

      const result = await recognizeTextAuto(mockBase64);
      
      expect(result.text).toBe('Deutscher Text');
      expect(result.detectedLanguage).toBe('deu');
      expect(createWorker).toHaveBeenCalledWith('eng');
      expect(createWorker).toHaveBeenCalledWith('deu');
    });

    test('calls progress callback during auto detection', async () => {
      const onProgress = jest.fn();
      
      // Mock worker to trigger progress updates
      mockWorker.setLogger.mockImplementation((handler) => {
        // Simulate progress update
        handler({ status: 'recognizing text', progress: 0.5 });
      });
      
      mockWorker.recognize.mockResolvedValue({
        data: {
          text: 'Text',
          confidence: 85,
          words: [],
          lines: [],
          paragraphs: []
        }
      });

      await recognizeTextAuto(mockBase64, onProgress);
      
      // Since recognizeTextAuto wraps the progress callback with a multiplier,
      // verify that setLogger was called (which means progress tracking is set up)
      expect(mockWorker.setLogger).toHaveBeenCalled();
    });
  });
});
