import React from 'react';
import { render, screen } from '@testing-library/react';
import RecipeList from './RecipeList';

const mockRecipes = [
  {
    id: '1',
    title: 'Test Recipe 1',
    speisekategorie: 'Hauptspeise',
    isFavorite: false,
    ingredients: ['ingredient1'],
    steps: ['step1']
  },
  {
    id: '2',
    title: 'Test Recipe 2',
    speisekategorie: 'Dessert',
    isFavorite: true,
    ingredients: ['ingredient1'],
    steps: ['step1']
  }
];

describe('RecipeList - Dynamic Heading', () => {
  const mockOnSelectRecipe = jest.fn();
  const mockOnAddRecipe = jest.fn();

  test('shows "Rezepte" when no category filter and favorites off', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={mockOnSelectRecipe}
        onAddRecipe={mockOnAddRecipe}
        categoryFilter=""
        showFavoritesOnly={false}
      />
    );
    expect(screen.getByRole('heading', { name: 'Rezepte' })).toBeInTheDocument();
  });

  test('shows "Meine Rezepte" when no category filter and favorites on', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={mockOnSelectRecipe}
        onAddRecipe={mockOnAddRecipe}
        categoryFilter=""
        showFavoritesOnly={true}
      />
    );
    expect(screen.getByRole('heading', { name: 'Meine Rezepte' })).toBeInTheDocument();
  });

  test('shows category name when category filter is set and favorites off', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={mockOnSelectRecipe}
        onAddRecipe={mockOnAddRecipe}
        categoryFilter="Hauptspeise"
        showFavoritesOnly={false}
      />
    );
    expect(screen.getByRole('heading', { name: 'Hauptspeise' })).toBeInTheDocument();
  });

  test('shows "Meine" + category when category filter is set and favorites on', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={mockOnSelectRecipe}
        onAddRecipe={mockOnAddRecipe}
        categoryFilter="Appetizer"
        showFavoritesOnly={true}
      />
    );
    expect(screen.getByRole('heading', { name: 'Meine Appetizer' })).toBeInTheDocument();
  });

  test('shows "Meine" + category for Vorspeisen', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={mockOnSelectRecipe}
        onAddRecipe={mockOnAddRecipe}
        categoryFilter="Vorspeisen"
        showFavoritesOnly={true}
      />
    );
    expect(screen.getByRole('heading', { name: 'Meine Vorspeisen' })).toBeInTheDocument();
  });

  test('shows "Dessert" when Dessert category is selected and favorites off', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={mockOnSelectRecipe}
        onAddRecipe={mockOnAddRecipe}
        categoryFilter="Dessert"
        showFavoritesOnly={false}
      />
    );
    expect(screen.getByRole('heading', { name: 'Dessert' })).toBeInTheDocument();
  });
});
