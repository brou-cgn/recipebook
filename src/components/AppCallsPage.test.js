import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AppCallsPage from './AppCallsPage';
import { INGREDIENT_MATCH_CREATE_NEW_OPTION } from '../hooks/useIngredientIDMatching';

let mockNutritionReferenceState = { rows: [], loading: false, reload: jest.fn(), lastUpdatedAt: null };
const mockGetIngredientIdSuggestions = jest.fn(() => []);
const mockSetCustomIngredientMatchingTerms = jest.fn();
const mockNutritionModalProps = jest.fn();
const mockSetDoc = jest.fn(() => Promise.resolve());

jest.mock('../firebase', () => ({
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((db, coll, id) => `${coll}/${id}`),
  serverTimestamp: jest.fn(() => 'server-ts'),
  setDoc: (...args) => mockSetDoc(...args),
}));

jest.mock('./NutritionModal', () => function MockNutritionModal(props) {
  const { recipe, onClose, onEnsureIngredientIDs } = props;
  mockNutritionModalProps(props);
  return (
    <div data-testid="nutrition-modal-mock">
      <p>Nährwerte Mock {recipe?.title}</p>
      <button onClick={() => onEnsureIngredientIDs?.()}>IDs prüfen</button>
      <button onClick={onClose}>Schließen</button>
    </div>
  );
});

jest.mock('../contexts/NutritionReferenceContext', () => ({
  useNutritionReference: () => mockNutritionReferenceState,
}));

jest.mock('../utils/ingredientIdMatching', () => {
  const actual = jest.requireActual('../utils/ingredientIdMatching');
  return {
    ...actual,
    getIngredientIdSuggestions: (...args) => mockGetIngredientIdSuggestions(...args),
    setCustomIngredientMatchingTerms: (...args) => mockSetCustomIngredientMatchingTerms(...args),
    initializeCommonUnitsFromFirebase: jest.fn(() => Promise.resolve()),
    initializeIgnoredMarkersFromFirebase: jest.fn(() => Promise.resolve()),
  };
});

// Mock utility modules
jest.mock('../utils/appCallsFirestore', () => ({
  getAppCalls: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../utils/recipeCallsFirestore', () => ({
  getRecipeCalls: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../utils/imageUtils', () => ({
  isBase64Image: jest.fn(() => false),
}));

jest.mock('../utils/recipeFirestore', () => ({
  enableRecipeSharing: jest.fn(() => Promise.resolve()),
}));

jest.mock('../utils/customLists', () => ({
  getButtonIcons: jest.fn(() => Promise.resolve({})),
  DEFAULT_BUTTON_ICONS: { privateListBack: '✕' },
  getEffectiveIcon: jest.fn((icons, key) => icons[key] ?? ''),
  getDarkModePreference: jest.fn(() => false),
  getInspirationListSettings: jest.fn(() =>
    Promise.resolve({
      inspirationListName: 'Inspirationen',
      inspirationListDescription: 'Interaktive Liste',
      inspirationTargetListName: 'Für jeden Tag',
      inspirationTargetListDescription: 'Klassische Liste',
    })
  ),
  saveInspirationListSettings: jest.fn(() => Promise.resolve()),
  DEFAULT_INSPIRATION_LIST_NAME: 'Inspirationen',
  DEFAULT_INSPIRATION_LIST_DESCRIPTION: '',
  DEFAULT_INSPIRATION_TARGET_LIST_NAME: 'Für jeden Tag',
  DEFAULT_INSPIRATION_TARGET_LIST_DESCRIPTION: '',
  DEFAULT_STANDARD_INGREDIENT_UNITS: ['g', 'kg'],
  DEFAULT_STANDARD_INGREDIENT_ADJECTIVES: ['frisch', 'warm'],
  COMMON_ADJECTIVE_GROUPS: ['temperature', 'state', 'sizing', 'protected'],
  COMMON_UNIT_GROUPS: ['volume', 'kitchenSize', 'weight', 'dimension'],
  DEFAULT_COMMON_UNITS: {
    volume: ['ml', 'l'],
    kitchenSize: ['Esslöffel'],
    weight: ['g', 'kg'],
    dimension: ['cm'],
  },
  getCustomLists: jest.fn(() =>
    Promise.resolve({ cuisineTypes: ['Spanisch', 'Italienisch'], cuisineGroups: [] })
  ),
  saveCustomLists: jest.fn(() => Promise.resolve()),
  getStandardIngredientTerms: jest.fn(() =>
    Promise.resolve({ standardUnits: ['Tasse'], standardAdjectives: ['frisch'] })
  ),
  saveStandardIngredientTerms: jest.fn(() => Promise.resolve()),
  getCommonAdjectives: jest.fn(() =>
    Promise.resolve({ temperature: [], state: [], sizing: [], protected: [] })
  ),
  saveCommonAdjectives: jest.fn(() => Promise.resolve()),
  getIgnoredTerms: jest.fn(() => Promise.resolve(['optional', 'ggf', 'gegebenenfalls'])),
  saveIgnoredTerms: jest.fn(() => Promise.resolve()),
  getCommonUnits: jest.fn(() =>
    Promise.resolve({ volume: [], kitchenSize: [], weight: [], dimension: [] })
  ),
  saveCommonUnits: jest.fn(() => Promise.resolve()),
}));

jest.mock('../utils/cuisineProposalsFirestore', () => ({
  getCuisineProposals: jest.fn(() => Promise.resolve([])),
  addCuisineProposal: jest.fn(() => Promise.resolve('new-id')),
  updateCuisineProposal: jest.fn(() => Promise.resolve()),
  releaseCuisineProposal: jest.fn(() => Promise.resolve()),
}));

const adminUser = {
  id: 'admin-1',
  vorname: 'Admin',
  nachname: 'User',
  email: 'admin@example.com',
  isAdmin: true,
  role: 'admin',
  appCalls: true,
};

const moderatorUser = {
  id: 'moderator-1',
  vorname: 'Moderator',
  nachname: 'User',
  email: 'moderator@example.com',
  isAdmin: false,
  role: 'moderator',
  appCalls: true,
};

