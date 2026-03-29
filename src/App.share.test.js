import React from 'react';
import { render, screen, act } from '@testing-library/react';
import App from './App';

// Mock SharePage and MenuSharePage to isolate routing logic
jest.mock('./components/SharePage', () => function MockSharePage({ shareId, onClose }) {
  return <div data-testid="share-page" data-share-id={shareId}>SharePage: {shareId}<button data-testid="share-page-close" onClick={onClose}>Close</button></div>;
});

jest.mock('./components/MenuSharePage', () => function MockMenuSharePage({ shareId, onClose }) {
  return <div data-testid="menu-share-page" data-share-id={shareId}>MenuSharePage: {shareId}<button data-testid="menu-share-page-close" onClick={onClose}>Close</button></div>;
});

// Mock userManagement so auth resolves immediately with no user
jest.mock('./utils/userManagement', () => ({
  onAuthStateChange: (callback) => {
    callback(null);
    return () => {};
  },
  loginUser: jest.fn(),
  logoutUser: jest.fn(),
  registerUser: jest.fn(),
  loginAsGuest: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  getUsers: jest.fn(() => Promise.resolve([])),
  canEditMenu: jest.fn(() => false),
  canDeleteMenu: jest.fn(() => false),
  getRolePermissions: jest.fn(() => ({})),
}));

// Mock Firebase-dependent utilities
jest.mock('./utils/recipeFirestore', () => ({
  subscribeToRecipes: jest.fn(() => () => {}),
  addRecipe: jest.fn(),
  updateRecipe: jest.fn(),
  deleteRecipe: jest.fn(),
  seedSampleRecipes: jest.fn(),
  initializeRecipeCounts: jest.fn(),
  enableRecipeSharing: jest.fn(),
}));

jest.mock('./utils/menuFirestore', () => ({
  subscribeToMenus: jest.fn(() => () => {}),
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
  ensurePublicGroup: jest.fn(() => Promise.resolve('public-group-id')),
  addRecipeToGroup: jest.fn(),
  removeRecipeFromGroup: jest.fn(),
}));

jest.mock('./utils/userFavorites', () => ({
  toggleFavorite: jest.fn(),
  migrateGlobalFavorites: jest.fn(),
}));

jest.mock('./utils/menuFavorites', () => ({
  toggleMenuFavorite: jest.fn(),
}));

jest.mock('./utils/faviconUtils', () => ({
  applyFaviconSettings: jest.fn(),
}));

jest.mock('./utils/customLists', () => ({
  applyTileSizePreference: () => {},
  applyDarkModePreference: () => {},
  expandCuisineSelection: () => [],
  getCustomLists: () => Promise.resolve({
    portionUnits: [{ id: 'portion', singular: 'Portion', plural: 'Portionen' }],
    cuisineTypes: [],
    cuisineGroups: [],
    mealCategories: [],
    units: [],
  }),
  getSortSettings: () => Promise.resolve({}),
}));

jest.mock('./utils/recipeCallsFirestore', () => ({
  logRecipeCall: jest.fn(),
}));

const resetLocation = () => {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, hash: '', pathname: '/' },
    writable: true,
    configurable: true,
  });
};

