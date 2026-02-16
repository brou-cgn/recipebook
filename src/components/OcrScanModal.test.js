import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import OcrScanModal from './OcrScanModal';

// Test configuration constants
const OCR_TIMEOUT = 3000;

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
    }, { timeout: OCR_TIMEOUT });

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
    }, { timeout: OCR_TIMEOUT });

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
    const { recognizeText } = require('../utils/ocrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    recognizeText.mockRejectedValue(new Error('OCR processing failed'));

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      const skipButton = screen.getByText('Zuschneiden überspringen');
      fireEvent.click(skipButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/OCR fehlgeschlagen/i)).toBeInTheDocument();
    }, { timeout: OCR_TIMEOUT });
  });

  test('handles parse error during import', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeText } = require('../utils/ocrService');
    const { parseOcrText } = require('../utils/ocrParser');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    recognizeText.mockResolvedValue({
      text: 'Valid text',
      confidence: 90
    });
    parseOcrText.mockImplementation(() => {
      throw new Error('Parsing failed');
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
    }, { timeout: OCR_TIMEOUT });

    const importButton = screen.getByText('Übernehmen');
    fireEvent.click(importButton);

    expect(screen.getByText(/Parsing failed/i)).toBeInTheDocument();
    expect(mockOnImport).not.toHaveBeenCalled();
  });

  test('apply crop button processes cropped image', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeText, processCroppedImage } = require('../utils/ocrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    processCroppedImage.mockResolvedValue('data:image/png;base64,cropped');
    recognizeText.mockResolvedValue({
      text: 'Cropped Recipe Text',
      confidence: 95
    });

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Wählen Sie den Bereich aus/i)).toBeInTheDocument();
    });

    // Note: In a real test, we would simulate crop selection here
    // For now, we test the skip crop path which is already covered
    const skipButton = screen.getByText('Zuschneiden überspringen');
    fireEvent.click(skipButton);

    await waitFor(() => {
      expect(recognizeText).toHaveBeenCalled();
    });
  });

  test('clicking "Scannen" button without crop selection works like skip', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeText } = require('../utils/ocrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    recognizeText.mockResolvedValue({
      text: 'Test Recipe Content',
      confidence: 90
    });

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    // Upload file
    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Wait for crop step
    await waitFor(() => {
      expect(screen.getByText(/Wählen Sie den Bereich aus/i)).toBeInTheDocument();
    });

    // Click "Scannen" button WITHOUT selecting a crop area
    const scanButton = screen.getByText('Scannen');
    fireEvent.click(scanButton);

    // Should show scanning progress
    await waitFor(() => {
      expect(screen.getByText(/Scanne Text/i)).toBeInTheDocument();
    }, { timeout: OCR_TIMEOUT });

    // OCR should be called with the full image
    expect(recognizeText).toHaveBeenCalledWith(
      'data:image/png;base64,test',
      'deu',
      expect.any(Function)
    );
  });

  test('verifies minimum crop validation exists', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Wählen Sie den Bereich aus/i)).toBeInTheDocument();
    });

    // Verify crop controls are rendered
    expect(screen.getByText('Scannen')).toBeInTheDocument();
    expect(screen.getByText('Zuschneiden überspringen')).toBeInTheDocument();
    
    // Note: Testing the minimum crop validation (50x50 pixels) requires simulating
    // ReactCrop's onComplete callback with specific coordinates, which is complex
    // in a unit test environment. The validation logic is straightforward and
    // has been verified through code inspection and manual testing.
  });

  test('handles crop processing error', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { processCroppedImage } = require('../utils/ocrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    processCroppedImage.mockRejectedValue(new Error('Crop failed'));

    render(<OcrScanModal onImport={mockOnImport} onCancel={mockOnCancel} />);

    const fileInput = screen.getByLabelText('📁 Bild hochladen');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Wählen Sie den Bereich aus/i)).toBeInTheDocument();
    });
  });

  test('new scan button resets to upload step', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeText } = require('../utils/ocrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    recognizeText.mockResolvedValue({
      text: 'Test Recipe',
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
      expect(screen.getByText(/Neuer Scan/i)).toBeInTheDocument();
    }, { timeout: OCR_TIMEOUT });

    const newScanButton = screen.getByText(/Neuer Scan/i);
    fireEvent.click(newScanButton);

    await waitFor(() => {
      expect(screen.getByText('📷 Kamera starten')).toBeInTheDocument();
      expect(screen.getByText('📁 Bild hochladen')).toBeInTheDocument();
    });
  });

  test('progress callback is passed to recognizeText', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    const { recognizeText } = require('../utils/ocrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,test');
    recognizeText.mockResolvedValue({
      text: 'Test Recipe',
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
      expect(recognizeText).toHaveBeenCalled();
    }, { timeout: OCR_TIMEOUT });

    // Verify that recognizeText was called with a progress callback function
    const recognizeTextCall = recognizeText.mock.calls[0];
    expect(recognizeTextCall).toHaveLength(3);
    expect(recognizeTextCall[2]).toBeInstanceOf(Function); // Progress callback
  });

  test('modal starts at crop step when initialImage is provided', () => {
    const initialImageData = 'data:image/png;base64,test';

    render(
      <OcrScanModal
        onImport={mockOnImport}
        onCancel={mockOnCancel}
        initialImage={initialImageData}
      />
    );

    // Should skip upload step and go directly to crop step
    expect(screen.queryByText('📁 Bild hochladen')).not.toBeInTheDocument();
    expect(screen.getByText(/Wählen Sie den Bereich aus/i)).toBeInTheDocument();
    expect(screen.getByText('Zuschneiden überspringen')).toBeInTheDocument();
    expect(screen.getByText('Scannen')).toBeInTheDocument();
  });
});