describe('AppCallsPage – Kulinariktypen release with rename', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetDoc.mockClear();
    mockSetCustomIngredientMatchingTerms.mockClear();
    mockNutritionReferenceState = { rows: [], loading: false, reload: jest.fn(), lastUpdatedAt: null };
    mockGetIngredientIdSuggestions.mockReset();
    mockGetIngredientIdSuggestions.mockReturnValue([]);
    mockNutritionModalProps.mockReset();
    const { getCustomLists, saveCustomLists, getButtonIcons, getInspirationListSettings } = require('../utils/customLists');
    getButtonIcons.mockResolvedValue({});
    getCustomLists.mockResolvedValue({
      cuisineTypes: ['Spanisch', 'Italienisch'],
      cuisineGroups: [],
    });
    saveCustomLists.mockResolvedValue();
    getInspirationListSettings.mockResolvedValue({
      inspirationListName: 'Inspirationen',
      inspirationListDescription: 'Interaktive Liste',
      inspirationTargetListName: 'Für jeden Tag',
      inspirationTargetListDescription: 'Klassische Liste',
    });
    const { getAppCalls } = require('../utils/appCallsFirestore');
    getAppCalls.mockResolvedValue([]);
    const { getRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecipeCalls.mockResolvedValue([]);
    const { getCuisineProposals, releaseCuisineProposal } = require('../utils/cuisineProposalsFirestore');
    getCuisineProposals.mockResolvedValue([]);
    releaseCuisineProposal.mockResolvedValue();
  });

  test('releasing an unedited proposal adds it to cuisineTypes without modifying other types', async () => {
    const { getCuisineProposals, releaseCuisineProposal } = require('../utils/cuisineProposalsFirestore');
    const { saveCustomLists } = require('../utils/customLists');
    getCuisineProposals.mockResolvedValueOnce([
      { id: 'p1', name: 'Spanisch', originalName: 'Spanisch', groupName: null, released: false, source: 'recipe_form' },
    ]);

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[{ id: 'r1', kulinarik: ['Spanisch'] }]}
        onUpdateRecipe={jest.fn()}
      />
    );

    // Switch to Kulinariktypen tab
    fireEvent.click(await screen.findByText('Kulinariktypen'));

    // Wait for proposals to load and click Freigeben
    await waitFor(() => screen.getByTitle('Kulinariktyp freigeben'));
    fireEvent.click(screen.getByTitle('Kulinariktyp freigeben'));

    await waitFor(() => expect(releaseCuisineProposal).toHaveBeenCalledWith('p1'));

    // cuisineTypes already contains 'Spanisch', so list stays the same
    await waitFor(() => expect(saveCustomLists).toHaveBeenCalledWith(
      expect.objectContaining({ cuisineTypes: expect.arrayContaining(['Spanisch', 'Italienisch']) })
    ));
  });

  test('releasing a renamed proposal replaces the original name in cuisineTypes', async () => {
    const { getCuisineProposals, releaseCuisineProposal } = require('../utils/cuisineProposalsFirestore');
    const { saveCustomLists } = require('../utils/customLists');
    getCuisineProposals.mockResolvedValueOnce([
      {
        id: 'p1',
        name: 'Spanische Küche',
        originalName: 'Spanisch',
        groupName: null,
        released: false,
        source: 'recipe_form',
      },
    ]);

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[{ id: 'r1', kulinarik: ['Spanisch'] }]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Kulinariktypen'));

    await waitFor(() => screen.getByTitle('Kulinariktyp freigeben'));
    fireEvent.click(screen.getByTitle('Kulinariktyp freigeben'));

    await waitFor(() => expect(releaseCuisineProposal).toHaveBeenCalledWith('p1'));

    await waitFor(() => expect(saveCustomLists).toHaveBeenCalledWith(
      expect.objectContaining({
        cuisineTypes: expect.arrayContaining(['Spanische Küche', 'Italienisch']),
      })
    ));

    // 'Spanisch' must no longer be in the saved list
    const savedArg = saveCustomLists.mock.calls[0][0];
    expect(savedArg.cuisineTypes).not.toContain('Spanisch');
  });

  test('releasing a renamed proposal updates kulinarik field on affected recipes', async () => {
    const { getCuisineProposals } = require('../utils/cuisineProposalsFirestore');
    getCuisineProposals.mockResolvedValueOnce([
      {
        id: 'p1',
        name: 'Spanische Küche',
        originalName: 'Spanisch',
        groupName: null,
        released: false,
        source: 'recipe_form',
      },
    ]);

    const onUpdateRecipe = jest.fn(() => Promise.resolve());

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[
          { id: 'r1', kulinarik: ['Spanisch'] },
          { id: 'r2', kulinarik: ['Spanisch', 'Tapas'] },
          { id: 'r3', kulinarik: ['Italienisch'] },
        ]}
        onUpdateRecipe={onUpdateRecipe}
      />
    );

    fireEvent.click(await screen.findByText('Kulinariktypen'));

    await waitFor(() => screen.getByTitle('Kulinariktyp freigeben'));
    fireEvent.click(screen.getByTitle('Kulinariktyp freigeben'));

    await waitFor(() => expect(onUpdateRecipe).toHaveBeenCalledTimes(2));

    expect(onUpdateRecipe).toHaveBeenCalledWith('r1', { kulinarik: ['Spanische Küche'] });
    expect(onUpdateRecipe).toHaveBeenCalledWith('r2', { kulinarik: ['Spanische Küche', 'Tapas'] });
    // r3 has only 'Italienisch' and must not be updated
    expect(onUpdateRecipe).not.toHaveBeenCalledWith('r3', expect.anything());
  });

  test('releasing a renamed proposal updates group children correctly', async () => {
    const { getCuisineProposals } = require('../utils/cuisineProposalsFirestore');
    const { getCustomLists, saveCustomLists } = require('../utils/customLists');
    getCustomLists.mockResolvedValue({
      cuisineTypes: ['Spanisch', 'Italienisch'],
      cuisineGroups: [
        { name: 'Europäisch', children: ['Spanisch', 'Italienisch'] },
      ],
    });
    getCuisineProposals.mockResolvedValueOnce([
      {
        id: 'p1',
        name: 'Spanische Küche',
        originalName: 'Spanisch',
        groupName: 'Europäisch',
        released: false,
        source: 'recipe_form',
      },
    ]);

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Kulinariktypen'));

    await waitFor(() => screen.getByTitle('Kulinariktyp freigeben'));
    fireEvent.click(screen.getByTitle('Kulinariktyp freigeben'));

    await waitFor(() => expect(saveCustomLists).toHaveBeenCalled());

    const savedArg = saveCustomLists.mock.calls[0][0];
    const europäisch = savedArg.cuisineGroups.find(g => g.name === 'Europäisch');
    expect(europäisch.children).toContain('Spanische Küche');
    expect(europäisch.children).not.toContain('Spanisch');
    expect(europäisch.children).toContain('Italienisch');
  });

  test('releasing a proposal without originalName falls back to current behavior', async () => {
    const { getCuisineProposals, releaseCuisineProposal } = require('../utils/cuisineProposalsFirestore');
    const { getCustomLists, saveCustomLists } = require('../utils/customLists');
    // No originalName field (legacy proposal)
    getCuisineProposals.mockResolvedValueOnce([
      { id: 'p1', name: 'Mexikanisch', groupName: null, released: false, source: 'manual' },
    ]);
    getCustomLists.mockResolvedValue({
      cuisineTypes: ['Spanisch'],
      cuisineGroups: [],
    });

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Kulinariktypen'));

    await waitFor(() => screen.getByTitle('Kulinariktyp freigeben'));
    fireEvent.click(screen.getByTitle('Kulinariktyp freigeben'));

    await waitFor(() => expect(releaseCuisineProposal).toHaveBeenCalledWith('p1'));

    await waitFor(() => expect(saveCustomLists).toHaveBeenCalledWith(
      expect.objectContaining({
        cuisineTypes: expect.arrayContaining(['Spanisch', 'Mexikanisch']),
      })
    ));
  });
});

describe('AppCallsPage – Kulinariktypen & Gruppen management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNutritionReferenceState = { rows: [], loading: false, reload: jest.fn(), lastUpdatedAt: null };
    mockGetIngredientIdSuggestions.mockReset();
    mockGetIngredientIdSuggestions.mockReturnValue([]);
    mockNutritionModalProps.mockReset();
    const { getCustomLists, saveCustomLists, getButtonIcons, getInspirationListSettings } = require('../utils/customLists');
    getButtonIcons.mockResolvedValue({});
    getCustomLists.mockResolvedValue({
      cuisineTypes: ['Spanisch', 'Italienisch'],
      cuisineGroups: [{ name: 'Europäisch', children: ['Spanisch'] }],
    });
    saveCustomLists.mockResolvedValue();
    getInspirationListSettings.mockResolvedValue({
      inspirationListName: 'Inspirationen',
      inspirationListDescription: 'Interaktive Liste',
      inspirationTargetListName: 'Für jeden Tag',
      inspirationTargetListDescription: 'Klassische Liste',
    });
    const { getAppCalls } = require('../utils/appCallsFirestore');
    getAppCalls.mockResolvedValue([]);
    const { getRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecipeCalls.mockResolvedValue([]);
    const { getCuisineProposals } = require('../utils/cuisineProposalsFirestore');
    getCuisineProposals.mockResolvedValue([]);
  });

  test('Kulinariktypen tab shows existing cuisineTypes list', async () => {
    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Kulinariktypen'));

    // 'Spanisch' appears in both the types list item and in the Europäisch group children
    const spanischItems = await screen.findAllByText('Spanisch');
    expect(spanischItems.length).toBe(2);
    expect(screen.getByText('Kulinarik-Typen')).toBeInTheDocument();
    expect(screen.getAllByText('Italienisch').length).toBeGreaterThanOrEqual(1);
  });

  test('Kulinariktypen tab shows existing cuisineGroups', async () => {
    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Kulinariktypen'));

    expect(await screen.findByText('Europäisch')).toBeInTheDocument();
  });

  test('adding a new cuisineType saves it', async () => {
    const { saveCustomLists } = require('../utils/customLists');

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Kulinariktypen'));

    const input = await screen.findByPlaceholderText('Neuen Kulinarik-Typ hinzufügen...');
    fireEvent.change(input, { target: { value: 'Mexikanisch' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Hinzufügen/i })[0]);

    await waitFor(() => expect(saveCustomLists).toHaveBeenCalledWith(
      expect.objectContaining({
        cuisineTypes: expect.arrayContaining(['Spanisch', 'Italienisch', 'Mexikanisch']),
      })
    ));
  });

  test('removing a cuisineType saves the updated list', async () => {
    const { saveCustomLists } = require('../utils/customLists');

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Kulinariktypen'));

    await screen.findAllByText('Spanisch');
    const removeButtons = screen.getAllByTitle('Entfernen');
    fireEvent.click(removeButtons[0]);

    await waitFor(() => expect(saveCustomLists).toHaveBeenCalled());
    const savedArg = saveCustomLists.mock.calls[0][0];
    expect(savedArg.cuisineTypes).not.toContain('Spanisch');
    expect(savedArg.cuisineTypes).toContain('Italienisch');
  });

  test('adding a new cuisineGroup saves it', async () => {
    const { saveCustomLists } = require('../utils/customLists');

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Kulinariktypen'));

    const input = await screen.findByPlaceholderText('Neue Gruppe hinzufügen (z.B. Asiatische Küche)...');
    fireEvent.change(input, { target: { value: 'Asiatisch' } });

    const addButtons = screen.getAllByRole('button', { name: /Hinzufügen/i });
    fireEvent.click(addButtons[1]);

    await waitFor(() => expect(saveCustomLists).toHaveBeenCalledWith(
      expect.objectContaining({
        cuisineGroups: expect.arrayContaining([
          expect.objectContaining({ name: 'Asiatisch' }),
        ]),
      })
    ));
  });
});

