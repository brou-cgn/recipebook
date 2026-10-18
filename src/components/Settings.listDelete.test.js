import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Settings from './Settings';
import * as customLists from '../utils/customLists';
import { getRolePermissions } from '../utils/userManagement';
import { subscribeToFaqs } from '../utils/faqFirestore';
import { getOnboardingTestmodeActive } from '../utils/onboardingSettings';

jest.mock('../firebase', () => ({ db: {}, auth: {}, functions: {}, storage: {} }));
jest.mock('../utils/customLists');
jest.mock('../utils/onboardingSettings');
jest.mock('../utils/categoryImages');
jest.mock('../utils/userManagement', () => ({
  ROLES: { ADMIN: 'admin', MODERATOR: 'moderator', EDIT: 'edit', READ: 'read' },
  isCurrentUserAdmin: () => true,
  getRolePermissions: jest.fn(() => Promise.resolve({})),
  canManageSeasonMatrix: () => false,
  canManageDrinkWeights: () => false,
}));
jest.mock('../utils/faqFirestore', () => ({
  addFaq: jest.fn(), updateFaq: jest.fn(), deleteFaq: jest.fn(),
  subscribeToFaqs: jest.fn(() => () => {}),
  importFaqsFromMarkdown: jest.fn(),
}));
jest.mock('../utils/storageUtils', () => ({
  uploadAppLogoToStorage: jest.fn(), deleteAppLogoFromStorage: jest.fn(),
}));
jest.mock('../utils/faviconUtils', () => ({ applyFaviconSettings: jest.fn() }));
jest.mock('../utils/ingredientUtils', () => ({ invalidateUnitsCache: jest.fn() }));
jest.mock('../utils/recipeKeywordsCsv', () => ({ downloadRecipesKeywordCsv: jest.fn() }));
jest.mock('./UserManagement', () => () => null);
jest.mock('./PrintFormatsSettings', () => () => null);
jest.mock('./SeasonMatrixTab', () => () => null);
jest.mock('./NutritionReferenceTab', () => () => null);
jest.mock('./DrinkWeightsTab', () => () => null);
jest.mock('./ButtonIconsAdminTab', () => () => null);
jest.mock('./DiscoverTopicsTab', () => () => null);

const LISTS = {
  cuisineTypes: ['Italienisch', 'Spanisch', 'Thai'],
  cuisineGroups: [{ name: 'Südeuropa', children: ['Italienisch', 'Spanisch'] }],
  mealCategories: ['Hauptgericht', 'Dessert'],
  units: [],
  portionUnits: [],
  packageUnits: [],
  drinkUnits: [],
  conversionTable: [
    { id: 'mehl-tl', ingredient: 'Mehl', unit: 'TL', grams: '3', milliliters: '' },
    { id: 'zucker-el', ingredient: 'Zucker', unit: 'EL', grams: '12', milliliters: '' },
  ],
};

beforeEach(() => {
  getRolePermissions.mockResolvedValue({});
  subscribeToFaqs.mockImplementation(() => () => {});
  getOnboardingTestmodeActive.mockResolvedValue(false);
  customLists.getCustomLists.mockResolvedValue(JSON.parse(JSON.stringify(LISTS)));
  customLists.getSortSettings.mockResolvedValue({});
  customLists.getStatusValiditySettings.mockResolvedValue({});
  customLists.getGroupStatusThresholds.mockResolvedValue({});
  customLists.getInspirationListSettings.mockResolvedValue({});
  customLists.getAIRecipePromptHistory.mockResolvedValue([]);
  customLists.getButtonIcons.mockResolvedValue({});
});

const adminUser = { id: 'u1', role: 'admin' };

async function openListsTab() {
  render(<Settings onBack={jest.fn()} currentUser={adminUser} allUsers={[]} allRecipes={[]} onUpdateRecipe={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /Listen/ }));
  await screen.findByRole('button', { name: 'Thai entfernen' });
}

const typeNames = () => Array.from(document.querySelectorAll('.list-item > span')).map((el) => el.textContent);

describe('Settings – Listen: Löschen mit Rückgängig (Tech-Check D1)', () => {
  test('Kulinarik-Typ verschwindet sofort und kommt mit Rückgängig an alter Stelle samt Gruppenzuordnung zurück', async () => {
    await openListsTab();
    const before = typeNames();
    const index = before.indexOf('Spanisch');
    expect(index).toBeGreaterThanOrEqual(0);

    fireEvent.click(screen.getByRole('button', { name: 'Spanisch entfernen' }));
    expect(typeNames()).not.toContain('Spanisch');
    expect(screen.getByText(/„Spanisch" entfernt/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Spanisch aus Südeuropa entfernen' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(typeNames()[index]).toBe('Spanisch');
    expect(screen.getByRole('button', { name: 'Spanisch aus Südeuropa entfernen' })).toBeInTheDocument();
  });

  test('Kulinarik-Gruppe und Untertyp lassen sich entfernen und zurückholen', async () => {
    await openListsTab();

    fireEvent.click(screen.getByRole('button', { name: 'Italienisch aus Südeuropa entfernen' }));
    expect(screen.queryByRole('button', { name: 'Italienisch aus Südeuropa entfernen' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(screen.getByRole('button', { name: 'Italienisch aus Südeuropa entfernen' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Südeuropa entfernen' }));
    expect(screen.queryByRole('button', { name: 'Südeuropa entfernen' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(screen.getByRole('button', { name: 'Südeuropa entfernen' })).toBeInTheDocument();
  });

  test('Speisekategorie entfernen und zurückholen', async () => {
    await openListsTab();
    fireEvent.click(screen.getByRole('button', { name: 'Dessert entfernen' }));
    expect(screen.queryByRole('button', { name: 'Dessert entfernen' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(screen.getByRole('button', { name: 'Dessert entfernen' })).toBeInTheDocument();
  });
});
