import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RecipeList from './RecipeList';
import * as userFavorites from '../utils/userFavorites';
import { DEFAULT_BUTTON_ICONS } from '../utils/customLists';

// Mock the user management utility
jest.mock('../utils/userManagement', () => ({
  canEditRecipes: jest.fn(() => true),
  getUsers: jest.fn(() => Promise.resolve([])),
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
  },
  getTimelineBubbleIcon: () => Promise.resolve(null),
}));

// Mock the category images utility
jest.mock('../utils/categoryImages', () => ({
  getCategoryImages: () => Promise.resolve([]),
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

  const users = [
    currentUser,
    { id: 'user-1', vorname: 'User', nachname: 'One' },
    { id: 'user-2', vorname: 'User', nachname: 'Two' }
  ];

  beforeEach(() => {
    // Mock localStorage for user management
    localStorage.setItem('users', JSON.stringify(users));
    // Mock getUsers to return the users array
    const { getUsers } = require('../utils/userManagement');
    getUsers.mockResolvedValue(users);
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

  test('displays favorited version first when user has favorited a version', async () => {
    const recipes = [originalRecipe, version1, version2];
    
    // Mock getUserFavorites to return version1 as favorite
    jest.spyOn(userFavorites, 'getUserFavorites').mockResolvedValue(['recipe-2']); // version1 is favorited

    render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={currentUser}
      />
    );

    // Wait for favorites to load
    await waitFor(() => {
      expect(userFavorites.getUserFavorites).toHaveBeenCalled();
    });

    // Should display the favorited version (version1) even though user owns version2
    await waitFor(() => {
      expect(screen.getByText('Version 1 by User 2')).toBeInTheDocument();
    });
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

  const users = [
    currentUser,
    { id: 'user-2', vorname: 'User', nachname: 'Two' },
    { id: 'user-3', vorname: 'User', nachname: 'Three' },
  ];

  beforeEach(() => {
    localStorage.setItem('users', JSON.stringify(users));
    // Mock getUsers to return the users array
    const { getUsers } = require('../utils/userManagement');
    getUsers.mockResolvedValue(users);
  });

  afterEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
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

  test('displays author name when present', async () => {
    render(
      <RecipeList
        recipes={[mockRecipe1]}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={currentUser}
      />
    );

    // Wait for users to load
    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });
  });

  test('version count and author are displayed in footer', async () => {
    render(
      <RecipeList
        recipes={[mockRecipe2, mockRecipe2Version]}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={currentUser}
      />
    );

    // Wait for users to load
    await waitFor(() => {
      const footer = document.querySelector('.recipe-footer');
      expect(footer).toBeInTheDocument();
      
      // Check that both version count and author are within the footer
      const versionCount = footer.querySelector('.version-count');
      const author = footer.querySelector('.recipe-author');
      
      expect(versionCount).toBeInTheDocument();
      expect(author).toBeInTheDocument();
    });
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

  const users = [
    currentUser,
    { id: 'user-1', vorname: 'User', nachname: 'One' },
    { id: 'user-2', vorname: 'User', nachname: 'Two' },
    { id: 'user-3', vorname: 'User', nachname: 'Three' }
  ];

  beforeEach(() => {
    localStorage.setItem('users', JSON.stringify(users));
    // Mock getUsers to return the users array
    const { getUsers } = require('../utils/userManagement');
    getUsers.mockResolvedValue(users);
  });

  afterEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  test('shows recipe group when only a variation is favorited', async () => {
    const recipes = [originalRecipe, variation1, variation2];
    
    // Mock getUserFavorites to return only variation1 as favorited
    jest.spyOn(userFavorites, 'getUserFavorites').mockResolvedValue(['recipe-2']);

    render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={currentUser}
      />
    );

    // Wait for favorites to load
    await waitFor(() => {
      expect(userFavorites.getUserFavorites).toHaveBeenCalled();
    });

    // Click the favorites filter button to activate it
    const favoritesButton = screen.getByTitle('Nur Favoriten anzeigen');
    fireEvent.click(favoritesButton);

    // The recipe group should be displayed because variation1 is favorited
    // The top recipe shown should be variation1 (the favorited one)
    await waitFor(() => {
      expect(screen.getByText('Variation 1')).toBeInTheDocument();
    });
  });

  test('does not show recipe group when no version is favorited', async () => {
    const recipes = [originalRecipe, variation1, variation2];
    
    // Mock getUserFavorites to return empty array (no favorites)
    jest.spyOn(userFavorites, 'getUserFavorites').mockResolvedValue([]);

    render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={currentUser}
      />
    );

    // Wait for favorites to load
    await waitFor(() => {
      expect(userFavorites.getUserFavorites).toHaveBeenCalled();
    });

    // Click the favorites filter button to activate it
    const favoritesButton = screen.getByTitle('Nur Favoriten anzeigen');
    fireEvent.click(favoritesButton);

    // No recipes should be shown
    expect(screen.getByText('Keine favorisierten Rezepte!')).toBeInTheDocument();
    expect(screen.queryByText('Original Recipe')).not.toBeInTheDocument();
    expect(screen.queryByText('Variation 1')).not.toBeInTheDocument();
  });

  test('shows recipe group when original is favorited', async () => {
    const recipes = [originalRecipe, variation1];
    
    // Mock getUserFavorites to return only original as favorited
    jest.spyOn(userFavorites, 'getUserFavorites').mockResolvedValue(['recipe-1']);

    render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={currentUser}
      />
    );

    // Wait for favorites to load
    await waitFor(() => {
      expect(userFavorites.getUserFavorites).toHaveBeenCalled();
    });

    // Click the favorites filter button to activate it
    const favoritesButton = screen.getByTitle('Nur Favoriten anzeigen');
    fireEvent.click(favoritesButton);

    // The recipe group should be displayed and show the original (which is favorited)
    await waitFor(() => {
      expect(screen.getByText('Original Recipe')).toBeInTheDocument();
    });
  });

  test('shows recipe group when multiple versions are favorited', async () => {
    const recipes = [originalRecipe, variation1, variation2];
    
    // Mock getUserFavorites to return both original and variation1 as favorited
    jest.spyOn(userFavorites, 'getUserFavorites').mockResolvedValue(['recipe-1', 'recipe-2']);

    render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={currentUser}
      />
    );

    // Wait for favorites to load
    await waitFor(() => {
      expect(userFavorites.getUserFavorites).toHaveBeenCalled();
    });

    // Click the favorites filter button to activate it
    const favoritesButton = screen.getByTitle('Nur Favoriten anzeigen');
    fireEvent.click(favoritesButton);

    // The recipe group should be displayed
    // The top recipe could be either one based on sorting logic, but the group should exist
    await waitFor(() => {
      const recipeCards = document.querySelectorAll('.recipe-card');
      expect(recipeCards.length).toBeGreaterThan(0);
    });
  });
});

