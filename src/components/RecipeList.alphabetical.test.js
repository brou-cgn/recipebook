import React from 'react';
import { render, screen } from '@testing-library/react';
import RecipeList from './RecipeList';
import { SpracheProvider } from '../contexts/SpracheContext';

// Mock the user management utility
jest.mock('../utils/userManagement', () => ({
  canEditRecipes: jest.fn(() => true),
  getUsers: () => Promise.resolve([]),
}));

// Mock the custom lists utility
jest.mock('../utils/customLists', () => ({
  getCustomLists: () => Promise.resolve({
    mealCategories: ['Appetizer', 'Main Course', 'Dessert']
  }),
  getButtonIcons: () => Promise.resolve({
    filterButton: '⚙'
  }),
  getSortSettings: () => Promise.resolve({
    trendingDays: 30,
    trendingMinViews: 5,
    newRecipeDays: 30,
    ratingMinVotes: 5,
  }),
  DEFAULT_BUTTON_ICONS: {
    filterButton: '⚙'
  },
  getEffectiveIcon: (icons, key) => icons[key] ?? '',
  getDarkModePreference: () => false,
  DEFAULT_TRENDING_DAYS: 30,
  DEFAULT_TRENDING_MIN_VIEWS: 5,
  DEFAULT_NEW_RECIPE_DAYS: 30,
  DEFAULT_RATING_MIN_VOTES: 5,
}));

// Mock getUserFavorites
jest.mock('../utils/userFavorites', () => ({
  getUserFavorites: () => Promise.resolve([]),
}));

// Mock recipeCallsFirestore
jest.mock('../utils/recipeCallsFirestore', () => ({
  getRecentRecipeCalls: () => Promise.resolve([]),
  getRecentRecipeViewCounts: () => Promise.resolve(new Map()),
}));

const mockRecipes = [
  {
    id: '3',
    title: 'Zebra Cake',
    ingredients: ['ingredient1'],
    steps: ['step1'],
    speisekategorie: 'Dessert',
    authorId: 'user-1'
  },
  {
    id: '1',
    title: 'Apple Pie',
    ingredients: ['ingredient1', 'ingredient2'],
    steps: ['step1', 'step2'],
    speisekategorie: 'Dessert',
    authorId: 'user-1'
  },
  {
    id: '2',
    title: 'Banana Bread',
    ingredients: ['ingredient1'],
    steps: ['step1'],
    speisekategorie: 'Dessert',
    authorId: 'user-1'
  }
];

describe('RecipeList - Alphabetical Sorting', () => {
  test('recipes are sorted alphabetically by title', async () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm=""
      />
    );
    
    // Wait for recipes to render
    await screen.findByText('Apple Pie');
    
    // Get all recipe cards
    const recipeCards = document.querySelectorAll('.recipe-card h3');
    const titles = Array.from(recipeCards).map(card => card.textContent);
    
    // Verify alphabetical order
    expect(titles).toEqual(['Apple Pie', 'Banana Bread', 'Zebra Cake']);
  });

  test('search filters recipes correctly', async () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm="banana"
      />
    );
    
    // Wait for filtered recipe to render
    await screen.findByText('Banana Bread');
    
    // Verify only matching recipe is shown
    expect(screen.queryByText('Apple Pie')).not.toBeInTheDocument();
    expect(screen.queryByText('Zebra Cake')).not.toBeInTheDocument();
  });

  test('search is case-insensitive', async () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm="APPLE"
      />
    );
    
    // Wait for filtered recipe to render
    await screen.findByText('Apple Pie');
    
    // Verify only matching recipe is shown
    expect(screen.queryByText('Banana Bread')).not.toBeInTheDocument();
    expect(screen.queryByText('Zebra Cake')).not.toBeInTheDocument();
  });

  test('empty search shows all recipes', async () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm=""
      />
    );
    
    // Wait for all recipes to render
    await screen.findByText('Apple Pie');
    
    // Verify all recipes are shown
    expect(screen.getByText('Apple Pie')).toBeInTheDocument();
    expect(screen.getByText('Banana Bread')).toBeInTheDocument();
    expect(screen.getByText('Zebra Cake')).toBeInTheDocument();
  });
});

describe('RecipeList – übersetzte Titel (Mehrsprachigkeit PR 3)', () => {
  // Deutsche Originale, deren englische Titel anders sortieren: Z… wird zu A…, A… zu Z…
  const uebersetzt = (id, title, en) => ({
    id,
    title,
    ingredients: ['ingredient1'],
    steps: ['step1'],
    speisekategorie: 'Dessert',
    authorId: 'user-1',
    titelUebersetzung: { quelle: title, originalSprache: 'de', de: title, en, fr: `${en} (fr)` },
  });
  const rezepte = [
    uebersetzt('a', 'Apfelstrudel', 'Zesty apple strudel'),
    uebersetzt('b', 'Zwetschgenkuchen', 'Autumn plum cake'),
  ];
  const liste = (searchTerm, inhalteUebersetzen = true) => (
    <SpracheProvider profilSprache="en" inhalteUebersetzen={inhalteUebersetzen} speicher={null}>
      <RecipeList
        recipes={rezepte}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm={searchTerm}
      />
    </SpracheProvider>
  );
  const titel = () => Array.from(document.querySelectorAll('.recipe-card h3')).map((h3) => h3.textContent);

  test('zeigt und sortiert nach dem angezeigten Titel', async () => {
    render(liste(''));
    await screen.findByText('Autumn plum cake');
    expect(titel()).toEqual(['Autumn plum cake', 'Zesty apple strudel']);
  });

  test('die Suche findet Original und Übersetzung', async () => {
    const { unmount } = render(liste('plum'));
    await screen.findByText('Autumn plum cake');
    expect(titel()).toEqual(['Autumn plum cake']);
    unmount();

    render(liste('strudel'));
    await screen.findByText('Zesty apple strudel');
    expect(titel()).toEqual(['Zesty apple strudel']);
  });

  test('ohne übersetzte Inhalte: Original-Titel, die Suche nur im Original', async () => {
    const { rerender } = render(liste('zwetschgen', false));
    await screen.findByText('Zwetschgenkuchen');
    expect(titel()).toEqual(['Zwetschgenkuchen']);
    rerender(liste('plum', false));
    expect(titel()).toEqual([]);
  });
});
