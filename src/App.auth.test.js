import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import App from './App';

let mockAuthStateCallback;
const mockRecipeListRender = jest.fn();
const mockRecipeFormProps = jest.fn();

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

jest.mock('./components/Tagesmenu', () => function MockTagesmenu() {
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
  canEditMenu: jest.fn(() => false),
  canDeleteMenu: jest.fn(() => false),
  getRolePermissions: jest.fn(() => Promise.resolve({})),
  ROLE_PERMISSIONS_DEFAULT: {},
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
    mockGetOnboardingTestmodeActive.mockResolvedValue(false);
    mockRecipeListRender.mockClear();
    mockRecipeFormProps.mockClear();
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState({}, '', '/');
    window.scrollTo = jest.fn();
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      writable: true,
      value: 0,
    });
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
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

  test('bottom navigation renders all primary tabs and switches between top-level views', async () => {
    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    mockGetRolePermissions.mockResolvedValue({ user: { startseite: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-nav-1',
        vorname: 'Bottom',
        nachname: 'Nav',
        email: 'bottom-nav@example.com',
        role: 'user',
        startseite: true,
      });
    });

    const nav = await screen.findByRole('navigation', { name: 'Hauptnavigation' });
    const navQueries = within(nav);

    expect(navQueries.getByRole('button', { name: 'Küche' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(navQueries.getByRole('button', { name: 'Kochbuch' }));
    expect(screen.getByTestId('recipe-list-view')).toBeInTheDocument();

    fireEvent.click(navQueries.getByRole('button', { name: 'Festtafel' }));
    expect(screen.getByTestId('menu-list-view')).toBeInTheDocument();

    localStorage.setItem('atelierOnboardingSeen', 'true');
    fireEvent.click(navQueries.getByRole('button', { name: 'Atelier' }));
    expect(screen.getByTestId('tagesmenu-view')).toBeInTheDocument();

    fireEvent.click(navQueries.getByRole('button', { name: 'Chefkoch' }));
    expect(screen.getByTestId('kueche-view')).toBeInTheDocument();
  });

  test('clicking the active bottom navigation tab scrolls back to the top', async () => {
    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    mockGetRolePermissions.mockResolvedValue({ user: { startseite: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-nav-2',
        vorname: 'Scroll',
        nachname: 'Top',
        email: 'scroll-top@example.com',
        role: 'user',
        startseite: true,
      });
    });

    const nav = await screen.findByRole('navigation', { name: 'Hauptnavigation' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Küche' }));

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  test('bottom navigation auto-hides on recipe scrolling and hides immediately in atelier mode', async () => {
    jest.useFakeTimers();

    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    mockGetRolePermissions.mockResolvedValue({ user: { startseite: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-nav-3',
        vorname: 'Auto',
        nachname: 'Hide',
        email: 'auto-hide@example.com',
        role: 'user',
        startseite: true,
      });
    });

    const nav = await screen.findByRole('navigation', { name: 'Hauptnavigation' });
    const navQueries = within(nav);

    fireEvent.click(navQueries.getByRole('button', { name: 'Kochbuch' }));
    expect(nav).toHaveAttribute('data-visible', 'true');

    await act(async () => {
      window.scrollY = 24;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(nav).toHaveAttribute('data-visible', 'false');

    await act(async () => {
      window.scrollY = 10;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(nav).toHaveAttribute('data-visible', 'true');

    await act(async () => {
      window.scrollY = 30;
      window.dispatchEvent(new Event('scroll'));
      jest.advanceTimersByTime(2000);
    });
    expect(nav).toHaveAttribute('data-visible', 'true');

    localStorage.setItem('atelierOnboardingSeen', 'true');
    fireEvent.click(navQueries.getByRole('button', { name: 'Atelier' }));
    expect(screen.getByTestId('tagesmenu-view')).toBeInTheDocument();
    expect(nav).toHaveAttribute('data-visible', 'false');

    jest.useRealTimers();
  });

  test('atelier opens directly without onboarding overlay when global onboarding testmode is disabled', async () => {
    mockGetRolePermissions.mockResolvedValue({ user: { startseite: true, onboardingTestmode: true } });
    mockGetOnboardingTestmodeActive.mockResolvedValue(false);

    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-nav-onboarding-disabled',
        vorname: 'Atelier',
        nachname: 'Off',
        email: 'atelier-off@example.com',
        role: 'user',
        startseite: true,
      });
      await Promise.resolve();
    });

    const nav = await screen.findByRole('navigation', { name: 'Hauptnavigation' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Atelier' }));

    expect(screen.getByTestId('tagesmenu-view')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Atelier Onboarding' })).not.toBeInTheDocument();
  });

  test('atelier shows onboarding overlay when global onboarding testmode and user permission are enabled', async () => {
    mockGetRolePermissions.mockResolvedValue({ user: { startseite: true, onboardingTestmode: true } });
    mockGetOnboardingTestmodeActive.mockResolvedValue(true);

    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-nav-onboarding-enabled',
        vorname: 'Atelier',
        nachname: 'On',
        email: 'atelier-on@example.com',
        role: 'user',
        startseite: true,
      });
      await Promise.resolve();
    });

    const nav = await screen.findByRole('navigation', { name: 'Hauptnavigation' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Atelier' }));

    expect(screen.getByRole('dialog', { name: 'Atelier Onboarding' })).toBeInTheDocument();
    expect(screen.queryByTestId('tagesmenu-view')).not.toBeInTheDocument();
  });

  test('bottom spacing custom property follows bottom navigation visibility', async () => {
    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    mockGetRolePermissions.mockResolvedValue({ user: { startseite: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-nav-spacing',
        vorname: 'Bottom',
        nachname: 'Spacing',
        email: 'bottom-spacing@example.com',
        role: 'user',
        startseite: true,
      });
    });

    const nav = await screen.findByRole('navigation', { name: 'Hauptnavigation' });
    const app = nav.closest('.App');
    expect(app).toBeTruthy();
    expect(app.style.getPropertyValue('--bottom-nav-offset')).toBe('var(--bottom-nav-height)');
    expect(app.style.getPropertyValue('--bottom-spacing')).toBe('calc(var(--bottom-nav-height) + 16px)');

    fireEvent.click(within(nav).getByRole('button', { name: 'Kochbuch' }));

    await act(async () => {
      window.scrollY = 24;
      window.dispatchEvent(new Event('scroll'));
    });

    expect(nav).toHaveAttribute('data-visible', 'false');
    expect(app.style.getPropertyValue('--bottom-nav-offset')).toBe('0px');
    expect(app.style.getPropertyValue('--bottom-spacing')).toBe('0px');

    localStorage.setItem('atelierOnboardingSeen', 'true');
    fireEvent.click(within(nav).getByRole('button', { name: 'Atelier' }));

    expect(screen.getByTestId('tagesmenu-view')).toBeInTheDocument();
    expect(nav).toHaveAttribute('data-visible', 'false');
    expect(app.style.getPropertyValue('--bottom-nav-offset')).toBe('0px');
    expect(app.style.getPropertyValue('--bottom-spacing')).toBe('0px');
  });

  test('seasonal startseite navigation opens the seasonal recipe overview', async () => {
    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    mockGetRolePermissions.mockResolvedValue({ user: { startseite: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-3a',
        vorname: 'Saisonal',
        nachname: 'Start',
        email: 'seasonal@example.com',
        role: 'user',
        startseite: true,
      });
    });

    expect(await screen.findByTestId('startseite-view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'startseite-go-seasonal' }));

    expect(screen.getByTestId('recipe-list-view')).toBeInTheDocument();
    expect(screen.queryByTestId('startseite-view')).not.toBeInTheDocument();
    expect(mockRecipeListRender.mock.lastCall[0].activePrivateListName).toBe('Saisonale Rezepte');
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

  test('persists webimport deeplink through login and resumes import after authentication', async () => {
    const deeplinkUrl = 'https://www.chefkoch.de/rezepte/123';
    window.history.pushState(
      {},
      '',
      `/?webimport=${encodeURIComponent(deeplinkUrl)}&webimportAuthor=user-42`
    );

    render(<App />);

    expect(await screen.findByTestId('login-view')).toBeInTheDocument();
    expect(screen.getByText('Bitte melde dich an, um das Rezept zu importieren.')).toBeInTheDocument();
    expect(sessionStorage.getItem('pendingWebimportUrl')).toBe(deeplinkUrl);
    expect(window.location.search).toBe('');

    mockGetRolePermissions.mockResolvedValue({ user: { webimport: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-8',
        vorname: 'Import',
        nachname: 'User',
        email: 'import@example.com',
        role: 'user',
      });
    });

    const recipeForm = await screen.findByTestId('recipe-form-view');
    expect(recipeForm).toHaveAttribute('data-initial-url', deeplinkUrl);
    expect(recipeForm).toHaveAttribute('data-initial-author', 'user-42');
    expect(sessionStorage.getItem('pendingWebimportUrl')).toBeNull();
    expect(sessionStorage.getItem('pendingWebimportAuthor')).toBeNull();
  });

  test('restores pending webimport deeplink from sessionStorage when URL params are no longer present', async () => {
    const deeplinkUrl = 'https://example.com/rezept';
    sessionStorage.setItem('pendingWebimportUrl', deeplinkUrl);
    sessionStorage.setItem('pendingWebimportAuthor', 'user-99');

    render(<App />);

    expect(await screen.findByTestId('login-view')).toBeInTheDocument();
    expect(screen.getByText('Bitte melde dich an, um das Rezept zu importieren.')).toBeInTheDocument();

    mockGetRolePermissions.mockResolvedValue({ user: { webimport: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-9',
        vorname: 'Session',
        nachname: 'Restore',
        email: 'session@example.com',
        role: 'user',
      });
    });

    const recipeForm = await screen.findByTestId('recipe-form-view');
    expect(recipeForm).toHaveAttribute('data-initial-url', deeplinkUrl);
    expect(recipeForm).toHaveAttribute('data-initial-author', 'user-99');
    expect(sessionStorage.getItem('pendingWebimportUrl')).toBeNull();
    expect(sessionStorage.getItem('pendingWebimportAuthor')).toBeNull();
  });

  test('clicking the Startseite Küche FAB opens appCalls and passes the restricted tab state through', async () => {
    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    mockGetRolePermissions.mockResolvedValue({ user: { appCalls: true, startseite: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-10',
        vorname: 'Kueche',
        nachname: 'Fab',
        email: 'kueche-fab@example.com',
        role: 'user',
        appCalls: true,
        kuecheFab: true,
      });
    });

    expect(await screen.findByTestId('startseite-view')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'startseite-open-restricted-appcalls' }));

    const appCallsView = await screen.findByTestId('app-calls-view');
    expect(appCallsView).toHaveAttribute('data-active-tab', 'kulinariktypen');
    expect(appCallsView).toHaveAttribute('data-visible-tabs', '["kulinariktypen"]');
  });

  test('leaving restricted appCalls clears the restricted tab state before a normal reopen', async () => {
    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    mockGetRolePermissions.mockResolvedValue({ user: { appCalls: true, startseite: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-11',
        vorname: 'Reset',
        nachname: 'Tabs',
        email: 'reset-tabs@example.com',
        role: 'user',
        appCalls: true,
        kuecheFab: true,
      });
    });

    expect(await screen.findByTestId('startseite-view')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'startseite-open-restricted-appcalls' }));

    expect(await screen.findByTestId('app-calls-view')).toHaveAttribute('data-visible-tabs', '["kulinariktypen"]');

    fireEvent.click(screen.getByRole('button', { name: 'appcalls-back' }));
    expect(screen.getByTestId('kueche-view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'go-appcalls' }));

    const appCallsView = await screen.findByTestId('app-calls-view');
    expect(appCallsView).toHaveAttribute('data-active-tab', 'app');
    expect(appCallsView).toHaveAttribute('data-visible-tabs', 'null');
  });

  test('bottom navigation is hidden when the recipe form is open', async () => {
    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    mockGetRolePermissions.mockResolvedValue({ user: { startseite: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-form-recipe',
        vorname: 'Form',
        nachname: 'Recipe',
        email: 'form-recipe@example.com',
        role: 'user',
        startseite: true,
      });
    });

    expect(await screen.findByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'go-recipes' }));
    fireEvent.click(screen.getByRole('button', { name: 'add-recipe' }));

    expect(screen.getByTestId('recipe-form-view')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Hauptnavigation' })).not.toBeInTheDocument();
  });

  test('bottom navigation is hidden when the recipe detail view is open', async () => {
    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    mockGetRolePermissions.mockResolvedValue({ user: { startseite: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-detail-recipe',
        vorname: 'Detail',
        nachname: 'Recipe',
        email: 'detail-recipe@example.com',
        role: 'user',
        startseite: true,
      });
    });

    expect(await screen.findByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'go-recipes' }));
    fireEvent.click(screen.getByRole('button', { name: 'open-recipe' }));

    expect(screen.getByTestId('recipe-detail-view')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Hauptnavigation' })).not.toBeInTheDocument();
  });

  test('bottom navigation is hidden when the menu form is open', async () => {
    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    mockGetRolePermissions.mockResolvedValue({ user: { startseite: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-form-menu',
        vorname: 'Form',
        nachname: 'Menu',
        email: 'form-menu@example.com',
        role: 'user',
        startseite: true,
      });
    });

    const nav = await screen.findByRole('navigation', { name: 'Hauptnavigation' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Festtafel' }));
    fireEvent.click(screen.getByRole('button', { name: 'add-menu' }));

    expect(screen.getByTestId('menu-form-view')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Hauptnavigation' })).not.toBeInTheDocument();
  });

  test('bottom navigation is hidden when the menu detail view is open', async () => {
    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    mockGetRolePermissions.mockResolvedValue({ user: { startseite: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-detail-menu',
        vorname: 'Detail',
        nachname: 'Menu',
        email: 'detail-menu@example.com',
        role: 'user',
        startseite: true,
      });
    });

    const nav = await screen.findByRole('navigation', { name: 'Hauptnavigation' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Festtafel' }));
    fireEvent.click(screen.getByRole('button', { name: 'open-menu' }));

    expect(screen.getByTestId('menu-detail-view')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Hauptnavigation' })).not.toBeInTheDocument();
  });

  test('bottom navigation is hidden when chef personal data is open', async () => {
    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    mockGetRolePermissions.mockResolvedValue({ user: { startseite: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-personal-data',
        vorname: 'Chef',
        nachname: 'Data',
        email: 'personal-data@example.com',
        role: 'user',
        startseite: true,
      });
    });

    expect(await screen.findByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'go-kueche' }));
    expect(screen.getByTestId('kueche-view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'open-personal-data' }));
    expect(screen.queryByRole('navigation', { name: 'Hauptnavigation' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'close-personal-data' }));
    expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument();
  });

  test('bottom navigation is hidden when the private list settings tab is open', async () => {
    render(<App />);
    expect(await screen.findByTestId('login-view')).toBeInTheDocument();

    mockGetRolePermissions.mockResolvedValue({ user: { startseite: true } });

    await act(async () => {
      mockAuthStateCallback({
        id: 'user-nav-settings',
        vorname: 'Nav',
        nachname: 'Settings',
        email: 'nav-settings@example.com',
        role: 'user',
        startseite: true,
      });
    });

    await screen.findByRole('navigation', { name: 'Hauptnavigation' });

    fireEvent.click(screen.getByRole('button', { name: 'go-groups' }));
    expect(screen.getByTestId('group-list-view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'open-group' }));
    expect(screen.getByTestId('group-detail-view')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'open-settings-tab' }));
    expect(screen.queryByRole('navigation', { name: 'Hauptnavigation' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'close-settings-tab' }));
    expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument();
  });
});