describe('Share URL hash routing', () => {
  afterEach(() => {
    resetLocation();
    jest.clearAllMocks();
  });

  test('shows SharePage when initial URL hash is #share/:shareId', () => {
    window.location.hash = '#share/abc-123';
    render(<App />);
    expect(screen.getByTestId('share-page')).toBeInTheDocument();
    expect(screen.getByTestId('share-page')).toHaveAttribute('data-share-id', 'abc-123');
  });

  test('shows MenuSharePage when initial URL hash is #menu-share/:shareId', () => {
    window.location.hash = '#menu-share/xyz-456';
    render(<App />);
    expect(screen.getByTestId('menu-share-page')).toBeInTheDocument();
    expect(screen.getByTestId('menu-share-page')).toHaveAttribute('data-share-id', 'xyz-456');
  });

  test('does not show share pages when hash is empty', () => {
    window.location.hash = '';
    render(<App />);
    expect(screen.queryByTestId('share-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('menu-share-page')).not.toBeInTheDocument();
  });

  test('updates to show SharePage when hash changes to #share/:shareId after initial render', () => {
    window.location.hash = '';
    render(<App />);
    expect(screen.queryByTestId('share-page')).not.toBeInTheDocument();

    // Simulate hash change as would happen from Cloud Function redirect
    act(() => {
      window.location.hash = '#share/new-recipe-id';
      window.dispatchEvent(new Event('hashchange'));
    });

    expect(screen.getByTestId('share-page')).toBeInTheDocument();
    expect(screen.getByTestId('share-page')).toHaveAttribute('data-share-id', 'new-recipe-id');
  });

  test('updates to show MenuSharePage when hash changes to #menu-share/:shareId after initial render', () => {
    window.location.hash = '';
    render(<App />);
    expect(screen.queryByTestId('menu-share-page')).not.toBeInTheDocument();

    // Simulate hash change as would happen from Cloud Function redirect
    act(() => {
      window.location.hash = '#menu-share/new-menu-id';
      window.dispatchEvent(new Event('hashchange'));
    });

    expect(screen.getByTestId('menu-share-page')).toBeInTheDocument();
    expect(screen.getByTestId('menu-share-page')).toHaveAttribute('data-share-id', 'new-menu-id');
  });

  test('hides SharePage and returns to normal view when hash is cleared', () => {
    window.location.hash = '#share/abc-123';
    render(<App />);
    expect(screen.getByTestId('share-page')).toBeInTheDocument();

    // Clear the hash (user navigates back)
    act(() => {
      window.location.hash = '';
      window.dispatchEvent(new Event('hashchange'));
    });

    expect(screen.queryByTestId('share-page')).not.toBeInTheDocument();
  });

  test('onClose from SharePage clears hash and hides share page', () => {
    window.location.hash = '#share/abc-123';
    render(<App />);
    expect(screen.getByTestId('share-page')).toBeInTheDocument();

    act(() => {
      screen.getByTestId('share-page-close').click();
      window.dispatchEvent(new Event('hashchange'));
    });

    expect(screen.queryByTestId('share-page')).not.toBeInTheDocument();
  });

  test('onClose from MenuSharePage clears hash and hides menu share page', () => {
    window.location.hash = '#menu-share/xyz-456';
    render(<App />);
    expect(screen.getByTestId('menu-share-page')).toBeInTheDocument();

    act(() => {
      screen.getByTestId('menu-share-page-close').click();
      window.dispatchEvent(new Event('hashchange'));
    });

    expect(screen.queryByTestId('menu-share-page')).not.toBeInTheDocument();
  });
});

describe('Share URL pathname routing', () => {
  afterEach(() => {
    resetLocation();
    jest.clearAllMocks();
  });

  test('shows SharePage when initial URL pathname is /share/:shareId', () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hash: '', pathname: '/share/abc-123' },
      writable: true,
      configurable: true,
    });
    render(<App />);
    expect(screen.getByTestId('share-page')).toBeInTheDocument();
    expect(screen.getByTestId('share-page')).toHaveAttribute('data-share-id', 'abc-123');
  });

  test('shows MenuSharePage when initial URL pathname is /menu-share/:shareId', () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hash: '', pathname: '/menu-share/xyz-456' },
      writable: true,
      configurable: true,
    });
    render(<App />);
    expect(screen.getByTestId('menu-share-page')).toBeInTheDocument();
    expect(screen.getByTestId('menu-share-page')).toHaveAttribute('data-share-id', 'xyz-456');
  });

  test('does not show share pages when pathname is /', () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hash: '', pathname: '/' },
      writable: true,
      configurable: true,
    });
    render(<App />);
    expect(screen.queryByTestId('share-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('menu-share-page')).not.toBeInTheDocument();
  });

  test('onClose from SharePage navigates away from path-based share URL', () => {
    const pushStateSpy = jest.spyOn(window.history, 'pushState');
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hash: '', pathname: '/share/abc-123' },
      writable: true,
      configurable: true,
    });
    render(<App />);
    expect(screen.getByTestId('share-page')).toBeInTheDocument();

    act(() => {
      screen.getByTestId('share-page-close').click();
    });

    expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/');
    expect(screen.queryByTestId('share-page')).not.toBeInTheDocument();
    pushStateSpy.mockRestore();
  });

  test('onClose from MenuSharePage navigates away from path-based menu-share URL', () => {
    const pushStateSpy = jest.spyOn(window.history, 'pushState');
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hash: '', pathname: '/menu-share/xyz-456' },
      writable: true,
      configurable: true,
    });
    render(<App />);
    expect(screen.getByTestId('menu-share-page')).toBeInTheDocument();

    act(() => {
      screen.getByTestId('menu-share-page-close').click();
    });

    expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/');
    expect(screen.queryByTestId('menu-share-page')).not.toBeInTheDocument();
    pushStateSpy.mockRestore();
  });
});