describe('AppCallsPage – Nährwertberechnungen tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNutritionReferenceState = { rows: [], loading: false, reload: jest.fn(), lastUpdatedAt: null };
    mockGetIngredientIdSuggestions.mockReset();
    mockGetIngredientIdSuggestions.mockReturnValue([]);
    mockNutritionModalProps.mockReset();
    const {
      getCustomLists,
      getButtonIcons,
      getInspirationListSettings,
      getStandardIngredientTerms,
    } = require('../utils/customLists');
    getButtonIcons.mockResolvedValue({});
    getCustomLists.mockResolvedValue({ cuisineTypes: [], cuisineGroups: [] });
    getStandardIngredientTerms.mockResolvedValue({
      standardUnits: ['Tasse'],
      standardAdjectives: ['frisch'],
    });
    getInspirationListSettings.mockResolvedValue({
      inspirationListName: 'Inspirationen',
      inspirationListDescription: 'Interaktive Liste',
      inspirationTargetListName: 'Für jeden Tag',
      inspirationTargetListDescription: 'Klassische Liste',
    });
    const { getAppCalls } = require('../utils/appCallsFirestore');
    getAppCalls.mockResolvedValue([]);
    const { getRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecipeCalls.mockResolvedValue([]);
    const { getCuisineProposals } = require('../utils/cuisineProposalsFirestore');
    getCuisineProposals.mockResolvedValue([]);
  });

  test('shows recipe title for pending calculations', async () => {
    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[
          { id: 'r1', title: 'Spaghetti Carbonara', naehrwerte: { calcPending: true, calcPendingAt: Date.now() } },
        ]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Nährwertberechnungen'));

    expect(await screen.findByText('Spaghetti Carbonara')).toBeInTheDocument();
  });

  test('shows "—" when calcPendingAt is not set', async () => {
    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[
          { id: 'r1', title: 'Gemüsesuppe', naehrwerte: { calcPending: true } },
        ]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Nährwertberechnungen'));

    await screen.findByText('Gemüsesuppe');
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  test('shows recipe id as fallback when title is missing', async () => {
    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[
          { id: 'recipe-42', naehrwerte: { calcPending: true } },
        ]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Nährwertberechnungen'));

    expect(await screen.findByText('recipe-42')).toBeInTheDocument();
  });

  test('shows "Keine aktiven Berechnungen vorhanden." when no pending', async () => {
    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[{ id: 'r1', title: 'Kuchen', naehrwerte: { calcPending: false } }]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Nährwertberechnungen'));

    expect(await screen.findByText('Keine aktiven Berechnungen vorhanden.')).toBeInTheDocument();
  });

  test('shows completed calculations sorted by newest completion date first', async () => {
    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[
          { id: 'r1', title: 'Älteres Rezept', naehrwerte: { calcPending: false, calcCompletedAt: 1710000000000 } },
          { id: 'r2', title: 'Neuestes Rezept', naehrwerte: { calcPending: false, calcCompletedAt: 1720000000000 } },
        ]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Nährwertberechnungen'));

    const openButtons = screen.getAllByRole('button', { name: 'Öffnen' });
    const firstRow = openButtons[0].closest('tr');
    expect(firstRow).toHaveTextContent('Neuestes Rezept');
  });

  test('opens nutrition dialog from completed calculation entry', async () => {
    mockNutritionReferenceState = {
      rows: [{ ingredientID: 'gemuesepfanne', synonyms: ['Gemüsepfanne'] }],
      loading: false,
      reload: jest.fn(),
      lastUpdatedAt: null,
    };

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[
          { id: 'r1', title: 'Gemüsepfanne', naehrwerte: { calcPending: false, calcCompletedAt: 1720000000000 } },
        ]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Nährwertberechnungen'));
    fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }));

    expect(await screen.findByTestId('nutrition-modal-mock')).toBeInTheDocument();
    expect(screen.getByText('Nährwerte Mock Gemüsepfanne')).toBeInTheDocument();
    expect(mockNutritionModalProps).toHaveBeenLastCalledWith(expect.objectContaining({
      onEnsureIngredientIDs: expect.any(Function),
      nutritionReferenceRows: mockNutritionReferenceState.rows,
    }));
  });

  test('shows ingredientID dialog and persists manual selection when modal requests matching', async () => {
    mockNutritionReferenceState = {
      rows: [
        { ingredientID: 'tomate', displayName: 'Tomate', synonyms: ['Tomate'] },
        { ingredientID: 'tomatenmark', displayName: 'Tomatenmark', synonyms: ['Tomate'] },
      ],
      loading: false,
      reload: jest.fn(),
      lastUpdatedAt: null,
    };
    mockGetIngredientIdSuggestions.mockReturnValue([
      { ingredientID: 'tomate', displayName: 'Tomate', confidencePercent: 100 },
      { ingredientID: 'tomatenmark', displayName: 'Tomatenmark', confidencePercent: 100 },
    ]);
    const onUpdateRecipe = jest.fn(() => Promise.resolve());

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[
          {
            id: 'r1',
            title: 'Gemüsepfanne',
            ingredients: [{ type: 'ingredient', text: '1 Tomate' }],
            naehrwerte: { calcPending: false, calcCompletedAt: 1720000000000 },
          },
        ]}
        onUpdateRecipe={onUpdateRecipe}
      />
    );

    fireEvent.click(await screen.findByText('Nährwertberechnungen'));
    fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }));
    fireEvent.click(await screen.findByRole('button', { name: 'IDs prüfen' }));

    expect(await screen.findByRole('dialog', { name: 'ingredientID-Zuordnung' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Neue Zutat' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Zutat ignorieren' })).toBeInTheDocument();

    const selectEl = screen.getByLabelText('ingredientID für 1 Tomate');
    const optionTexts = Array.from(selectEl.options).map((o) => o.textContent);
    const suggestionIdx = optionTexts.findIndex((t) => /Tomate \(100%\)/i.test(t));
    const neueZutatIdx = optionTexts.findIndex((t) => t === 'Neue Zutat');
    const ignoriereIdx = optionTexts.findIndex((t) => t === 'Zutat ignorieren');
    expect(suggestionIdx).toBeLessThan(neueZutatIdx);
    expect(neueZutatIdx).toBeLessThan(ignoriereIdx);

    fireEvent.change(screen.getByLabelText('ingredientID für 1 Tomate'), { target: { value: 'tomate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen & berechnen' }));

    await waitFor(() => expect(onUpdateRecipe).toHaveBeenCalledWith(
      'r1',
      {
        ingredients: [{ type: 'ingredient', text: '1 Tomate', ingredientID: 'tomate' }],
      }
    ));
  });

  test('shows ingredient info panel when info button is clicked', async () => {
    mockNutritionReferenceState = {
      rows: [
        { ingredientID: 'tomate', displayName: 'Tomate', synonyms: ['Tomate'] },
        { ingredientID: 'tomatenmark', displayName: 'Tomatenmark', synonyms: ['Tomate'] },
      ],
      loading: false,
      reload: jest.fn(),
      lastUpdatedAt: null,
    };
    mockGetIngredientIdSuggestions.mockReturnValue([
      { ingredientID: 'tomate', displayName: 'Tomate', confidencePercent: 100 },
      { ingredientID: 'tomatenmark', displayName: 'Tomatenmark', confidencePercent: 100 },
    ]);

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[
          {
            id: 'r-info',
            title: 'Tomatensalat',
            ingredients: [{ type: 'ingredient', text: '200 g Tomaten' }],
            naehrwerte: { calcPending: false, calcCompletedAt: 1720000000000 },
          },
        ]}
        onUpdateRecipe={jest.fn(() => Promise.resolve())}
      />
    );

    fireEvent.click(await screen.findByText('Nährwertberechnungen'));
    fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }));
    fireEvent.click(await screen.findByRole('button', { name: 'IDs prüfen' }));

    expect(await screen.findByRole('dialog', { name: 'ingredientID-Zuordnung' })).toBeInTheDocument();

    const infoBtn = screen.getByRole('button', { name: /Details zur Erkennung/ });
    expect(infoBtn).toBeInTheDocument();
    expect(infoBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(infoBtn);

    expect(infoBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Menge')).toBeInTheDocument();
    expect(screen.getByText('Einheit')).toBeInTheDocument();
    expect(screen.getByText('Zutat')).toBeInTheDocument();
    expect(screen.getByText('Ignoriert')).toBeInTheDocument();

    // clicking again collapses the panel
    fireEvent.click(infoBtn);
    expect(infoBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Menge')).not.toBeInTheDocument();
  });

  test('learns synonyms and units for manual existing ingredientID assignments below 100% confidence', async () => {
    mockNutritionReferenceState = {
      rows: [
        { ingredientID: 'walnuss', displayName: 'Walnuss', synonyms: ['Walnuss'], possibleUnits: ['EL'] },
      ],
      loading: false,
      reload: jest.fn(),
      lastUpdatedAt: null,
    };
    mockGetIngredientIdSuggestions.mockReturnValue([
      { ingredientID: 'walnuss', displayName: 'Walnuss', confidencePercent: 75 },
    ]);
    const onUpdateRecipe = jest.fn(() => Promise.resolve());

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[
          {
            id: 'r-walnuss',
            title: 'Walnussbrot',
            ingredients: [{ type: 'ingredient', text: '50 g Walnüsse' }],
            naehrwerte: { calcPending: false, calcCompletedAt: 1720000000000 },
          },
        ]}
        onUpdateRecipe={onUpdateRecipe}
      />
    );

    fireEvent.click(await screen.findByText('Nährwertberechnungen'));
    fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }));
    fireEvent.click(await screen.findByRole('button', { name: 'IDs prüfen' }));
    mockSetDoc.mockClear();

    fireEvent.change(screen.getByLabelText('ingredientID für 50 g Walnüsse'), { target: { value: 'walnuss' } });
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen & berechnen' }));

    await waitFor(() => expect(onUpdateRecipe).toHaveBeenCalledWith(
      'r-walnuss',
      {
        ingredients: [{ type: 'ingredient', text: '50 g Walnüsse', ingredientID: 'walnuss' }],
      }
    ));
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [, payload, options] = mockSetDoc.mock.calls[0];
    expect(payload).toEqual(expect.objectContaining({
      ingredientID: 'walnuss',
      synonyms: expect.arrayContaining(['Walnuss', 'Walnüsse']),
      normalizedSynonyms: expect.arrayContaining(['walnuss', 'walnuesse']),
      possibleUnits: expect.arrayContaining(['EL', 'g']),
    }));
    expect(options).toEqual({ merge: true });
  });

  test('creates a new pending ingredientID from ambiguous selection via "Neue Zutat"', async () => {
    mockNutritionReferenceState = {
      rows: [
        { ingredientID: 'tomate', displayName: 'Tomate', synonyms: ['Tomate'] },
        { ingredientID: 'tomatenmark', displayName: 'Tomatenmark', synonyms: ['Tomate'] },
      ],
      loading: false,
      reload: jest.fn(),
      lastUpdatedAt: null,
    };
    mockGetIngredientIdSuggestions.mockReturnValue([
      { ingredientID: 'tomate', displayName: 'Tomate', confidencePercent: 100 },
      { ingredientID: 'tomatenmark', displayName: 'Tomatenmark', confidencePercent: 100 },
    ]);
    const onUpdateRecipe = jest.fn(() => Promise.resolve());

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[
          {
            id: 'r-new-ambiguous',
            title: 'Gemüsepfanne',
            ingredients: [{ type: 'ingredient', text: '1 Tomate' }],
            naehrwerte: { calcPending: false, calcCompletedAt: 1720000000000 },
          },
        ]}
        onUpdateRecipe={onUpdateRecipe}
      />
    );

    fireEvent.click(await screen.findByText('Nährwertberechnungen'));
    fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }));
    fireEvent.click(await screen.findByRole('button', { name: 'IDs prüfen' }));
    fireEvent.change(screen.getByLabelText('ingredientID für 1 Tomate'), { target: { value: INGREDIENT_MATCH_CREATE_NEW_OPTION } });
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen & berechnen' }));

    await waitFor(() => expect(onUpdateRecipe).toHaveBeenCalledWith(
      'r-new-ambiguous',
      {
        ingredients: [{ type: 'ingredient', text: '1 Tomate', ingredientID: 'tomate-2' }],
      }
    ));
    expect(mockSetDoc).toHaveBeenCalled();
    expect(mockSetDoc.mock.calls[0][1]).toEqual(expect.objectContaining({
      ingredientID: 'tomate-2',
      status: 'Neu',
    }));
    expect(mockSetDoc.mock.calls[0][2]).toEqual({ merge: true });
  });

  test('creates a new pending ingredientID with status Neu when no match exists', async () => {
    mockNutritionReferenceState = {
      rows: [],
      loading: false,
      reload: jest.fn(),
      lastUpdatedAt: null,
    };
    mockGetIngredientIdSuggestions.mockReturnValue([]);
    const onUpdateRecipe = jest.fn(() => Promise.resolve());

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[
          {
            id: 'r-new',
            title: 'Gemüsepfanne',
            ingredients: [{ type: 'ingredient', text: '1 Prise Sumach' }],
            naehrwerte: { calcPending: false, calcCompletedAt: 1720000000000 },
          },
        ]}
        onUpdateRecipe={onUpdateRecipe}
      />
    );

    fireEvent.click(await screen.findByText('Nährwertberechnungen'));
    fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }));
    fireEvent.click(await screen.findByRole('button', { name: 'IDs prüfen' }));

    await waitFor(() => expect(onUpdateRecipe).toHaveBeenCalledWith(
      'r-new',
      {
        ingredients: [{ type: 'ingredient', text: '1 Prise Sumach', ingredientID: 'sumach' }],
      }
    ));
    expect(screen.queryByRole('dialog', { name: 'ingredientID-Zuordnung' })).not.toBeInTheDocument();
    expect(mockSetDoc).toHaveBeenCalled();
    expect(mockSetDoc.mock.calls[0][1]).toEqual(expect.objectContaining({
      ingredientID: 'sumach',
      displayName: 'Sumach',
      synonyms: ['Sumach'],
      possibleUnits: ['Prise'],
      status: 'Neu',
      source: 'auto-created',
    }));
    expect(mockSetDoc.mock.calls[0][2]).toEqual({ merge: true });
  });

  test('shows warning symbol only for recipes with non-included ingredients', async () => {
    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[
          {
            id: 'r1',
            title: 'Mit Hinweis',
            naehrwerte: {
              calcPending: false,
              calcCompletedAt: 1720000000000,
              calcNotIncluded: [{ ingredient: '1 Prise X', error: 'Nicht gefunden' }],
            },
          },
          {
            id: 'r2',
            title: 'Ohne Hinweis',
            naehrwerte: { calcPending: false, calcCompletedAt: 1710000000000, calcNotIncluded: [] },
          },
        ]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Nährwertberechnungen'));

    const withWarningRow = screen.getByText('Mit Hinweis').closest('tr');
    const withoutWarningRow = screen.getByText('Ohne Hinweis').closest('tr');

    expect(within(withWarningRow).getByLabelText('Enthält nicht einkalkulierte Zutaten')).toBeInTheDocument();
    expect(within(withoutWarningRow).queryByLabelText('Enthält nicht einkalkulierte Zutaten')).not.toBeInTheDocument();
  });

  test('does not show ingredient word context dialog outside missing ingredientID tab', async () => {
    mockNutritionReferenceState = {
      rows: [
        { ingredientID: 'tomate', displayName: 'Tomate', synonyms: ['Tomate'] },
        { ingredientID: 'tomatenmark', displayName: 'Tomatenmark', synonyms: ['Tomate'] },
      ],
      loading: false,
      reload: jest.fn(),
      lastUpdatedAt: null,
    };
    mockGetIngredientIdSuggestions.mockReturnValue([
      { ingredientID: 'tomate', displayName: 'Tomate', confidencePercent: 100 },
      { ingredientID: 'tomatenmark', displayName: 'Tomatenmark', confidencePercent: 100 },
    ]);

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[
          {
            id: 'r1',
            title: 'Gemüsepfanne',
            ingredients: [{ type: 'ingredient', text: '1 frische Tomate' }],
            naehrwerte: { calcPending: false, calcCompletedAt: 1720000000000 },
          },
        ]}
        onUpdateRecipe={jest.fn(() => Promise.resolve())}
      />
    );

    fireEvent.click(await screen.findByText('Nährwertberechnungen'));
    fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }));
    fireEvent.click(await screen.findByRole('button', { name: 'IDs prüfen' }));
    expect(await screen.findByRole('dialog', { name: 'ingredientID-Zuordnung' })).toBeInTheDocument();

    const wordButton = screen.getByRole('button', { name: 'Kontextdialog für "frische"' });
    fireEvent.click(wordButton);

    expect(screen.queryByRole('dialog', { name: /Segmentzuordnung für .*frische.*/ })).not.toBeInTheDocument();
  });

  test('opens recipe detail when recipe name is clicked', async () => {
    const onSelectRecipe = jest.fn();
    const recipe = { id: 'r1', title: 'Kichererbsensalat', naehrwerte: { calcPending: false, calcCompletedAt: 1720000000000 } };

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[recipe]}
        onUpdateRecipe={jest.fn()}
        onSelectRecipe={onSelectRecipe}
      />
    );

    fireEvent.click(await screen.findByText('Nährwertberechnungen'));
    fireEvent.click(screen.getByRole('button', { name: 'Kichererbsensalat' }));

    expect(onSelectRecipe).toHaveBeenCalledWith(recipe);
  });
});

