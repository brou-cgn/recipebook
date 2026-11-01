import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import RecipeDetail from './RecipeDetail';
import CookingSessionDock from './CookingSessionDock';
import { CookingSessionProvider } from '../contexts/CookingSessionContext';
import { resetViewportCoverForTests } from '../hooks/useViewportFitCover';
import { isBase64Image } from '../utils/imageUtils';
import { defaultIcon } from '../utils/defaultButtonIcons';

// Eingerichtete Button-Icons (Admin); je Test überschreibbar
let mockButtonIcons = {};

jest.mock('../utils/imageUtils', () => ({
  isBase64Image: jest.fn(() => false),
}));

jest.mock('../utils/userFavorites', () => ({
  getUserFavorites: () => Promise.resolve([]),
}));

jest.mock('../utils/userManagement', () => ({
  canDirectlyEditRecipe: () => true,
  canCreateNewVersion: () => true,
  canDeleteRecipe: () => true,
  canDeleteRecipes: () => true,
  canViewRecipeIndex: () => false,
}));

jest.mock('../utils/recipeVersioning', () => ({
  isRecipeVersion: () => false,
  getVersionNumber: () => 0,
  getRecipeVersions: () => [],
  getParentRecipe: () => null,
  sortRecipeVersions: (recipes) => recipes,
}));

jest.mock('../utils/customLists', () => ({
  getCustomLists: () => Promise.resolve({
    portionUnits: [{ id: 'portion', singular: 'Portion', plural: 'Portionen' }],
    cuisineTypes: [],
    mealCategories: [],
    units: [],
  }),
  getButtonIcons: () => Promise.resolve(mockButtonIcons),
  getTimelineBubbleIcon: () => Promise.resolve(null),
  getTimelineCookEventBubbleIcon: () => Promise.resolve(null),
  getTimelineCookEventDefaultImage: () => Promise.resolve(null),
  DEFAULT_BUTTON_ICONS: {
    ratingHeartEmpty: '♡',
    ratingHeartEmptyModal: '♡',
    ratingHeartFilled: '♥',
  },
  getEffectiveIcon: (icons, key) => icons[key] ?? '',
  getDarkModePreference: () => false,
  ALARM_SOUNDS: [{ key: 'radar', label: 'Radar' }],
  DEFAULT_ALARM_SOUND: 'radar',
  getAlarmSoundPreference: () => 'radar',
  saveAlarmSoundPreference: () => {},
}));

jest.mock('../utils/recipeLinks', () => ({
  decodeRecipeLink: () => null,
}));

jest.mock('../utils/recipeCookDates', () => ({
  getAllCookDates: () => Promise.resolve([]),
  getRecentlyCookedRecipeIds: () => Promise.resolve([]),
}));

// Ohne Firestore, damit die Button-Icons fertig laden (wie in RecipeDetail.test.js)
jest.mock('../utils/categoryImages', () => ({
  getCategoryImages: () => Promise.resolve([]),
}));

const rouladen = {
  id: 'rouladen',
  title: 'Rinderrouladen',
  authorId: 'user-1',
  image: 'test-image.jpg',
  portionen: 4,
  ingredients: ['4 Rinderrouladen'],
  steps: ['Rouladen flach klopfen.', 'Rouladen rundherum anbraten.', 'Zugedeckt schmoren lassen.'],
};
const rotkohl = {
  id: 'rotkohl',
  title: 'Apfelrotkohl',
  authorId: 'user-1',
  image: 'test-image.jpg',
  portionen: 4,
  ingredients: ['1 Rotkohl'],
  steps: ['Rotkohl fein hobeln.', 'Zugedeckt köcheln lassen.'],
};
const kloesse = {
  id: 'kloesse',
  title: 'Kartoffelklöße',
  authorId: 'user-1',
  image: 'test-image.jpg',
  portionen: 8,
  ingredients: ['1 kg Kartoffeln'],
  steps: ['Kartoffeln kochen.', 'Klöße formen.'],
};
const bratapfel = {
  id: 'bratapfel',
  title: 'Bratapfel',
  authorId: 'user-1',
  image: 'test-image.jpg',
  portionen: 4,
  ingredients: ['4 Äpfel'],
  steps: ['Äpfel füllen und backen.'],
};
const pudding = {
  id: 'pudding',
  title: 'Vanillepudding',
  authorId: 'user-1',
  image: 'test-image.jpg',
  portionen: 4,
  ingredients: ['1 l Milch'],
  steps: ['Milch aufkochen.'],
};
const salat = {
  id: 'salat',
  title: 'Gurkensalat',
  authorId: 'user-1',
  image: 'test-image.jpg',
  portionen: 4,
  ingredients: ['1 Gurke'],
  steps: ['Gurke hobeln.'],
};
const allRecipes = [rouladen, rotkohl, kloesse, bratapfel, pudding, salat];

