import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

// Mock recipeCallsFirestore
jest.mock('../utils/recipeCallsFirestore', () => ({
  getRecentRecipeCalls: () => Promise.resolve([]),
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
  test('shows "Kochbuch" when no filters are active', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
      />
    );
    
    expect(screen.getByText('Kochbuch')).toBeInTheDocument();
  });

  test('shows "Mein Kochbuch" when favorites filter is active and no category selected', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        showFavoritesOnly={true}
      />
    );
    
    expect(screen.getByText('Mein Kochbuch')).toBeInTheDocument();
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

  test('shows private list name as heading when activePrivateListName is provided', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        activePrivateListName="Familie"
      />
    );

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Familie');
  });

  test('private list name takes precedence over category filter in heading', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter="Appetizer"
        activePrivateListName="Freunde"
      />
    );

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Freunde');
  });

  test('shows default heading when activePrivateListName is not provided', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
      />
    );

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Kochbuch');
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
        showFavoritesOnly={true}
      />
    );

    // Wait for favorites to load
    await waitFor(() => {
      expect(userFavorites.getUserFavorites).toHaveBeenCalled();
    });

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
        showFavoritesOnly={true}
      />
    );

    // Wait for favorites to load
    await waitFor(() => {
      expect(userFavorites.getUserFavorites).toHaveBeenCalled();
    });

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
        showFavoritesOnly={true}
      />
    );

    // Wait for favorites to load
    await waitFor(() => {
      expect(userFavorites.getUserFavorites).toHaveBeenCalled();
    });

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
        showFavoritesOnly={true}
      />
    );

    // Wait for favorites to load
    await waitFor(() => {
      expect(userFavorites.getUserFavorites).toHaveBeenCalled();
    });

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
        onClearAllFilters={() => {}}
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
        onClearAllFilters={() => {}}
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

  test('renders filterButtonActive emoji when filters are active', async () => {
    jest.spyOn(require('../utils/customLists'), 'getButtonIcons').mockResolvedValue({
      filterButton: '⚙',
      filterButtonActive: '🔽'
    });

    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        onClearAllFilters={() => {}}
        activeFilters={{ selectedGroup: 'Vorspeisen' }}
      />
    );

    const filterButton = await screen.findByTitle('Weitere Filter');
    expect(filterButton).toBeInTheDocument();
    expect(filterButton).toHaveTextContent('🔽');
    const imgInButton = filterButton.querySelector('img');
    expect(imgInButton).toBeNull();
  });

  test('renders filterButton emoji when no filters are active', async () => {
    jest.spyOn(require('../utils/customLists'), 'getButtonIcons').mockResolvedValue({
      filterButton: '⚙',
      filterButtonActive: '🔽'
    });

    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        onClearAllFilters={() => {}}
        activeFilters={{}}
      />
    );

    const filterButton = await screen.findByTitle('Weitere Filter');
    expect(filterButton).toBeInTheDocument();
    expect(filterButton).toHaveTextContent('⚙');
    const imgInButton = filterButton.querySelector('img');
    expect(imgInButton).toBeNull();
  });

  test('renders filterButtonActive image when filters are active and icon is base64', async () => {
    const mockBase64Active = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    jest.spyOn(require('../utils/customLists'), 'getButtonIcons').mockResolvedValue({
      filterButton: '⚙',
      filterButtonActive: mockBase64Active
    });

    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        onClearAllFilters={() => {}}
        activeFilters={{ selectedGroup: 'Hauptgerichte' }}
      />
    );

    const filterButton = await screen.findByTitle('Weitere Filter');
    expect(filterButton).toBeInTheDocument();
    const imgInButton = filterButton.querySelector('img');
    expect(imgInButton).toBeInTheDocument();
    expect(imgInButton).toHaveAttribute('src', mockBase64Active);
    expect(imgInButton).toHaveAttribute('alt', 'Filter aktiv');
  });

  test('shows filterButtonActive when showFavoritesOnly is true', async () => {
    jest.spyOn(require('../utils/customLists'), 'getButtonIcons').mockResolvedValue({
      filterButton: '⚙',
      filterButtonActive: '🔽'
    });
    jest.spyOn(require('../utils/recipeRatings'), 'getUserRating').mockResolvedValue(null);
    jest.spyOn(require('../utils/recipeRatings'), 'subscribeToRatingSummary').mockImplementation(() => () => {});

    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        onClearAllFilters={() => {}}
        activeFilters={{}}
        showFavoritesOnly={true}
      />
    );

    const filterButton = await screen.findByTitle('Weitere Filter');
    expect(filterButton).toHaveClass('has-active-filters');
    expect(filterButton).toHaveTextContent('🔽');
  });

  test('shows filterButton (inactive) when showFavoritesOnly is false and no other filters', async () => {
    jest.spyOn(require('../utils/customLists'), 'getButtonIcons').mockResolvedValue({
      filterButton: '⚙',
      filterButtonActive: '🔽'
    });
    jest.spyOn(require('../utils/recipeRatings'), 'getUserRating').mockResolvedValue(null);
    jest.spyOn(require('../utils/recipeRatings'), 'subscribeToRatingSummary').mockImplementation(() => () => {});

    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        onClearAllFilters={() => {}}
        activeFilters={{}}
        showFavoritesOnly={false}
      />
    );

    const filterButton = await screen.findByTitle('Weitere Filter');
    expect(filterButton).not.toHaveClass('has-active-filters');
    expect(filterButton).toHaveTextContent('⚙');
  });

  test('shows filterButtonActive when searchTerm is set', async () => {
    jest.spyOn(require('../utils/customLists'), 'getButtonIcons').mockResolvedValue({
      filterButton: '⚙',
      filterButtonActive: '🔽'
    });
    jest.spyOn(require('../utils/recipeRatings'), 'getUserRating').mockResolvedValue(null);
    jest.spyOn(require('../utils/recipeRatings'), 'subscribeToRatingSummary').mockImplementation(() => () => {});

    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        onClearAllFilters={() => {}}
        activeFilters={{}}
        searchTerm="Pasta"
      />
    );

    const filterButton = await screen.findByTitle('Weitere Filter');
    expect(filterButton).toHaveClass('has-active-filters');
    expect(filterButton).toHaveTextContent('🔽');
  });
});

