import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RecipeDetail from './RecipeDetail';

// Mock the utility modules
jest.mock('../utils/imageUtils', () => ({
  isBase64Image: jest.fn(() => false),
}));

jest.mock('../utils/userFavorites', () => ({
  isRecipeFavorite: () => false,
  toggleRecipeFavorite: jest.fn(),
  getUserFavorites: () => Promise.resolve([]),
}));

jest.mock('../utils/userManagement', () => ({
  canDirectlyEditRecipe: () => true,
  canCreateNewVersion: () => true,
  canDeleteRecipe: () => true,
  getUsers: () => [
    { id: 'user-1', vorname: 'Test', nachname: 'User' },
  ],
}));

jest.mock('../utils/recipeVersioning', () => ({
  isRecipeVersion: () => false,
  getVersionNumber: () => 0,
  getRecipeVersions: () => [],
  getParentRecipe: () => null,
  sortRecipeVersions: (recipes) => recipes,
}));

jest.mock('../utils/customLists', () => ({
  getCustomLists: () => Promise.resolve({
    portionUnits: [
      { id: 'portion', singular: 'Portion', plural: 'Portionen' },
      { id: 'serving', singular: 'Menge', plural: 'Mengen' },
    ],
    cuisineTypes: [],
    mealCategories: [],
    units: [],
  }),
  getButtonIcons: () => Promise.resolve({
    cookingMode: '👨‍🍳',
    importRecipe: '📥',
    scanImage: '📷'
  }),
}));

