import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SeasonMatrixTab from './SeasonMatrixTab';
import {
  subscribeToSeasonMatrix,
  addSeasonMatrixEntry,
  updateSeasonMatrixEntry
} from '../utils/seasonMatrix';
import {
  createSeasonMatrixTemplateCsv,
  parseSeasonMatrixImport
} from '../utils/seasonMatrixImportExport';
import { canManageSeasonMatrix } from '../utils/userManagement';

jest.mock('../utils/seasonMatrix', () => ({
  subscribeToSeasonMatrix: jest.fn(),
  addSeasonMatrixEntry: jest.fn(),
  updateSeasonMatrixEntry: jest.fn(),
  deleteSeasonMatrixEntry: jest.fn(),
  CURRENT_SEASON_STATUS: {
    HAUPTSAISON: 'Hauptsaison',
    NEBENSAISON: 'Nebensaison',
    BALD_SAISON: 'Bald_Saison',
    KEINE_SAISON: 'Keine_Saison',
  }
}));

jest.mock('../utils/seasonMatrixImportExport', () => ({
  createSeasonMatrixTemplateCsv: jest.fn(() => 'id;name'),
  parseSeasonMatrixImport: jest.fn()
}));

jest.mock('../utils/userManagement', () => ({
  canManageSeasonMatrix: jest.fn()
}));

describe('SeasonMatrixTab import/export', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    canManageSeasonMatrix.mockReturnValue(true);
    subscribeToSeasonMatrix.mockImplementation((callback) => {
      callback([{ id: 'kartoffel', name: 'Kartoffel' }]);
      return jest.fn();
    });

    addSeasonMatrixEntry.mockResolvedValue(undefined);
    updateSeasonMatrixEntry.mockResolvedValue(undefined);
  });

  it('blocks access for users without saisonmatrix permission', () => {
    canManageSeasonMatrix.mockReturnValue(false);

    render(<SeasonMatrixTab currentUser={{ vorname: 'Max', nachname: 'Muster', role: 'read' }} />);

    expect(screen.getByText(/Nur Moderatoren und Administratoren können die Saisonmatrix bearbeiten/i)).toBeInTheDocument();
    expect(subscribeToSeasonMatrix).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Template herunterladen' })).not.toBeInTheDocument();
  });

  it('downloads template CSV on button click', () => {
    const createObjectURLSpy = jest.fn(() => 'blob:test');
    const revokeObjectURLSpy = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURLSpy
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURLSpy
    });
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<SeasonMatrixTab currentUser={{ vorname: 'Max', nachname: 'Muster', role: 'admin' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Template herunterladen' }));

    expect(createSeasonMatrixTemplateCsv).toHaveBeenCalledTimes(1);
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test');

    clickSpy.mockRestore();
  });

  it('imports rows and updates existing entries', async () => {
    parseSeasonMatrixImport.mockReturnValue({
      entries: [
        {
          id: 'kartoffel',
          name: 'Kartoffel',
          category: undefined,
          mainSeasonMonths: [1, 2],
          secondarySeasonMonths: [],
          seasonScore: 80,
          isActive: true,
          region: 'DE',
          synonyms: undefined,
          description: undefined
        },
        {
          id: 'spargel',
          name: 'Spargel',
          category: undefined,
          mainSeasonMonths: [4, 5],
          secondarySeasonMonths: [],
          seasonScore: 90,
          isActive: true,
          region: 'DE',
          synonyms: undefined,
          description: undefined
        }
      ],
      errors: ['Zeile 3 ignoriert']
    });

    render(<SeasonMatrixTab currentUser={{ vorname: 'Max', nachname: 'Muster', role: 'admin' }} />);

    const input = screen.getByLabelText('Datei importieren');
    const csvContent = 'id;name\nkartoffel;Kartoffel';
    const file = new File([csvContent], 'season.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'arrayBuffer', {
      configurable: true,
      value: jest.fn(async () => Uint8Array.from(csvContent.split('').map((char) => char.charCodeAt(0))).buffer)
    });
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: jest.fn(async () => csvContent)
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(updateSeasonMatrixEntry).toHaveBeenCalledWith(
        'kartoffel',
        expect.objectContaining({ id: 'kartoffel' }),
        'Max Muster'
      );
    });

    expect(addSeasonMatrixEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'spargel' }),
      'Max Muster'
    );

    expect(await screen.findByText(/Import abgeschlossen/)).toBeInTheDocument();
    expect(screen.getByText(/Hinweise:/)).toBeInTheDocument();
  });

  it('edits an entry directly in the table row', async () => {
    subscribeToSeasonMatrix.mockImplementation((callback) => {
      callback([{
        id: 'kartoffel',
        name: 'Kartoffel',
        category: 'Gemüse',
        mainSeasonMonths: [4, 5],
        secondarySeasonMonths: [],
        seasonScore: 80,
        isActive: true,
        region: 'DE',
        synonyms: ['Erdapfel'],
        description: 'Test'
      }]);
      return jest.fn();
    });

    render(<SeasonMatrixTab currentUser={{ vorname: 'Max', nachname: 'Muster', role: 'admin' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));

    fireEvent.change(screen.getByLabelText('Name für kartoffel'), { target: { value: 'Neue Kartoffel' } });
    fireEvent.change(screen.getByLabelText('Kategorie für kartoffel'), { target: { value: 'Wurzelgemüse' } });
    fireEvent.change(screen.getByLabelText('Hauptsaison für kartoffel'), { target: { value: '2,3,4' } });
    fireEvent.change(screen.getByLabelText('Score für kartoffel'), { target: { value: '85' } });
    fireEvent.change(screen.getByLabelText('Region für kartoffel'), { target: { value: 'AT' } });
    fireEvent.click(screen.getByLabelText('Aktiv für kartoffel'));

    fireEvent.click(screen.getByRole('button', { name: 'Speichern für kartoffel' }));

    await waitFor(() => {
      expect(updateSeasonMatrixEntry).toHaveBeenCalledWith(
        'kartoffel',
        expect.objectContaining({
          id: 'kartoffel',
          name: 'Neue Kartoffel',
          category: 'Wurzelgemüse',
          mainSeasonMonths: [2, 3, 4],
          seasonScore: 85,
          region: 'AT',
          isActive: false
        }),
        'Max Muster'
      );
    });
  });
});
