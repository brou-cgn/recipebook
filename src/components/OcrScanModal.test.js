import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import OcrScanModal from './OcrScanModal';

// Mock the OCR service
jest.mock('../utils/ocrService', () => ({
  recognizeText: jest.fn(),
  processCroppedImage: jest.fn()
}));

// Mock the OCR parser
jest.mock('../utils/ocrParser', () => ({
  parseOcrText: jest.fn()
}));

// Mock the image utils
jest.mock('../utils/imageUtils', () => ({
  fileToBase64: jest.fn()
}));

describe('OcrScanModal', () => {
  const mockOnImport = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
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

  test('file upload triggers crop step', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    fileToBase64.mockResolvedValue('data:image/png;base64,test');

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Wählen Sie den Bereich aus/i)).toBeInTheDocument();
    });
  });

  test('language selection works', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    fileToBase64.mockResolvedValue('data:image/png;base64,test');

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('🇩🇪 Deutsch')).toBeInTheDocument();
      expect(screen.getByText('🇬🇧 English')).toBeInTheDocument();
    });

    const englishButton = screen.getByText('🇬🇧 English');
    fireEvent.click(englishButton);

    // Check that English tab is now active
    expect(englishButton).toHaveClass('active');
  });

  test('skip crop button proceeds to scanning', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeText } = require('../utils/ocrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    recognizeText.mockResolvedValue({
      text: 'Test Recipe\nZutaten\n200g Zutat',
      confidence: 90
    });

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Zuschneiden überspringen')).toBeInTheDocument();
    });

    const skipButton = screen.getByText('Zuschneiden überspringen');
    fireEvent.click(skipButton);

    await waitFor(() => {
      expect(screen.getByText(/Scanne Text/i)).toBeInTheDocument();
    });
  });

  test('import button parses OCR text and calls onImport', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeText } = require('../utils/ocrService');
    const { parseOcrText } = require('../utils/ocrParser');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    recognizeText.mockResolvedValue({
      text: 'Test Recipe\nZutaten\n200g Zutat',
      confidence: 90
    });
    
    const mockRecipe = {
      title: 'Test Recipe',
      ingredients: ['200g Zutat'],
      steps: []
    };
    parseOcrText.mockReturnValue(mockRecipe);

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      const skipButton = screen.getByText('Zuschneiden überspringen');
      fireEvent.click(skipButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Übernehmen')).toBeInTheDocument();
    }, { timeout: 3000 });

    const importButton = screen.getByText('Übernehmen');
    fireEvent.click(importButton);

    expect(parseOcrText).toHaveBeenCalledWith('Test Recipe\nZutaten\n200g Zutat', 'de');
    expect(mockOnImport).toHaveBeenCalledWith(mockRecipe);
  });

  test('displays error when OCR text is empty', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeText } = require('../utils/ocrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    recognizeText.mockResolvedValue({
      text: '',
      confidence: 90
    });

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      const skipButton = screen.getByText('Zuschneiden überspringen');
      fireEvent.click(skipButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Übernehmen')).toBeInTheDocument();
    }, { timeout: 3000 });

    const importButton = screen.getByText('Übernehmen');
    fireEvent.click(importButton);

    expect(screen.getByText(/Kein Text erkannt/i)).toBeInTheDocument();
    expect(mockOnImport).not.toHaveBeenCalled();
  });

  test('editable textarea allows text modification', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeText } = require('../utils/ocrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    recognizeText.mockResolvedValue({
      text: 'Original Text',
      confidence: 90
    });

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      const skipButton = screen.getByText('Zuschneiden überspringen');
      fireEvent.click(skipButton);
    });

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText('Erkannter Text...');
      expect(textarea).toHaveValue('Original Text');
      
      fireEvent.change(textarea, { target: { value: 'Modified Text' } });
      expect(textarea).toHaveValue('Modified Text');
    }, { timeout: 3000 });
  });
});