describe('RecipeList - Kulinarik Display', () => {
  beforeEach(() => {
    jest.spyOn(userFavorites, 'getUserFavorites').mockResolvedValue([]);
    jest.spyOn(require('../utils/customLists'), 'getButtonIcons').mockResolvedValue({
      filterButton: '⚙',
    });
    jest.spyOn(require('../utils/recipeRatings'), 'getUserRating').mockResolvedValue(null);
    jest.spyOn(require('../utils/recipeRatings'), 'subscribeToRatingSummary').mockImplementation(() => () => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('displays kulinarik tags when recipe has kulinarik', () => {
    const recipesWithKulinarik = [
      {
        id: '1',
        title: 'Pasta Carbonara',
        kulinarik: ['Italienisch', 'Mediterran'],
      }
    ];

    render(
      <RecipeList
        recipes={recipesWithKulinarik}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
      />
    );

    expect(screen.getByText('Italienisch')).toBeInTheDocument();
    expect(screen.getByText('Mediterran')).toBeInTheDocument();
  });

  test('does not display kulinarik section when recipe has no kulinarik', () => {
    const recipesWithoutKulinarik = [
      {
        id: '1',
        title: 'Simple Recipe',
      }
    ];

    render(
      <RecipeList
        recipes={recipesWithoutKulinarik}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
      />
    );

    const kulinarikDiv = document.querySelector('.recipe-kulinarik');
    expect(kulinarikDiv).not.toBeInTheDocument();
  });

  test('limits kulinarik tags to 5 and shows "+N weitere" for the rest', () => {
    const recipesWithManyKulinarik = [
      {
        id: '1',
        title: 'Test Recipe',
        kulinarik: ['Italienisch', 'Mediterran', 'Asiatisch', 'Mexikanisch', 'Griechisch', 'Französisch', 'Japanisch'],
      }
    ];

    render(
      <RecipeList
        recipes={recipesWithManyKulinarik}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
      />
    );

    expect(screen.getByText('Italienisch')).toBeInTheDocument();
    expect(screen.getByText('Mediterran')).toBeInTheDocument();
    expect(screen.getByText('Asiatisch')).toBeInTheDocument();
    expect(screen.getByText('Mexikanisch')).toBeInTheDocument();
    expect(screen.getByText('Griechisch')).toBeInTheDocument();
    expect(screen.queryByText('Französisch')).not.toBeInTheDocument();
    expect(screen.queryByText('Japanisch')).not.toBeInTheDocument();
    expect(screen.getByText('+2 weitere')).toBeInTheDocument();
  });

  test('shows exactly 5 kulinarik tags without "+N weitere" when there are exactly 5', () => {
    const recipesWithFiveKulinarik = [
      {
        id: '1',
        title: 'Test Recipe',
        kulinarik: ['Italienisch', 'Mediterran', 'Asiatisch', 'Mexikanisch', 'Griechisch'],
      }
    ];

    render(
      <RecipeList
        recipes={recipesWithFiveKulinarik}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
      />
    );

    expect(screen.getByText('Italienisch')).toBeInTheDocument();
    expect(screen.getByText('Mediterran')).toBeInTheDocument();
    expect(screen.getByText('Asiatisch')).toBeInTheDocument();
    expect(screen.getByText('Mexikanisch')).toBeInTheDocument();
    expect(screen.getByText('Griechisch')).toBeInTheDocument();
    expect(screen.queryByText(/\+\d+ weitere/)).not.toBeInTheDocument();
  });

  test('applies kulinarik-tag-more class to the overflow indicator', () => {
    const recipesWithManyKulinarik = [
      {
        id: '1',
        title: 'Test Recipe',
        kulinarik: ['Italienisch', 'Mediterran', 'Asiatisch', 'Mexikanisch', 'Griechisch', 'Französisch'],
      }
    ];

    render(
      <RecipeList
        recipes={recipesWithManyKulinarik}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
      />
    );

    const moreTag = screen.getByText('+1 weitere');
    expect(moreTag).toHaveClass('kulinarik-tag-more');
  });

  test('does not show ingredient or step counts', () => {
    const recipe = {
      id: '1',
      title: 'Test',
      ingredients: ['a', 'b', 'c'],
      steps: ['s1', 's2'],
    };

    render(
      <RecipeList
        recipes={[recipe]}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
      />
    );

    expect(screen.queryByText(/Zutaten/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Schritte/)).not.toBeInTheDocument();
  });
});

describe('RecipeList - SortCarousel Visibility', () => {
  const recipes = [
    { id: '1', title: 'Recipe A' },
  ];

  beforeEach(() => {
    jest.spyOn(userFavorites, 'getUserFavorites').mockResolvedValue([]);
    jest.spyOn(require('../utils/customLists'), 'getButtonIcons').mockResolvedValue({
      filterButton: '⚙',
    });
    jest.spyOn(require('../utils/recipeRatings'), 'getUserRating').mockResolvedValue(null);
    jest.spyOn(require('../utils/recipeRatings'), 'subscribeToRatingSummary').mockImplementation(() => () => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('shows SortCarousel when user has sortCarousel permission', () => {
    const userWithPermission = {
      id: 'user-1',
      role: 'admin',
      sortCarousel: true,
    };

    render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={userWithPermission}
      />
    );

    expect(document.querySelector('.sort-carousel')).toBeInTheDocument();
  });

  test('hides SortCarousel when user does not have sortCarousel permission', () => {
    const userWithoutPermission = {
      id: 'user-2',
      role: 'read',
      sortCarousel: false,
    };

    render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={userWithoutPermission}
      />
    );

    expect(document.querySelector('.sort-carousel')).not.toBeInTheDocument();
  });

  test('hides SortCarousel when no user is logged in', () => {
    render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={null}
      />
    );

    expect(document.querySelector('.sort-carousel')).not.toBeInTheDocument();
  });
});

describe('RecipeList - Active Filters Bar', () => {
  const recipes = [{ id: '1', title: 'Recipe A' }];

  beforeEach(() => {
    jest.spyOn(userFavorites, 'getUserFavorites').mockResolvedValue([]);
    jest.spyOn(require('../utils/customLists'), 'getButtonIcons').mockResolvedValue({
      filterButton: '⚙',
    });
    jest.spyOn(require('../utils/recipeRatings'), 'getUserRating').mockResolvedValue(null);
    jest.spyOn(require('../utils/recipeRatings'), 'subscribeToRatingSummary').mockImplementation(() => () => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('does not show active-filters-bar when no filters are active', () => {
    render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        activeFilters={{}}
      />
    );

    expect(document.querySelector('.active-filters-bar')).not.toBeInTheDocument();
  });

  test('does not show search chip in recipe list when searchTerm is set', () => {
    render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        activeFilters={{}}
        searchTerm="Pasta"
      />
    );

    expect(document.querySelector('.active-filters-bar')).not.toBeInTheDocument();
    expect(document.querySelector('.active-filter-chip--search')).not.toBeInTheDocument();
  });

  test('does not show cuisine chip in recipe list when selectedCuisines are set', () => {
    render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        activeFilters={{ selectedCuisines: ['Italienisch', 'Asiatisch'] }}
      />
    );

    expect(document.querySelector('.active-filters-bar')).not.toBeInTheDocument();
    expect(document.querySelector('.active-filter-chip--cuisine')).not.toBeInTheDocument();
  });

  test('does not show chips when both search and cuisine filters are active', () => {
    render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        activeFilters={{ selectedCuisines: ['Japanisch'] }}
        searchTerm="Sushi"
      />
    );

    expect(document.querySelector('.active-filter-chip--search')).not.toBeInTheDocument();
    expect(document.querySelector('.active-filter-chip--cuisine')).not.toBeInTheDocument();
  });
});

describe('RecipeList - SortCarousel persistence', () => {
  const recipes = [{ id: '1', title: 'Recipe A' }];
  const userWithPermission = { id: 'user-1', role: 'admin', sortCarousel: true };
  const SORT_STORAGE_KEY = 'recipebook_active_sort';

  beforeEach(() => {
    sessionStorage.clear();
    jest.spyOn(userFavorites, 'getUserFavorites').mockResolvedValue([]);
    jest.spyOn(require('../utils/customLists'), 'getButtonIcons').mockResolvedValue({
      filterButton: '⚙',
    });
    jest.spyOn(require('../utils/recipeRatings'), 'getUserRating').mockResolvedValue(null);
    jest.spyOn(require('../utils/recipeRatings'), 'subscribeToRatingSummary').mockImplementation(() => () => {});
  });

  afterEach(() => {
    sessionStorage.clear();
    jest.restoreAllMocks();
  });

  test('defaults to alphabetical when sessionStorage is empty', () => {
    const { container } = render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={userWithPermission}
      />
    );

    const carousel = container.querySelector('.sort-carousel');
    expect(carousel).toBeInTheDocument();
    const activeItem = carousel.querySelector('.sort-carousel-item--active');
    expect(activeItem).toHaveTextContent('Alphabetisch');
  });

  test('restores sort selection from sessionStorage on mount', () => {
    sessionStorage.setItem(SORT_STORAGE_KEY, 'newest');

    const { container } = render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={userWithPermission}
      />
    );

    const carousel = container.querySelector('.sort-carousel');
    expect(carousel).toBeInTheDocument();
    const activeItem = carousel.querySelector('.sort-carousel-item--active');
    expect(activeItem).toHaveTextContent('Neue Rezepte');
  });

  test('saves sort selection to sessionStorage after mount', () => {
    render(
      <RecipeList
        recipes={recipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={userWithPermission}
      />
    );

    expect(sessionStorage.getItem(SORT_STORAGE_KEY)).toBe('alphabetical');
  });
});

describe('RecipeList - Filter Button Visibility', () => {
  let originalInnerWidth;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
    // Simulate mobile viewport
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    jest.spyOn(userFavorites, 'getUserFavorites').mockResolvedValue([]);
    jest.spyOn(require('../utils/customLists'), 'getButtonIcons').mockResolvedValue({
      filterButton: '⚙',
    });
    jest.spyOn(require('../utils/recipeRatings'), 'getUserRating').mockResolvedValue(null);
    jest.spyOn(require('../utils/recipeRatings'), 'subscribeToRatingSummary').mockImplementation(() => () => {});
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: originalInnerWidth });
    jest.restoreAllMocks();
  });

  test('filter button is always visible when component mounts (mobile)', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        onClearAllFilters={() => {}}
      />
    );

    const filterButton = screen.getByTitle('Weitere Filter');
    expect(filterButton).toBeInTheDocument();
    expect(filterButton.style.transform).not.toContain('translateY(-76px)');
  });

  test('filter button remains visible after touching outside it (mobile)', () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        onClearAllFilters={() => {}}
      />
    );

    const filterButton = screen.getByTitle('Weitere Filter');
    expect(filterButton).toBeInTheDocument();

    // Simulate a touch/click outside the filter button
    fireEvent.mouseDown(document.body);

    // Filter button should still be visible (always visible, not hidden by outside touch)
    expect(filterButton).toBeInTheDocument();
    expect(filterButton.style.transform).not.toContain('translateY(-76px)');
  });

});