const flaggedUser = { id: 'user-1', vorname: 'Test', nachname: 'User', parallelKochen: true };
const sundayMenu = {
  id: 'menu-1',
  name: 'Sonntagsessen',
  sections: [
    { name: 'Hauptgang', recipeIds: ['rouladen'] },
    { name: 'Beilagen', recipeIds: ['rotkohl', 'kloesse'] },
  ],
};

// Spielt App.js nach: Die Kochsitzung öffnet Rezepte, indem sie das angezeigte Rezept wechselt
function Harness({ user = flaggedUser, menu = null, onPortionCountChange, onHeaderVisibilityChange }) {
  const [current, setCurrent] = React.useState(rouladen);
  return (
    <CookingSessionProvider onOpenRecipe={(recipe) => setCurrent(allRecipes.find((r) => r.id === recipe.id) || recipe)}>
      <RecipeDetail
        recipe={current}
        allRecipes={allRecipes}
        currentUser={user}
        menu={menu}
        onPortionCountChange={onPortionCountChange}
        onHeaderVisibilityChange={onHeaderVisibilityChange}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    </CookingSessionProvider>
  );
}

// Die einrichtbaren Button-Icons laden asynchron; bis dahin sind die Knöpfe unsichtbar (wie die FABs)
async function enterCookingMode() {
  await act(async () => {});
  fireEvent.click(document.querySelector('.overlay-cooking-mode-static'));
}

function titleBarTitle() {
  return document.querySelector('.cooking-mode-titlebar-title')?.textContent;
}

function openSheet() {
  fireEvent.click(screen.getByRole('button', { name: 'Weiteres Rezept dazunehmen' }));
  return screen.getByRole('dialog', { name: 'Was kochst du dazu?' });
}

function addRecipeViaSearch(query, title) {
  const sheet = openSheet();
  fireEvent.change(within(sheet).getByLabelText('Rezept suchen'), { target: { value: query } });
  fireEvent.click(within(sheet).getByRole('button', { name: `${title} dazunehmen` }));
}

function activeStepIndex() {
  return Array.from(document.querySelectorAll('.step-card')).findIndex((card) => card.classList.contains('active'));
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 400 });
  Object.defineProperty(navigator, 'wakeLock', {
    writable: true,
    configurable: true,
    value: { request: jest.fn().mockResolvedValue({ release: jest.fn().mockResolvedValue(undefined) }) },
  });
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  mockButtonIcons = {};
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 768 });
});

// Handy im Querformat (iPhone 15): RecipeDetail schaltet den Kochmodus dann von selbst ein
function setLandscapeViewport() {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 852 });
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 393 });
}

function landscapeTitle() {
  return document.querySelector('.cooking-mode-landscape-title')?.textContent;
}

function railItemsOf() {
  const rail = screen.getByRole('navigation', { name: 'Rezepte am Herd' });
  return within(rail).getAllByRole('listitem');
}

