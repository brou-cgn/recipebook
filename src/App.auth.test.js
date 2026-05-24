import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from './App';

let mockAuthStateCallback;
const mockRecipeListRender = jest.fn();

jest.mock('./components/RecipeList', () => function MockRecipeList() {
  mockRecipeListRender();
  return <div data-testid="recipe-list-view">Recipe List</div>;
});

jest.mock('./components/Startseite', () => function MockStartseite(props) {
  return (
    <div data-testid="startseite-view">
      Startseite
      <button type="button" onClick={() => props.onViewChange?.('groups')}>startseite-go-groups</button>
    </div>
  );
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
    return (
      <div ref={ref} data-testid="header" data-current-view={props.currentView}>
        <button type="button" onClick={() => props.onViewChange?.('recipes')}>go-recipes</button>
        <button type="button" onClick={() => props.onViewChange?.('groups')}>go-groups</button>
        {props.startseiteEnabled && (
          <button type="button" onClick={() => props.onViewChange?.('startseite')}>go-startseite</button>
        )}
      </div>
    );
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
  return <div data-testid="kueche-view">Kueche</div>;
});

jest.mock('./components/SharePage', () => function MockSharePage() {
  return null;
});

jest.mock('./components/MenuSharePage', () => function MockMenuSharePage() {
  return null;
});

jest.mock('./components/GroupList', () => function MockGroupList(props) {
  return (
    <div data-testid="group-list-view">
      <button
        type="button"
        onClick={() => props.onSelectGroup?.({
          id: 'private-1',
          type: 'private',
          name: 'Private Liste alt',
          description: 'Alte Beschreibung',
          listKind: 'classic',
        })}
      >
        open-group
      </button>
      <button type="button" onClick={() => props.onBack?.()}>close-groups</button>
    </div>
  );
});

jest.mock('./components/GroupDetail', () => function MockGroupDetail(props) {
  return (
    <div data-testid="group-detail-view">
      <button type="button" onClick={() => props.onBack?.()}>back-to-groups</button>
      <div data-testid="group-detail-name">{props.group?.name || ''}</div>
      <div data-testid="group-detail-description">{props.group?.description || ''}</div>
      <button
        type="button"
        onClick={() => props.onEditGroupProperties?.('private-1', {
          name: 'Private Liste neu',
          description: 'Neue Beschreibung sofort sichtbar',
          listKind: 'classic',
        })}
      >
        edit-group-properties
      </button>
    </div>
  );
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
  getRolePermissions: jest.fn(() => Promise.resolve({})),
  saveFcmToken: () => Promise.resolve(),
}));

const { getRolePermissions: mockGetRolePermissions } = jest.requireMock('./utils/userManagement');

jest.mock('./utils/pushNotifications', () => ({
  requestNotificationPermission: () => Promise.resolve('default'),
  setupForegroundMessageListener: () => () => {},
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

describe('App authentication view handling', () => {
  beforeEach(() => {
    mockAuthStateCallback = null;
    mockGetRolePermissions.mockResolvedValue({});
    mockRecipeListRender.mockClear();
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

  test('loads startseite directly on login when startseite permission is active', async () => {
    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    mockGetRolePermissions.mockResolvedValue({ user: { startseite: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-2',
        vorname: 'Start',
        nachname: 'Seite',
        email: 'start@example.com',
        role: 'user',
        startseite: true,
      });
    });

    expect(await screen.findByTestId('startseite-view')).toBeInTheDocument();
    expect(screen.queryByTestId('recipe-list-view')).not.toBeInTheDocument();
    expect(mockRecipeListRender).not.toHaveBeenCalled();
  });

  test('recipes navigation stays on recipe list even when startseite is enabled', async () => {
    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    mockGetRolePermissions.mockResolvedValue({ user: { startseite: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-3',
        vorname: 'Menu',
        nachname: 'Test',
        email: 'menu@example.com',
        role: 'user',
        startseite: true,
      });
    });

    expect(await screen.findByTestId('startseite-view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'go-recipes' }));

    expect(screen.getByTestId('recipe-list-view')).toBeInTheDocument();
    expect(screen.queryByTestId('startseite-view')).not.toBeInTheDocument();
  });

  test('closing groups returns to startseite when groups were opened from startseite', async () => {
    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    mockGetRolePermissions.mockResolvedValue({ user: { startseite: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-4',
        vorname: 'Start',
        nachname: 'Back',
        email: 'start-back@example.com',
        role: 'user',
        startseite: true,
      });
    });

    expect(await screen.findByTestId('startseite-view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'startseite-go-groups' }));
    expect(screen.getByTestId('group-list-view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'close-groups' }));
    expect(screen.getByTestId('startseite-view')).toBeInTheDocument();
  });

  test('closing groups still returns to kueche when groups were not opened from startseite', async () => {
    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    mockGetRolePermissions.mockResolvedValue({ user: { startseite: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-5',
        vorname: 'Kitchen',
        nachname: 'Back',
        email: 'kitchen-back@example.com',
        role: 'user',
        startseite: true,
      });
    });

    expect(await screen.findByTestId('startseite-view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'go-recipes' }));
    fireEvent.click(screen.getByRole('button', { name: 'go-groups' }));
    expect(screen.getByTestId('group-list-view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'close-groups' }));

    expect(screen.getByTestId('kueche-view')).toBeInTheDocument();
    expect(screen.queryByTestId('startseite-view')).not.toBeInTheDocument();
  });

  test('closing groups after opening a private list still returns to startseite when opened from startseite', async () => {
    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    mockGetRolePermissions.mockResolvedValue({ user: { startseite: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-6',
        vorname: 'Private',
        nachname: 'List',
        email: 'private-list@example.com',
        role: 'user',
        startseite: true,
      });
    });

    expect(await screen.findByTestId('startseite-view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'startseite-go-groups' }));
    expect(screen.getByTestId('group-list-view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'open-group' }));
    expect(screen.getByTestId('group-detail-view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'back-to-groups' }));
    expect(screen.getByTestId('group-list-view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'close-groups' }));
    expect(screen.getByTestId('startseite-view')).toBeInTheDocument();
  });

  test('updates selected private list data immediately after editing group properties', async () => {
    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    mockGetRolePermissions.mockResolvedValue({ user: { startseite: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-7',
        vorname: 'Edit',
        nachname: 'List',
        email: 'edit-list@example.com',
        role: 'user',
        startseite: true,
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'startseite-go-groups' }));
    fireEvent.click(screen.getByRole('button', { name: 'open-group' }));

    expect(screen.getByTestId('group-detail-description')).toHaveTextContent('Alte Beschreibung');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'edit-group-properties' }));
    });

    expect(screen.getByTestId('group-detail-name')).toHaveTextContent('Private Liste neu');
    expect(screen.getByTestId('group-detail-description')).toHaveTextContent('Neue Beschreibung sofort sichtbar');
  });
});
