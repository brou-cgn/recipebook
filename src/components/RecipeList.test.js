import React from 'react';
import { render, screen } from '@testing-library/react';
import RecipeList from './RecipeList';

const mockRecipes = [
  {
    id: '1',
    title: 'Test Recipe 1',
    ingredients: ['ingredient1', 'ingredient2'],
    steps: ['step1', 'step2'],
    speisekategorie: 'Appetizer'
  },
  {
    id: '2',
    title: 'Test Recipe 2',
    ingredients: ['ingredient1'],
    steps: ['step1'],
    speisekategorie: 'Main Course'
  }
];

describe('RecipeList - Dynamic Heading', () => {
  test('shows "Rezepte" when no filters are active', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        showFavoritesOnly={false}
      />
    );
    
    expect(screen.getByText('Rezepte')).toBeInTheDocument();
  });

  test('shows "Meine Rezepte" when favorites filter is active and no category selected', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        showFavoritesOnly={true}
      />
    );
    
    expect(screen.getByText('Meine Rezepte')).toBeInTheDocument();
  });

  test('shows category name when category filter is active and favorites filter is off', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter="Appetizer"
        showFavoritesOnly={false}
      />
    );
    
    expect(screen.getByText('Appetizer')).toBeInTheDocument();
  });

  test('shows "Meine" + category name when both filters are active', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter="Main Course"
        showFavoritesOnly={true}
      />
    );
    
    expect(screen.getByText('Meine Main Course')).toBeInTheDocument();
  });

  test('shows "Hauptspeise" when favorites off and Hauptspeise category selected', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter="Hauptspeise"
        showFavoritesOnly={false}
      />
    );
    
    expect(screen.getByText('Hauptspeise')).toBeInTheDocument();
  });

  test('shows "Meine Appetizer" when favorites on and Appetizer category selected', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter="Appetizer"
        showFavoritesOnly={true}
      />
    );
    
    expect(screen.getByText('Meine Appetizer')).toBeInTheDocument();
  });
});
