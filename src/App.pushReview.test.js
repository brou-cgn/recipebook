import React from 'react';
import { render, screen, act, cleanup } from '@testing-library/react';
import App from './App';

let mockAuthStateCallback;
let mockEmitTempRecipes;
const mockTakePendingReviewImport = jest.fn();
const mockRecipeListRender = jest.fn();
const mockRecipeFormProps = jest.fn();
const mockTagesmenuProps = jest.fn();

jest.mock('./components/RecipeList', () => function MockRecipeList(props) {
  mockRecipeListRender(props);
  return (
    <div data-testid="recipe-list-view">
      Recipe List
      <button type="button" onClick={() => props.onAddRecipe?.()}>add-recipe</button>
      <button type="button" onClick={() => props.onSelectRecipe?.({ id: 'recipe-1', title: 'Recipe 1' })}>open-recipe</button>
    </div>
  );
});

jest.mock('./components/Startseite', () => function MockStartseite(props) {
  return (
    <div data-testid="startseite-view">
      Startseite
      <button type="button" onClick={() => props.onViewChange?.('groups')}>startseite-go-groups</button>
      <button type="button" onClick={() => props.onOpenSeasonalRecipes?.()}>startseite-go-seasonal</button>
      <button
        type="button"
        onClick={() => props.onViewChange?.('appCalls', {
          visibleTabs: ['kulinariktypen'],
          activeTab: 'kulinariktypen',
        })}
      >
        startseite-open-restricted-appcalls
      </button>
    </div>
  );
});

jest.mock('./components/RecipeDetail', () => function MockRecipeDetail(props) {
  return (
    <div data-testid="recipe-detail-view">
      Recipe Detail
      <button type="button" onClick={() => props.onBack?.()}>back-from-recipe</button>
    </div>
  );
});

jest.mock('./components/RecipeForm', () => function MockRecipeForm(props) {
  mockRecipeFormProps(props);
  return (
    <div
      data-testid="recipe-form-view"
      data-initial-url={props.initialWebImportUrl || ''}
      data-initial-author={props.initialWebImportAuthorId || ''}
      data-recipe-id={props.recipe?.id || ''}
    >
      Recipe Form
    </div>
  );
});

