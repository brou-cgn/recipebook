import React from 'react';
import { render, screen } from '@testing-library/react';
import RecipeList from './RecipeList';

// Mock the user management utility
jest.mock('../utils/userManagement', () => ({
  canEditRecipes: jest.fn(() => true),
  getUsers: () => Promise.resolve([]),
}));

// Mock the custom lists utility
jest.mock('../utils/customLists', () => ({
  getCustomLists: () => Promise.resolve({
    mealCategories: ['Appetizer', 'Main Course', 'Dessert']
  })
}));

// Mock getUserFavorites
jest.mock('../utils/userFavorites', () => ({
  getUserFavorites: () => Promise.resolve([]),
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
