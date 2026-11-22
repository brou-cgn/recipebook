import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  cuisineTypes: [], cuisineGroups: [], mealCategories: [], units: [], portionUnits: [],
  packageUnits: [], drinkUnits: [], conversionTable: [],
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
  customLists.getHeaderSlogan.mockResolvedValue('Kochen mit Freunden');
  customLists.getSloganUebersetzungen.mockResolvedValue({ quelle: 'Kochen mit Freunden', en: 'Cooking with friends' });
  customLists.saveSloganUebersetzungen.mockResolvedValue();
  customLists.saveCustomLists.mockResolvedValue();
});

const zeige = async () => {
  render(<Settings onBack={jest.fn()} currentUser={{ id: 'u1', role: 'admin' }} allUsers={[]} allRecipes={[]} onUpdateRecipe={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('Englisch')).toHaveValue('Cooking with friends'));
};
const speichern = () => fireEvent.click(screen.getAllByRole('button', { name: 'Einstellungen speichern' })[0]);

describe('Settings – Übersetzungen des Header-Slogans (Mehrsprachigkeit)', () => {
  test('speichert neue Übersetzungen zum aktuellen Slogan', async () => {
    await zeige();
    fireEvent.change(screen.getByLabelText('Französisch'), { target: { value: ' Cuisiner entre amis ' } });
    speichern();
    await waitFor(() => expect(customLists.saveSloganUebersetzungen).toHaveBeenCalledWith({
      quelle: 'Kochen mit Freunden', en: 'Cooking with friends', fr: 'Cuisiner entre amis',
    }));
  });

  test('nach einer Änderung des Slogans gelten die Übersetzungen als veraltet, bis sie bestätigt sind', async () => {
    await zeige();
    expect(screen.queryByText(/gehören zum bisherigen Slogan/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Header-Slogan'), { target: { value: 'Kochen mit der Familie' } });
    expect(screen.getByText(/gehören zum bisherigen Slogan „Kochen mit Freunden“/)).toBeInTheDocument();

    speichern();
    await waitFor(() => expect(customLists.saveSloganUebersetzungen).toHaveBeenLastCalledWith({
      quelle: 'Kochen mit Freunden', en: 'Cooking with friends',
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Übersetzungen passen weiterhin' }));
    expect(screen.queryByText(/gehören zum bisherigen Slogan/)).not.toBeInTheDocument();
    speichern();
    await waitFor(() => expect(customLists.saveSloganUebersetzungen).toHaveBeenLastCalledWith({
      quelle: 'Kochen mit der Familie', en: 'Cooking with friends',
    }));
  });

  test('eine bearbeitete Übersetzung gehört zum aktuellen Slogan', async () => {
    await zeige();
    fireEvent.change(screen.getByLabelText('Header-Slogan'), { target: { value: 'Kochen mit der Familie' } });
    fireEvent.change(screen.getByLabelText('Englisch'), { target: { value: 'Cooking with family' } });
    expect(screen.queryByText(/gehören zum bisherigen Slogan/)).not.toBeInTheDocument();
    speichern();
    await waitFor(() => expect(customLists.saveSloganUebersetzungen).toHaveBeenLastCalledWith({
      quelle: 'Kochen mit der Familie', en: 'Cooking with family',
    }));
  });

  test('leere Felder leeren die Übersetzungen', async () => {
    await zeige();
    fireEvent.change(screen.getByLabelText('Englisch'), { target: { value: '' } });
    speichern();
    await waitFor(() => expect(customLists.saveSloganUebersetzungen).toHaveBeenLastCalledWith(null));
  });
});