describe('AppCallsPage – Standardeinheiten/-adjektive tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetDoc.mockClear();
    mockSetCustomIngredientMatchingTerms.mockClear();
    mockNutritionReferenceState = { rows: [], loading: false, reload: jest.fn(), lastUpdatedAt: null };
    mockGetIngredientIdSuggestions.mockReset();
    mockGetIngredientIdSuggestions.mockReturnValue([]);
    mockNutritionModalProps.mockReset();
    const {
      getCustomLists,
      getStandardIngredientTerms,
      saveStandardIngredientTerms,
      getCommonAdjectives,
      saveCommonAdjectives,
      getButtonIcons,
      getInspirationListSettings,
    } = require('../utils/customLists');
    getButtonIcons.mockResolvedValue({});
    getCustomLists.mockResolvedValue({
      cuisineTypes: ['Spanisch'],
      cuisineGroups: [],
    });
    getStandardIngredientTerms.mockResolvedValue({
      standardUnits: ['Tasse'],
      standardAdjectives: ['frisch'],
    });
    saveStandardIngredientTerms.mockResolvedValue();
    getCommonAdjectives.mockResolvedValue({
      temperature: ['warm'],
      state: ['frisch'],
      sizing: ['groß'],
      protected: ['weiß'],
    });
    saveCommonAdjectives.mockResolvedValue();
    getInspirationListSettings.mockResolvedValue({
      inspirationListName: 'Inspirationen',
      inspirationListDescription: 'Interaktive Liste',
      inspirationTargetListName: 'Für jeden Tag',
      inspirationTargetListDescription: 'Klassische Liste',
    });
    const { getAppCalls } = require('../utils/appCallsFirestore');
    getAppCalls.mockResolvedValue([]);
    const { getRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecipeCalls.mockResolvedValue([]);
    const { getCuisineProposals } = require('../utils/cuisineProposalsFirestore');
    getCuisineProposals.mockResolvedValue([]);
  });

  test('shows loaded standard terms, applies them in memory, and renders without standalone standard units section', async () => {
    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Standardeinheiten/-adjektive'));

    expect(screen.queryByText('Standard-Einheiten')).not.toBeInTheDocument();
    expect(screen.getByText('Temperatur')).toBeInTheDocument();
    expect(screen.getByText('Zustand')).toBeInTheDocument();
    expect(screen.getByText('Größe')).toBeInTheDocument();
    expect(screen.getByText('Geschützt')).toBeInTheDocument();
    expect(screen.queryByText('Standard-Einheitengruppen')).not.toBeInTheDocument();
    expect(screen.queryByText('Einheiten nach Kategorien für das ingredientID-Matching. Diese Einheiten werden automatisch erkannt und ignoriert.')).not.toBeInTheDocument();
    expect(screen.getByText('frisch')).toBeInTheDocument();
    expect(mockSetCustomIngredientMatchingTerms).toHaveBeenCalledWith({
      units: ['Tasse'],
      adjectives: ['frisch'],
    });
    expect(screen.queryByRole('button', { name: 'Jetzt deployen' })).not.toBeInTheDocument();
  });

  test('renders grouped common adjectives and persists add/remove per group', async () => {
    const { saveCommonAdjectives } = require('../utils/customLists');

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Standardeinheiten/-adjektive'));

    const temperaturSection = screen.getByText('Temperatur').closest('.settings-section');
    const geschuetztSection = screen.getByText('Geschützt').closest('.settings-section');
    expect(temperaturSection).toBeTruthy();
    expect(geschuetztSection).toBeTruthy();

    fireEvent.change(within(temperaturSection).getByPlaceholderText('Neues Adjektiv für Temperatur hinzufügen...'), {
      target: { value: 'heiß' },
    });
    fireEvent.click(within(temperaturSection).getByRole('button', { name: 'Hinzufügen' }));

    await waitFor(() => expect(saveCommonAdjectives).toHaveBeenCalledWith(
      {
        temperature: ['warm', 'heiß'],
        state: ['frisch'],
        sizing: ['groß'],
        protected: ['weiß'],
      },
      adminUser.id,
    ));

    fireEvent.click(within(geschuetztSection).getByTitle('Entfernen'));
    await waitFor(() => expect(saveCommonAdjectives).toHaveBeenLastCalledWith(
      {
        temperature: ['warm', 'heiß'],
        state: ['frisch'],
        sizing: ['groß'],
        protected: [],
      },
      adminUser.id,
    ));
  });

  test('uses default standard terms as fallback when loading fails', async () => {
    const { getStandardIngredientTerms, getCommonAdjectives } = require('../utils/customLists');
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    getStandardIngredientTerms.mockRejectedValue(new Error('Firestore down'));
    getCommonAdjectives.mockResolvedValue({ temperature: [], state: [], sizing: [], protected: [] });

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Standardeinheiten/-adjektive'));

    expect(screen.queryByText('Standard-Einheiten')).not.toBeInTheDocument();
    expect(screen.getByText('Temperatur')).toBeInTheDocument();
    expect(screen.queryByText('Standard-Einheitengruppen')).not.toBeInTheDocument();
    await waitFor(() => expect(mockSetCustomIngredientMatchingTerms).toHaveBeenCalledWith({
      units: ['g', 'kg'],
      adjectives: ['frisch', 'warm'],
    }));
    expect(errorSpy).toHaveBeenCalledWith(
      'Error loading standard ingredient terms:',
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });

  test('uses list-input/list-items layout for standard unit groups and persists group updates', async () => {
    const { getCommonUnits, saveCommonUnits } = require('../utils/customLists');
    getCommonUnits.mockResolvedValue({
      volume: ['ml'],
      kitchenSize: ['Esslöffel'],
      weight: ['g'],
      dimension: ['cm'],
    });

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Standardeinheiten/-adjektive'));

    const volumenSection = screen.getByText('Volumen').closest('.standard-terms-group-section');
    expect(volumenSection).toBeTruthy();
    expect(volumenSection.querySelector('.list-input')).toBeTruthy();
    expect(volumenSection.querySelector('.list-items')).toBeTruthy();

    fireEvent.change(within(volumenSection).getByPlaceholderText('Volumen hinzufügen...'), {
      target: { value: 'dl' },
    });
    fireEvent.click(within(volumenSection).getByRole('button', { name: 'Hinzufügen' }));

    await waitFor(() => expect(saveCommonUnits).toHaveBeenCalledWith(
      {
        volume: ['ml', 'dl'],
        kitchenSize: ['Esslöffel'],
        weight: ['g'],
        dimension: ['cm'],
      },
      adminUser.id,
    ));
  });
});

