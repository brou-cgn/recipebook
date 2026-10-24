/**
 * Automatische Wiederaufnahme verwaister Import-Jobs (RecipeImportQueueContext).
 */
import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { RecipeImportQueueProvider } from './RecipeImportQueueContext';

let mockEmitTempRecipes;
const mockUpdateRecipe = jest.fn();
const mockRunWebImport = jest.fn();

jest.mock('../utils/recipeFirestore', () => ({
  addRecipe: jest.fn(),
  updateRecipe: (...args) => mockUpdateRecipe(...args),
  deleteRecipe: jest.fn(),
  subscribeToTempRecipes: (userId, callback) => {
    mockEmitTempRecipes = callback;
    return () => {};
  },
}));
jest.mock('../utils/importRunners', () => ({
  runWebImport: (...args) => mockRunWebImport(...args),
  runUniversalImport: jest.fn(),
  runPhotoScanImport: jest.fn(),
}));
jest.mock('../utils/imageUtils', () => ({ compressImage: jest.fn() }));
jest.mock('../utils/failedWebImportsFirestore', () => ({ logFailedWebImport: jest.fn() }));
jest.mock('firebase/firestore', () => ({ deleteField: () => '__deleteField__' }));

const staleJob = (overrides = {}) => ({
  id: 'job1',
  title: 'Rezept-Import',
  isTemp: true,
  importStatus: 'processing',
  importHeartbeatAt: Date.now() - 5 * 60 * 1000,
  importSource: { type: 'web', url: 'https://example.test/rezept' },
  ...overrides,
});

describe('Wiederaufnahme verwaister Import-Jobs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateRecipe.mockImplementation(() => Promise.resolve());
    mockRunWebImport.mockImplementation(() => new Promise(() => {}));
    render(<RecipeImportQueueProvider userId="u1"><div /></RecipeImportQueueProvider>);
  });

  test('ein im Browser gestarteter Job mit altem Lebenszeichen wird neu gestartet', async () => {
    act(() => mockEmitTempRecipes([staleJob()]));

    expect(mockUpdateRecipe).toHaveBeenCalledWith('job1', expect.objectContaining({ importStatus: 'queued' }));
    // Die Runner werden erst beim Start nachgeladen (Tech-Check P2).
    await waitFor(() => expect(mockRunWebImport).toHaveBeenCalled());
  });

  test('ein Kurzbefehl-Job bleibt dem Server überlassen', () => {
    act(() => mockEmitTempRecipes([staleJob({ importOrigin: 'shortcut' })]));

    expect(mockUpdateRecipe).not.toHaveBeenCalled();
    expect(mockRunWebImport).not.toHaveBeenCalled();
  });
});