describe('RecipeDetail – parallel kochen (Rollen-Flag parallelKochen)', () => {
  test('without the flag the cooking mode has no title bar', async () => {
    renderWithProviders(<Harness user={{ id: 'user-1', vorname: 'Test', nachname: 'User' }} />);
    await enterCookingMode();
    expect(document.querySelector('.cooking-mode-active')).toBeInTheDocument();
    expect(document.querySelector('.cooking-mode-titlebar')).toBeNull();
  });

  test('the title bar names the recipe and the sheet suggests the other recipes of the menu', async () => {
    renderWithProviders(<Harness menu={sundayMenu} />);
    await enterCookingMode();
    expect(titleBarTitle()).toBe('Rinderrouladen');

    const sheet = openSheet();
    const menuSection = within(sheet).getByRole('region', { name: 'Aus der Festtafel „Sonntagsessen“' });
    expect(within(menuSection).getByRole('button', { name: 'Apfelrotkohl dazunehmen' })).toBeInTheDocument();
    expect(within(menuSection).getByRole('button', { name: 'Kartoffelklöße dazunehmen' })).toBeInTheDocument();
    expect(within(menuSection).queryByRole('button', { name: 'Rinderrouladen dazunehmen' })).toBeNull();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Abbrechen' }));
    // Das Sheet blendet aus (useFadeOutClose), bevor es verschwindet
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Was kochst du dazu?' })).toBeNull());
  });

  test('the search finds recipes by title and leaves out the current one', async () => {
    renderWithProviders(<Harness />);
    await enterCookingMode();
    const sheet = openSheet();

    fireEvent.change(within(sheet).getByLabelText('Rezept suchen'), { target: { value: 'klö' } });
    expect(within(sheet).getByRole('button', { name: 'Kartoffelklöße dazunehmen' })).toBeInTheDocument();

    fireEvent.change(within(sheet).getByLabelText('Rezept suchen'), { target: { value: 'roulad' } });
    expect(within(sheet).getByText('Kein Rezept gefunden.')).toBeInTheDocument();
  });

  test('adding a recipe parks the current one; „Zurück“ brings it back at its step', async () => {
    renderWithProviders(<Harness />);
    await enterCookingMode();
    fireEvent.click(document.querySelectorAll('.step-card')[1]);
    expect(activeStepIndex()).toBe(1);

    addRecipeViaSearch('rotkohl', 'Apfelrotkohl');

    expect(titleBarTitle()).toBe('Apfelrotkohl');
    expect(document.querySelector('.cooking-mode-active')).toBeInTheDocument();
    expect(activeStepIndex()).toBe(0);
    expect(screen.getByText('„Rinderrouladen“ läuft im Hintergrund')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));

    expect(titleBarTitle()).toBe('Rinderrouladen');
    expect(activeStepIndex()).toBe(1);
  });

  test('ending the cooking mode lets the next recipe move up; the last one ends normally', async () => {
    renderWithProviders(<Harness />);
    await enterCookingMode();
    addRecipeViaSearch('rotkohl', 'Apfelrotkohl');
    expect(titleBarTitle()).toBe('Apfelrotkohl');

    fireEvent.click(screen.getByRole('button', { name: 'Kochmodus beenden' }));
    expect(titleBarTitle()).toBe('Rinderrouladen');
    expect(document.querySelector('.cooking-mode-active')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Kochmodus beenden' }));
    expect(document.querySelector('.cooking-mode-active')).toBeNull();
  });

  test('the add button has no text, only its own icon (default: pot with plus)', async () => {
    isBase64Image.mockImplementation((value) => typeof value === 'string' && value.startsWith('data:image/'));
    renderWithProviders(<Harness />);
    await enterCookingMode();

    const button = screen.getByRole('button', { name: 'Weiteres Rezept dazunehmen' });
    expect(button.textContent.trim()).toBe('');
    expect(button).toHaveAttribute('title', 'Weiteres Rezept dazunehmen');
    expect(button.querySelector('img')).toHaveAttribute('src', defaultIcon('potPlus'));
  });

  test('the add button shows the icon configured as button icon cookingAddRecipe', async () => {
    isBase64Image.mockImplementation((value) => typeof value === 'string' && value.startsWith('data:image/'));
    mockButtonIcons = { cookingAddRecipe: 'data:image/png;base64,QUJD' };
    renderWithProviders(<Harness />);
    await enterCookingMode();

    const button = screen.getByRole('button', { name: 'Weiteres Rezept dazunehmen' });
    expect(button.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,QUJD');
    expect(button).toHaveStyle({ visibility: 'visible' });
    expect(button.textContent.trim()).toBe('');
  });

  test('with six recipes the sheet asks to end one first', async () => {
    renderWithProviders(<Harness />);
    await enterCookingMode();
    addRecipeViaSearch('rotkohl', 'Apfelrotkohl');
    addRecipeViaSearch('klö', 'Kartoffelklöße');
    addRecipeViaSearch('brat', 'Bratapfel');
    addRecipeViaSearch('pudding', 'Vanillepudding');
    addRecipeViaSearch('gurke', 'Gurkensalat');

    const sheet = openSheet();
    expect(within(sheet).getByText(/Es kochen schon sechs Rezepte gleichzeitig/)).toBeInTheDocument();
    expect(within(sheet).queryByLabelText('Rezept suchen')).toBeNull();
  });

  test('the dock at the bottom shows the parked recipe; tapping it swaps both recipes', async () => {
    renderWithProviders(<Harness />);
    await enterCookingMode();
    expect(document.querySelector('.cooking-dock')).toBeNull();
    fireEvent.click(document.querySelectorAll('.step-card')[1]);
    addRecipeViaSearch('rotkohl', 'Apfelrotkohl');

    expect(document.querySelector('.cooking-mode-has-dock')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rinderrouladen öffnen, Schritt 2 von 3' }));

    expect(titleBarTitle()).toBe('Rinderrouladen');
    expect(activeStepIndex()).toBe(1);
    expect(screen.getByRole('button', { name: 'Apfelrotkohl öffnen, Schritt 1 von 2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Rinderrouladen öffnen/ })).toBeNull();
  });

  test('closing a recipe with a running timer parks it; the dock outside the cooking mode shows it', async () => {
    const timedRouladen = { ...rouladen, steps: ['Rouladen flach klopfen.', 'Rouladen anbraten.', 'Zugedeckt 90 Minuten schmoren lassen.'] };
    function CloseHarness({ show }) {
      return (
        <CookingSessionProvider onOpenRecipe={() => {}}>
          {show && (
            <RecipeDetail
              recipe={timedRouladen}
              allRecipes={allRecipes}
              currentUser={flaggedUser}
              onBack={() => {}}
              onEdit={() => {}}
              onDelete={() => {}}
            />
          )}
          <CookingSessionDock placement="top" />
        </CookingSessionProvider>
      );
    }
    const { rerender } = renderWithProviders(<CloseHarness show />);
    await enterCookingMode();
    fireEvent.click(document.querySelector('.step-timer-start-btn'));

    rerender(<CloseHarness show={false} />);

    expect(screen.getByRole('button', { name: 'Rinderrouladen öffnen, Timer 1:30:00' })).toBeInTheDocument();
    expect(screen.getByText('„Rinderrouladen“ läuft im Hintergrund')).toBeInTheDocument();
  });

  test('closing a recipe without a running timer does not park it', async () => {
    function CloseHarness({ show }) {
      return (
        <CookingSessionProvider onOpenRecipe={() => {}}>
          {show && (
            <RecipeDetail recipe={rouladen} allRecipes={allRecipes} currentUser={flaggedUser} onBack={() => {}} onEdit={() => {}} onDelete={() => {}} />
          )}
          <CookingSessionDock placement="top" />
        </CookingSessionProvider>
      );
    }
    const { rerender } = renderWithProviders(<CloseHarness show />);
    await enterCookingMode();

    rerender(<CloseHarness show={false} />);

    expect(screen.queryByRole('navigation', { name: 'Rezepte im Hintergrund' })).toBeNull();
  });

  test('only recipes of the open menu write their portions into it', async () => {
    const onPortionCountChange = jest.fn();
    renderWithProviders(<Harness menu={{ ...sundayMenu, sections: [{ name: 'Hauptgang', recipeIds: ['rouladen'] }] }} onPortionCountChange={onPortionCountChange} />);
    await enterCookingMode();

    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    expect(onPortionCountChange).toHaveBeenCalledWith('rouladen', 5);

    addRecipeViaSearch('rotkohl', 'Apfelrotkohl');
    onPortionCountChange.mockClear();
    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    expect(onPortionCountChange).not.toHaveBeenCalled();
  });
});

describe('RecipeDetail – parallel kochen im Querformat (Entwurf Q2, Rezept-Schiene)', () => {
  beforeEach(setLandscapeViewport);

  test('the rail replaces title bar and dock; the ingredients column names the recipe', async () => {
    renderWithProviders(<Harness />);
    await act(async () => {});

    const content = document.querySelector('.recipe-detail-content');
    expect(content).toHaveClass('cooking-mode-landscape');
    expect(content).toHaveClass('cooking-mode-has-rail');
    expect(document.querySelector('.cooking-mode-titlebar')).toBeNull();
    expect(landscapeTitle()).toBe('Rinderrouladen');

    const rail = screen.getByRole('navigation', { name: 'Rezepte am Herd' });
    expect(within(rail).getByRole('img', { name: 'Rinderrouladen' })).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: 'Weiteres Rezept dazunehmen' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Rezepte im Hintergrund' })).toBeNull();
  });

  test('„+“ in the rail adds a recipe; the order stays and tapping the parked one swaps back at its step', async () => {
    renderWithProviders(<Harness />);
    await act(async () => {});
    fireEvent.click(document.querySelectorAll('.step-card')[1]);
    addRecipeViaSearch('rotkohl', 'Apfelrotkohl');

    expect(landscapeTitle()).toBe('Apfelrotkohl');
    let items = railItemsOf();
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole('button', { name: 'Rinderrouladen öffnen, Schritt 2 von 3' })).toBeInTheDocument();
    expect(items[1]).toHaveClass('cooking-rail-item--current');

    fireEvent.click(within(items[0]).getByRole('button', { name: 'Rinderrouladen öffnen, Schritt 2 von 3' }));

    expect(landscapeTitle()).toBe('Rinderrouladen');
    expect(activeStepIndex()).toBe(1);
    items = railItemsOf();
    expect(items[0]).toHaveClass('cooking-rail-item--current');
    expect(within(items[1]).getByRole('button', { name: 'Apfelrotkohl öffnen, Schritt 1 von 2' })).toBeInTheDocument();
  });

  test('without the flag the landscape cooking mode stays as before', async () => {
    renderWithProviders(<Harness user={{ ...flaggedUser, parallelKochen: false }} />);
    await act(async () => {});

    const content = document.querySelector('.recipe-detail-content');
    expect(content).toHaveClass('cooking-mode-landscape');
    expect(content).not.toHaveClass('cooking-mode-has-rail');
    expect(screen.queryByRole('navigation', { name: 'Rezepte am Herd' })).toBeNull();
    expect(landscapeTitle()).toBeUndefined();
  });

  describe('the rail stands opposite the camera', () => {
    function setDeviceOrientation(value) {
      Object.defineProperty(window, 'orientation', { configurable: true, writable: true, value });
    }

    function railNav() {
      return screen.getByRole('navigation', { name: 'Rezepte am Herd' });
    }

    afterEach(() => {
      delete window.orientation;
    });

    test('turned to the left (camera on the left): the rail moves to the right', async () => {
      setDeviceOrientation(90);
      renderWithProviders(<Harness />);
      await act(async () => {});

      expect(document.querySelector('.recipe-detail-content')).toHaveClass('cooking-mode-rail-right');
      expect(railNav()).toHaveClass('cooking-rail--right');
    });

    test('turned to the right (camera on the right): the rail stays on the left; it follows a half turn', async () => {
      setDeviceOrientation(-90);
      renderWithProviders(<Harness />);
      await act(async () => {});

      expect(document.querySelector('.recipe-detail-content')).not.toHaveClass('cooking-mode-rail-right');
      expect(railNav()).toHaveClass('cooking-rail--left');

      // Von quer nach quer gedreht: kein resize, nur orientationchange
      setDeviceOrientation(90);
      act(() => { window.dispatchEvent(new Event('orientationchange')); });
      expect(document.querySelector('.recipe-detail-content')).toHaveClass('cooking-mode-rail-right');
      expect(railNav()).toHaveClass('cooking-rail--right');
    });

    test('without a known direction the rail stays on the left, within the safe area as before', async () => {
      renderWithProviders(<Harness />);
      await act(async () => {});

      expect(railNav()).toHaveClass('cooking-rail--left');
      expect(document.querySelector('.recipe-detail-content')).not.toHaveClass('cooking-mode-rail-right');
    });

    test('rotating back to portrait ends the cooking mode', async () => {
      setDeviceOrientation(90);
      renderWithProviders(<Harness />);
      await act(async () => {});

      setDeviceOrientation(0);
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 393 });
      Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 852 });
      act(() => { window.dispatchEvent(new Event('resize')); });
      act(() => { jest.advanceTimersByTime(200); });

      expect(screen.queryByRole('navigation', { name: 'Rezepte am Herd' })).toBeNull();
    });

    test('without the flag the rail stays away, whatever the direction', async () => {
      setDeviceOrientation(90);
      renderWithProviders(<Harness user={{ ...flaggedUser, parallelKochen: false }} />);
      await act(async () => {});

      expect(document.querySelector('.recipe-detail-content')).toHaveClass('cooking-mode-landscape');
      expect(document.querySelector('.recipe-detail-content')).not.toHaveClass('cooking-mode-rail-right');
    });
  });
});

