import React from 'react';
import { render, screen } from '@testing-library/react';
import RecipeList from './RecipeList';
import * as userFavorites from '../utils/userFavorites';

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

describe('RecipeList - Version Display Order', () => {
  const originalRecipe = {
    id: 'recipe-1',
    title: 'Original Recipe',
    authorId: 'user-1',
    ingredients: ['ingredient1', 'ingredient2'],
    steps: ['step1', 'step2'],
    createdAt: '2024-01-01T09:00:00Z'
  };

  const version1 = {
    id: 'recipe-2',
    title: 'Version 1 by User 2',
    parentRecipeId: 'recipe-1',
    authorId: 'user-2',
    ingredients: ['ingredient1', 'ingredient2', 'ingredient3'],
    steps: ['step1', 'step2'],
    createdAt: '2024-01-01T10:00:00Z'
  };

  const version2 = {
    id: 'recipe-3',
    title: 'Version 2 by Current User',
    parentRecipeId: 'recipe-1',
    authorId: 'user-current',
    ingredients: ['ingredient1', 'ingredient2'],
    steps: ['step1', 'step2'],
    createdAt: '2024-01-01T11:00:00Z'
  };

  const currentUser = {
    id: 'user-current',
    vorname: 'Test',
    nachname: 'User'
  };

  beforeEach(() => {
    // Mock localStorage for user management
    const users = [
      currentUser,
      { id: 'user-1', vorname: 'User', nachname: 'One' },
      { id: 'user-2', vorname: 'User', nachname: 'Two' }
    ];
    localStorage.setItem('users', JSON.stringify(users));
  });

  afterEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  test('displays original recipe when no versions exist', () => {
    render(
      <RecipeList
        recipes={[originalRecipe]}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={currentUser}
      />
    );

    expect(screen.getByText('Original Recipe')).toBeInTheDocument();
  });

  test('displays own version first when user has created a version', () => {
    const recipes = [originalRecipe, version1, version2];
    
    render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={currentUser}
      />
    );

    // Should display the current user's version (version2) which comes first in sorted order
    expect(screen.getByText('Version 2 by Current User')).toBeInTheDocument();
  });

  test('displays favorited version first when user has favorited a version', () => {
    const recipes = [originalRecipe, version1, version2];
    
    // Mock the favorite function to return version1 as favorite
    jest.spyOn(userFavorites, 'isRecipeFavorite').mockImplementation((userId, recipeId) => {
      return recipeId === 'recipe-2'; // version1 is favorited
    });

    render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={currentUser}
      />
    );

    // Should display the favorited version (version1) even though user owns version2
    expect(screen.getByText('Version 1 by User 2')).toBeInTheDocument();
  });

  test('displays original recipe first when no favorite or own version exists', () => {
    const recipes = [originalRecipe, version1];
    const otherUser = { id: 'user-other', vorname: 'Other', nachname: 'User' };
    
    render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={otherUser}
      />
    );

    // Should display the original recipe (version 0) which comes first
    expect(screen.getByText('Original Recipe')).toBeInTheDocument();
  });
});

describe('RecipeList - Version Count Display', () => {
  const mockRecipe1 = {
    id: 'recipe-1',
    title: 'Recipe with 1 Version',
    authorId: 'user-1',
    ingredients: ['ingredient1'],
    steps: ['step1'],
  };

  const mockRecipe2 = {
    id: 'recipe-2',
    title: 'Recipe Original',
    authorId: 'user-2',
    ingredients: ['ingredient1'],
    steps: ['step1'],
  };

  const mockRecipe2Version = {
    id: 'recipe-3',
    title: 'Recipe Version',
    parentRecipeId: 'recipe-2',
    authorId: 'user-3',
    ingredients: ['ingredient1', 'ingredient2'],
    steps: ['step1'],
  };

  const currentUser = {
    id: 'user-1',
    vorname: 'Test',
    nachname: 'User',
  };

  beforeEach(() => {
    const users = [
      currentUser,
      { id: 'user-2', vorname: 'User', nachname: 'Two' },
      { id: 'user-3', vorname: 'User', nachname: 'Three' },
    ];
    localStorage.setItem('users', JSON.stringify(users));
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('does not display version count for recipe with single version', () => {
    render(
      <RecipeList
        recipes={[mockRecipe1]}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={currentUser}
      />
    );

    // Version count should not be displayed when there's only 1 version
    const versionCount = document.querySelector('.version-count');
    expect(versionCount).not.toBeInTheDocument();
  });

  test('displays version count for recipe with multiple versions', () => {
    render(
      <RecipeList
        recipes={[mockRecipe2, mockRecipe2Version]}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={currentUser}
      />
    );

    // Verify the footer version count is displayed (badge is removed)
    const versionCount = document.querySelector('.version-count');
    expect(versionCount).toBeInTheDocument();
    expect(versionCount).toHaveTextContent('2 Versionen');
  });

  test('version count has correct CSS class for orange color', () => {
    render(
      <RecipeList
        recipes={[mockRecipe2, mockRecipe2Version]}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={currentUser}
      />
    );

    const versionCount = document.querySelector('.version-count');
    expect(versionCount).toBeInTheDocument();
    expect(versionCount).toHaveClass('version-count');
  });

  test('displays author name when present', () => {
    render(
      <RecipeList
        recipes={[mockRecipe1]}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={currentUser}
      />
    );

    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  test('version count and author are displayed in footer', () => {
    render(
      <RecipeList
        recipes={[mockRecipe2, mockRecipe2Version]}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={currentUser}
      />
    );

    const footer = document.querySelector('.recipe-footer');
    expect(footer).toBeInTheDocument();
    
    // Check that both version count and author are within the footer
    const versionCount = footer.querySelector('.version-count');
    const author = footer.querySelector('.recipe-author');
    
    expect(versionCount).toBeInTheDocument();
    expect(author).toBeInTheDocument();
  });
});
