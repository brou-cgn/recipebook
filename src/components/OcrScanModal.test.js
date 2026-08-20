import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import OcrScanModal from './OcrScanModal';

// Test configuration constants
const OCR_TIMEOUT = 3000;

// Mock the image utils
jest.mock('../utils/imageUtils', () => ({
  fileToBase64: jest.fn()
}));

// Mock the AI OCR service
jest.mock('../utils/aiOcrService', () => ({
  recognizeRecipeWithAI: jest.fn()
}));

// Mock ocrParser's buildRecipeFromAiResult with the real implementation so
// the recipe shape returned from a queued job matches production behavior.
jest.mock('../utils/ocrParser', () => ({
  buildRecipeFromAiResult: jest.requireActual('../utils/ocrParser').buildRecipeFromAiResult,
}));

// Mock the background import queue: enqueueImportJob is captured so tests
// can manually invoke the queued `run` function and inspect the recipe it
// resolves to, mirroring what the real RecipeImportQueueProvider would do.
const mockEnqueueImportJob = jest.fn();
jest.mock('../contexts/RecipeImportQueueContext', () => ({
  useRecipeImportQueue: () => ({ enqueueImportJob: mockEnqueueImportJob }),
}));

describe('OcrScanModal', () => {
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Runs the `run` function captured by the most recent enqueueImportJob
  // call, with a no-op progress callback — equivalent to what the queue
  // does when it actually processes the job.
  const runQueuedJob = async () => {
    expect(mockEnqueueImportJob).toHaveBeenCalled();
    const job = mockEnqueueImportJob.mock.calls[mockEnqueueImportJob.mock.calls.length - 1][0];
    return job.run(jest.fn());
  };

  test('renders modal with initial upload step', () => {
    render(<OcrScanModal onCancel={mockOnCancel} />);

    expect(screen.getByText('Rezept scannen')).toBeInTheDocument();
    expect(screen.getByText(/Fotografieren Sie ein Rezept/i)).toBeInTheDocument();
    expect(screen.getByText('Kamera starten')).toBeInTheDocument();
    expect(screen.getByText('Bild(er) hochladen')).toBeInTheDocument();
  });

  test('cancel button calls onCancel', () => {
    render(<OcrScanModal onCancel={mockOnCancel} />);

    const cancelButton = screen.getByText('Abbrechen');
    fireEvent.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  test('close button calls onCancel', () => {
    render(<OcrScanModal onCancel={mockOnCancel} />);

    const closeButton = screen.getByText('×');
    fireEvent.click(closeButton);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  test('file upload shows preview step before queuing analysis', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    fileToBase64.mockResolvedValue('data:image/png;base64,test');

    render(<OcrScanModal onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('Bild(er) hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    // Preview step should appear first
    await waitFor(() => {
      expect(screen.getByText(/Analyse starten \(1\)/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Analyse starten \(1\)/i));

    // Queues a background job and closes the modal immediately, without a review step
    expect(mockEnqueueImportJob).toHaveBeenCalled();
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  test('queued job resolves to the recognized recipe', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeRecipeWithAI } = require('../utils/aiOcrService');

    fileToBase64.mockResolvedValue('data:image/png;base64,test');

    const mockAiResult = {
      title: 'Test Recipe',
      ingredients: ['200g Zutat'],
      steps: ['Mix'],
      servings: 4,
      prepTime: '30 min'
    };

    recognizeRecipeWithAI.mockResolvedValue(mockAiResult);

    render(<OcrScanModal onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('Bild(er) hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Analyse starten \(1\)/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Analyse starten \(1\)/i));

    const recipe = await runQueuedJob();

    expect(recipe).toEqual({
      title: 'Test Recipe',
      ingredients: ['200g Zutat'],
      steps: ['Mix'],
      portionen: 4,
      kochdauer: 30,
      kulinarik: [],
      schwierigkeit: 3,
      speisekategorie: ''
    });
  }, OCR_TIMEOUT);

  test('handles file upload error', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');

    fileToBase64.mockRejectedValue(new Error('Failed to read file'));

    render(<OcrScanModal onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('Bild(er) hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Failed to read file/i)).toBeInTheDocument();
    });
  });

  test('queued job surfaces the OCR error instead of resolving', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeRecipeWithAI } = require('../utils/aiOcrService');

    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    recognizeRecipeWithAI.mockRejectedValue(new Error('OCR processing failed'));

    render(<OcrScanModal onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('Bild(er) hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Analyse starten \(1\)/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Analyse starten \(1\)/i));

    // A single-image scan now calls recognizeRecipeWithAI directly (see
    // runPhotoScanImport) instead of always going through a merge step, so
    // its rejection surfaces as-is rather than being flattened into the
    // generic "no valid OCR results" message multi-image merges produce.
    await expect(runQueuedJob()).rejects.toThrow('OCR processing failed');
  }, OCR_TIMEOUT);

  test('modal queues an immediate scan and closes when initialImage is provided', async () => {
    const { recognizeRecipeWithAI } = require('../utils/aiOcrService');
    const initialImageData = 'data:image/png;base64,test';

    recognizeRecipeWithAI.mockResolvedValue({
      title: 'Initial Image Recipe',
      ingredients: ['Test'],
      steps: ['Test Step']
    });

    render(
      <OcrScanModal
        onCancel={mockOnCancel}
        initialImage={initialImageData}
      />
    );

    // Should skip upload step and queue immediately
    expect(screen.queryByText('Bild(er) hochladen')).not.toBeInTheDocument();
    expect(mockEnqueueImportJob).toHaveBeenCalled();
    expect(mockOnCancel).toHaveBeenCalledTimes(1);

    await runQueuedJob();
    expect(recognizeRecipeWithAI).toHaveBeenCalledWith(
      initialImageData,
      expect.objectContaining({ language: 'de', provider: 'gemini' })
    );
  });

  test('progress callback is passed to recognizeRecipeWithAI', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeRecipeWithAI } = require('../utils/aiOcrService');

    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    recognizeRecipeWithAI.mockResolvedValue({
      title: 'Test Recipe',
      ingredients: ['Ingredient'],
      steps: ['Step']
    });

    render(<OcrScanModal onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('Bild(er) hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Analyse starten \(1\)/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Analyse starten \(1\)/i));

    await runQueuedJob();

    expect(recognizeRecipeWithAI).toHaveBeenCalled();
    const aiCall = recognizeRecipeWithAI.mock.calls[0];
    expect(aiCall).toHaveLength(2);
    expect(aiCall[1]).toHaveProperty('onProgress');
    // A single-image scan now forwards the queue's progress callback to
    // recognizeRecipeWithAI directly (see runPhotoScanImport) instead of
    // wrapping it in a local closure, so `onProgress` here is the same
    // jest.fn() passed to job.run() — `typeof` avoids the jsdom/jest-mock
    // realm mismatch that `toBeInstanceOf(Function)` hits on that value.
    expect(typeof aiCall[1].onProgress).toBe('function');
  });

  test('queued job adds vegetarisch and vegan tags to kulinarik', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeRecipeWithAI } = require('../utils/aiOcrService');

    fileToBase64.mockResolvedValue('data:image/png;base64,test');

    recognizeRecipeWithAI.mockResolvedValue({
      title: 'Veganer Salat',
      servings: 2,
      prepTime: '10 min',
      difficulty: 1,
      cuisine: 'Mediterran',
      category: 'Salat',
      ingredients: ['Tomaten', 'Gurken'],
      steps: ['Gemüse hacken'],
      tags: ['vegan', 'vegetarisch']
    });

    render(<OcrScanModal onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('Bild(er) hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Analyse starten \(1\)/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Analyse starten \(1\)/i));

    const recipe = await runQueuedJob();
    expect(recipe.kulinarik).toEqual(expect.arrayContaining(['Mediterran', 'Vegan', 'Vegetarisch']));
  });

  test('queued job does not duplicate kulinarik when tag matches cuisine', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeRecipeWithAI } = require('../utils/aiOcrService');

    fileToBase64.mockResolvedValue('data:image/png;base64,test');

    recognizeRecipeWithAI.mockResolvedValue({
      title: 'Veggie Burger',
      servings: 4,
      prepTime: '30 min',
      difficulty: 2,
      cuisine: 'Vegetarisch',
      category: 'Hauptgericht',
      ingredients: ['Gemüse', 'Brötchen'],
      steps: ['Gemüse braten'],
      tags: ['vegetarisch']
    });

    render(<OcrScanModal onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('Bild(er) hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Analyse starten \(1\)/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Analyse starten \(1\)/i));

    const recipe = await runQueuedJob();
    expect(recipe.kulinarik.filter(k => k === 'Vegetarisch')).toHaveLength(1);
  });

  // Camera multi-photo tests
  describe('Camera multi-photo capture', () => {
    let mockGetUserMedia;

    beforeEach(() => {
      // Mock MediaStream and getUserMedia
      const mockTrack = { stop: jest.fn() };
      const mockStream = { getTracks: jest.fn().mockReturnValue([mockTrack]) };
      mockGetUserMedia = jest.fn().mockResolvedValue(mockStream);
      Object.defineProperty(global.navigator, 'mediaDevices', {
        value: { getUserMedia: mockGetUserMedia },
        writable: true,
        configurable: true,
      });

      // Mock canvas toDataURL
      HTMLCanvasElement.prototype.toDataURL = jest.fn().mockReturnValue('data:image/png;base64,photo1');
      HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue({
        drawImage: jest.fn(),
      });
    });

    test('camera start button activates camera', async () => {
      render(<OcrScanModal onCancel={mockOnCancel} />);

      const cameraButton = screen.getByText('Kamera starten');
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(mockGetUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'environment' } });
      });
    });

    test('capturing a photo keeps camera active and shows thumbnail', async () => {
      render(<OcrScanModal onCancel={mockOnCancel} />);

      const cameraButton = screen.getByText('Kamera starten');
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(screen.getByText('Foto aufnehmen')).toBeInTheDocument();
      });

      const captureButton = screen.getByText('Foto aufnehmen');
      fireEvent.click(captureButton);

      await waitFor(() => {
        expect(screen.getByText(/1 Foto aufgenommen/i)).toBeInTheDocument();
        expect(screen.getByAltText('Foto 1')).toBeInTheDocument();
      });

      // Camera should still be active (capture button text changes)
      expect(screen.getByText(/Weiteres Foto aufnehmen/i)).toBeInTheDocument();
    });

    test('capturing multiple photos shows correct count and thumbnails', async () => {
      render(<OcrScanModal onCancel={mockOnCancel} />);

      const cameraButton = screen.getByText('Kamera starten');
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(screen.getByText('Foto aufnehmen')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Foto aufnehmen'));

      await waitFor(() => {
        expect(screen.getByText(/1 Foto aufgenommen/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Weiteres Foto aufnehmen/i));

      await waitFor(() => {
        expect(screen.getByText(/2 Fotos aufgenommen/i)).toBeInTheDocument();
        expect(screen.getByAltText('Foto 1')).toBeInTheDocument();
        expect(screen.getByAltText('Foto 2')).toBeInTheDocument();
      });
    });

    test('analyse starten button appears after first photo', async () => {
      render(<OcrScanModal onCancel={mockOnCancel} />);

      const cameraButton = screen.getByText('Kamera starten');
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(screen.getByText('Foto aufnehmen')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Analyse starten/i)).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('Foto aufnehmen'));

      await waitFor(() => {
        expect(screen.getByText(/Analyse starten \(1\)/i)).toBeInTheDocument();
      });
    });

    test('letztes löschen button removes last photo', async () => {
      render(<OcrScanModal onCancel={mockOnCancel} />);

      const cameraButton = screen.getByText('Kamera starten');
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(screen.getByText('Foto aufnehmen')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Foto aufnehmen'));
      await waitFor(() => {
        expect(screen.getByText(/1 Foto aufgenommen/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Weiteres Foto aufnehmen/i));
      await waitFor(() => {
        expect(screen.getByText(/2 Fotos aufgenommen/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Löschen'));

      await waitFor(() => {
        expect(screen.getByText(/1 Foto aufgenommen/i)).toBeInTheDocument();
        expect(screen.queryByAltText('Foto 2')).not.toBeInTheDocument();
      });
    });

    test('abbrechen button stops camera and discards photos', async () => {
      render(<OcrScanModal onCancel={mockOnCancel} />);

      const cameraButton = screen.getByText('Kamera starten');
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(screen.getByText('Foto aufnehmen')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Foto aufnehmen'));
      await waitFor(() => {
        expect(screen.getByText(/1 Foto aufgenommen/i)).toBeInTheDocument();
      });

      const abortButton = screen.getByText('× Abbrechen');
      fireEvent.click(abortButton);

      await waitFor(() => {
        expect(screen.getByText('Kamera starten')).toBeInTheDocument();
        expect(screen.queryByText(/aufgenommen/i)).not.toBeInTheDocument();
      });
    });

    test('startBatchAnalysis queues captured photos and closes the modal', async () => {
      const { recognizeRecipeWithAI } = require('../utils/aiOcrService');
      recognizeRecipeWithAI.mockResolvedValue({
        title: 'Kamera Rezept',
        ingredients: ['Mehl', 'Eier'],
        steps: ['Mischen', 'Backen'],
        servings: 4,
      });

      render(<OcrScanModal onCancel={mockOnCancel} />);

      const cameraButton = screen.getByText('Kamera starten');
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(screen.getByText('Foto aufnehmen')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Foto aufnehmen'));
      await waitFor(() => {
        expect(screen.getByText(/Analyse starten \(1\)/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Analyse starten \(1\)/i));

      // Queues the background job and closes the modal, without a review step
      expect(mockEnqueueImportJob).toHaveBeenCalled();
      expect(mockOnCancel).toHaveBeenCalledTimes(1);

      const recipe = await runQueuedJob();
      expect(recipe).toEqual(expect.objectContaining({ title: 'Kamera Rezept' }));
    }, OCR_TIMEOUT);
  });
});
