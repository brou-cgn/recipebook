import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Settings from './Settings';
import * as customLists from '../utils/customLists';
import { getRolePermissions } from '../utils/userManagement';
import { subscribeToFaqs, deleteFaq } from '../utils/faqFirestore';
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
jest.mock('./print/PrintFormatsSettings', () => () => null);
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

const FAQS = [
  { id: 'f1', title: 'Grundlagen', level: 0, order: 0 },
  { id: 'f2', title: 'Messer **schärfen**', level: 1, order: 1 },
  { id: 'f3', title: 'Brühe ansetzen', level: 1, order: 2 },
];

async function openKochschuleTab() {
  subscribeToFaqs.mockImplementation((callback) => { callback(FAQS); return () => {}; });
  const view = render(<Settings onBack={jest.fn()} currentUser={adminUser} allUsers={[]} allRecipes={[]} onUpdateRecipe={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Kochschule' }));
  await screen.findByRole('button', { name: 'Messer schärfen entfernen' });
  return view;
}

const titles = () => Array.from(document.querySelectorAll('.faq-list-item-title')).map((el) => el.textContent);

describe('Settings – Kochschule: Löschen mit Rückgängig statt Rückfrage (Tech-Check D6)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('Eintrag verschwindet sofort ohne window.confirm; gelöscht wird erst nach dem Rückgängig-Fenster', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm');
    await openKochschuleTab();
    jest.useFakeTimers();

    fireEvent.click(screen.getByRole('button', { name: 'Messer schärfen entfernen' }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(titles()).toEqual(['Grundlagen', 'Brühe ansetzen']);
    expect(screen.getByText('„Messer schärfen" entfernt')).toBeInTheDocument();
    expect(deleteFaq).not.toHaveBeenCalled();

    act(() => { jest.advanceTimersByTime(6000); });
    expect(deleteFaq).toHaveBeenCalledWith('f2');
    confirmSpy.mockRestore();
  });

  test('Rückgängig holt den Eintrag an seine Stelle zurück und löscht nichts', async () => {
    await openKochschuleTab();
    jest.useFakeTimers();

    fireEvent.click(screen.getByRole('button', { name: 'Messer schärfen entfernen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(titles()).toEqual(['Grundlagen', 'Messer schärfen', 'Brühe ansetzen']);

    act(() => { jest.advanceTimersByTime(6000); });
    expect(deleteFaq).not.toHaveBeenCalled();
  });
});
