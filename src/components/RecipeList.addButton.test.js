import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RecipeList from './RecipeList';

// Mock the user management utility
jest.mock('../utils/userManagement', () => ({
  canEditRecipes: () => true,
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
  DEFAULT_BUTTON_ICONS: {
    filterButton: '⚙'
  }
}));

// Mock getUserFavorites to prevent Firebase calls
jest.mock('../utils/userFavorites', () => ({
  getUserFavorites: () => Promise.resolve([]),
}));

const mockRecipes = [
  {
    id: '1',
    title: 'Test Recipe 1',
    ingredients: ['ingredient1'],
    steps: ['step1'],
  },
];

describe('RecipeList - Add Button Visibility', () => {
  test('shows "Rezept hinzufügen" button when no private list filter is active', async () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
      />
    );

    const addButton = await screen.findByRole('button', { name: /Rezept hinzufügen/i });
    expect(addButton).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Privates Rezept hinzufügen/i })).not.toBeInTheDocument();
  });

  test('shows "Privates Rezept hinzufügen" button when a private list filter is active', async () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        activePrivateListName="Familie"
        activePrivateListId="group-1"
      />
    );

    const privateAddButton = await screen.findByRole('button', { name: /Privates Rezept hinzufügen/i });
    expect(privateAddButton).toBeInTheDocument();
    expect(screen.queryByText('+ Rezept hinzufügen')).not.toBeInTheDocument();
  });

  test('"Privates Rezept hinzufügen" calls onAddRecipe with the group ID', async () => {
    const onAddRecipe = jest.fn();
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={onAddRecipe}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        activePrivateListName="Familie"
        activePrivateListId="group-1"
      />
    );

    const btn = await screen.findByRole('button', { name: /Privates Rezept hinzufügen/i });
    fireEvent.click(btn);
    expect(onAddRecipe).toHaveBeenCalledWith('group-1');
  });
});
