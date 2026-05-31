import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NutritionReferenceTab from './NutritionReferenceTab';
import { NutritionReferenceProvider } from '../contexts/NutritionReferenceContext';

jest.mock('../firebase', () => ({
  db: {},
}));

const mockGetDocs = jest.fn();
const mockSetDoc = jest.fn(() => Promise.resolve());
const mockDeleteDoc = jest.fn(() => Promise.resolve());
const mockFetch = jest.fn();
const mockDoc = jest.fn((db, coll, id) => `${coll}/${id}`);
const mockServerTimestamp = jest.fn(() => 'server-ts');

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => 'collection-ref'),
  getDocs: (...args) => mockGetDocs(...args),
  doc: (...args) => mockDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  serverTimestamp: (...args) => mockServerTimestamp(...args),
}));

describe('NutritionReferenceTab', () => {
  const renderTab = (user, providerEnabled = true, allRecipes = []) =>
    render(
      <NutritionReferenceProvider enabled={providerEnabled}>
        <NutritionReferenceTab currentUser={user} allRecipes={allRecipes} />
      </NutritionReferenceProvider>
    );

  beforeEach(() => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'tomate',
          data: () => ({ ingredientID: 'dummy-tomate', synonyms: ['Tomate'], kalorien: 18, kohlenhydrate: 3.9 }),
        },
      ],
    });
    mockSetDoc.mockClear();
    mockDeleteDoc.mockClear();
    mockDoc.mockClear();
    mockServerTimestamp.mockClear();
    mockFetch.mockReset();
    global.fetch = mockFetch;
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    jest.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  afterEach(() => {
    window.alert.mockRestore();
    window.confirm.mockRestore();
  });

  test('shows info message for unauthorized users', () => {
    renderTab({ role: 'read' }, false);
    expect(screen.getByText(/Nur Admins und Moderatoren/i)).toBeInTheDocument();
  });

  test('loads rows and allows adding a nutrition reference', async () => {
    renderTab({ id: 'u1', role: 'moderator' });

    expect(await screen.findByDisplayValue('Tomate')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('dummy-zutat'), { target: { value: 'dummy-haferflocken' } });
    fireEvent.change(screen.getByPlaceholderText('z. B. Tomate, Paradeiser'), { target: { value: 'Haferflocken' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
    expect(mockSetDoc.mock.calls[0][1]).toEqual(expect.objectContaining({
      ingredientID: 'dummy-haferflocken',
      synonyms: ['Haferflocken'],
    }));
    expect(mockSetDoc.mock.calls[0][2]).toEqual({ merge: true });
  });

  test('does not create duplicates for existing ingredient ids', async () => {
    renderTab({ id: 'u1', role: 'moderator' });

    expect(await screen.findByDisplayValue('Tomate')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('dummy-zutat'), { target: { value: 'dummy-tomate' } });
    fireEvent.change(screen.getByPlaceholderText('z. B. Tomate, Paradeiser'), { target: { value: 'Tomate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));

    await waitFor(() => {
      expect(mockSetDoc).not.toHaveBeenCalled();
    });
    expect(window.alert).toHaveBeenCalledWith('Diese ingredientID existiert bereits.');
  });

  test('saves boolean fields for an existing row', async () => {
    renderTab({ id: 'u1', role: 'moderator' });

    expect(await screen.findByDisplayValue('Tomate')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Saisonrelevant tomate'));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
    expect(mockSetDoc.mock.calls[0][1]).toEqual(expect.objectContaining({
      ingredientID: 'dummy-tomate',
      seasonRelevant: true,
    }));
    expect(mockSetDoc.mock.calls[0][2]).toEqual({ merge: true });
  });

  test('refreshes an existing row from OpenFoodFacts and overwrites the document', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        products: [
          {
            product_name: 'Tomatenmark',
            nutriments: {
              'energy-kcal_100g': 82,
              proteins_100g: 4.3,
              fat_100g: 0.5,
              carbohydrates_100g: 18.9,
              sugars_100g: 12.5,
              fiber_100g: 4.1,
              salt_100g: 0.2,
            },
          },
        ],
      }),
    });

    renderTab({ id: 'u1', role: 'moderator' });

    expect(await screen.findByDisplayValue('Tomate')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '🔍 OpenFoodFacts' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        'https://world.openfoodfacts.org/cgi/search.pl?search_terms=Tomate&action=process&json=1&page_size=5'
      );
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      expect(mockSetDoc.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          ingredientID: 'dummy-tomate',
          synonyms: ['Tomate'],
          normalizedSynonyms: ['tomate'],
          product: 'Tomatenmark',
          kalorien: 82,
          protein: 4.3,
          fett: 0.5,
          kohlenhydrate: 18.9,
          zucker: 12.5,
          ballaststoffe: 4.1,
          salz: 0.2,
          source: 'openfoodfacts',
          updatedBy: 'u1',
        })
      );
      expect(mockSetDoc.mock.calls[0][2]).toEqual({ merge: true });
    });
  });

  test('shows an error message when the OpenFoodFacts refresh fails', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        products: [],
      }),
    });

    renderTab({ id: 'u1', role: 'moderator' });

    expect(await screen.findByDisplayValue('Tomate')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '🔍 OpenFoodFacts' }));

    expect(await screen.findByText('Keine Nährwertdaten bei OpenFoodFacts gefunden.')).toBeInTheDocument();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  test('imports ingredient names from recipes with dummy ids', async () => {
    renderTab(
      { id: 'u1', role: 'moderator' },
      true,
      [
        {
          ingredients: [
            { type: 'ingredient', text: '500g Kartoffeln' },
            { type: 'ingredient', text: '200ml Milch' },
          ],
        },
      ]
    );

    expect(await screen.findByDisplayValue('Tomate')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zutatenliste importieren (Dummy-IDs)' }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
    expect(mockSetDoc.mock.calls[0][1]).toEqual(expect.objectContaining({
      ingredientID: 'dummy-kartoffeln',
      synonyms: ['Kartoffeln'],
      source: 'recipe-import',
    }));
    expect(mockSetDoc.mock.calls[0][2]).toEqual({ merge: true });
  });

  test('deletes all entries with one action', async () => {
    renderTab({ id: 'u1', role: 'moderator' });

    expect(await screen.findByDisplayValue('Tomate')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Alle Einträge löschen' }));

    await waitFor(() => {
      expect(mockDeleteDoc).toHaveBeenCalled();
    });
  });
});
