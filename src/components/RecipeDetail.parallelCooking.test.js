import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import RecipeDetail from './RecipeDetail';
import { CookingSessionProvider } from '../contexts/CookingSessionContext';

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
  getButtonIcons: () => Promise.resolve({}),
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
const allRecipes = [rouladen, rotkohl, kloesse, bratapfel];

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
function Harness({ user = flaggedUser, menu = null, onPortionCountChange }) {
  const [current, setCurrent] = React.useState(rouladen);
  return (
    <CookingSessionProvider onOpenRecipe={(recipe) => setCurrent(allRecipes.find((r) => r.id === recipe.id) || recipe)}>
      <RecipeDetail
        recipe={current}
        allRecipes={allRecipes}
        currentUser={user}
        menu={menu}
        onPortionCountChange={onPortionCountChange}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    </CookingSessionProvider>
  );
}

function enterCookingMode() {
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
});

describe('RecipeDetail – parallel kochen (Rollen-Flag parallelKochen)', () => {
  test('without the flag the cooking mode has no title bar', () => {
    renderWithProviders(<Harness user={{ id: 'user-1', vorname: 'Test', nachname: 'User' }} />);
    enterCookingMode();
    expect(document.querySelector('.cooking-mode-active')).toBeInTheDocument();
    expect(document.querySelector('.cooking-mode-titlebar')).toBeNull();
  });

  test('the title bar names the recipe and the sheet suggests the other recipes of the menu', () => {
    renderWithProviders(<Harness menu={sundayMenu} />);
    enterCookingMode();
    expect(titleBarTitle()).toBe('Rinderrouladen');

    const sheet = openSheet();
    const menuSection = within(sheet).getByRole('region', { name: 'Aus der Festtafel „Sonntagsessen“' });
    expect(within(menuSection).getByRole('button', { name: 'Apfelrotkohl dazunehmen' })).toBeInTheDocument();
    expect(within(menuSection).getByRole('button', { name: 'Kartoffelklöße dazunehmen' })).toBeInTheDocument();
    expect(within(menuSection).queryByRole('button', { name: 'Rinderrouladen dazunehmen' })).toBeNull();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByRole('dialog', { name: 'Was kochst du dazu?' })).toBeNull();
  });

  test('the search finds recipes by title and leaves out the current one', () => {
    renderWithProviders(<Harness />);
    enterCookingMode();
    const sheet = openSheet();

    fireEvent.change(within(sheet).getByLabelText('Rezept suchen'), { target: { value: 'klö' } });
    expect(within(sheet).getByRole('button', { name: 'Kartoffelklöße dazunehmen' })).toBeInTheDocument();

    fireEvent.change(within(sheet).getByLabelText('Rezept suchen'), { target: { value: 'roulad' } });
    expect(within(sheet).getByText('Kein Rezept gefunden.')).toBeInTheDocument();
  });

  test('adding a recipe parks the current one; „Zurück“ brings it back at its step', () => {
    renderWithProviders(<Harness />);
    enterCookingMode();
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

  test('ending the cooking mode lets the next recipe move up; the last one ends normally', () => {
    renderWithProviders(<Harness />);
    enterCookingMode();
    addRecipeViaSearch('rotkohl', 'Apfelrotkohl');
    expect(titleBarTitle()).toBe('Apfelrotkohl');

    fireEvent.click(screen.getByRole('button', { name: 'Kochmodus beenden' }));
    expect(titleBarTitle()).toBe('Rinderrouladen');
    expect(document.querySelector('.cooking-mode-active')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Kochmodus beenden' }));
    expect(document.querySelector('.cooking-mode-active')).toBeNull();
  });

  test('with four recipes the sheet asks to end one first', () => {
    renderWithProviders(<Harness />);
    enterCookingMode();
    addRecipeViaSearch('rotkohl', 'Apfelrotkohl');
    addRecipeViaSearch('klö', 'Kartoffelklöße');
    addRecipeViaSearch('brat', 'Bratapfel');

    const sheet = openSheet();
    expect(within(sheet).getByText(/Es kochen schon vier Rezepte gleichzeitig/)).toBeInTheDocument();
    expect(within(sheet).queryByLabelText('Rezept suchen')).toBeNull();
  });

  test('only recipes of the open menu write their portions into it', () => {
    const onPortionCountChange = jest.fn();
    renderWithProviders(<Harness menu={{ ...sundayMenu, sections: [{ name: 'Hauptgang', recipeIds: ['rouladen'] }] }} onPortionCountChange={onPortionCountChange} />);
    enterCookingMode();

    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    expect(onPortionCountChange).toHaveBeenCalledWith('rouladen', 5);

    addRecipeViaSearch('rotkohl', 'Apfelrotkohl');
    onPortionCountChange.mockClear();
    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    expect(onPortionCountChange).not.toHaveBeenCalled();
  });
});