describe('RecipeDetail – Schiene ohne Abstand zum Displayrand (viewport-fit=cover nur beim Drehen)', () => {
  const INITIAL_VIEWPORT = 'width=device-width, initial-scale=1';

  function viewportContent() {
    return document.querySelector('meta[name="viewport"]').getAttribute('content');
  }

  // Drehen wie auf dem iPhone: window.orientation und orientationchange, dann resize; RecipeDetail entprellt 150 ms
  function rotateTo(orientation, width, height) {
    Object.defineProperty(window, 'orientation', { configurable: true, writable: true, value: orientation });
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: height });
    act(() => { window.dispatchEvent(new Event('orientationchange')); });
    act(() => { window.dispatchEvent(new Event('resize')); });
    act(() => { jest.advanceTimersByTime(200); });
  }

  beforeEach(() => {
    document.head.innerHTML = `<meta name="viewport" content="${INITIAL_VIEWPORT}" />`;
    Object.defineProperty(window, 'orientation', { configurable: true, writable: true, value: 0 });
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 393 });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 852 });
  });

  afterEach(() => {
    resetViewportCoverForTests();
    delete window.orientation;
    document.head.innerHTML = '';
  });

  test('rotated into landscape with a recipe open, the page reaches the edge; rotated back, the safe area returns', async () => {
    renderWithProviders(<Harness />);
    await act(async () => {});
    expect(viewportContent()).toBe(INITIAL_VIEWPORT);

    rotateTo(90, 852, 393);
    expect(viewportContent()).toBe(`${INITIAL_VIEWPORT}, viewport-fit=cover`);
    const content = document.querySelector('.recipe-detail-content');
    expect(content).toHaveClass('cooking-mode-landscape');
    expect(content).toHaveClass('cooking-mode-rail-right');
    expect(screen.getByRole('navigation', { name: 'Rezepte am Herd' })).toHaveClass('cooking-rail--right');

    rotateTo(0, 393, 852);
    expect(viewportContent()).toBe(INITIAL_VIEWPORT);
    expect(screen.queryByRole('navigation', { name: 'Rezepte am Herd' })).toBeNull();
  });

  test('opened in landscape without rotating, nothing switches in between; the rail stays within the safe area', async () => {
    Object.defineProperty(window, 'orientation', { configurable: true, writable: true, value: 90 });
    setLandscapeViewport();
    renderWithProviders(<Harness />);
    await act(async () => {});

    expect(screen.getByRole('navigation', { name: 'Rezepte am Herd' })).toHaveClass('cooking-rail--right');
    expect(viewportContent()).toBe(INITIAL_VIEWPORT);

    // Erst die nächste Drehung (hier von quer nach quer) schaltet um
    rotateTo(-90, 852, 393);
    expect(viewportContent()).toBe(`${INITIAL_VIEWPORT}, viewport-fit=cover`);
    expect(screen.getByRole('navigation', { name: 'Rezepte am Herd' })).toHaveClass('cooking-rail--left');
  });

  test('without the flag rotating changes nothing', async () => {
    renderWithProviders(<Harness user={{ ...flaggedUser, parallelKochen: false }} />);
    await act(async () => {});

    rotateTo(90, 852, 393);
    expect(document.querySelector('.recipe-detail-content')).toHaveClass('cooking-mode-landscape');
    expect(viewportContent()).toBe(INITIAL_VIEWPORT);
  });
});

