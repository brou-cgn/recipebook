import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AppCallsPage from './AppCallsPage';

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
  getCustomLists: jest.fn(() =>
    Promise.resolve({ cuisineTypes: ['Spanisch', 'Italienisch'], cuisineGroups: [] })
  ),
  saveCustomLists: jest.fn(() => Promise.resolve()),
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
});

describe('AppCallsPage – Kochateliereinstellungen tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
