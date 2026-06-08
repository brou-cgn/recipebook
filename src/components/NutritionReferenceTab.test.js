import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NutritionReferenceTab from './NutritionReferenceTab';
import { NutritionReferenceProvider, clearNutritionReferenceCache } from '../contexts/NutritionReferenceContext';

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
    clearNutritionReferenceCache();
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'tomate',
          data: () => ({
            ingredientID: 'dummy-tomate',
            displayName: 'Tomate',
            nutritionFamily: 'Gemüse',
            seasonalFamily: 'Fruchtgemüse',
            status: 'Freigegeben',
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
    clearNutritionReferenceCache();
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
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Quelle')).toBeInTheDocument();
    expect(screen.getByText('Suchbegriff')).toBeInTheDocument();
    expect(screen.getByLabelText('Status tomate')).toHaveValue('Freigegeben');
    const sourceSelect = screen.getByLabelText('Quelle tomate');
    expect(sourceSelect.querySelector('option[value="ai-generiert"]')).not.toBeNull();
    expect(sourceSelect.querySelector('option[value="ai"]')).toBeNull();

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
      status: 'Neu',
      source: '',
      synonyms: ['Haferflocken'],
    }));
    expect(mockSetDoc.mock.calls[0][2]).toEqual({ merge: true });
  });

  test('filters rows by status', async () => {
    renderTab({ id: 'u1', role: 'moderator' });

    expect(await screen.findByDisplayValue('dummy-tomate')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Status filtern'), { target: { value: 'Freigegeben' } });

    expect(screen.getByDisplayValue('dummy-tomate')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Status filtern'), { target: { value: 'Prüfung ausstehend' } });
    expect(screen.queryByDisplayValue('dummy-tomate')).not.toBeInTheDocument();
  });

  test('supports column filters for table headers', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'tomate',
          data: () => ({
            ingredientID: 'dummy-tomate',
            displayName: 'Tomate',
            nutritionFamily: 'Gemüse',
            seasonalFamily: 'Fruchtgemüse',
            category: 'Gemüse',
            status: 'Datenerfassung ausstehend',
            source: 'manual',
            searchTerm: 'Tomate',
            seasonRelevant: true,
            synonyms: ['Tomate'],
            possibleUnits: ['g'],
            defaultAmountG: 100,
            kalorien: 18,
          }),
        },
        {
          id: 'milch',
          data: () => ({
            ingredientID: 'dummy-milch',
            displayName: 'Milch',
            nutritionFamily: 'Milchprodukte',
            seasonalFamily: 'Ganzjährig',
            category: 'Getränk',
            status: 'Freigegeben',
            source: 'openfoodfacts',
            searchTerm: 'Milch',
            seasonRelevant: false,
            synonyms: ['Milch', 'Kuhmilch'],
            possibleUnits: ['ml'],
            defaultAmountG: 250,
            kalorien: 64,
          }),
        },
      ],
    });
    renderTab({ id: 'u1', role: 'moderator' });

    expect(await screen.findByDisplayValue('dummy-tomate')).toBeInTheDocument();
    expect(screen.getByDisplayValue('dummy-milch')).toBeInTheDocument();

    expect(screen.getByLabelText('Filter ingredientID')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter Anzeigename')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter Quelle')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter Saisonrelevant')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter Kalorien (kcal)')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter ingredientID'), { target: { value: 'milch' } });
    expect(screen.getByDisplayValue('dummy-milch')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('dummy-tomate')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter ingredientID'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Filter Saisonrelevant'), { target: { value: 'true' } });
    expect(screen.getByDisplayValue('dummy-tomate')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('dummy-milch')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter Saisonrelevant'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Filter Quelle'), { target: { value: 'openfoodfacts' } });
    expect(screen.getByDisplayValue('dummy-milch')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('dummy-tomate')).not.toBeInTheDocument();
  });

  test('shows confidence and deviations for OpenFoodFacts nutrients', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'tomate',
          data: () => ({
            ingredientID: 'dummy-tomate',
            displayName: 'Tomate',
            source: 'openfoodfacts',
            synonyms: ['Tomate'],
            kalorien_openfoodfacts: 90,
            protein_openfoodfacts: 5,
            fett_openfoodfacts: 4,
            kohlenhydrate_openfoodfacts: 10,
            kalorien_ai: 88,
            protein_ai: 4,
            fett_ai: 5,
            kohlenhydrate_ai: 12,
          }),
        },
      ],
    });

    renderTab({ id: 'u1', role: 'moderator' });

    const overallConfidence = await screen.findByLabelText('Gesamt-Confidence tomate');
    expect(overallConfidence).toHaveTextContent('C: 84%');

    const caloriesDiagnostics = screen.getByLabelText('Kalorien (kcal) (OpenFoodFacts Diagnose) tomate');
    expect(caloriesDiagnostics).not.toHaveTextContent('C: 98%');
    expect(caloriesDiagnostics).toHaveTextContent('Δ KI: +2');
    expect(caloriesDiagnostics).toHaveTextContent('Δ Formel: -6');
    expect(caloriesDiagnostics).toHaveTextContent('C Formel: 94%');

    const proteinDiagnostics = screen.getByLabelText('Protein (g) (OpenFoodFacts Diagnose) tomate');
    expect(proteinDiagnostics).not.toHaveTextContent('C: 78%');
    expect(proteinDiagnostics).toHaveTextContent('Δ KI: +1');
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

  test('stores approvedAt when status changes to Freigegeben', async () => {
    mockServerTimestamp.mockReturnValue('server-ts');
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'tomate',
          data: () => ({
            ingredientID: 'dummy-tomate',
            status: 'Prüfung ausstehend',
            synonyms: ['Tomate'],
          }),
        },
      ],
    });
    renderTab({ id: 'u1', role: 'moderator' });

    expect(await screen.findByDisplayValue('dummy-tomate')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Status tomate'), { target: { value: 'Freigegeben' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
    expect(mockSetDoc.mock.calls[0][1]).toEqual(expect.objectContaining({
      status: 'Freigegeben',
      approvedAt: 'server-ts',
    }));
  });

  test('keeps existing approvedAt when status remains Freigegeben', async () => {
    mockServerTimestamp.mockReturnValue('server-ts');
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'tomate',
          data: () => ({
            ingredientID: 'dummy-tomate',
            status: 'Freigegeben',
            approvedAt: 'existing-approved-at',
            nutritionFamily: 'Gemüse',
            synonyms: ['Tomate'],
          }),
        },
      ],
    });
    renderTab({ id: 'u1', role: 'moderator' });

    expect(await screen.findByDisplayValue('dummy-tomate')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('nutritionFamily tomate'), { target: { value: 'Nachtschatten' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
    expect(mockSetDoc.mock.calls[0][1]).toEqual(expect.objectContaining({
      approvedAt: 'existing-approved-at',
      status: 'Freigegeben',
      nutritionFamily: 'Nachtschatten',
    }));
  });

  test('sets recalc and shifts nutrition sets when status changes to Freigegeben', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'tomate',
          data: () => ({
            ingredientID: 'dummy-tomate',
            status: 'Prüfung ausstehend',
            source: 'manual',
            synonyms: ['Tomate'],
            kalorien_manual: 100,
            protein_manual: 2,
            nutritionSetActual: [{ source: 'manual', kalorien: 100, protein: 2 }],
            nutritionSetOutdated: [],
            recalc: false,
          }),
        },
      ],
    });
    renderTab({ id: 'u1', role: 'moderator' });

    expect(await screen.findByDisplayValue('dummy-tomate')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Kalorien (kcal) (Manuell) tomate'), { target: { value: '130' } });
    fireEvent.change(screen.getByLabelText('Status tomate'), { target: { value: 'Freigegeben' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
    expect(mockSetDoc.mock.calls[0][1]).toEqual(expect.objectContaining({
      status: 'Freigegeben',
      recalc: true,
      nutritionSetOutdated: [{ source: 'manual', kalorien: 100, protein: 2 }],
      nutritionSetActual: [{ source: 'manual', kalorien: 130, protein: 2 }],
    }));
  });

  test('keeps nutrition sets unchanged when source is switched to manual', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'tomate',
          data: () => ({
            ingredientID: 'dummy-tomate',
            status: 'Prüfung ausstehend',
            source: 'openfoodfacts',
            synonyms: ['Tomate'],
            kalorien_openfoodfacts: 100,
            kalorien_manual: 90,
            nutritionSetActual: [{ source: 'openfoodfacts', kalorien: 100 }],
            nutritionSetOutdated: [{ source: 'ai-generiert', kalorien: 97 }],
            recalc: false,
          }),
        },
      ],
    });
    renderTab({ id: 'u1', role: 'moderator' });

    expect(await screen.findByDisplayValue('dummy-tomate')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Quelle tomate'), { target: { value: 'manual' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
    expect(mockSetDoc.mock.calls[0][1]).toEqual(expect.objectContaining({
      source: 'manual',
      nutritionSetActual: [{ source: 'openfoodfacts', kalorien: 100 }],
      nutritionSetOutdated: [{ source: 'ai-generiert', kalorien: 97 }],
      recalc: false,
    }));
  });

  test('persists clearing nutrition values and source for an existing row', async () => {
    renderTab({ id: 'u1', role: 'moderator' });

    expect(await screen.findByDisplayValue('dummy-tomate')).toBeInTheDocument();

    // The row has source:'manual', so lazy migration puts kalorien into kalorien_manual.
    // Clear the manual Kalorien field and change source to empty.
    fireEvent.change(screen.getByLabelText('Kalorien (kcal) (Manuell) tomate'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Quelle tomate'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });

    const payload = mockSetDoc.mock.calls[0][1];
    expect(payload.source).toBe('');
    expect(Object.prototype.hasOwnProperty.call(payload, 'kalorien')).toBe(true);
    expect(payload.kalorien).toBeUndefined();
    expect(mockDeleteField).toHaveBeenCalled();
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
        status: 'Prüfung ausstehend',
        searchTerm: 'tomato',
        kalorien: 82,
        protein: 4.3,
        fett: 0.5,
        kohlenhydrate: 18.9,
        zucker: 12.5,
        ballaststoffe: 4.1,
        salz: 0.2,
        kalorien_openfoodfacts: 82,
        protein_openfoodfacts: 4.3,
        fett_openfoodfacts: 0.5,
        kohlenhydrate_openfoodfacts: 18.9,
        zucker_openfoodfacts: 12.5,
        ballaststoffe_openfoodfacts: 4.1,
        salz_openfoodfacts: 0.2,
        nutritionSetActual: [{
          source: 'openfoodfacts',
          kalorien: 82,
          protein: 4.3,
          fett: 0.5,
          kohlenhydrate: 18.9,
          zucker: 12.5,
          ballaststoffe: 4.1,
          salz: 0.2,
        }],
        nutritionSetOutdated: [],
        recalc: false,
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
      status: 'Prüfung ausstehend',
      searchTerm: 'tomato puree',
      kalorien: 80,
      protein: 4,
      fett: 0.4,
      kohlenhydrate: 18,
      zucker: 12,
      ballaststoffe: 4,
      salz: 0.1,
      kalorien_ai: 80,
      protein_ai: 4,
      fett_ai: 0.4,
      kohlenhydrate_ai: 18,
      zucker_ai: 12,
      ballaststoffe_ai: 4,
      salz_ai: 0.1,
      nutritionSetActual: [{
        source: 'ai-generiert',
        kalorien: 80,
        protein: 4,
        fett: 0.4,
        kohlenhydrate: 18,
        zucker: 12,
        ballaststoffe: 4,
        salz: 0.1,
      }],
      nutritionSetOutdated: [],
      recalc: false,
      source: 'ai-generiert',
    });
    expect(mockSetDoc.mock.calls[1][2]).toEqual({ merge: true });
  });

  test('keeps status "Neu" when refreshing a newly created row', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'hafer',
          data: () => ({
            ingredientID: 'dummy-hafer',
            status: 'Neu',
            source: 'auto-created',
            synonyms: ['Hafer'],
          }),
        },
      ],
    });
    const mockCallFn = jest.fn().mockResolvedValue({
      data: {
        searchTerm: 'oats',
        source: 'openfoodfacts',
        values: { kalorien: 60 },
      },
    });
    mockHttpsCallable.mockReturnValue(mockCallFn);

    renderTab({ id: 'u1', role: 'moderator' });
    expect(await screen.findByDisplayValue('dummy-hafer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '🤖 Nährwerte abrufen' }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
    });
    expect(mockSetDoc.mock.calls[0][1]).toEqual(expect.objectContaining({
      status: 'Neu',
      source: 'openfoodfacts',
      searchTerm: 'oats',
      kalorien: 60,
    }));
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

  test('allows refreshing rows with status Freigegeben', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'tomate',
          data: () => ({
            ingredientID: 'dummy-tomate',
            nutritionFamily: 'Gemüse',
            status: 'Freigegeben',
            source: 'manual',
            searchTerm: 'Tomate',
          }),
        },
      ],
    });
    const mockCallFn = jest.fn().mockResolvedValue({
      data: {
        searchTerm: 'tomato',
        source: 'openfoodfacts',
        values: { kalorien: 20 },
      },
    });
    mockHttpsCallable.mockReturnValue(mockCallFn);

    renderTab({ id: 'u1', role: 'moderator' });
    expect(await screen.findByDisplayValue('dummy-tomate')).toBeInTheDocument();

    const btn = screen.getByRole('button', { name: '🤖 Nährwerte abrufen' });
    expect(btn).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '🤖 Nährwerte abrufen' }));

    await waitFor(() => {
      expect(mockCallFn).toHaveBeenCalled();
      expect(mockSetDoc).toHaveBeenCalled();
    });
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

  test('keeps table mounted and restores table scroll after saving a row', async () => {
    let resolveReload;
    mockGetDocs
      .mockResolvedValueOnce({
        docs: [
          {
            id: 'tomate',
            data: () => ({
              ingredientID: 'dummy-tomate',
              displayName: 'Tomate',
              nutritionFamily: 'Gemüse',
              status: 'Freigegeben',
              source: 'manual',
              synonyms: ['Tomate'],
              kalorien: 18,
            }),
          },
        ],
      })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveReload = resolve;
      }));

    renderTab({ id: 'u1', role: 'moderator' });
    expect(await screen.findByDisplayValue('dummy-tomate')).toBeInTheDocument();

    const container = document.querySelector('.conversion-table-container');
    expect(container).not.toBeNull();
    container.scrollTop = 123;
    container.scrollLeft = 45;

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByText('Lade Nährwerte...')).not.toBeInTheDocument();

    // Simulate the observed UI jump where the table snaps back to the top during reload.
    container.scrollTop = 0;
    container.scrollLeft = 0;
    resolveReload({
      docs: [
        {
          id: 'tomate',
          data: () => ({
            ingredientID: 'dummy-tomate',
            displayName: 'Tomate',
            nutritionFamily: 'Gemüse',
            status: 'Freigegeben',
            source: 'manual',
            synonyms: ['Tomate'],
            kalorien: 18,
          }),
        },
      ],
    });

    await waitFor(() => {
      expect(container.scrollTop).toBe(123);
      expect(container.scrollLeft).toBe(45);
    });
  });

  const makeCsvFile = (csvContent) => ({
    text: () => Promise.resolve(csvContent),
    arrayBuffer: () => {
      const nodeBuffer = Buffer.from(csvContent, 'utf-8');
      return Promise.resolve(nodeBuffer.buffer.slice(
        nodeBuffer.byteOffset,
        nodeBuffer.byteOffset + nodeBuffer.byteLength
      ));
    },
    name: 'test.csv',
    type: 'text/csv',
  });

  test('CSV import preserves existing source and nutrition fields for known rows', async () => {
    renderTab({ id: 'u1', role: 'moderator' });
    expect(await screen.findByDisplayValue('dummy-tomate')).toBeInTheDocument();

    const file = makeCsvFile('ingredientID;synonyms\ndummy-tomate;Tomate');
    const input = document.querySelector('#nutrition-reference-import-input');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });

    const payload = mockSetDoc.mock.calls[0][1];
    // Existing source 'manual' must be preserved (not replaced with 'csv-import')
    expect(payload.source).toBe('manual');
    // Existing nutrition fields must be preserved
    expect(payload.kalorien).toBe(18);
    expect(payload.kohlenhydrate).toBe(3.9);
    // setDoc options must still use merge:false to replace the document
    expect(mockSetDoc.mock.calls[0][2]).toEqual({ merge: false });
  });

  test('CSV import preserves existing searchTerm for known rows', async () => {
    renderTab({ id: 'u1', role: 'moderator' });
    expect(await screen.findByDisplayValue('dummy-tomate')).toBeInTheDocument();

    const file = makeCsvFile('ingredientID;synonyms\ndummy-tomate;Tomate');
    const input = document.querySelector('#nutrition-reference-import-input');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });

    // Existing searchTerm 'Tomate' must be preserved
    expect(mockSetDoc.mock.calls[0][1].searchTerm).toBe('Tomate');
  });

  test('CSV import uses csv-import as source for new rows without an existing entry', async () => {
    renderTab({ id: 'u1', role: 'moderator' });
    expect(await screen.findByDisplayValue('dummy-tomate')).toBeInTheDocument();

    const file = makeCsvFile('ingredientID;synonyms\ndummy-kartoffel;Kartoffel');
    const input = document.querySelector('#nutrition-reference-import-input');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });

    const payload = mockSetDoc.mock.calls[0][1];
    expect(payload.source).toBe('csv-import');
    expect(payload).not.toHaveProperty('kalorien');
  });
});