// iPad Pro 11" quer: Touch-Bildschirm (Finger als Zeiger), breiter als hoch
function setTabletViewport(width = 1194, height = 834) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: height });
  window.matchMedia = jest.fn((query) => ({
    matches: query === '(pointer: coarse)',
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
}

function carouselCards() {
  const nav = screen.getByRole('navigation', { name: 'Weitere Rezepte am Herd' });
  return within(nav).queryAllByRole('button', { name: /nach vorn holen/ }).map((b) => b.getAttribute('aria-label'));
}

describe('RecipeDetail – parallel kochen auf dem iPad quer (Entwurf I4, Karussell)', () => {
  const originalMatchMedia = window.matchMedia;
  beforeEach(() => setTabletViewport());
  afterEach(() => { window.matchMedia = originalMatchMedia; });

  test('the picture offers the cooking mode; it starts with two columns, the carousel still empty', async () => {
    const onHeaderVisibilityChange = jest.fn();
    renderWithProviders(<Harness onHeaderVisibilityChange={onHeaderVisibilityChange} />);
    await act(async () => {});
    // Bisher ohne Einstieg (Desktop-Ansicht ab 769 px); Schließen bleibt in der Kopfzeile, nicht doppelt auf dem Bild
    expect(document.querySelector('.overlay-cooking-mode-static')).toBeInTheDocument();
    expect(document.querySelector('.overlay-back-button')).toBeNull();

    await enterCookingMode();

    expect(document.querySelector('.recipe-detail-content')).toHaveClass('cooking-mode-split');
    expect(titleBarTitle()).toBe('Rinderrouladen');
    expect(carouselCards()).toEqual([]);
    expect(screen.getByText('Noch kein weiteres Rezept am Herd')).toBeInTheDocument();
    // Die zwei Spalten füllen den Bildschirm: der App-Header blendet aus
    expect(onHeaderVisibilityChange).toHaveBeenLastCalledWith(false);
  });

  test('„Rezept dazunehmen“ in the empty carousel adds a recipe; the first one moves into the carousel at its step', async () => {
    renderWithProviders(<Harness />);
    await enterCookingMode();
    fireEvent.click(document.querySelectorAll('.step-card')[1]);

    fireEvent.click(screen.getByRole('button', { name: 'Rezept dazunehmen' }));
    const sheet = screen.getByRole('dialog', { name: 'Was kochst du dazu?' });
    fireEvent.change(within(sheet).getByLabelText('Rezept suchen'), { target: { value: 'rotkohl' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Apfelrotkohl dazunehmen' }));

    expect(titleBarTitle()).toBe('Apfelrotkohl');
    expect(carouselCards()).toEqual(['Rinderrouladen nach vorn holen, Schritt 2 von 3']);
    expect(screen.getByRole('button', { name: 'Rinderrouladen nach vorn holen, Schritt 2 von 3' }))
      .toHaveAccessibleDescription('Rouladen rundherum anbraten.');
    // Die Leiste gibt es hier nicht, das Karussell übernimmt ihre Aufgabe
    expect(screen.queryByRole('navigation', { name: 'Rezepte im Hintergrund' })).toBeNull();
    expect(document.querySelector('.recipe-detail-content')).not.toHaveClass('cooking-mode-has-dock');
    await act(async () => {});
  });

  test('tapping a card swaps in place: the recipe in front takes its place, the other cards stay', async () => {
    renderWithProviders(<Harness />);
    await enterCookingMode();
    addRecipeViaSearch('rotkohl', 'Apfelrotkohl');
    addRecipeViaSearch('klö', 'Kartoffelklöße');
    expect(carouselCards()).toEqual([
      'Rinderrouladen nach vorn holen, Schritt 1 von 3',
      'Apfelrotkohl nach vorn holen, Schritt 1 von 2',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Rinderrouladen nach vorn holen, Schritt 1 von 3' }));

    expect(titleBarTitle()).toBe('Rinderrouladen');
    expect(carouselCards()).toEqual([
      'Kartoffelklöße nach vorn holen, Schritt 1 von 2',
      'Apfelrotkohl nach vorn holen, Schritt 1 von 2',
    ]);
  });

  test('turned upright, the iPad shows the dock again instead of the carousel', async () => {
    renderWithProviders(<Harness />);
    await enterCookingMode();
    addRecipeViaSearch('rotkohl', 'Apfelrotkohl');
    expect(document.querySelector('.cooking-mode-split')).toBeInTheDocument();

    setTabletViewport(834, 1194);
    act(() => {
      window.dispatchEvent(new Event('resize'));
      jest.advanceTimersByTime(150);
    });

    expect(document.querySelector('.cooking-mode-active')).toBeInTheDocument();
    expect(document.querySelector('.cooking-mode-split')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Weitere Rezepte am Herd' })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Rezepte im Hintergrund' })).toBeInTheDocument();
    await act(async () => {});
  });

  test('without the flag the iPad keeps its view: no cooking mode button on the picture, no carousel', async () => {
    renderWithProviders(<Harness user={{ ...flaggedUser, parallelKochen: false }} />);
    await act(async () => {});

    expect(document.querySelector('.overlay-cooking-mode-static')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Weitere Rezepte am Herd' })).toBeNull();
  });
});

describe('RecipeDetail – Kochmodus quer: Schritte nur per Wischen', () => {
  beforeEach(setLandscapeViewport);

  test('there are no buttons for the next and the previous step', async () => {
    renderWithProviders(<Harness />);
    await act(async () => {});

    expect(document.querySelector('.cooking-mode-landscape')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nächster Schritt' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Vorheriger Schritt' })).toBeNull();
    expect(document.querySelector('.step-nav')).toBeNull();
  });
});
