import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecipeList from './RecipeList';

jest.mock('../utils/userManagement', () => ({
  canEditRecipes: jest.fn(() => false),
  getUsers: () => Promise.resolve([]),
}));

jest.mock('../utils/customLists', () => ({
  getCustomLists: () => Promise.resolve({ mealCategories: [] }),
  getButtonIcons: () => Promise.resolve({ filterButton: '⚙' }),
  DEFAULT_BUTTON_ICONS: { filterButton: '⚙' },
}));

jest.mock('../utils/userFavorites', () => ({
  getUserFavorites: () => Promise.resolve([]),
}));

jest.mock('../utils/recipeCallsFirestore', () => ({
  getRecipeCalls: jest.fn(),
}));

const mockGetRecipeCalls = jest.requireMock('../utils/recipeCallsFirestore').getRecipeCalls;

const mockRecipes = [
  {
    id: '1',
    title: 'Banana Bread',
    ingredients: [],
    steps: [],
    viewCount: 100,
    createdAt: '2024-01-01T10:00:00Z',
    authorId: 'user-1',
  },
  {
    id: '2',
    title: 'Apple Pie',
    ingredients: [],
    steps: [],
    viewCount: 200,
    createdAt: '2024-01-02T10:00:00Z',
    authorId: 'user-1',
  },
  {
    id: '3',
    title: 'Zebra Cake',
    ingredients: [],
    steps: [],
    viewCount: 50,
    createdAt: '2024-01-03T10:00:00Z',
    authorId: 'user-1',
  },
];

describe('RecipeList - Sort Swiper', () => {
  beforeEach(() => {
    // resetMocks: true clears jest.fn() implementations between tests, so re-apply the default
    mockGetRecipeCalls.mockResolvedValue([]);
  });

  test('renders sort swiper with "Im Trend" and "Alphabetisch" options', async () => {
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

    expect(await screen.findByText('Im Trend')).toBeInTheDocument();
    expect(screen.getByText('Alphabetisch')).toBeInTheDocument();
  });

  test('"Im Trend" is active by default', async () => {
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

    const trendingBtn = await screen.findByText('Im Trend');
    expect(trendingBtn).toHaveClass('active');
    expect(screen.getByText('Alphabetisch')).not.toHaveClass('active');
  });

  test('trending mode sorts recipes by viewCount descending', async () => {
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

    await screen.findByText('Apple Pie');

    const cards = document.querySelectorAll('.recipe-card h3');
    const titles = Array.from(cards).map(c => c.textContent);
    // viewCount: Apple Pie=200, Banana Bread=100, Zebra Cake=50
    expect(titles).toEqual(['Apple Pie', 'Banana Bread', 'Zebra Cake']);
  });

  test('clicking "Alphabetisch" switches to alphabetical sort', async () => {
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

    await screen.findByText('Alphabetisch');
    fireEvent.click(screen.getByText('Alphabetisch'));

    expect(screen.getByText('Alphabetisch')).toHaveClass('active');
    expect(screen.getByText('Im Trend')).not.toHaveClass('active');

    const cards = document.querySelectorAll('.recipe-card h3');
    const titles = Array.from(cards).map(c => c.textContent);
    expect(titles).toEqual(['Apple Pie', 'Banana Bread', 'Zebra Cake']);
  });

  test('alphabetical mode falls back to createdAt when titles are equal', async () => {
    const recipesWithSameTitle = [
      { id: 'a', title: 'Soup', ingredients: [], steps: [], createdAt: '2024-01-01T00:00:00Z', authorId: 'u1' },
      { id: 'b', title: 'Soup', ingredients: [], steps: [], createdAt: '2024-06-01T00:00:00Z', authorId: 'u1' },
    ];
    render(
      <RecipeList
        recipes={recipesWithSameTitle}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'u1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Alphabetisch');
    fireEvent.click(screen.getByText('Alphabetisch'));

    await screen.findAllByText('Soup');
    const cards = document.querySelectorAll('.recipe-card h3');
    // Newer (June) recipe should come first
    expect(cards).toHaveLength(2);
  });

  test('trending mode falls back to title then createdAt when viewCounts are equal', async () => {
    const recipesEqualViews = [
      { id: '1', title: 'Zebra Cake', ingredients: [], steps: [], viewCount: 10, createdAt: '2024-01-01T00:00:00Z', authorId: 'u1' },
      { id: '2', title: 'Apple Pie', ingredients: [], steps: [], viewCount: 10, createdAt: '2024-01-01T00:00:00Z', authorId: 'u1' },
    ];
    render(
      <RecipeList
        recipes={recipesEqualViews}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'u1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Apple Pie');
    const cards = document.querySelectorAll('.recipe-card h3');
    const titles = Array.from(cards).map(c => c.textContent);
    // Same viewCount → alphabetical fallback
    expect(titles).toEqual(['Apple Pie', 'Zebra Cake']);
  });

  test('clicking "Im Trend" after "Alphabetisch" resets to trending sort', async () => {
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

    await screen.findByText('Alphabetisch');
    fireEvent.click(screen.getByText('Alphabetisch'));

    // Verify alphabetical sort is active
    expect(screen.getByText('Alphabetisch')).toHaveClass('active');

    // Switch back to trending
    fireEvent.click(screen.getByText('Im Trend'));

    expect(screen.getByText('Im Trend')).toHaveClass('active');
    expect(screen.getByText('Alphabetisch')).not.toHaveClass('active');

    const cards = document.querySelectorAll('.recipe-card h3');
    const titles = Array.from(cards).map(c => c.textContent);
    // viewCount: Apple Pie=200, Banana Bread=100, Zebra Cake=50
    expect(titles).toEqual(['Apple Pie', 'Banana Bread', 'Zebra Cake']);
  });

  test('trending mode sorts recipes by recipeCalls count from all users', async () => {
    mockGetRecipeCalls.mockResolvedValueOnce([
      { id: 'call-1', recipeId: '3' }, // Zebra Cake – 3 calls
      { id: 'call-2', recipeId: '3' },
      { id: 'call-3', recipeId: '3' },
      { id: 'call-4', recipeId: '1' }, // Banana Bread – 1 call
    ]);

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

    await screen.findByText('Zebra Cake');

    const cards = document.querySelectorAll('.recipe-card h3');
    const titles = Array.from(cards).map(c => c.textContent);
    // Zebra Cake=3 calls, Banana Bread=1 call, Apple Pie=0 calls
    expect(titles).toEqual(['Zebra Cake', 'Banana Bread', 'Apple Pie']);
  });

  test('swiper is compact (no expanded class) by default', async () => {
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

    await screen.findByText('Im Trend');
    const swiper = document.querySelector('.sort-swiper');
    expect(swiper).not.toHaveClass('expanded');
  });

  test('swiper gains expanded class on touch start', async () => {
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

    await screen.findByText('Im Trend');
    const swiper = document.querySelector('.sort-swiper');
    fireEvent.touchStart(swiper);
    expect(swiper).toHaveClass('expanded');
  });

  test('swiper loses expanded class after touch end delay', async () => {
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

    // Wait for component to finish async loading with real timers
    await screen.findByText('Im Trend');
    const swiper = document.querySelector('.sort-swiper');

    // Switch to fake timers after async loading is done
    jest.useFakeTimers();

    fireEvent.touchStart(swiper);
    expect(swiper).toHaveClass('expanded');

    fireEvent.touchEnd(swiper);

    // Advance past the 500ms collapse delay and flush React state updates
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(swiper).not.toHaveClass('expanded');

    jest.useRealTimers();
  });
});
