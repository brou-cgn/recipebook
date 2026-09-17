import React from 'react';
import { render, screen } from '@testing-library/react';
import RecipeList, { filterTutorialsByMealCategory } from './RecipeList';

// Tutorials mit zugeordneter Speisekategorie sollen nur im Feed auftauchen,
// solange kein Speisekategorie-Filter gesetzt ist oder ihre Kategorie im
// Filter aktiv ist. Tutorials ohne Zuordnung bleiben unabhaengig davon
// sichtbar.

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

const dessertTutorial = { id: 't-dessert', title: 'Baiser aufschlagen', speisekategorie: ['Dessert'] };
const mainTutorial = { id: 't-main', title: 'Fleisch anbraten', speisekategorie: ['Hauptgericht'] };
const genericTutorial = { id: 't-generic', title: 'Zwiebeln schneiden' };

describe('filterTutorialsByMealCategory', () => {
  const tutorials = [dessertTutorial, mainTutorial, genericTutorial];

  test('laesst ohne aktiven Filter alle Tutorials durch', () => {
    expect(filterTutorialsByMealCategory(tutorials, '', [])).toEqual(tutorials);
    expect(filterTutorialsByMealCategory(tutorials, undefined, undefined)).toEqual(tutorials);
  });

  test('behaelt bei aktivem Filter nur passende und nicht zugeordnete Tutorials', () => {
    const result = filterTutorialsByMealCategory(tutorials, '', ['Dessert']);
    expect(result.map((t) => t.id)).toEqual(['t-dessert', 't-generic']);
  });

  test('zeigt ein Tutorial, sobald eine seiner Kategorien im Filter aktiv ist', () => {
    const multi = [{ id: 't-multi', speisekategorie: ['Vorspeise', 'Dessert'] }];
    expect(filterTutorialsByMealCategory(multi, '', ['Dessert'])).toHaveLength(1);
    expect(filterTutorialsByMealCategory(multi, '', ['Hauptgericht'])).toHaveLength(0);
  });

  test('wertet die Kochbuch-Einzelkategorie genauso aus wie die Mehrfachauswahl', () => {
    const result = filterTutorialsByMealCategory(tutorials, 'Hauptgericht', []);
    expect(result.map((t) => t.id)).toEqual(['t-main', 't-generic']);
  });

  test('verknuepft beide Filterquellen additiv', () => {
    // Einzelkategorie "Dessert" und Mehrfachauswahl "Hauptgericht" schliessen
    // sich fuer zugeordnete Tutorials gegenseitig aus - uebrig bleibt nur das
    // Tutorial ohne Zuordnung.
    const result = filterTutorialsByMealCategory(tutorials, 'Dessert', ['Hauptgericht']);
    expect(result.map((t) => t.id)).toEqual(['t-generic']);
  });

  test('behandelt eine als String gespeicherte Speisekategorie wie ein Ein-Element-Array', () => {
    const legacy = [{ id: 't-legacy', speisekategorie: 'Dessert' }];
    expect(filterTutorialsByMealCategory(legacy, '', ['Dessert'])).toHaveLength(1);
    expect(filterTutorialsByMealCategory(legacy, '', ['Vorspeise'])).toHaveLength(0);
  });

  test('kommt mit fehlender Tutorialliste klar', () => {
    expect(filterTutorialsByMealCategory(undefined, '', ['Dessert'])).toEqual([]);
    expect(filterTutorialsByMealCategory(null, '', [])).toEqual([]);
  });
});

describe('RecipeList - Speisekategorie-Filter auf eingewobenen Tutorials', () => {
  // Vier Rezepte ergeben genau einen Einwebe-Slot (TUTORIAL_WEAVE_INTERVAL).
  const recipes = [1, 2, 3, 4].map((n) => ({
    id: String(n),
    title: `Test Recipe ${n}`,
    ingredients: ['a'],
    steps: ['b'],
  }));

  const renderList = (props = {}) => render(
    <RecipeList
      recipes={recipes}
      tutorials={[dessertTutorial]}
      onSelectRecipe={() => {}}
      onAddRecipe={() => {}}
      categoryFilter=""
      currentUser={{ id: 'user-1' }}
      {...props}
    />
  );

  test('zeigt das Tutorial ohne aktiven Speisekategorie-Filter', async () => {
    renderList();
    expect(await screen.findByText('Baiser aufschlagen')).toBeInTheDocument();
  });

  test('zeigt das Tutorial, wenn seine Speisekategorie im Filter aktiv ist', async () => {
    renderList({ activeFilters: { selectedCategories: ['Dessert'] } });
    expect(await screen.findByText('Baiser aufschlagen')).toBeInTheDocument();
  });

  test('blendet das Tutorial aus, wenn ein anderer Speisekategorie-Filter aktiv ist', async () => {
    renderList({ activeFilters: { selectedCategories: ['Hauptgericht'] } });
    expect(await screen.findByText('Test Recipe 1')).toBeInTheDocument();
    expect(screen.queryByText('Baiser aufschlagen')).not.toBeInTheDocument();
  });

  test('blendet ein Tutorial ohne Zuordnung auch bei aktivem Filter nicht aus', async () => {
    renderList({ tutorials: [genericTutorial], activeFilters: { selectedCategories: ['Hauptgericht'] } });
    expect(await screen.findByText('Zwiebeln schneiden')).toBeInTheDocument();
  });
});
