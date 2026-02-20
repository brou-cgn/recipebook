import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import OcrScanModal from './OcrScanModal';

// Test configuration constants
const OCR_TIMEOUT = 3000;

// Mock the OCR service
jest.mock('../utils/ocrService', () => ({
  recognizeText: jest.fn()
}));

// Mock the OCR parser
jest.mock('../utils/ocrParser', () => ({
  parseOcrText: jest.fn(),
  parseOcrTextSmart: jest.fn()
}));

// Mock the OCR validation
jest.mock('../utils/ocrValidation', () => ({
  validateOcrResult: jest.fn(),
  getValidationSummary: jest.fn()
}));

// Mock the image utils
jest.mock('../utils/imageUtils', () => ({
  fileToBase64: jest.fn()
}));

// Mock the AI OCR service
jest.mock('../utils/aiOcrService', () => ({
  recognizeRecipeWithAI: jest.fn(),
  isAiOcrAvailable: jest.fn().mockReturnValue(true) // Default to true
}));

describe('OcrScanModal', () => {
  const mockOnImport = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-set default return value after clearAllMocks removes it
    const { isAiOcrAvailable } = require('../utils/aiOcrService');
    isAiOcrAvailable.mockReturnValue(true);
  });

  test('renders modal with initial upload step', () => {
    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    expect(screen.getByText('Rezept scannen')).toBeInTheDocument();
    expect(screen.getByText(/Fotografieren Sie ein Rezept/i)).toBeInTheDocument();
    expect(screen.getByText('📷 Kamera starten')).toBeInTheDocument();
    expect(screen.getByText('📁 Bild hochladen')).toBeInTheDocument();
  });

  test('cancel button calls onCancel', () => {
    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const cancelButton = screen.getByText('Abbrechen');
    fireEvent.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  test('close button calls onCancel', () => {
    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const closeButton = screen.getByText('✕');
    fireEvent.click(closeButton);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  test('file upload triggers scanning directly', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeRecipeWithAI } = require('../utils/aiOcrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    recognizeRecipeWithAI.mockResolvedValue({
      title: 'Test Recipe',
      ingredients: ['200g Zutat'],
      steps: ['Mix'],
      servings: 4,
    });

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    // OCR should start automatically after upload and show results
    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument();
    }, { timeout: OCR_TIMEOUT });
  });

  test('language selection works on upload step', async () => {
    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    // Language selector should be visible on upload step
    expect(screen.getByText('🇩🇪 Deutsch')).toBeInTheDocument();
    expect(screen.getByText('🇬🇧 English')).toBeInTheDocument();

    const englishButton = screen.getByText('🇬🇧 English');
    fireEvent.click(englishButton);

    // Check that English tab is now active
    expect(englishButton).toHaveClass('active');
  });

  test('import button parses OCR text and calls onImport', async () => {
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

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Übernehmen')).toBeInTheDocument();
    }, { timeout: OCR_TIMEOUT });

    const importButton = screen.getByText('Übernehmen');
    fireEvent.click(importButton);

    // Verify AI import was called
    expect(mockOnImport).toHaveBeenCalledWith({
      title: 'Test Recipe',
      ingredients: ['200g Zutat'],
      steps: ['Mix'],
      portionen: 4,
      kochdauer: 30,
      kulinarik: [],
      schwierigkeit: 3,
      speisekategorie: ''
    });
  });

  test('displays error when AI OCR returns empty results', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeRecipeWithAI } = require('../utils/aiOcrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    recognizeRecipeWithAI.mockResolvedValue({
      title: '',
      ingredients: [],
      steps: []
    });

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Übernehmen')).toBeInTheDocument();
    }, { timeout: OCR_TIMEOUT });

    const importButton = screen.getByText('Übernehmen');
    fireEvent.click(importButton);

    // AI results are imported as-is, even if empty (with defaults)
    expect(mockOnImport).toHaveBeenCalledWith({
      title: '',
      ingredients: [],
      steps: [],
      portionen: 4,
      kochdauer: 30,
      kulinarik: [],
      schwierigkeit: 3,
      speisekategorie: ''
    });
  });

  test('editable textarea allows text modification', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeRecipeWithAI } = require('../utils/aiOcrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    recognizeRecipeWithAI.mockResolvedValue({
      title: 'Original Text',
      ingredients: ['Ingredient'],
      steps: ['Step'],
      servings: 4
    });

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Original Text')).toBeInTheDocument();
    }, { timeout: OCR_TIMEOUT });

    // Convert to text editing mode
    const editButton = screen.getByText(/Als Text bearbeiten/i);
    fireEvent.click(editButton);

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText('Erkannter Text...');
      expect(textarea).toBeInTheDocument();
      
      fireEvent.change(textarea, { target: { value: 'Modified Text' } });
      expect(textarea).toHaveValue('Modified Text');
    }, { timeout: OCR_TIMEOUT });
  });

  test('handles file upload error', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    
    fileToBase64.mockRejectedValue(new Error('Failed to read file'));

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Failed to read file/i)).toBeInTheDocument();
    });
  });

  test('handles OCR processing error', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeRecipeWithAI } = require('../utils/aiOcrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    recognizeRecipeWithAI.mockRejectedValue(new Error('OCR processing failed'));

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/OCR fehlgeschlagen/i)).toBeInTheDocument();
    }, { timeout: OCR_TIMEOUT });
  });

  test('handles AI result with valid data', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeRecipeWithAI } = require('../utils/aiOcrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    recognizeRecipeWithAI.mockResolvedValue({
      title: 'Test',
      ingredients: ['Ingredient'],
      steps: ['Step']
    });

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Übernehmen')).toBeInTheDocument();
    }, { timeout: OCR_TIMEOUT });

    const importButton = screen.getByText('Übernehmen');
    fireEvent.click(importButton);

    expect(mockOnImport).toHaveBeenCalledWith({
      title: 'Test',
      ingredients: ['Ingredient'],
      steps: ['Step'],
      portionen: 4,
      kochdauer: 30,
      kulinarik: [],
      schwierigkeit: 3,
      speisekategorie: ''
    });
  });

  test('new scan button is available after OCR completes', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeRecipeWithAI } = require('../utils/aiOcrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    recognizeRecipeWithAI.mockResolvedValue({
      title: 'Test Recipe',
      ingredients: ['Ingredient'],
      steps: ['Step']
    });

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Wait for OCR to complete and results to show
    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument();
    }, { timeout: OCR_TIMEOUT });

    // Convert to text editing mode to see "Neuer Scan" button
    const editButton = screen.getByText(/Als Text bearbeiten/i);
    fireEvent.click(editButton);

    // Verify that "Neuer Scan" button exists and is available
    await waitFor(() => {
      const newScanButton = screen.getByText(/Neuer Scan/i);
      expect(newScanButton).toBeInTheDocument();
    });
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

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(recognizeRecipeWithAI).toHaveBeenCalled();
    }, { timeout: OCR_TIMEOUT });

    // Verify that recognizeRecipeWithAI was called with a progress callback function
    const aiCall = recognizeRecipeWithAI.mock.calls[0];
    expect(aiCall).toHaveLength(2);
    expect(aiCall[1]).toHaveProperty('onProgress');
    expect(aiCall[1].onProgress).toBeInstanceOf(Function);
  });

  test('modal starts scanning immediately when initialImage is provided', async () => {
    const { recognizeRecipeWithAI } = require('../utils/aiOcrService');
    const initialImageData = 'data:image/png;base64,test';
    
    recognizeRecipeWithAI.mockResolvedValue({
      title: 'Initial Image Recipe',
      ingredients: ['Test'],
      steps: ['Test Step']
    });

    render(
      <OcrScanModal
        onImport={mockOnImport}
        onCancel={mockOnCancel}
        initialImage={initialImageData}
      />
    );

    // Should skip upload step and start scanning immediately
    expect(screen.queryByText('📁 Bild hochladen')).not.toBeInTheDocument();
    
    // Wait for OCR to be called with the initial image
    await waitFor(() => {
      expect(recognizeRecipeWithAI).toHaveBeenCalledWith(
        initialImageData,
        expect.objectContaining({
          language: 'de',
          provider: 'gemini'
        })
      );
    }, { timeout: OCR_TIMEOUT });
  });

  test('displays error when AI OCR fails', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeRecipeWithAI } = require('../utils/aiOcrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    recognizeRecipeWithAI.mockRejectedValue(new Error('API key not configured'));

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Should show error when AI OCR fails
    await waitFor(() => {
      expect(screen.getByText(/OCR fehlgeschlagen.*API key not configured/i)).toBeInTheDocument();
    }, { timeout: OCR_TIMEOUT });
  });

  test('AI mode is default - no mode selector shown', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { isAiOcrAvailable } = require('../utils/aiOcrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    isAiOcrAvailable.mockReturnValue(true);

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      // OCR mode selector should not be visible
      expect(screen.queryByText('📝 Standard-OCR')).not.toBeInTheDocument();
      expect(screen.queryByText('🤖 KI-Scan (Gemini)')).not.toBeInTheDocument();
    });
  });

  test('AI mode is used by default', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { isAiOcrAvailable } = require('../utils/aiOcrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    isAiOcrAvailable.mockReturnValue(false);

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      // No hint should be shown since the mode selector is hidden
      expect(screen.queryByText(/KI-Scan benötigt einen Gemini API-Key/i)).not.toBeInTheDocument();
    });
  });

  test('AI OCR mode processes image with Gemini by default', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { isAiOcrAvailable, recognizeRecipeWithAI } = require('../utils/aiOcrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    isAiOcrAvailable.mockReturnValue(true);
    
    const mockAiResult = {
      title: 'AI-erkanntes Rezept',
      servings: 4,
      prepTime: '30 min',
      difficulty: 3,
      cuisine: 'Italienisch',
      category: 'Hauptgericht',
      ingredients: ['200g Pasta', '100g Tomaten'],
      steps: ['Pasta kochen', 'Mit Tomaten servieren'],
      tags: ['vegetarisch']
    };
    recognizeRecipeWithAI.mockResolvedValue(mockAiResult);

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    // Upload file
    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Should display AI result immediately (no intermediate scanning state)
    await waitFor(() => {
      expect(screen.getByText('AI-erkanntes Rezept')).toBeInTheDocument();
      expect(screen.getByText(/200g Pasta/i)).toBeInTheDocument();
      expect(screen.getByText(/Pasta kochen/i)).toBeInTheDocument();
    }, { timeout: OCR_TIMEOUT });
  });

  test('AI result can be imported directly', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { isAiOcrAvailable, recognizeRecipeWithAI } = require('../utils/aiOcrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    isAiOcrAvailable.mockReturnValue(true);
    
    const mockAiResult = {
      title: 'Testrezept',
      servings: 2,
      prepTime: '20 min',
      difficulty: 2,
      cuisine: 'Deutsch',
      category: 'Dessert',
      ingredients: ['100g Zucker'],
      steps: ['Zucker schmelzen']
    };
    recognizeRecipeWithAI.mockResolvedValue(mockAiResult);

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Testrezept')).toBeInTheDocument();
    }, { timeout: OCR_TIMEOUT });

    const importButton = screen.getByText('Übernehmen');
    fireEvent.click(importButton);

    expect(mockOnImport).toHaveBeenCalledWith({
      title: 'Testrezept',
      ingredients: ['100g Zucker'],
      steps: ['Zucker schmelzen'],
      portionen: 2,
      kochdauer: 20,
      kulinarik: ['Deutsch'],
      schwierigkeit: 2,
      speisekategorie: 'Dessert'
    });
  });

  test('AI result can be converted to text for editing', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { isAiOcrAvailable, recognizeRecipeWithAI } = require('../utils/aiOcrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    isAiOcrAvailable.mockReturnValue(true);
    
    const mockAiResult = {
      title: 'Kuchen',
      servings: 8,
      prepTime: '45 min',
      difficulty: 3,
      cuisine: 'International',
      category: 'Dessert',
      ingredients: ['200g Mehl', '100g Zucker'],
      steps: ['Teig mischen', 'Backen']
    };
    recognizeRecipeWithAI.mockResolvedValue(mockAiResult);

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Kuchen')).toBeInTheDocument();
    }, { timeout: OCR_TIMEOUT });

    const editButton = screen.getByText(/Als Text bearbeiten/i);
    fireEvent.click(editButton);

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText('Erkannter Text...');
      expect(textarea).toBeInTheDocument();
      expect(textarea.value).toContain('Kuchen');
      expect(textarea.value).toContain('200g Mehl');
      expect(textarea.value).toContain('Teig mischen');
    });
  });

  test('handles AI OCR error gracefully', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { isAiOcrAvailable, recognizeRecipeWithAI } = require('../utils/aiOcrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    isAiOcrAvailable.mockReturnValue(true);
    recognizeRecipeWithAI.mockRejectedValue(new Error('API quota exceeded'));

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/OCR fehlgeschlagen.*API quota exceeded/i)).toBeInTheDocument();
    }, { timeout: OCR_TIMEOUT });
  });

  test('shows fallback to standard OCR button when AI OCR fails', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeRecipeWithAI } = require('../utils/aiOcrService');

    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    recognizeRecipeWithAI.mockRejectedValue(new Error('Tageslimit erreicht (20/20 Scans)'));

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Mit Standard-OCR fortfahren/i)).toBeInTheDocument();
    }, { timeout: OCR_TIMEOUT });
  });

  test('displays remaining scans info when AI scan succeeds', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeRecipeWithAI } = require('../utils/aiOcrService');

    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    recognizeRecipeWithAI.mockResolvedValue({
      title: 'Test Recipe',
      ingredients: ['Zutat'],
      steps: ['Schritt'],
      servings: 2,
      remainingScans: 3,
      dailyLimit: 20,
    });

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument();
    }, { timeout: OCR_TIMEOUT });

    // Reset to upload step to see quota info
    const editButton = screen.getByText(/Als Text bearbeiten/i);
    fireEvent.click(editButton);

    const newScanButton = screen.getByText(/Neuer Scan/i);
    fireEvent.click(newScanButton);

    await waitFor(() => {
      expect(screen.getByText(/3 KI-Scans/i)).toBeInTheDocument();
    }, { timeout: OCR_TIMEOUT });
  });
});