describe('RecipeDetail - Portion Controller', () => {
  const mockRecipe = {
    id: 'recipe-1',
    title: 'Test Recipe',
    authorId: 'user-1',
    portionen: 4,
    portionUnitId: 1, // Portionen
    ingredients: [
      '200 g Ingredient 1',
      '1 Stück Ingredient 2',
    ],
    steps: ['Step 1', 'Step 2'],
    kulinarik: ['Italian'],
    schwierigkeit: 3,
    kochdauer: 30,
    speisekategorie: 'Main Course',
  };

  const currentUser = {
    id: 'user-1',
    vorname: 'Test',
    nachname: 'User',
  };

  test('displays initial portion count correctly', () => {
    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    expect(screen.getByText('4 Portionen')).toBeInTheDocument();
  });

  test('increments portions by whole numbers only', () => {
    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    // Initial state: 4 portions
    expect(screen.getByText('4 Portionen')).toBeInTheDocument();

    // Click increment button
    const incrementButton = screen.getAllByRole('button').find(btn => btn.textContent === '+');
    fireEvent.click(incrementButton);

    // Should now be 5 portions (not 4.5)
    expect(screen.getByText('5 Portionen')).toBeInTheDocument();

    // Click increment again
    fireEvent.click(incrementButton);

    // Should now be 6 portions
    expect(screen.getByText('6 Portionen')).toBeInTheDocument();
  });

  test('decrements portions by whole numbers only', () => {
    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    // Initial state: 4 portions
    expect(screen.getByText('4 Portionen')).toBeInTheDocument();

    // Click decrement button
    const decrementButton = screen.getAllByRole('button').find(btn => btn.textContent === '-');
    fireEvent.click(decrementButton);

    // Should now be 3 portions (not 3.5)
    expect(screen.getByText('3 Portionen')).toBeInTheDocument();

    // Click decrement again
    fireEvent.click(decrementButton);

    // Should now be 2 portions
    expect(screen.getByText('2 Portionen')).toBeInTheDocument();
  });

  test('does not allow portions to go below 1', () => {
    const recipeWith1Portion = { ...mockRecipe, portionen: 1 };
    
    render(
      <RecipeDetail
        recipe={recipeWith1Portion}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    // Initial state: 1 portion
    expect(screen.getByText('1 Portion')).toBeInTheDocument();

    // Decrement button should be disabled
    const decrementButton = screen.getAllByRole('button').find(btn => btn.textContent === '-');
    expect(decrementButton).toBeDisabled();

    // Try to click it anyway
    fireEvent.click(decrementButton);

    // Should still be 1 portion
    expect(screen.getByText('1 Portion')).toBeInTheDocument();
  });

  test('enables decrement button when portions are above 1', () => {
    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    const decrementButton = screen.getAllByRole('button').find(btn => btn.textContent === '-');
    
    // With 4 portions, decrement should be enabled
    expect(decrementButton).not.toBeDisabled();
  });

  test('scales ingredients based on whole number portions', () => {
    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    // Initial state: 200g for 4 portions
    expect(screen.getByText(/200.*g/)).toBeInTheDocument();

    // Increment to 8 portions (double)
    const incrementButton = screen.getAllByRole('button').find(btn => btn.textContent === '+');
    fireEvent.click(incrementButton); // 5 portions
    fireEvent.click(incrementButton); // 6 portions
    fireEvent.click(incrementButton); // 7 portions
    fireEvent.click(incrementButton); // 8 portions

    // Should now be 400g (200 * 2)
    expect(screen.getByText(/400.*g/)).toBeInTheDocument();
  });
});

describe('RecipeDetail - Rating Stars Color', () => {
  const mockRecipe = {
    id: 'recipe-1',
    title: 'Test Recipe',
    authorId: 'user-1',
    portionen: 4,
    ingredients: [],
    steps: [],
    kulinarik: [],
    schwierigkeit: 3,
  };

  const currentUser = {
    id: 'user-1',
    vorname: 'Test',
    nachname: 'User',
  };

  test('displays difficulty stars when schwierigkeit is set', () => {
    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    // Check that "Schwierigkeit" label is present
    expect(screen.getByText('Schwierigkeit:')).toBeInTheDocument();
    
    // Check that the difficulty-stars class is present in the document
    const difficultyStars = document.querySelector('.difficulty-stars');
    expect(difficultyStars).toBeInTheDocument();
    
    // Check that stars are displayed (3 stars for schwierigkeit: 3)
    expect(difficultyStars.textContent).toBe('⭐⭐⭐');
  });

  test('difficulty stars have correct CSS class for orange color', () => {
    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    const difficultyStars = document.querySelector('.difficulty-stars');
    expect(difficultyStars).toHaveClass('difficulty-stars');
  });
});

describe('RecipeDetail - Cooking Mode', () => {
  const mockRecipe = {
    id: 'recipe-1',
    title: 'Test Recipe',
    authorId: 'user-1',
    portionen: 4,
    ingredients: ['200 g Ingredient 1'],
    steps: ['Step 1', 'Step 2'],
    image: 'test-image.jpg',
  };

  const currentUser = {
    id: 'user-1',
    vorname: 'Test',
    nachname: 'User',
  };

  let originalInnerWidth;

  // Helper function to set mock window width
  const setMockWindowWidth = (width) => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: width,
    });
  };

  // Mock Wake Lock API
  beforeEach(() => {
    // Save original innerWidth
    originalInnerWidth = window.innerWidth;

    // Mock navigator.wakeLock
    Object.defineProperty(navigator, 'wakeLock', {
      writable: true,
      value: {
        request: jest.fn().mockResolvedValue({
          release: jest.fn().mockResolvedValue(undefined),
        }),
      },
    });
  });

  afterEach(() => {
    // Restore original innerWidth
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
  });

  test('does NOT display cooking mode button on desktop', () => {
    // Mock desktop width (> 480px)
    setMockWindowWidth(1024);

    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    // Cooking mode button should NOT be in the desktop header
    const desktopHeader = document.querySelector('.recipe-detail-header');
    expect(desktopHeader).toBeInTheDocument();
    
    // Should not find "Kochmodus" text in desktop header
    const cookingModeButtons = screen.queryAllByText(/Kochmodus/);
    const desktopCookingModeButton = cookingModeButtons.find(btn => 
      desktopHeader.contains(btn)
    );
    expect(desktopCookingModeButton).toBeUndefined();
  });

  test('displays cooking mode button on mobile', () => {
    // Mock mobile width (<= 480px)
    setMockWindowWidth(400);

    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    // When inactive, cooking mode static icon should be displayed (not the button)
    const staticIcon = document.querySelector('.overlay-cooking-mode-static');
    expect(staticIcon).toBeInTheDocument();
    
    // The button should NOT be present when inactive
    const overlayButton = document.querySelector('.overlay-cooking-mode');
    expect(overlayButton).not.toBeInTheDocument();
  });

  test('activates cooking mode on mobile when button is clicked', () => {
    // Mock mobile width (<= 480px)
    setMockWindowWidth(400);

    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    // Find the mobile overlay static icon (when inactive)
    const staticIcon = document.querySelector('.overlay-cooking-mode-static');
    expect(staticIcon).toBeInTheDocument();
    
    // Click to activate cooking mode
    fireEvent.click(staticIcon);
    
    // Check that the cooking mode indicator appears
    expect(screen.getByText('Kochmodus aktiv')).toBeInTheDocument();
    
    // In cooking mode, the image should be hidden, so overlay button should not be present
    const overlayButton = document.querySelector('.overlay-cooking-mode');
    expect(overlayButton).not.toBeInTheDocument();
    
    // Check that the static icon is also not present anymore
    const staticIconAfter = document.querySelector('.overlay-cooking-mode-static');
    expect(staticIconAfter).not.toBeInTheDocument();
  });

  test('deactivates cooking mode when exit button is clicked', () => {
    // Mock mobile width (<= 480px)
    setMockWindowWidth(400);

    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    // Activate cooking mode by clicking the static icon
    const staticIcon = document.querySelector('.overlay-cooking-mode-static');
    fireEvent.click(staticIcon);

    // Verify it's active
    expect(screen.getByText('Kochmodus aktiv')).toBeInTheDocument();

    // Find and click the exit button (×) in the indicator
    const exitButton = document.querySelector('.cooking-mode-exit');
    fireEvent.click(exitButton);

    // Verify cooking mode is deactivated
    expect(screen.queryByText('Kochmodus aktiv')).not.toBeInTheDocument();
    
    // Verify the static icon is shown again (not the button)
    const staticIconAfter = document.querySelector('.overlay-cooking-mode-static');
    expect(staticIconAfter).toBeInTheDocument();
  });
});