describe('RecipeList - Filter Button Icon', () => {
  beforeEach(() => {
    jest.spyOn(userFavorites, 'getUserFavorites').mockResolvedValue([]);
  });

  test('renders emoji icon when filterButton is emoji', async () => {
    const { getButtonIcons } = require('../utils/customLists');
    jest.spyOn(require('../utils/customLists'), 'getButtonIcons').mockResolvedValue({
      filterButton: '⚙'
    });

    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        onOpenFilterPage={() => {}}
      />
    );

    // Wait for the filter button to render
    const filterButton = await screen.findByTitle('Weitere Filter');
    expect(filterButton).toBeInTheDocument();
    expect(filterButton).toHaveTextContent('⚙');
    
    // Ensure no img tag is rendered
    const imgInButton = filterButton.querySelector('img');
    expect(imgInButton).toBeNull();
  });

  test('renders image when filterButton is base64 image', async () => {
    const mockBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    
    jest.spyOn(require('../utils/customLists'), 'getButtonIcons').mockResolvedValue({
      filterButton: mockBase64
    });

    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        onOpenFilterPage={() => {}}
      />
    );

    // Wait for the filter button to render
    const filterButton = await screen.findByTitle('Weitere Filter');
    expect(filterButton).toBeInTheDocument();
    
    // Ensure img tag is rendered with correct src
    const imgInButton = filterButton.querySelector('img');
    expect(imgInButton).toBeInTheDocument();
    expect(imgInButton).toHaveAttribute('src', mockBase64);
    expect(imgInButton).toHaveAttribute('alt', 'Filter');
  });
});

