import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import RecipeList from './RecipeList';

// Die beiden Longpress-Einstiege rund um Tutorials haengen an den
// Rollenberechtigungen "Tutorial anlegen" (addTutorial) und
// "Tutorial bearbeiten" (editTutorial) aus der Tabelle "Funktionen nach
// Berechtigung". Fehlt die Berechtigung, muss die kurze Geste unveraendert
// weiterlaufen - der lange Druck darf nur nichts Zusaetzliches oeffnen.

jest.mock('../utils/userManagement', () => ({
  canEditRecipes: () => true,
  getUsers: () => Promise.resolve([]),
}));

jest.mock('../utils/customLists', () => ({
  getCustomLists: () => Promise.resolve({ mealCategories: [] }),
  getButtonIcons: () => Promise.resolve({ filterButton: '⚙', addRecipe: '➕' }),
  getSortSettings: () => Promise.resolve({
    trendingDays: 30,
    trendingMinViews: 5,
    newRecipeDays: 30,
    ratingMinVotes: 5,
  }),
  DEFAULT_BUTTON_ICONS: { filterButton: '⚙', addRecipe: '➕' },
  getEffectiveIcon: (icons, key) => icons[key] ?? '',
  getDarkModePreference: () => false,
  DEFAULT_TRENDING_DAYS: 30,
  DEFAULT_TRENDING_MIN_VIEWS: 5,
  DEFAULT_NEW_RECIPE_DAYS: 30,
  DEFAULT_RATING_MIN_VOTES: 5,
}));

jest.mock('../utils/userFavorites', () => ({
  getUserFavorites: () => Promise.resolve([]),
}));

jest.mock('../utils/recipeCallsFirestore', () => ({
  getRecentRecipeCalls: () => Promise.resolve([]),
}));

// Tutorials werden alle vier Rezepte in den Feed eingewoben
// (TUTORIAL_WEAVE_INTERVAL) - darunter erscheint keine Tutorialkarte.
const recipes = [1, 2, 3, 4].map((n) => ({
  id: String(n),
  title: `Test Recipe ${n}`,
  ingredients: ['a'],
  steps: ['b'],
}));
const tutorials = [{
  id: 'tut-1',
  title: 'Zwiebeln schneiden',
  videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
  category: 'schneiden',
}];

const longPressAddButton = (button) => {
  fireEvent.touchStart(button);
  act(() => { jest.advanceTimersByTime(600); });
  fireEvent.touchEnd(button);
};

describe('RecipeList - Tutorial-Longpress nach Berechtigung', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => { jest.runOnlyPendingTimers(); });
    jest.useRealTimers();
  });

  const renderList = (currentUser, handlers = {}) => render(
    <RecipeList
      recipes={recipes}
      tutorials={tutorials}
      onSelectRecipe={() => {}}
      onAddRecipe={handlers.onAddRecipe || (() => {})}
      onAddTutorial={handlers.onAddTutorial}
      onEditTutorial={handlers.onEditTutorial}
      categoryFilter=""
      currentUser={currentUser}
    />
  );

  test('Longpress auf "Rezept hinzufügen" öffnet das Tutorialformular mit addTutorial-Berechtigung', async () => {
    const onAddTutorial = jest.fn();
    const onAddRecipe = jest.fn();
    renderList({ id: 'user-1', addTutorial: true }, { onAddTutorial, onAddRecipe });

    const button = await screen.findByRole('button', { name: /Rezept hinzufügen \(lang drücken für Tutorial\)/i });
    longPressAddButton(button);

    expect(onAddTutorial).toHaveBeenCalled();
    expect(onAddRecipe).not.toHaveBeenCalled();
  });

  test('ohne addTutorial-Berechtigung legt auch der Longpress nur ein Rezept an', async () => {
    const onAddTutorial = jest.fn();
    const onAddRecipe = jest.fn();
    renderList({ id: 'user-1', addTutorial: false }, { onAddTutorial, onAddRecipe });

    const button = await screen.findByRole('button', { name: /^Rezept hinzufügen$/i });
    longPressAddButton(button);

    expect(onAddTutorial).not.toHaveBeenCalled();
    expect(onAddRecipe).toHaveBeenCalled();
  });

  test('der Button-Hinweis auf den Longpress fehlt ohne Berechtigung', async () => {
    renderList({ id: 'user-1' });

    const button = await screen.findByRole('button', { name: /^Rezept hinzufügen$/i });
    expect(button).toHaveAttribute('title', 'Rezept hinzufügen');
  });

  test('Tutorialkarte bekommt den Bearbeiten-Longpress nur mit editTutorial-Berechtigung', async () => {
    const onEditTutorial = jest.fn();
    renderList({ id: 'user-1', editTutorial: true }, { onEditTutorial });

    const card = await screen.findByRole('button', { name: /Zwiebeln schneiden.*abspielen/i });
    expect(card).toHaveAttribute('title', 'Zwiebeln schneiden (lang drücken zum Bearbeiten)');
  });

  test('ohne editTutorial-Berechtigung bleibt die Tutorialkarte reine Wiedergabe', async () => {
    const onEditTutorial = jest.fn();
    renderList({ id: 'user-1', editTutorial: false }, { onEditTutorial });

    const card = await screen.findByRole('button', { name: /Zwiebeln schneiden.*abspielen/i });
    expect(card).not.toHaveAttribute('title');
  });
});