jest.mock('./components/Header', () => {
  const React = require('react');
  return React.forwardRef(function MockHeader(props, ref) {
    return (
      <div ref={ref} data-testid="header" data-current-view={props.currentView}>
        <button type="button" onClick={() => props.onViewChange?.('recipes')}>go-recipes</button>
        <button type="button" onClick={() => props.onViewChange?.('groups')}>go-groups</button>
        <button type="button" onClick={() => props.onViewChange?.('appCalls')}>go-appcalls</button>
        {props.onChefkochClick && (
          <button type="button" onClick={() => props.onChefkochClick()}>go-kueche</button>
        )}
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

jest.mock('./components/MenuList', () => function MockMenuList(props) {
  return (
    <div data-testid="menu-list-view">
      Menu List
      <button type="button" onClick={() => props.onAddMenu?.()}>add-menu</button>
      <button type="button" onClick={() => props.onSelectMenu?.({ id: 'menu-1', title: 'Menu 1' })}>open-menu</button>
    </div>
  );
});

jest.mock('./components/MenuDetail', () => function MockMenuDetail(props) {
  return (
    <div data-testid="menu-detail-view">
      Menu Detail
      <button type="button" onClick={() => props.onBack?.()}>back-from-menu</button>
    </div>
  );
});

jest.mock('./components/MenuForm', () => function MockMenuForm() {
  return <div data-testid="menu-form-view">Menu Form</div>;
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

jest.mock('./components/Kueche', () => function MockKueche(props) {
  return (
    <div data-testid="kueche-view">
      Kueche
      <button
        type="button"
        onClick={() => props.onViewChange?.('appCalls', {
          visibleTabs: ['kulinariktypen'],
          activeTab: 'kulinariktypen',
        })}
      >
        kueche-open-restricted-appcalls
      </button>
      <button type="button" onClick={() => props.onPersonalDataVisibilityChange?.(true)}>open-personal-data</button>
      <button type="button" onClick={() => props.onPersonalDataVisibilityChange?.(false)}>close-personal-data</button>
    </div>
  );
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
      <button type="button" onClick={() => props.onActiveTabChange?.('einstellungen')}>open-settings-tab</button>
      <button type="button" onClick={() => props.onActiveTabChange?.('rezepte')}>close-settings-tab</button>
    </div>
  );
});

jest.mock('./components/AppCallsPage', () => function MockAppCallsPage(props) {
  return (
    <div
      data-testid="app-calls-view"
      data-active-tab={props.activeTab || ''}
      data-visible-tabs={JSON.stringify(props.visibleTabs ?? null)}
    >
      <button type="button" onClick={() => props.onBack?.()}>appcalls-back</button>
    </div>
  );
});

jest.mock('./components/MeineKuechenstarsPage', () => function MockMeineKuechenstarsPage() {
  return null;
});

jest.mock('./components/Tagesmenu', () => function MockTagesmenu(props) {
  mockTagesmenuProps(props);
  return <div data-testid="tagesmenu-view">Tagesmenu</div>;
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
  canEditRecipes: () => false,
  canEditMenu: jest.fn(() => false),
  canDeleteMenu: jest.fn(() => false),
  getRolePermissions: jest.fn(() => Promise.resolve({})),
  ROLE_PERMISSIONS_DEFAULT: {},
  saveFcmToken: () => Promise.resolve(),
}));

const { getRolePermissions: mockGetRolePermissions } = jest.requireMock('./utils/userManagement');
const { subscribeToRecipes: mockSubscribeToRecipes } = jest.requireMock('./utils/recipeFirestore');
const { subscribeToGroups: mockSubscribeToGroups } = jest.requireMock('./utils/groupFirestore');

jest.mock('./utils/pushNotifications', () => ({
  requestNotificationPermission: () => Promise.resolve('default'),
  setupForegroundMessageListener: () => () => {},
  updateMessagingServiceWorker: () => Promise.resolve(),
  notifyPrivateListMembers: () => Promise.resolve(),
}));

jest.mock('./utils/pushTapHandoff', () => ({
  appendPushLog: () => Promise.resolve(),
  takePendingReviewImport: (...args) => mockTakePendingReviewImport(...args),
}));

jest.mock('./utils/userFavorites', () => ({
  toggleFavorite: jest.fn(),
  migrateGlobalFavorites: jest.fn(),
}));

jest.mock('./utils/menuFavorites', () => ({
  toggleMenuFavorite: jest.fn(),
}));

jest.mock('./utils/onboardingSettings', () => ({
  getOnboardingTestmodeActive: jest.fn(() => Promise.resolve(false)),
  saveOnboardingTestmodeActive: jest.fn(),
  shouldShowOnboardingOverlay: (currentUser, onboardingTestmodeActive) => Boolean(onboardingTestmodeActive && currentUser?.onboardingTestmode),
}));

const { getOnboardingTestmodeActive: mockGetOnboardingTestmodeActive } = jest.requireMock('./utils/onboardingSettings');

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
  DEFAULT_BUTTON_ICONS: {},
  getDarkModePreference: () => false,
  getButtonIcons: () => Promise.resolve({}),
  getEffectiveIcon: () => '',
  getInspirationListSettings: () => Promise.resolve({}),
}));

jest.mock('./utils/recipeCallsFirestore', () => ({
  logRecipeCall: jest.fn(),
}));

jest.mock('./utils/storageUtils', () => ({
  deleteRecipeThumbnail: jest.fn(() => Promise.resolve()),
}));

jest.mock('./utils/recipeFirestore', () => ({
  subscribeToRecipes: jest.fn(() => () => {}),
  subscribeToTempRecipes: (userId, callback) => {
    mockEmitTempRecipes = callback;
    return () => {};
  },
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
  subscribeToGroups: jest.fn(() => () => {}),
  addGroup: jest.fn(),
  updateGroup: jest.fn(),
  deleteGroup: jest.fn(),
  ensurePublicGroup: () => Promise.resolve('public-group-id'),
  addRecipeToGroup: jest.fn(),
  removeRecipeFromGroup: jest.fn(),
}));


/**
 * Tipp auf die Push-Nachricht „Rezept bereit zur Prüfung" (Tech-Check M8):
 * die App öffnet das Formular mit genau dem angetippten Rezept.
 */
const tempRecipe = (id, title) => ({ id, title, isTemp: true, authorId: 'user-1' });

describe('Push-Tipp öffnet das Prüf-Rezept', () => {
  let serviceWorker;

  beforeEach(() => {
    jest.useRealTimers();
    mockAuthStateCallback = null;
    mockEmitTempRecipes = null;
    mockTakePendingReviewImport.mockReset();
    mockTakePendingReviewImport.mockResolvedValue(null);
    mockGetRolePermissions.mockResolvedValue({});
    mockGetOnboardingTestmodeActive.mockResolvedValue(false);
    mockSubscribeToRecipes.mockImplementation(() => () => {});
    mockSubscribeToGroups.mockImplementation(() => () => {});
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState({}, '', '/');
    window.scrollTo = jest.fn();
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    serviceWorker = new EventTarget();
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker });
  });

  afterEach(() => {
    cleanup();
    delete navigator.serviceWorker;
  });

  async function loginWithQueue(queue) {
    render(<App />);
    await screen.findByTestId('login-view');
    await act(async () => {
      mockAuthStateCallback({ id: 'user-1', vorname: 'Test', nachname: 'User', email: 't@example.com' });
    });
    await screen.findByTestId('recipe-list-view');
    await act(async () => {
      mockEmitTempRecipes(queue);
    });
  }

  async function tapNotification(recipeId) {
    await act(async () => {
      serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'REVIEW_IMPORT', recipeId } }));
    });
  }

  test('öffnet das angetippte Rezept, nicht das erste wartende', async () => {
    await loginWithQueue([tempRecipe('a', 'Älteres Rezept'), tempRecipe('b', 'Neues Rezept')]);

    await tapNotification('b');

    expect(screen.getByTestId('recipe-form-view')).toHaveAttribute('data-recipe-id', 'b');
  });

  test('ersetzt ein offenes Prüf-Formular eines anderen Imports', async () => {
    await loginWithQueue([tempRecipe('a', 'Älteres Rezept'), tempRecipe('b', 'Neues Rezept')]);
    await tapNotification('a');
    expect(screen.getByTestId('recipe-form-view')).toHaveAttribute('data-recipe-id', 'a');

    await tapNotification('b');

    expect(screen.getByTestId('recipe-form-view')).toHaveAttribute('data-recipe-id', 'b');
  });

  test('wartet auf das Rezept, wenn der Prüf-Stapel noch den alten Stand zeigt', async () => {
    await loginWithQueue([tempRecipe('a', 'Älteres Rezept')]);

    await tapNotification('b');
    expect(screen.queryByTestId('recipe-form-view')).not.toBeInTheDocument();

    await act(async () => {
      mockEmitTempRecipes([tempRecipe('a', 'Älteres Rezept'), tempRecipe('b', 'Neues Rezept')]);
    });

    expect(screen.getByTestId('recipe-form-view')).toHaveAttribute('data-recipe-id', 'b');
  });

  test('ein laufender Import im Stapel zählt nicht als Prüf-Rezept', async () => {
    await loginWithQueue([{ ...tempRecipe('b', 'Rezept-Import'), importStatus: 'processing' }]);

    await tapNotification('b');
    expect(screen.queryByTestId('recipe-form-view')).not.toBeInTheDocument();

    await act(async () => {
      mockEmitTempRecipes([tempRecipe('b', 'Neues Rezept')]);
    });

    expect(screen.getByTestId('recipe-form-view')).toHaveAttribute('data-recipe-id', 'b');
  });

  test('ohne Nachricht: liest die Ablage des Workers, sobald die App sichtbar wird', async () => {
    await loginWithQueue([tempRecipe('a', 'Älteres Rezept'), tempRecipe('b', 'Neues Rezept')]);
    mockTakePendingReviewImport.mockResolvedValueOnce('b');

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(screen.getByTestId('recipe-form-view')).toHaveAttribute('data-recipe-id', 'b');
  });
});