describe('RecipeList - Timeline View Mode', () => {
  const recipesWithDates = [
    {
      id: '1',
      title: 'Timeline Recipe 1',
      ingredients: ['a', 'b'],
      steps: ['s1'],
      createdAt: { toDate: () => new Date('2024-03-10') },
    },
    {
      id: '2',
      title: 'Timeline Recipe 2',
      ingredients: ['c'],
      steps: ['s2'],
      createdAt: { toDate: () => new Date('2024-03-05') },
    },
  ];

  test('renders view mode toggle button', () => {
    render(
      <RecipeList
        recipes={recipesWithDates}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
      />
    );

    expect(screen.getByTitle('Zeitleiste anzeigen')).toBeInTheDocument();
  });

  test('switches to timeline view when toggle is clicked', () => {
    render(
      <RecipeList
        recipes={recipesWithDates}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
      />
    );

    // Initially in grid mode
    expect(document.querySelector('.recipe-grid')).toBeInTheDocument();
    expect(document.querySelector('.recipe-timeline-container')).not.toBeInTheDocument();

    // Click the toggle to switch to timeline view
    fireEvent.click(screen.getByTitle('Zeitleiste anzeigen'));

    // Now in timeline mode
    expect(document.querySelector('.recipe-timeline-container')).toBeInTheDocument();
    expect(document.querySelector('.recipe-grid')).not.toBeInTheDocument();
  });

  test('timeline view shows recipe titles as timeline cards', () => {
    render(
      <RecipeList
        recipes={recipesWithDates}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
      />
    );

    fireEvent.click(screen.getByTitle('Zeitleiste anzeigen'));

    const timelineCards = document.querySelectorAll('.timeline-card');
    expect(timelineCards.length).toBeGreaterThan(0);
    expect(screen.getByText('Timeline Recipe 1')).toBeInTheDocument();
    expect(screen.getByText('Timeline Recipe 2')).toBeInTheDocument();
  });

  test('switches back to grid view when toggle is clicked again', () => {
    render(
      <RecipeList
        recipes={recipesWithDates}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
      />
    );

    // Switch to timeline
    fireEvent.click(screen.getByTitle('Zeitleiste anzeigen'));
    expect(document.querySelector('.recipe-timeline-container')).toBeInTheDocument();

    // Switch back to grid
    fireEvent.click(screen.getByTitle('Rasteransicht anzeigen'));
    expect(document.querySelector('.recipe-grid')).toBeInTheDocument();
    expect(document.querySelector('.recipe-timeline-container')).not.toBeInTheDocument();
  });

  test('calls onSelectRecipe when a timeline card is clicked', () => {
    const handleSelect = jest.fn();

    render(
      <RecipeList
        recipes={[recipesWithDates[0]]}
        onSelectRecipe={handleSelect}
        onAddRecipe={() => {}}
        categoryFilter=""
      />
    );

    fireEvent.click(screen.getByTitle('Zeitleiste anzeigen'));

    const card = document.querySelector('.timeline-card');
    fireEvent.click(card);

    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: '1', title: 'Timeline Recipe 1' })
    );
  });
});
