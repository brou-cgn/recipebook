import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NutritionReferenceTab from './NutritionReferenceTab';
import { NutritionReferenceProvider } from '../contexts/NutritionReferenceContext';

jest.mock('../firebase', () => ({
  db: {},
  functions: {},
}));

const mockGetDocs = jest.fn();
const mockSetDoc = jest.fn(() => Promise.resolve());
const mockDeleteDoc = jest.fn(() => Promise.resolve());
const mockFetch = jest.fn();
const mockDoc = jest.fn((db, coll, id) => `${coll}/${id}`);
const mockServerTimestamp = jest.fn(() => 'server-ts');
const mockDeleteField = jest.fn(() => 'delete-field');
const mockHttpsCallable = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => 'collection-ref'),
  getDocs: (...args) => mockGetDocs(...args),
  doc: (...args) => mockDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  serverTimestamp: (...args) => mockServerTimestamp(...args),
  deleteField: (...args) => mockDeleteField(...args),
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: (...args) => mockHttpsCallable(...args),
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
          data: () => ({
            ingredientID: 'dummy-tomate',
            displayName: 'Tomate',
            nutritionFamily: 'Gemüse',
            seasonalFamily: 'Fruchtgemüse',
            source: 'manual',
            searchTerm: 'Tomate',
            synonyms: ['Tomate'],
            kalorien: 18,
            kohlenhydrate: 3.9,
          }),
        },
      ],
    });
    mockSetDoc.mockClear();
    mockDeleteDoc.mockClear();
    mockDoc.mockClear();
    mockServerTimestamp.mockClear();
    mockDeleteField.mockClear();
    mockFetch.mockReset();
    mockHttpsCallable.mockReset();
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

    const section = screen.getByText('Nährwerte je 100 g').closest('.settings-section');
    expect(section).toHaveClass('nutrition-reference-section');

    expect(await screen.findByDisplayValue('dummy-tomate')).toBeInTheDocument();
    expect(screen.getByLabelText('Anzeigename tomate')).toHaveValue('Tomate');
    expect(screen.getByText('nutritionFamily')).toBeInTheDocument();
    expect(screen.getByText('Anzeigename')).toBeInTheDocument();
    expect(screen.getByText('seasonalFamily')).toBeInTheDocument();
    expect(screen.getByText('Quelle')).toBeInTheDocument();
    expect(screen.getByText('Suchbegriff')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('dummy-zutat'), { target: { value: 'dummy-haferflocken' } });
    fireEvent.change(screen.getByPlaceholderText('z. B. Tomate'), { target: { value: 'Haferflocken' } });
    fireEvent.change(screen.getByPlaceholderText('z. B. Tomate, Paradeiser'), { target: { value: 'Haferflocken' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
    expect(mockSetDoc.mock.calls[0][1]).toEqual(expect.objectContaining({
      ingredientID: 'dummy-haferflocken',
      displayName: 'Haferflocken',
      synonyms: ['Haferflocken'],
    }));
    expect(mockSetDoc.mock.calls[0][2]).toEqual({ merge: true });
  });

  test('does not create duplicates for existing ingredient ids', async () => {
    renderTab({ id: 'u1', role: 'moderator' });

    expect(await screen.findByDisplayValue('dummy-tomate')).toBeInTheDocument();

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

    expect(await screen.findByDisplayValue('dummy-tomate')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('nutritionFamily tomate'), { target: { value: 'Nachtschatten' } });
    fireEvent.click(screen.getByLabelText('Saisonrelevant tomate'));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
    expect(mockSetDoc.mock.calls[0][1]).toEqual(expect.objectContaining({
      ingredientID: 'dummy-tomate',
      nutritionFamily: 'Nachtschatten',
      seasonRelevant: true,
    }));
    expect(mockSetDoc.mock.calls[0][2]).toEqual({ merge: true });
  });

  test('refreshes an existing row via generateNutritionFromReference and writes openfoodfacts data', async () => {
    const mockCallFn = jest.fn().mockResolvedValue({
      data: {
        searchTerm: 'tomato',
        source: 'openfoodfacts',
        values: {
          kalorien: 82,
          protein: 4.3,
          fett: 0.5,
          kohlenhydrate: 18.9,
          zucker: 12.5,
          ballaststoffe: 4.1,
          salz: 0.2,
        },
      },
    });
    mockHttpsCallable.mockReturnValue(mockCallFn);

    renderTab({ id: 'u1', role: 'moderator' });

    expect(await screen.findByDisplayValue('dummy-tomate')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '🤖 Nährwerte abrufen' }));

    await waitFor(() => {
      expect(mockHttpsCallable).toHaveBeenCalledWith(expect.any(Object), 'generateNutritionFromReference');
      expect(mockCallFn).toHaveBeenCalledWith({
        ingredientID: 'dummy-tomate',
        nutritionFamily: 'Gemüse',
        category: '',
      });
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      expect(mockSetDoc.mock.calls[0][1]).toEqual({
        searchTerm: 'tomato',
        kalorien: 82,
        protein: 4.3,
        fett: 0.5,
        kohlenhydrate: 18.9,
        zucker: 12.5,
        ballaststoffe: 4.1,
        salz: 0.2,
        source: 'openfoodfacts',
      });
      expect(mockSetDoc.mock.calls[0][2]).toEqual({ merge: true });
    });
  });

  test('clears previous AI_Gemini_Error before refresh and writes Gemini nutrition fields only', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'tomate',
          data: () => ({
            ingredientID: 'dummy-tomate',
            nutritionFamily: 'Gemüse',
            source: 'manual',
            searchTerm: 'Tomate',
            synonyms: ['Tomate'],
            AI_Gemini_Error: 'Vorheriger Fehler',
          }),
        },
      ],
    });
    const mockCallFn = jest.fn().mockResolvedValue({
      data: {
        searchTerm: 'tomato puree',
        source: 'ai-generiert',
        values: {
          kalorien: 80,
          protein: 4,
          fett: 0.4,
          kohlenhydrate: 18,
          zucker: 12,
          ballaststoffe: 4,
          salz: 0.1,
        },
      },
    });
    mockHttpsCallable.mockReturnValue(mockCallFn);

    renderTab({ id: 'u1', role: 'moderator' });
    expect(await screen.findByDisplayValue('dummy-tomate')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '🤖 Nährwerte abrufen' }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledTimes(2);
    });
    expect(mockDeleteField).toHaveBeenCalled();
    expect(mockSetDoc.mock.calls[0][1].AI_Gemini_Error).toBeUndefined();
    expect(mockSetDoc.mock.calls[0][2]).toEqual({ merge: true });
    expect(mockSetDoc.mock.calls[1][1]).toEqual({
      searchTerm: 'tomato puree',
      kalorien: 80,
      protein: 4,
      fett: 0.4,
      kohlenhydrate: 18,
      zucker: 12,
      ballaststoffe: 4,
      salz: 0.1,
      source: 'ai-generiert',
    });
    expect(mockSetDoc.mock.calls[1][2]).toEqual({ merge: true });
  });

  test('shows an error message when generateNutritionFromReference fails and stores AI_Gemini_Error', async () => {
    const mockCallFn = jest.fn().mockRejectedValue(new Error('Abruf fehlgeschlagen.'));
    mockHttpsCallable.mockReturnValue(mockCallFn);

    renderTab({ id: 'u1', role: 'moderator' });

    expect(await screen.findByDisplayValue('dummy-tomate')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '🤖 Nährwerte abrufen' }));

    expect(await screen.findByText('Abruf fehlgeschlagen.')).toBeInTheDocument();
    expect(mockSetDoc.mock.calls[0][1]).toEqual({ AI_Gemini_Error: 'Abruf fehlgeschlagen.' });
    expect(mockSetDoc.mock.calls[0][2]).toEqual({ merge: true });
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

    expect(await screen.findByDisplayValue('dummy-tomate')).toBeInTheDocument();
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

    expect(await screen.findByDisplayValue('dummy-tomate')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Alle Einträge löschen' }));

    await waitFor(() => {
      expect(mockDeleteDoc).toHaveBeenCalled();
    });
  });
});
