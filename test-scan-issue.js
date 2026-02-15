// Test to reproduce the scan issue after photo upload and crop
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import OcrScanModal from './src/components/OcrScanModal';

// Mock the OCR service
jest.mock('./src/utils/ocrService', () => ({
  recognizeText: jest.fn(),
  processCroppedImage: jest.fn()
}));

// Mock the OCR parser
jest.mock('./src/utils/ocrParser', () => ({
  parseOcrText: jest.fn()
}));

// Mock the image utils
jest.mock('./src/utils/imageUtils', () => ({
  fileToBase64: jest.fn()
}));

describe('Scan button after upload and crop', () => {
  const mockOnImport = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('clicking "Scannen" button after image upload without making a crop selection', async () => {
    const { fileToBase64 } = require('./src/utils/imageUtils');
    const { recognizeText } = require('./src/utils/ocrService');
    
    fileToBase64.mockResolvedValue('data:image/png;base64,testimage');
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

    // Verify both buttons are present
    expect(screen.getByText('Zuschneiden überspringen')).toBeInTheDocument();
    expect(screen.getByText('Scannen')).toBeInTheDocument();

    // Click "Scannen" button WITHOUT selecting a crop area
    const scanButton = screen.getByText('Scannen');
    console.log('Clicking Scannen button...');
    fireEvent.click(scanButton);

    // Verify that scan progress should appear
    await waitFor(() => {
      expect(screen.getByText(/Scanne Text/i)).toBeInTheDocument();
    }, { timeout: 3000 });

    // Verify recognizeText was called
    expect(recognizeText).toHaveBeenCalled();
  });
});
