import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from './App';

let mockAuthStateCallback;

jest.mock('./components/RecipeList', () => function MockRecipeList() {
  return <div data-testid="recipe-list-view">Recipe List</div>;
});

jest.mock('./components/RecipeDetail', () => function MockRecipeDetail() {
  return null;
});

jest.mock('./components/RecipeForm', () => function MockRecipeForm() {
  return null;
});

jest.mock('./components/Header', () => {
  const React = require('react');
  return React.forwardRef(function MockHeader(props, ref) {
    return <div ref={ref} data-testid="header">Header</div>;
  });
});

jest.mock('./components/Settings', () => function MockSettings() {
  return null;
});

jest.mock('./components/MenuList', () => function MockMenuList() {
  return null;
});

jest.mock('./components/MenuDetail', () => function MockMenuDetail() {
  return null;
});

jest.mock('./components/MenuForm', () => function MockMenuForm() {
  return null;
});

jest.mock('./components/Login', () => function MockLogin({ onSwitchToRegister }) {
  return (
    <div data-testid="login-view">
      <button type="button" onClick={onSwitchToRegister}>switch-register</button>
    </div>
  );
});

jest.mock('./components/Register', () => function MockRegister({ onSwitchToLogin }) {
  return (
    <div data-testid="register-view">
      <button type="button" onClick={onSwitchToLogin}>switch-login</button>
    </div>
  );
});

jest.mock('./components/PasswordChangeModal', () => function MockPasswordChangeModal() {
  return null;
});

jest.mock('./components/Kueche', () => function MockKueche() {
  return null;
});

jest.mock('./components/SharePage', () => function MockSharePage() {
  return null;
});

jest.mock('./components/MenuSharePage', () => function MockMenuSharePage() {
  return null;
});

jest.mock('./components/GroupList', () => function MockGroupList() {
  return null;
});

jest.mock('./components/GroupDetail', () => function MockGroupDetail() {
  return null;
});

jest.mock('./components/AppCallsPage', () => function MockAppCallsPage() {
  return null;
});

jest.mock('./components/MeineKuechenstarsPage', () => function MockMeineKuechenstarsPage() {
  return null;
});

jest.mock('./components/Tagesmenu', () => function MockTagesmenu() {
  return null;
});

jest.mock('./components/UniversalImportModal', () => function MockUniversalImportModal() {
  return null;
});

jest.mock('./components/MobileSearchOverlay', () => function MockMobileSearchOverlay() {
  return null;
});

jest.mock('./utils/userManagement', () => ({
  loginUser: jest.fn(),
  logoutUser: jest.fn(),
  registerUser: jest.fn(),
  loginAsGuest: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  getUsers: () => Promise.resolve([]),
  onAuthStateChange: (callback) => {
    mockAuthStateCallback = callback;
    callback(null);
    return () => {};
  },
  canEditMenu: jest.fn(() => false),
  canDeleteMenu: jest.fn(() => false),
  getRolePermissions: () => Promise.resolve({}),
  saveFcmToken: jest.fn(() => Promise.resolve()),
}));

jest.mock('./utils/pushNotifications', () => ({
  requestNotificationPermission: jest.fn(() => Promise.resolve('default')),
  setupForegroundMessageListener: jest.fn(() => () => {}),
  notifyPrivateListMembers: () => Promise.resolve(),
}));

jest.mock('./utils/userFavorites', () => ({
  toggleFavorite: jest.fn(),
  migrateGlobalFavorites: jest.fn(),
}));

jest.mock('./utils/menuFavorites', () => ({
  toggleMenuFavorite: jest.fn(),
}));

jest.mock('./utils/faviconUtils', () => ({
  applyFaviconSettings: () => Promise.resolve(),
}));

jest.mock('./utils/customLists', () => ({
  applyTileSizePreference: jest.fn(),
  applyDarkModePreference: jest.fn(),
  expandCuisineSelection: jest.fn(() => []),
  getCustomLists: () => Promise.resolve({
    portionUnits: [{ id: 'portion', singular: 'Portion', plural: 'Portionen' }],
    cuisineTypes: [],
    cuisineGroups: [],
    mealCategories: [],
    units: [],
  }),
}));

jest.mock('./utils/recipeCallsFirestore', () => ({
  logRecipeCall: jest.fn(),
}));

jest.mock('./utils/storageUtils', () => ({
  deleteRecipeThumbnail: jest.fn(() => Promise.resolve()),
}));

jest.mock('./utils/recipeFirestore', () => ({
  subscribeToRecipes: () => () => {},
  addRecipe: jest.fn(),
  updateRecipe: jest.fn(),
  deleteRecipe: jest.fn(),
  seedSampleRecipes: () => Promise.resolve(),
  initializeRecipeCounts: () => Promise.resolve(),
  enableRecipeSharing: () => Promise.resolve(),
}));

jest.mock('./utils/menuFirestore', () => ({
  subscribeToMenus: () => () => {},
  addMenu: jest.fn(),
  updateMenu: jest.fn(),
  deleteMenu: jest.fn(),
  updateMenuPortionCount: jest.fn(),
}));

jest.mock('./utils/groupFirestore', () => ({
  subscribeToGroups: () => () => {},
  addGroup: jest.fn(),
  updateGroup: jest.fn(),
  deleteGroup: jest.fn(),
  ensurePublicGroup: () => Promise.resolve('public-group-id'),
  addRecipeToGroup: jest.fn(),
  removeRecipeFromGroup: jest.fn(),
}));

jest.mock('./utils/recipeSwipeFlags', () => ({
  reconcileRecipeSwipeFlagsForMemberChange: () => Promise.resolve(),
}));

describe('App authentication view handling', () => {
  beforeEach(() => {
    mockAuthStateCallback = null;
    const { saveFcmToken } = jest.requireMock('./utils/userManagement');
    const { requestNotificationPermission, setupForegroundMessageListener } = jest.requireMock('./utils/pushNotifications');
    saveFcmToken.mockClear();
    requestNotificationPermission.mockClear();
    setupForegroundMessageListener.mockClear();
    localStorage.clear();
    sessionStorage.clear();
  });

  test('resets to login view after authentication from the register screen', async () => {
    render(<App />);

    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'switch-register' }));
    expect(screen.getByTestId('register-view')).toBeInTheDocument();

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-1',
        vorname: 'Test',
        nachname: 'User',
        email: 'test@example.com',
      });
    });

    expect(screen.getByTestId('recipe-list-view')).toBeInTheDocument();
    expect(screen.queryByTestId('register-view')).not.toBeInTheDocument();

    await act(async () => {
      mockAuthStateCallback(null);
    });

    expect(screen.getByTestId('login-view')).toBeInTheDocument();
    expect(screen.queryByTestId('register-view')).not.toBeInTheDocument();
  });

  test('does not request push permission automatically after login', async () => {
    const { saveFcmToken } = jest.requireMock('./utils/userManagement');
    const { requestNotificationPermission, setupForegroundMessageListener } = jest.requireMock('./utils/pushNotifications');

    render(<App />);

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-1',
        vorname: 'Test',
        nachname: 'User',
        email: 'test@example.com',
      });
    });

    expect(setupForegroundMessageListener).toHaveBeenCalledTimes(1);
    expect(requestNotificationPermission).not.toHaveBeenCalled();
    expect(saveFcmToken).not.toHaveBeenCalled();
  });
});