describe('RecipeList - Filter Button Long Press', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(userFavorites, 'getUserFavorites').mockResolvedValue([]);
    jest.spyOn(require('../utils/customLists'), 'getButtonIcons').mockResolvedValue({
      filterButton: '⚙',
      filterButtonActive: '🔽',
    });
    jest.spyOn(require('../utils/recipeRatings'), 'getUserRating').mockResolvedValue(null);
    jest.spyOn(require('../utils/recipeRatings'), 'subscribeToRatingSummary').mockImplementation(() => () => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('long press on active filter button clears filters but does not open dialog', async () => {
    const onClearAllFilters = jest.fn();
    const onOpenSearch = jest.fn();

    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        onClearAllFilters={onClearAllFilters}
        onOpenSearch={onOpenSearch}
        activeFilters={{ cuisine: 'Italian' }}
      />
    );

    const filterButton = await screen.findByTitle('Weitere Filter');

    // Start touch (long press)
    fireEvent.touchStart(filterButton);

    // Advance past the long press threshold (500ms)
    act(() => { jest.advanceTimersByTime(600); });

    // End touch
    fireEvent.touchEnd(filterButton);

    // Filter should be cleared
    expect(onClearAllFilters).toHaveBeenCalledTimes(1);
    // Dialog must NOT be opened
    expect(onOpenSearch).not.toHaveBeenCalled();
  });

  test('short tap on filter button opens dialog without clearing filters', async () => {
    const onClearAllFilters = jest.fn();
    const onOpenSearch = jest.fn();

    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        onClearAllFilters={onClearAllFilters}
        onOpenSearch={onOpenSearch}
        activeFilters={{ cuisine: 'Italian' }}
      />
    );

    const filterButton = await screen.findByTitle('Weitere Filter');

    // Short tap: touchStart + touchEnd without long press delay
    fireEvent.touchStart(filterButton);
    act(() => { jest.advanceTimersByTime(100); });
    fireEvent.touchEnd(filterButton);

    // Dialog should open
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
    // Filters must NOT be cleared
    expect(onClearAllFilters).not.toHaveBeenCalled();
  });
});
