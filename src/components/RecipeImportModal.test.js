import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RecipeImportModal from './RecipeImportModal';
import { renderWithProviders } from '../test-utils';

describe('RecipeImportModal', () => {
  const mockOnImport = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders action buttons', () => {
    render(
      <RecipeImportModal 
        onImport={mockOnImport} 
        onCancel={mockOnCancel} 
      />
    );

    expect(screen.getByText('Abbrechen')).toBeInTheDocument();
    expect(screen.getByText('Importieren')).toBeInTheDocument();
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
});

describe('RecipeImportModal in anderer Sprache (Mehrsprachigkeit PR 6i)', () => {
  test('Englisch: Texte und Meldung ohne Datei', () => {
    renderWithProviders(<RecipeImportModal onImport={() => {}} onCancel={() => {}} />, { sprache: 'en' });
    expect(screen.getByRole('heading', { name: 'Import recipe' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Import'));
    expect(screen.getByText('Please choose a CSV file')).toBeInTheDocument();
  });

  test('Deutsch: Meldung ohne Datei duzt', () => {
    renderWithProviders(<RecipeImportModal onImport={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByText('Importieren'));
    expect(screen.getByText('Bitte wähle eine CSV-Datei aus')).toBeInTheDocument();
  });
});

describe('RecipeImportModal: Meldungen des CSV-Imports (Mehrsprachigkeit PR 6m)', () => {
  // jsdom kennt weder TextDecoder noch File.arrayBuffer; beides nur für diesen Test bereitstellen
  const ohneTextDecoder = global.TextDecoder;
  beforeEach(() => {
    global.TextDecoder = jest.requireActual('util').TextDecoder;
  });
  afterEach(() => {
    global.TextDecoder = ohneTextDecoder;
  });

  test('Englisch: Fehler aus csvBulkImport in der Sprache', async () => {
    const { container } = renderWithProviders(<RecipeImportModal onImport={() => {}} onCancel={() => {}} />, { sprache: 'en' });
    const datei = { name: 'rezepte.csv', type: 'text/csv', arrayBuffer: async () => Buffer.from('Titel;Zutaten\n') };
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [datei] } });
    expect(await screen.findByText('The CSV must contain at least a header and one data row')).toBeInTheDocument();
  });
});
