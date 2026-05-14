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

describe('AppCallsPage – Kulinariktypen release with rename', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getCustomLists, saveCustomLists, getButtonIcons } = require('../utils/customLists');
    getButtonIcons.mockResolvedValue({});
    getCustomLists.mockResolvedValue({
      cuisineTypes: ['Spanisch', 'Italienisch'],
      cuisineGroups: [],
    });
    saveCustomLists.mockResolvedValue();
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
    const { getCustomLists, saveCustomLists, getButtonIcons } = require('../utils/customLists');
    getButtonIcons.mockResolvedValue({});
    getCustomLists.mockResolvedValue({
      cuisineTypes: ['Spanisch', 'Italienisch'],
      cuisineGroups: [{ name: 'Europäisch', children: ['Spanisch'] }],
    });
    saveCustomLists.mockResolvedValue();
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
