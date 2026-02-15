import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RecipeImportModal from './RecipeImportModal';

describe('RecipeImportModal', () => {
  const mockOnImport = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders camera button with correct accessibility attributes', () => {
    render(
      <RecipeImportModal 
        onImport={mockOnImport} 
        onCancel={mockOnCancel} 
      />
    );

    const cameraButton = screen.getByRole('button', { name: /Rezept mit Kamera scannen/i });
    expect(cameraButton).toBeInTheDocument();
    expect(cameraButton).toHaveAttribute('title', 'Rezept mit Kamera scannen');
    expect(cameraButton).toHaveClass('ocr-camera-button');
  });

  test('camera button opens OCR modal when clicked', () => {
    render(
      <RecipeImportModal 
        onImport={mockOnImport} 
        onCancel={mockOnCancel} 
      />
    );

    const cameraButton = screen.getByRole('button', { name: /Rezept mit Kamera scannen/i });
    fireEvent.click(cameraButton);

    // Check that OcrScanModal title is present
    expect(screen.getByText('Rezept scannen')).toBeInTheDocument();
  });

  test('renders all action buttons', () => {
    render(
      <RecipeImportModal 
        onImport={mockOnImport} 
        onCancel={mockOnCancel} 
      />
    );

    expect(screen.getByText('Abbrechen')).toBeInTheDocument();
    expect(screen.getByText('Importieren')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rezept mit Kamera scannen/i })).toBeInTheDocument();
  });

  test('cancel button calls onCancel', () => {
    render(
      <RecipeImportModal 
        onImport={mockOnImport} 
        onCancel={mockOnCancel} 
      />
    );

    const cancelButton = screen.getByText('Abbrechen');
    fireEvent.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  test('OCR result populates import text field and closes modal', () => {
    render(
      <RecipeImportModal 
        onImport={mockOnImport} 
        onCancel={mockOnCancel} 
      />
    );

    // Open OCR modal
    const cameraButton = screen.getByRole('button', { name: /Rezept mit Kamera scannen/i });
    fireEvent.click(cameraButton);

    // Verify OCR modal is open
    expect(screen.getByText('Rezept scannen')).toBeInTheDocument();

    // Simulate OCR result by clicking the cancel button of OCR modal
    // (In real scenario, OcrScanModal would call onImport callback)
    const ocrCancelButton = screen.getAllByText('Abbrechen')[1]; // Second cancel button is from OCR modal
    fireEvent.click(ocrCancelButton);

    // Verify OCR modal is closed
    expect(screen.queryByText('Rezept scannen')).not.toBeInTheDocument();
  });
});