describe('AppCallsPage – Kochateliereinstellungen tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNutritionReferenceState = { rows: [], loading: false, reload: jest.fn(), lastUpdatedAt: null };
    mockGetIngredientIdSuggestions.mockReset();
    mockGetIngredientIdSuggestions.mockReturnValue([]);
    mockNutritionModalProps.mockReset();
    const { getCustomLists, getButtonIcons, getInspirationListSettings } = require('../utils/customLists');
    getButtonIcons.mockResolvedValue({});
    getCustomLists.mockResolvedValue({ cuisineTypes: [], cuisineGroups: [] });
    getInspirationListSettings.mockResolvedValue({
      inspirationListName: 'Inspirationen',
      inspirationListDescription: 'Interaktive Beschreibung',
      inspirationTargetListName: 'Für jeden Tag',
      inspirationTargetListDescription: 'Klassische Beschreibung',
    });
    const { getAppCalls } = require('../utils/appCallsFirestore');
    getAppCalls.mockResolvedValue([]);
    const { getRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecipeCalls.mockResolvedValue([]);
    const { getCuisineProposals } = require('../utils/cuisineProposalsFirestore');
    getCuisineProposals.mockResolvedValue([]);
  });

  test('shows kochateliereinstellungen tab with multiline description fields', async () => {
    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Kochateliereinstellungen'));

    const nameFields = await screen.findAllByLabelText('Name:');
    expect(nameFields).toHaveLength(2);
    const descriptionFields = screen.getAllByLabelText('Beschreibung:');
    expect(descriptionFields).toHaveLength(2);
    descriptionFields.forEach((field) => {
      expect(field.tagName).toBe('TEXTAREA');
    });
    expect(screen.getByDisplayValue('Inspirationen')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Für jeden Tag')).toBeInTheDocument();
  });

  test('saves kochateliereinstellungen values', async () => {
    const { saveInspirationListSettings } = require('../utils/customLists');

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Kochateliereinstellungen'));

    fireEvent.change(screen.getByDisplayValue('Inspirationen'), { target: { value: 'Neue Inspirationen' } });
    fireEvent.change(screen.getByDisplayValue('Interaktive Beschreibung'), { target: { value: 'Mehrzeilige Interaktivbeschreibung' } });
    fireEvent.change(screen.getByDisplayValue('Für jeden Tag'), { target: { value: 'Wochenplanung' } });
    fireEvent.change(screen.getByDisplayValue('Klassische Beschreibung'), { target: { value: 'Mehrzeilige Zielbeschreibung' } });

    fireEvent.click(screen.getByRole('button', { name: 'Kochateliereinstellungen speichern' }));

    await waitFor(() => expect(saveInspirationListSettings).toHaveBeenCalledWith({
      inspirationListName: 'Neue Inspirationen',
      inspirationListDescription: 'Mehrzeilige Interaktivbeschreibung',
      inspirationTargetListName: 'Wochenplanung',
      inspirationTargetListDescription: 'Mehrzeilige Zielbeschreibung',
    }));
  });

  test('persists kochateliereinstellungen on blur for all fields', async () => {
    const { saveInspirationListSettings } = require('../utils/customLists');

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Kochateliereinstellungen'));

    const updates = [
      {
        previousValue: 'Inspirationen',
        nextValue: 'Neue Inspirationen Auto',
        expectedPayload: {
          inspirationListName: 'Neue Inspirationen Auto',
          inspirationListDescription: 'Interaktive Beschreibung',
          inspirationTargetListName: 'Für jeden Tag',
          inspirationTargetListDescription: 'Klassische Beschreibung',
        },
      },
      {
        previousValue: 'Interaktive Beschreibung',
        nextValue: 'Neue Interaktivbeschreibung Auto',
        expectedPayload: {
          inspirationListName: 'Neue Inspirationen Auto',
          inspirationListDescription: 'Neue Interaktivbeschreibung Auto',
          inspirationTargetListName: 'Für jeden Tag',
          inspirationTargetListDescription: 'Klassische Beschreibung',
        },
      },
      {
        previousValue: 'Für jeden Tag',
        nextValue: 'Wochenplanung Auto',
        expectedPayload: {
          inspirationListName: 'Neue Inspirationen Auto',
          inspirationListDescription: 'Neue Interaktivbeschreibung Auto',
          inspirationTargetListName: 'Wochenplanung Auto',
          inspirationTargetListDescription: 'Klassische Beschreibung',
        },
      },
      {
        previousValue: 'Klassische Beschreibung',
        nextValue: 'Neue Zielbeschreibung Auto',
        expectedPayload: {
          inspirationListName: 'Neue Inspirationen Auto',
          inspirationListDescription: 'Neue Interaktivbeschreibung Auto',
          inspirationTargetListName: 'Wochenplanung Auto',
          inspirationTargetListDescription: 'Neue Zielbeschreibung Auto',
        },
      },
    ];

    for (const { previousValue, nextValue, expectedPayload } of updates) {
      const field = screen.getByDisplayValue(previousValue);
      fireEvent.change(field, { target: { value: nextValue } });
      fireEvent.blur(field);

      await waitFor(() => expect(saveInspirationListSettings).toHaveBeenLastCalledWith(expectedPayload));
    }
  });

  test('moderator can save kochateliereinstellungen values', async () => {
    const { saveInspirationListSettings } = require('../utils/customLists');

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={moderatorUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Kochateliereinstellungen'));

    fireEvent.change(screen.getByDisplayValue('Inspirationen'), { target: { value: 'Moderierte Inspirationen' } });
    fireEvent.change(screen.getByDisplayValue('Interaktive Beschreibung'), { target: { value: 'Beschreibung durch Moderator' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kochateliereinstellungen speichern' }));

    await waitFor(() => expect(saveInspirationListSettings).toHaveBeenCalledWith({
      inspirationListName: 'Moderierte Inspirationen',
      inspirationListDescription: 'Beschreibung durch Moderator',
      inspirationTargetListName: 'Für jeden Tag',
      inspirationTargetListDescription: 'Klassische Beschreibung',
    }));
  });

  test('non admin/moderator cannot edit kochateliereinstellungen', async () => {
    const { saveInspirationListSettings } = require('../utils/customLists');
    const editUser = {
      id: 'edit-1',
      vorname: 'Edit',
      nachname: 'User',
      email: 'edit@example.com',
      isAdmin: false,
      role: 'edit',
      appCalls: true,
    };

    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={editUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByText('Kochateliereinstellungen'));

    const saveButton = screen.getByRole('button', { name: 'Kochateliereinstellungen speichern' });
    expect(saveButton).toBeDisabled();
    expect(screen.getByDisplayValue('Inspirationen')).toBeDisabled();
    expect(screen.getByDisplayValue('Interaktive Beschreibung')).toBeDisabled();

    fireEvent.click(saveButton);
    await waitFor(() => expect(saveInspirationListSettings).not.toHaveBeenCalled());
  });
});

describe('AppCallsPage – Benjamin Rousselli filter', () => {
  const benjaminCall = {
    id: 'call-benjamin',
    userVorname: 'Benjamin',
    userNachname: 'Rousselli',
    userEmail: 'benjamin@example.com',
    isGuest: false,
    timestamp: null,
  };
  const otherCall = {
    id: 'call-other',
    userVorname: 'Max',
    userNachname: 'Mustermann',
    userEmail: 'max@example.com',
    isGuest: false,
    timestamp: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockNutritionReferenceState = { rows: [], loading: false, reload: jest.fn(), lastUpdatedAt: null };
    mockGetIngredientIdSuggestions.mockReset();
    mockGetIngredientIdSuggestions.mockReturnValue([]);
    mockNutritionModalProps.mockReset();
    const { getCustomLists, getButtonIcons, getInspirationListSettings } = require('../utils/customLists');
    getButtonIcons.mockResolvedValue({});
    getCustomLists.mockResolvedValue({ cuisineTypes: [], cuisineGroups: [] });
    getInspirationListSettings.mockResolvedValue({
      inspirationListName: 'Inspirationen',
      inspirationListDescription: '',
      inspirationTargetListName: 'Für jeden Tag',
      inspirationTargetListDescription: '',
    });
    const { getAppCalls } = require('../utils/appCallsFirestore');
    getAppCalls.mockResolvedValue([benjaminCall, otherCall]);
    const { getRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecipeCalls.mockResolvedValue([]);
    const { getCuisineProposals } = require('../utils/cuisineProposalsFirestore');
    getCuisineProposals.mockResolvedValue([]);
  });

  test('filter checkbox is present on App-Aufrufe tab', async () => {
    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    expect(await screen.findByLabelText('Benjamin Rousselli ausblenden')).toBeInTheDocument();
  });

  test('filter is checked by default and hides Benjamin Rousselli entries', async () => {
    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    const checkbox = await screen.findByLabelText('Benjamin Rousselli ausblenden');
    expect(checkbox).toBeChecked();
    expect(screen.queryByText('Rousselli')).not.toBeInTheDocument();
    expect(screen.getByText('Mustermann')).toBeInTheDocument();
  });

  test('unchecking the filter shows Benjamin Rousselli entries', async () => {
    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    const checkbox = await screen.findByLabelText('Benjamin Rousselli ausblenden');
    fireEvent.click(checkbox);

    expect(screen.getByText('Rousselli')).toBeInTheDocument();
    expect(screen.getByText('Mustermann')).toBeInTheDocument();
  });

  test('stats show filtered count when filter is active', async () => {
    render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    await screen.findByLabelText('Benjamin Rousselli ausblenden');
    expect(screen.getByText(/von 2 Einträgen \(gefiltert\)/)).toBeInTheDocument();
  });

  test('stats show total count when filter is inactive', async () => {
    const { container } = render(
      <AppCallsPage
        onBack={jest.fn()}
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
      />
    );

    const checkbox = await screen.findByLabelText('Benjamin Rousselli ausblenden');
    fireEvent.click(checkbox);

    const stats = container.querySelector('.app-calls-stats');
    expect(stats.textContent).toMatch(/2/);
    expect(stats.textContent).not.toMatch(/gefiltert/);
  });
});

describe('AppCallsPage – Fehlende Zutaten-IDs tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNutritionReferenceState = { rows: [], loading: false, reload: jest.fn(), lastUpdatedAt: null };
    mockGetIngredientIdSuggestions.mockReset();
    mockGetIngredientIdSuggestions.mockReturnValue([]);
    mockNutritionModalProps.mockReset();
    const { getCustomLists, getButtonIcons, getInspirationListSettings } = require('../utils/customLists');
    getButtonIcons.mockResolvedValue({});
    getCustomLists.mockResolvedValue({ cuisineTypes: [], cuisineGroups: [] });
    getInspirationListSettings.mockResolvedValue({
      inspirationListName: 'Inspirationen',
      inspirationListDescription: 'Interaktive Liste',
      inspirationTargetListName: 'Für jeden Tag',
      inspirationTargetListDescription: 'Klassische Liste',
    });
    const { getAppCalls } = require('../utils/appCallsFirestore');
    getAppCalls.mockResolvedValue([]);
    const { getRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecipeCalls.mockResolvedValue([]);
    const { getCuisineProposals } = require('../utils/cuisineProposalsFirestore');
    getCuisineProposals.mockResolvedValue([]);
  });

  test('tab button is present', async () => {
    render(<AppCallsPage currentUser={adminUser} recipes={[]} onUpdateRecipe={jest.fn()} />);
    expect(await screen.findByRole('button', { name: 'Fehlende Zutaten-IDs' })).toBeInTheDocument();
  });

  test('shows empty state when all ingredients have IDs', async () => {
    const recipes = [
      { id: 'r1', title: 'Pasta', ingredients: [{ type: 'ingredient', text: '200 g Nudeln', ingredientID: 'nudel' }] },
    ];
    render(<AppCallsPage currentUser={adminUser} recipes={recipes} onUpdateRecipe={jest.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Fehlende Zutaten-IDs' }));
    expect(await screen.findByText('Alle Zutaten haben bereits eine ingredientID.')).toBeInTheDocument();
  });

  test('clears nutrition reference cache and shows success feedback', async () => {
    const reload = jest.fn(() => Promise.resolve([]));
    mockNutritionReferenceState = { rows: [], loading: false, reload, lastUpdatedAt: null };

    render(<AppCallsPage currentUser={adminUser} recipes={[]} onUpdateRecipe={jest.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Fehlende Zutaten-IDs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cache leeren' }));

    await waitFor(() => {
      expect(reload).toHaveBeenCalledWith({ throwOnError: true });
    });
    expect(await screen.findByRole('status')).toHaveTextContent('nutritionReferences-Cache wurde geleert und neu geladen.');
  });

  test('shows an error message when clearing nutrition reference cache fails', async () => {
    const reload = jest.fn(() => Promise.reject(new Error('Netzwerkfehler')));
    mockNutritionReferenceState = { rows: [], loading: false, reload, lastUpdatedAt: null };

    render(<AppCallsPage currentUser={adminUser} recipes={[]} onUpdateRecipe={jest.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Fehlende Zutaten-IDs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cache leeren' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Fehler beim Leeren des nutritionReferences-Caches: Netzwerkfehler');
  });

  test('lists recipes with missing ingredient IDs', async () => {
    const recipes = [
      {
        id: 'r1',
        title: 'Tomatensuppe',
        ingredients: [
          { type: 'ingredient', text: '200 g Tomaten' },
          { type: 'ingredient', text: '1 Zwiebel', ingredientID: 'zwiebel' },
        ],
      },
      {
        id: 'r2',
        title: 'Salat',
        ingredients: [{ type: 'ingredient', text: '100 g Salat', ingredientID: 'salat' }],
      },
    ];
    render(<AppCallsPage currentUser={adminUser} recipes={recipes} onUpdateRecipe={jest.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Fehlende Zutaten-IDs' }));

    expect(await screen.findByText('Tomatensuppe')).toBeInTheDocument();
    expect(screen.queryByText('Salat')).not.toBeInTheDocument();
  });

  test('ignores recipes where missing IDs are only linked recipe ingredients', async () => {
    const recipes = [
      {
        id: 'r1',
        title: 'Mit Verlinkung',
        ingredients: [{ type: 'ingredient', text: '#recipe:linked123:Tomatensoße' }],
      },
      {
        id: 'r2',
        title: 'Mit fehlender ID',
        ingredients: [{ type: 'ingredient', text: '200 g Tomaten' }],
      },
    ];
    render(<AppCallsPage currentUser={adminUser} recipes={recipes} onUpdateRecipe={jest.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Fehlende Zutaten-IDs' }));

    expect(await screen.findByText('Mit fehlender ID')).toBeInTheDocument();
    expect(screen.queryByText('Mit Verlinkung')).not.toBeInTheDocument();
  });

  test('shows "IDs zuordnen" button for each recipe with missing IDs', async () => {
    const recipes = [
      { id: 'r1', title: 'Tomatensuppe', ingredients: [{ type: 'ingredient', text: '200 g Tomaten' }] },
    ];
    render(<AppCallsPage currentUser={adminUser} recipes={recipes} onUpdateRecipe={jest.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Fehlende Zutaten-IDs' }));
    expect(await screen.findByRole('button', { name: 'IDs zuordnen' })).toBeInTheDocument();
  });

  test('opens recipe detail when recipe title is clicked', async () => {
    const onSelectRecipe = jest.fn();
    const recipe = { id: 'r1', title: 'Tomatensuppe', ingredients: [{ type: 'ingredient', text: '200 g Tomaten' }] };
    render(
      <AppCallsPage
        currentUser={adminUser}
        recipes={[recipe]}
        onUpdateRecipe={jest.fn()}
        onSelectRecipe={onSelectRecipe}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Fehlende Zutaten-IDs' }));
    fireEvent.click(await screen.findByText('Tomatensuppe'));
    expect(onSelectRecipe).toHaveBeenCalledWith(recipe);
  });

  test('shows stats with correct recipe count', async () => {
    const recipes = [
      { id: 'r1', title: 'Tomatensuppe', ingredients: [{ type: 'ingredient', text: '200 g Tomaten' }] },
      { id: 'r2', title: 'Zwiebelsuppe', ingredients: [{ type: 'ingredient', text: '2 Zwiebeln' }] },
    ];
    const { container } = render(
      <AppCallsPage currentUser={adminUser} recipes={recipes} onUpdateRecipe={jest.fn()} />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Fehlende Zutaten-IDs' }));
    await screen.findByText('Tomatensuppe');

    const stats = container.querySelector('.app-calls-stats');
    expect(stats.textContent).toMatch(/2/);
    expect(stats.textContent).toMatch(/Rezepte/);
  });

  test('click on ingredient word allows assigning standard unit segment on missing ingredientID page', async () => {
    const { saveStandardIngredientTerms } = require('../utils/customLists');
    mockNutritionReferenceState = {
      rows: [
        { ingredientID: 'tomate', displayName: 'Tomate', synonyms: ['Tomate'] },
        { ingredientID: 'tomatenmark', displayName: 'Tomatenmark', synonyms: ['Tomate'] },
      ],
      loading: false,
      reload: jest.fn(),
      lastUpdatedAt: null,
    };
    mockGetIngredientIdSuggestions.mockReturnValue([
      { ingredientID: 'tomate', displayName: 'Tomate', confidencePercent: 100 },
      { ingredientID: 'tomatenmark', displayName: 'Tomatenmark', confidencePercent: 100 },
    ]);

    render(
      <AppCallsPage
        currentUser={adminUser}
        recipes={[{ id: 'r1', title: 'Suppe', ingredients: [{ type: 'ingredient', text: '1 frische Tomate' }] }]}
        onUpdateRecipe={jest.fn(() => Promise.resolve())}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Fehlende Zutaten-IDs' }));
    fireEvent.click(await screen.findByRole('button', { name: 'IDs zuordnen' }));
    expect(await screen.findByRole('dialog', { name: 'ingredientID-Zuordnung' })).toBeInTheDocument();

    const wordButton = screen.getByRole('button', { name: 'Kontextdialog für "frische"' });
    fireEvent.click(wordButton);
    expect(await screen.findByRole('dialog', { name: /Segmentzuordnung für .*frische.*/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zuweisen' }));

    await waitFor(() => expect(saveStandardIngredientTerms).toHaveBeenCalled());
    const [savedUnits, savedAdjectives, savedUserId] = saveStandardIngredientTerms.mock.calls.at(-1);
    expect(savedUnits).toContain('frische');
    expect(savedAdjectives).toEqual(expect.any(Array));
    expect(savedUserId).toBe(adminUser.id);
  });

  test('context dialog standard adjective option stores declension forms', async () => {
    const { saveStandardIngredientTerms } = require('../utils/customLists');
    mockNutritionReferenceState = {
      rows: [
        { ingredientID: 'tomate', displayName: 'Tomate', synonyms: ['Tomate'] },
        { ingredientID: 'tomatenmark', displayName: 'Tomatenmark', synonyms: ['Tomate'] },
      ],
      loading: false,
      reload: jest.fn(),
      lastUpdatedAt: null,
    };
    mockGetIngredientIdSuggestions.mockReturnValue([
      { ingredientID: 'tomate', displayName: 'Tomate', confidencePercent: 100 },
      { ingredientID: 'tomatenmark', displayName: 'Tomatenmark', confidencePercent: 100 },
    ]);

    render(
      <AppCallsPage
        currentUser={adminUser}
        recipes={[{ id: 'r1', title: 'Suppe', ingredients: [{ type: 'ingredient', text: '1 frischen Tomate' }] }]}
        onUpdateRecipe={jest.fn(() => Promise.resolve())}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Fehlende Zutaten-IDs' }));
    fireEvent.click(await screen.findByRole('button', { name: 'IDs zuordnen' }));
    expect(await screen.findByRole('dialog', { name: 'ingredientID-Zuordnung' })).toBeInTheDocument();

    const wordButton = screen.getByRole('button', { name: 'Kontextdialog für "frischen"' });
    fireEvent.click(wordButton);
    expect(await screen.findByRole('dialog', { name: /Segmentzuordnung für .*frischen.*/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Zielsegment' }), {
      target: { value: 'standardAdjectives' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Zuweisen' }));

    await waitFor(() => expect(saveStandardIngredientTerms).toHaveBeenCalled());
    const [savedUnits, savedAdjectives, savedUserId] = saveStandardIngredientTerms.mock.calls.at(-1);
    expect(savedUnits).toEqual(expect.any(Array));
    expect(savedAdjectives).toEqual(expect.arrayContaining([
      'frisch',
      'frische',
      'frischen',
      'frischem',
      'frischer',
      'frisches',
    ]));
    expect(savedUserId).toBe(adminUser.id);
  });
});

describe('AppCallsPage – tab preservation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNutritionReferenceState = { rows: [], loading: false, reload: jest.fn(), lastUpdatedAt: null };
    mockGetIngredientIdSuggestions.mockReset();
    mockGetIngredientIdSuggestions.mockReturnValue([]);
    const { getCustomLists, getButtonIcons, getInspirationListSettings } = require('../utils/customLists');
    const { getCuisineProposals } = require('../utils/cuisineProposalsFirestore');
    const { getAppCalls } = require('../utils/appCallsFirestore');
    const { getRecipeCalls } = require('../utils/recipeCallsFirestore');
    getButtonIcons.mockResolvedValue({});
    getCustomLists.mockResolvedValue({ cuisineTypes: [], cuisineGroups: [] });
    getCuisineProposals.mockResolvedValue([]);
    getAppCalls.mockResolvedValue([]);
    getRecipeCalls.mockResolvedValue([]);
    getInspirationListSettings.mockResolvedValue({
      inspirationListName: 'Inspirationen',
      inspirationListDescription: '',
      inspirationTargetListName: 'Für jeden Tag',
      inspirationTargetListDescription: '',
    });
  });

  test('renders with the tab specified by activeTab prop', async () => {
    render(
      <AppCallsPage
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
        activeTab="kulinariktypen"
      />
    );

    await waitFor(() => {
      const kulinarikBtn = screen.getByRole('button', { name: 'Kulinariktypen' });
      expect(kulinarikBtn.className).toContain('active');
    });
  });

  test('calls onActiveTabChange when a tab is switched', async () => {
    const onActiveTabChange = jest.fn();
    render(
      <AppCallsPage
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
        activeTab="app"
        onActiveTabChange={onActiveTabChange}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Rezeptaufrufe' }));
    expect(onActiveTabChange).toHaveBeenCalledWith('recipe');
  });

  test('restores active tab when remounted with preserved activeTab prop', async () => {
    const onActiveTabChange = jest.fn();
    const { unmount } = render(
      <AppCallsPage
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
        activeTab="naehrwert"
        onActiveTabChange={onActiveTabChange}
      />
    );

    // Verify the Nährwertberechnungen tab is active
    await waitFor(() => {
      const naehrwertBtn = screen.getByRole('button', { name: 'Nährwertberechnungen' });
      expect(naehrwertBtn.className).toContain('active');
    });

    // Simulate unmount (e.g. user opens a recipe) and remount with preserved tab
    unmount();

    render(
      <AppCallsPage
        currentUser={adminUser}
        recipes={[]}
        onUpdateRecipe={jest.fn()}
        activeTab="naehrwert"
        onActiveTabChange={onActiveTabChange}
      />
    );

    // After remount the same tab should still be active
    await waitFor(() => {
      const naehrwertBtn = screen.getByRole('button', { name: 'Nährwertberechnungen' });
      expect(naehrwertBtn.className).toContain('active');
    });
  });
});
