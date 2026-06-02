import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import {
  NutritionReferenceProvider,
  useNutritionReference,
  NUTRITION_REF_CACHE_KEY,
  loadCachedRows,
  saveCachedRows,
  clearNutritionReferenceCache,
} from './NutritionReferenceContext';

const mockGetDocs = jest.fn();
const mockGetDoc = jest.fn();
const mockCollection = jest.fn(() => 'nutritionReferences-collection');
const mockDoc = jest.fn(() => 'appConfig/nutritionReferences');

jest.mock('../firebase', () => ({
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  getDocs: (...args) => mockGetDocs(...args),
  doc: (...args) => mockDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
}));

function NutritionReferenceConsumer() {
  const { rows, loading } = useNutritionReference();
  return (
    <div>
      <span data-testid="loading">{loading ? 'loading' : 'ready'}</span>
      <span data-testid="rows-count">{rows.length}</span>
      <span data-testid="first-id">{rows[0]?.ingredientID || ''}</span>
    </div>
  );
}

describe('NutritionReferenceContext caching', () => {
  beforeEach(() => {
    clearNutritionReferenceCache();
    mockGetDocs.mockReset();
    mockGetDoc.mockReset();
    mockCollection.mockClear();
    mockDoc.mockClear();
  });

  test('saves, loads and clears nutrition reference cache helpers', () => {
    saveCachedRows([{ ingredientID: 'tomate' }], 1234);

    const loaded = loadCachedRows();
    expect(loaded).toEqual(expect.objectContaining({
      rows: [{ ingredientID: 'tomate' }],
      lastUpdatedAt: 1234,
    }));
    expect(typeof loaded.cachedAt).toBe('number');

    clearNutritionReferenceCache();
    expect(localStorage.getItem(NUTRITION_REF_CACHE_KEY)).toBeNull();
    expect(loadCachedRows()).toBeNull();
  });

  test('uses valid cache on mount and skips nutritionReferences fetch', async () => {
    saveCachedRows([{ ingredientID: 'cached-tomate', source: 'manual' }], 5000);
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ lastUpdatedAt: { toMillis: () => 5000 } }),
    });
    mockGetDocs.mockResolvedValue({ docs: [] });

    render(
      <NutritionReferenceProvider>
        <NutritionReferenceConsumer />
      </NutritionReferenceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('ready');
    });

    expect(screen.getByTestId('rows-count')).toHaveTextContent('1');
    expect(screen.getByTestId('first-id')).toHaveTextContent('cached-tomate');
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  test('reloads from firestore when cache is older than appConfig timestamp', async () => {
    saveCachedRows([{ ingredientID: 'cached-tomate', source: 'manual' }], 1000);
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ lastUpdatedAt: { toMillis: () => 2000 } }),
    });
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'tomate',
          data: () => ({
            ingredientID: 'fresh-tomate',
            source: 'openfoodfacts',
            displayName: 'Tomate',
          }),
        },
      ],
    });

    render(
      <NutritionReferenceProvider>
        <NutritionReferenceConsumer />
      </NutritionReferenceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('ready');
    });

    expect(mockGetDocs).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('first-id')).toHaveTextContent('fresh-tomate');
    const stored = JSON.parse(localStorage.getItem(NUTRITION_REF_CACHE_KEY));
    expect(stored.lastUpdatedAt).toBe(2000);
    expect(stored.rows[0].ingredientID).toBe('fresh-tomate');
  });
});
