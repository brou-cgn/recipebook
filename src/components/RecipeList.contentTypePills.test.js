import React from 'react';
import { render, screen } from '@testing-library/react';
import RecipeList from './RecipeList';

// Die Pillen "Rezepte" und "Tutorials" (Suchoverlay und Filter-Sidebar)
// schalten die beiden Inhaltsarten des Feeds einzeln ab. Beide sind
// standardmaessig aktiv, der Feed sieht dann aus wie bisher.

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

// Vier Rezepte ergeben genau einen Einwebe-Slot (TUTORIAL_WEAVE_INTERVAL).
const recipes = [1, 2, 3, 4].map((n) => ({
  id: String(n),
  title: `Test Recipe ${n}`,
  ingredients: ['a'],
  steps: ['b'],
}));

const tutorial = { id: 't-1', title: 'Zwiebeln schneiden' };

const renderList = (props = {}) => render(
  <RecipeList
    recipes={recipes}
    tutorials={[tutorial]}
    onSelectRecipe={() => {}}
    onAddRecipe={() => {}}
    categoryFilter=""
    currentUser={{ id: 'user-1' }}
    {...props}
  />
);

describe('RecipeList - Inhaltsart-Pillen "Rezepte" und "Tutorials"', () => {
  test('zeigt standardmaessig Rezepte und Tutorials', async () => {
    renderList();
    expect(await screen.findByText('Test Recipe 1')).toBeInTheDocument();
    expect(screen.getByText('Zwiebeln schneiden')).toBeInTheDocument();
  });

  test('blendet die Tutorials aus, wenn showTutorials false ist', async () => {
    renderList({ showTutorials: false });
    expect(await screen.findByText('Test Recipe 1')).toBeInTheDocument();
    expect(screen.queryByText('Zwiebeln schneiden')).not.toBeInTheDocument();
  });

  test('blendet die Rezepte aus, zeigt die Tutorials aber weiter', async () => {
    renderList({ showRecipes: false });
    expect(await screen.findByText('Zwiebeln schneiden')).toBeInTheDocument();
    expect(screen.queryByText('Test Recipe 1')).not.toBeInTheDocument();
  });

  test('zeigt alle Tutorials, wenn die Rezepte ausgeblendet sind', async () => {
    // Ohne Rezepte gibt es keine Einwebe-Slots - die Tutorials bilden den
    // Feed dann allein, und zwar vollstaendig.
    const tutorials = [
      tutorial,
      { id: 't-2', title: 'Fleisch anbraten' },
      { id: 't-3', title: 'Baiser aufschlagen' },
    ];
    renderList({ tutorials, showRecipes: false });
    expect(await screen.findByText('Zwiebeln schneiden')).toBeInTheDocument();
    expect(screen.getByText('Fleisch anbraten')).toBeInTheDocument();
    expect(screen.getByText('Baiser aufschlagen')).toBeInTheDocument();
  });

  test('zeigt den Leerzustand, wenn beide Pillen deaktiviert sind', async () => {
    renderList({ showRecipes: false, showTutorials: false });
    expect(await screen.findByText('Nichts ausgewählt!')).toBeInTheDocument();
    expect(screen.queryByText('Test Recipe 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Zwiebeln schneiden')).not.toBeInTheDocument();
  });

  test('haelt Tutorials aus privaten Listen heraus, auch wenn die Pille aktiv ist', async () => {
    renderList({ activePrivateListId: 'list-1' });
    expect(await screen.findByText('Test Recipe 1')).toBeInTheDocument();
    expect(screen.queryByText('Zwiebeln schneiden')).not.toBeInTheDocument();
  });
});