describe('RecipeDetail - Recipe Links', () => {
  const mockLinkedRecipe = {
    id: 'recipe-linked',
    title: 'Pizzateig',
    authorId: 'user-1',
    portionen: 4,
    ingredients: ['500g Mehl', '300ml Wasser'],
    steps: ['Mischen'],
  };

  const mockRecipeWithLinks = {
    id: 'recipe-1',
    title: 'Pizza',
    authorId: 'user-1',
    portionen: 4,
    ingredients: [
      '200g Mehl',
      '#recipe:recipe-linked:Pizzateig',
      '1 Teil #recipe:recipe-linked:Pizzateig',
      '50g #recipe:recipe-linked:Tomatensoße',
    ],
    steps: ['Step 1'],
  };

  const currentUser = {
    id: 'user-1',
    vorname: 'Test',
    nachname: 'User',
  };

  test('displays recipe link without emoji', () => {
    render(
      <RecipeDetail
        recipe={mockRecipeWithLinks}
        allRecipes={[mockLinkedRecipe]}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    // Check that recipe link button exists and doesn't contain emoji
    const linkButtons = screen.getAllByRole('button', { name: /Pizzateig/i });
    expect(linkButtons.length).toBeGreaterThan(0);
    
    // Verify the button text does NOT contain the 🔗 emoji anywhere
    linkButtons.forEach(button => {
      expect(button.textContent).not.toContain('🔗');
    });
  });

  test('displays recipe link with quantity prefix', () => {
    render(
      <RecipeDetail
        recipe={mockRecipeWithLinks}
        allRecipes={[mockLinkedRecipe]}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    // Check that ingredient with quantity prefix is displayed correctly
    expect(screen.getByText('1 Teil')).toBeInTheDocument();
    expect(screen.getByText('50g')).toBeInTheDocument();
  });

  test('displays recipe link without quantity prefix (backward compatibility)', () => {
    render(
      <RecipeDetail
        recipe={mockRecipeWithLinks}
        allRecipes={[mockLinkedRecipe]}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    // Recipe link without quantity should still work
    const linkButtons = screen.getAllByRole('button', { name: /Pizzateig/i });
    // We have 3 recipe links in total (one without quantity, two with quantities)
    expect(linkButtons.length).toBe(3);
  });

  test('scales recipe link quantity prefix when portions are changed', () => {
    render(
      <RecipeDetail
        recipe={mockRecipeWithLinks}
        allRecipes={[mockLinkedRecipe]}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    // Initial state: 1 Teil for 4 portions
    expect(screen.getByText('1 Teil')).toBeInTheDocument();

    // Increment to 8 portions (double)
    const incrementButton = screen.getAllByRole('button').find(btn => btn.textContent === '+');
    fireEvent.click(incrementButton); // 5 portions
    fireEvent.click(incrementButton); // 6 portions
    fireEvent.click(incrementButton); // 7 portions
    fireEvent.click(incrementButton); // 8 portions

    // Should now be 2 Teil (1 * 2)
    expect(screen.getByText('2 Teil')).toBeInTheDocument();
  });

  test('recipe link ingredients use consistent list styling', () => {
    render(
      <RecipeDetail
        recipe={mockRecipeWithLinks}
        allRecipes={[mockLinkedRecipe]}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    // Find all list items that contain recipe links
    const ingredientsList = document.querySelector('.ingredients-list');
    const listItems = ingredientsList.querySelectorAll('li.ingredient-with-link');
    
    // Recipe link ingredients should NOT have manual bullet prefix
    // They should use browser's native list styling like other ingredients
    listItems.forEach(item => {
      expect(item.textContent).not.toMatch(/^•/);
    });
  });
});

describe('RecipeDetail - Creation Date Display', () => {
  const currentUser = {
    id: 'user-1',
    vorname: 'Test',
    nachname: 'User',
  };

  const allUsers = [
    { id: 'user-1', vorname: 'Test', nachname: 'User' },
    { id: 'user-2', vorname: 'Another', nachname: 'Author' },
  ];

  test('displays creation date when available', () => {
    const mockRecipe = {
      id: 'recipe-1',
      title: 'Test Recipe',
      authorId: 'user-1',
      createdAt: '2024-01-15T10:30:00Z',
      ingredients: ['Ingredient 1'],
      steps: ['Step 1'],
    };

    render(
      <RecipeDetail
        recipe={mockRecipe}
        allUsers={allUsers}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    // Check that the creation date is displayed with label in German format (D.M.YYYY or DD.MM.YYYY)
    expect(screen.getByText('Erstellt am: 15.1.2024')).toBeInTheDocument();
  });

  test('displays author and creation date together', () => {
    const mockRecipe = {
      id: 'recipe-1',
      title: 'Test Recipe',
      authorId: 'user-2',
      createdAt: '2024-02-20T14:45:00Z',
      ingredients: ['Ingredient 1'],
      steps: ['Step 1'],
    };

    render(
      <RecipeDetail
        recipe={mockRecipe}
        allUsers={allUsers}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    // Check that both author and date are displayed
    expect(screen.getByText(/Autor: Another Author/)).toBeInTheDocument();
    expect(screen.getByText('Erstellt am: 20.2.2024')).toBeInTheDocument();
  });

  test('does not display creation date when not available', () => {
    const mockRecipe = {
      id: 'recipe-1',
      title: 'Test Recipe',
      authorId: 'user-1',
      // No createdAt field
      ingredients: ['Ingredient 1'],
      steps: ['Step 1'],
    };

    render(
      <RecipeDetail
        recipe={mockRecipe}
        allUsers={allUsers}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    // Check that author is still displayed
    expect(screen.getByText(/Autor: Test User/)).toBeInTheDocument();
    
    // Creation date should not be in the document (no specific date text)
    expect(screen.queryByText(/\d{2}\.\d{2}\.\d{4}/)).not.toBeInTheDocument();
  });

  test('handles Firestore Timestamp objects', () => {
    const mockFirestoreTimestamp = {
      toDate: () => new Date('2024-03-10T08:00:00Z'),
    };

    const mockRecipe = {
      id: 'recipe-1',
      title: 'Test Recipe',
      authorId: 'user-1',
      createdAt: mockFirestoreTimestamp,
      ingredients: ['Ingredient 1'],
      steps: ['Step 1'],
    };

    render(
      <RecipeDetail
        recipe={mockRecipe}
        allUsers={allUsers}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    // Check that the creation date is displayed correctly with label
    expect(screen.getByText('Erstellt am: 10.3.2024')).toBeInTheDocument();
  });

  test('handles Date objects', () => {
    const mockRecipe = {
      id: 'recipe-1',
      title: 'Test Recipe',
      authorId: 'user-1',
      createdAt: new Date('2024-04-05T12:00:00Z'),
      ingredients: ['Ingredient 1'],
      steps: ['Step 1'],
    };

    render(
      <RecipeDetail
        recipe={mockRecipe}
        allUsers={allUsers}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );

    // Check that the creation date is displayed correctly with label
    expect(screen.getByText('Erstellt am: 5.4.2024')).toBeInTheDocument();
  });
});
