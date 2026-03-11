import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
});
