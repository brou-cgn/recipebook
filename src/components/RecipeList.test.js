import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RecipeList from './RecipeList';
import * as userFavorites from '../utils/userFavorites';

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
      />
    );
    
    // Click the favorites filter button to activate it
    const favoritesButton = screen.getByTitle('Nur Favoriten anzeigen');
    fireEvent.click(favoritesButton);
    
    expect(screen.getByText('Meine Rezepte')).toBeInTheDocument();
  });

  test('shows category name when category filter is active and favorites filter is off', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter="Appetizer"
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
      />
    );
    
    // Click the favorites filter button to activate it
    const favoritesButton = screen.getByTitle('Nur Favoriten anzeigen');
    fireEvent.click(favoritesButton);
    
    expect(screen.getByText('Meine Main Course')).toBeInTheDocument();
  });

  test('shows "Hauptspeise" when favorites off and Hauptspeise category selected', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter="Hauptspeise"
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
      />
    );
    
    // Click the favorites filter button to activate it
    const favoritesButton = screen.getByTitle('Nur Favoriten anzeigen');
    fireEvent.click(favoritesButton);
    
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

describe('RecipeList - Favorites Filter with Versions', () => {
  const originalRecipe = {
    id: 'recipe-1',
    title: 'Original Recipe',
    authorId: 'user-1',
    ingredients: ['ingredient1', 'ingredient2'],
    steps: ['step1', 'step2'],
    createdAt: '2024-01-01T09:00:00Z'
  };

  const variation1 = {
    id: 'recipe-2',
    title: 'Variation 1',
    parentRecipeId: 'recipe-1',
    authorId: 'user-2',
    ingredients: ['ingredient1', 'ingredient2', 'ingredient3'],
    steps: ['step1', 'step2', 'step3'],
    createdAt: '2024-01-01T10:00:00Z'
  };

  const variation2 = {
    id: 'recipe-3',
    title: 'Variation 2',
    parentRecipeId: 'recipe-1',
    authorId: 'user-3',
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
    const users = [
      currentUser,
      { id: 'user-1', vorname: 'User', nachname: 'One' },
      { id: 'user-2', vorname: 'User', nachname: 'Two' },
      { id: 'user-3', vorname: 'User', nachname: 'Three' }
    ];
    localStorage.setItem('users', JSON.stringify(users));
  });

  afterEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  test('shows recipe group when only a variation is favorited', () => {
    const recipes = [originalRecipe, variation1, variation2];
    
    // Mock the favorite function: only variation1 is favorited
    jest.spyOn(userFavorites, 'isRecipeFavorite').mockImplementation((userId, recipeId) => {
      return recipeId === 'recipe-2'; // only variation1 is favorited
    });

    jest.spyOn(userFavorites, 'hasAnyFavoriteInGroup').mockImplementation((userId, recipeGroup) => {
      return recipeGroup.some(recipe => recipe.id === 'recipe-2');
    });

    render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={currentUser}
      />
    );

    // Click the favorites filter button to activate it
    const favoritesButton = screen.getByTitle('Nur Favoriten anzeigen');
    fireEvent.click(favoritesButton);

    // The recipe group should be displayed because variation1 is favorited
    // The top recipe shown should be variation1 (the favorited one)
    expect(screen.getByText('Variation 1')).toBeInTheDocument();
  });

  test('does not show recipe group when no version is favorited', () => {
    const recipes = [originalRecipe, variation1, variation2];
    
    // Mock the favorite function: no recipes are favorited
    jest.spyOn(userFavorites, 'isRecipeFavorite').mockImplementation(() => false);
    jest.spyOn(userFavorites, 'hasAnyFavoriteInGroup').mockImplementation(() => false);

    render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={currentUser}
      />
    );

    // Click the favorites filter button to activate it
    const favoritesButton = screen.getByTitle('Nur Favoriten anzeigen');
    fireEvent.click(favoritesButton);

    // No recipes should be shown
    expect(screen.getByText('Keine favorisierten Rezepte!')).toBeInTheDocument();
    expect(screen.queryByText('Original Recipe')).not.toBeInTheDocument();
    expect(screen.queryByText('Variation 1')).not.toBeInTheDocument();
  });

  test('shows recipe group when original is favorited', () => {
    const recipes = [originalRecipe, variation1];
    
    // Mock the favorite function: only the original is favorited
    jest.spyOn(userFavorites, 'isRecipeFavorite').mockImplementation((userId, recipeId) => {
      return recipeId === 'recipe-1'; // only original is favorited
    });

    jest.spyOn(userFavorites, 'hasAnyFavoriteInGroup').mockImplementation((userId, recipeGroup) => {
      return recipeGroup.some(recipe => recipe.id === 'recipe-1');
    });

    render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={currentUser}
      />
    );

    // Click the favorites filter button to activate it
    const favoritesButton = screen.getByTitle('Nur Favoriten anzeigen');
    fireEvent.click(favoritesButton);

    // The recipe group should be displayed and show the original (which is favorited)
    expect(screen.getByText('Original Recipe')).toBeInTheDocument();
  });

  test('shows recipe group when multiple versions are favorited', () => {
    const recipes = [originalRecipe, variation1, variation2];
    
    // Mock the favorite function: both original and variation1 are favorited
    jest.spyOn(userFavorites, 'isRecipeFavorite').mockImplementation((userId, recipeId) => {
      return recipeId === 'recipe-1' || recipeId === 'recipe-2';
    });

    jest.spyOn(userFavorites, 'hasAnyFavoriteInGroup').mockImplementation((userId, recipeGroup) => {
      return recipeGroup.some(recipe => recipe.id === 'recipe-1' || recipe.id === 'recipe-2');
    });

    render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={currentUser}
      />
    );

    // Click the favorites filter button to activate it
    const favoritesButton = screen.getByTitle('Nur Favoriten anzeigen');
    fireEvent.click(favoritesButton);

    // The recipe group should be displayed
    // The top recipe could be either one based on sorting logic, but the group should exist
    const recipeCards = document.querySelectorAll('.recipe-card');
    expect(recipeCards.length).toBeGreaterThan(0);
  });
});
