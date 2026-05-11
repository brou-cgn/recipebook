import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RecipeForm from './RecipeForm';

// Mock the utility modules
jest.mock('../utils/emojiUtils', () => ({
  removeEmojis: (text) => text,
  containsEmojis: () => false,
}));

jest.mock('../utils/imageUtils', () => ({
  fileToBase64: jest.fn(),
  isBase64Image: jest.fn(() => false),
  analyzeImageBrightness: jest.fn(() => Promise.resolve({ isBright: false })),
}));

jest.mock('../utils/customLists', () => ({
  getCustomLists: () => Promise.resolve({
    cuisineTypes: ['Italian', 'Thai', 'Chinese'],
    mealCategories: ['Appetizer', 'Main Course', 'Dessert'],
    units: [],
    portionUnits: [
      { id: 'portion', singular: 'Portion', plural: 'Portionen' }
    ]
  }),
  saveCustomLists: jest.fn(() => Promise.resolve()),
  getButtonIcons: () => Promise.resolve({
    cookingMode: '👨‍🍳',
    importRecipe: '📥',
    scanImage: '📷',
    webImport: '🌐',
    saveRecipe: '💾',
    cancelRecipe: '✕'
  }),
  DEFAULT_BUTTON_ICONS: {
    cookingMode: '👨‍🍳',
    importRecipe: '📥',
    scanImage: '📷',
    webImport: '🌐',
    saveRecipe: '💾',
    closeButton: '✕',
    closeButtonAlt: '✕',
    menuCloseButton: '✕',
    filterButton: '⚙',
    filterButtonActive: '🔽',
    copyLink: '📋',
    nutritionEmpty: '➕',
    nutritionFilled: '🥦',
    ratingHeartEmpty: '🤍',
    ratingHeartEmptyModal: '♡',
    ratingHeartFilled: '♥',
    privateListBack: '✕',
    shoppingList: '🛒',
    bringButton: '🛍️',
    timerStart: '⏱',
    timerStop: '⏹',
    cookDate: '📅',
    addRecipe: '➕',
    addMenu: '📋',
    addPrivateRecipe: '🔒',
    swipeRight: '👍',
    swipeLeft: '👎',
    swipeUp: '⭐',
    menuFavoritesButton: '★',
    tagesmenuFilterButton: '☰'
  },
  getEffectiveIcon: (icons, key) => icons[key] ?? '',
  getDarkModePreference: () => false,
}));

jest.mock('../utils/userManagement', () => ({
  getUsers: () => Promise.resolve([
    { id: 'admin-1', vorname: 'Admin', nachname: 'User', email: 'admin@example.com', isAdmin: true, role: 'admin' },
    { id: 'user-1', vorname: 'Regular', nachname: 'User', email: 'user@example.com', isAdmin: false, role: 'edit' },
  ]),
  isCurrentUserAdmin: jest.fn(() => false),
  getUserAiOcrScanCount: jest.fn(() => Promise.resolve(0)),
  ROLES: {
    ADMIN: 'admin',
    EDIT: 'edit',
    COMMENT: 'comment',
    READ: 'read',
    GUEST: 'guest'
  }
}));

jest.mock('../utils/categoryImages', () => ({
  getImageForCategories: jest.fn(),
}));

jest.mock('../utils/ingredientUtils', () => {
  const actual = jest.requireActual('../utils/ingredientUtils');
  return {
    formatIngredientSpacing: actual.formatIngredientSpacing,
  };
});

jest.mock('../utils/storageUtils', () => ({
  uploadRecipeImage: jest.fn(),
  deleteRecipeImage: jest.fn(),
}));

jest.mock('../utils/recipeLinks', () => ({
  encodeRecipeLink: jest.fn((id, title) => `#${id}-${title}`),
  decodeRecipeLink: jest.fn((text) => null), // Returns null for non-recipe-link text
  startsWithHash: (text) => text.startsWith('#'),
  containsHashForTypeahead: jest.fn(() => false),
}));

jest.mock('../utils/cuisineProposalsFirestore', () => ({
  addCuisineProposal: jest.fn(() => Promise.resolve('proposal-id-1')),
}));

// Mock @dnd-kit modules
jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }) => <div>{children}</div>,
  closestCenter: jest.fn(),
  PointerSensor: jest.fn(),
  TouchSensor: jest.fn(),
  KeyboardSensor: jest.fn(),
  useSensor: jest.fn(),
  useSensors: jest.fn(() => []),
}));

jest.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }) => <div>{children}</div>,
  arrayMove: jest.fn((array, oldIndex, newIndex) => {
    const newArray = [...array];
    const [item] = newArray.splice(oldIndex, 1);
    newArray.splice(newIndex, 0, item);
    return newArray;
  }),
  sortableKeyboardCoordinates: jest.fn(),
  verticalListSortingStrategy: jest.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

jest.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => '',
    },
  },
}));

describe('RecipeForm - Author Field', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows author dropdown for admin user', async () => {
    const adminUser = {
      id: 'admin-1',
      vorname: 'Admin',
      nachname: 'User',
      email: 'admin@example.com',
      isAdmin: true,
      role: 'admin',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={adminUser}
      />
    );

    // Check that author field is a select (dropdown)
    const authorField = screen.getByLabelText('Autor');
    expect(authorField.tagName).toBe('SELECT');

    // Wait for users to load
    await waitFor(() => {
      expect(screen.getByText('Admin User (admin@example.com)')).toBeInTheDocument();
      expect(screen.getByText('Regular User (user@example.com)')).toBeInTheDocument();
    });
  });

  test('does not show author field for non-admin user', () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Author field should not be visible for non-admin users
    expect(screen.queryByLabelText('Autor')).not.toBeInTheDocument();
  });

  test('sets current user as author for new recipe', async () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Fill in required fields
    fireEvent.change(screen.getByLabelText('Rezepttitel *'), {
      target: { value: 'Test Recipe' },
    });

    fireEvent.change(screen.getByPlaceholderText('Zutat 1'), { target: { value: 'Test Zutat' } });
    fireEvent.change(screen.getByPlaceholderText('Schritt 1'), { target: { value: 'Test Schritt' } });

    // Select a required category
    const speisekategorieSelect = screen.getByLabelText('Speisekategorie (Mehrfachauswahl möglich)');
    await waitFor(() => expect(speisekategorieSelect.options.length).toBeGreaterThan(0));
    speisekategorieSelect.options[0].selected = true;
    fireEvent.change(speisekategorieSelect);

    // Submit form
    fireEvent.submit(document.querySelector('.recipe-form'));

    // Check that onSave was called with authorId set to current user
    await waitFor(() => expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test Recipe',
        authorId: 'user-1',
      })
    ));
  });

  test('admin can change author when creating recipe', async () => {
    const adminUser = {
      id: 'admin-1',
      vorname: 'Admin',
      nachname: 'User',
      email: 'admin@example.com',
      isAdmin: true,
      role: 'admin',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={adminUser}
      />
    );

    // Fill in required fields
    fireEvent.change(screen.getByLabelText('Rezepttitel *'), {
      target: { value: 'Test Recipe' },
    });

    fireEvent.change(screen.getByPlaceholderText('Zutat 1'), { target: { value: 'Test Zutat' } });
    fireEvent.change(screen.getByPlaceholderText('Schritt 1'), { target: { value: 'Test Schritt' } });

    // Change author (wait for users to load first)
    const authorField = screen.getByLabelText('Autor');
    await waitFor(() => expect(authorField.options.length).toBeGreaterThan(0));
    fireEvent.change(authorField, { target: { value: 'user-1' } });

    // Select a required category
    const speisekategorieSelect = screen.getByLabelText('Speisekategorie (Mehrfachauswahl möglich)');
    await waitFor(() => expect(speisekategorieSelect.options.length).toBeGreaterThan(0));
    speisekategorieSelect.options[0].selected = true;
    fireEvent.change(speisekategorieSelect);

    // Submit form
    fireEvent.submit(document.querySelector('.recipe-form'));

    // Check that onSave was called with the selected authorId
    await waitFor(() => expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test Recipe',
        authorId: 'user-1',
      })
    ));
  });

  test('preserves authorId when editing existing recipe', async () => {
    const adminUser = {
      id: 'admin-1',
      vorname: 'Admin',
      nachname: 'User',
      email: 'admin@example.com',
      isAdmin: true,
      role: 'admin',
    };

    const existingRecipe = {
      id: 'recipe-1',
      title: 'Existing Recipe',
      authorId: 'user-1',
      portionen: 4,
      kulinarik: [],
      schwierigkeit: 3,
      kochdauer: 30,
      speisekategorie: ['Main Course'],
      ingredients: ['Ingredient 1'],
      steps: ['Step 1'],
      image: '',
    };

    render(
      <RecipeForm
        recipe={existingRecipe}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={adminUser}
      />
    );

    // Submit form without changing anything
    fireEvent.submit(document.querySelector('.recipe-form'));

    // Check that onSave was called with the original authorId
    await waitFor(() => expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'recipe-1',
        title: 'Existing Recipe',
        authorId: 'user-1',
      })
    ));
  });

  test('admin can change author when editing existing recipe', async () => {
    const adminUser = {
      id: 'admin-1',
      vorname: 'Admin',
      nachname: 'User',
      email: 'admin@example.com',
      isAdmin: true,
      role: 'admin',
    };

    const existingRecipe = {
      id: 'recipe-1',
      title: 'Existing Recipe',
      authorId: 'user-1',
      portionen: 4,
      kulinarik: [],
      schwierigkeit: 3,
      kochdauer: 30,
      speisekategorie: ['Main Course'],
      ingredients: ['Ingredient 1'],
      steps: ['Step 1'],
      image: '',
    };

    render(
      <RecipeForm
        recipe={existingRecipe}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={adminUser}
      />
    );

    // Change author (wait for users to load first)
    const authorField = screen.getByLabelText('Autor');
    await waitFor(() => expect(authorField.options.length).toBeGreaterThan(0));
    fireEvent.change(authorField, { target: { value: 'admin-1' } });

    // Submit form
    fireEvent.submit(document.querySelector('.recipe-form'));

    // Check that onSave was called with the new authorId
    await waitFor(() => expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'recipe-1',
        authorId: 'admin-1',
      })
    ));
  });
});

describe('RecipeForm - Difficulty Field', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();
  const currentUser = {
    id: 'user-1',
    vorname: 'Regular',
    nachname: 'User',
    email: 'user@example.com',
    isAdmin: false,
    role: 'edit',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('difficulty field has no pre-selection when adding a new recipe', () => {
    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={currentUser}
      />
    );

    const stars = document.querySelectorAll('.difficulty-slider .star');
    expect(stars.length).toBe(5);
    stars.forEach((star) => {
      expect(star).toHaveClass('empty');
      expect(star).not.toHaveClass('filled');
    });
  });
});

describe('RecipeForm - Multi-Select Fields', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Kulinarik field is a search input for pill-based selection', () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    const kulinarikSearch = screen.getByLabelText('Kulinariktypen suchen');
    expect(kulinarikSearch.tagName).toBe('INPUT');
    expect(kulinarikSearch).toHaveAttribute('type', 'text');
  });

  test('Speisekategorie field is a multi-select dropdown', () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    const speisekategorieField = screen.getByLabelText('Speisekategorie (Mehrfachauswahl möglich)');
    expect(speisekategorieField.tagName).toBe('SELECT');
    expect(speisekategorieField).toHaveAttribute('multiple');
  });

  test('can select multiple cuisines in Kulinarik field', async () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Wait for cuisine pills to appear
    await waitFor(() => expect(screen.getByRole('button', { name: 'Italian' })).toBeInTheDocument());

    // Click the Italian and Thai pills to select them
    fireEvent.click(screen.getByRole('button', { name: 'Italian' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thai' }));

    // Fill in required title and other required fields
    fireEvent.change(screen.getByLabelText('Rezepttitel *'), {
      target: { value: 'Test Recipe' },
    });

    fireEvent.change(screen.getByPlaceholderText('Zutat 1'), { target: { value: 'Test Zutat' } });
    fireEvent.change(screen.getByPlaceholderText('Schritt 1'), { target: { value: 'Test Schritt' } });

    // Select a required category
    const speisekategorieSelect = screen.getByLabelText('Speisekategorie (Mehrfachauswahl möglich)');
    speisekategorieSelect.options[0].selected = true;
    fireEvent.change(speisekategorieSelect);

    // Submit form
    fireEvent.submit(document.querySelector('.recipe-form'));

    // Check that onSave was called with multiple cuisines
    await waitFor(() => expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        kulinarik: expect.arrayContaining(['Italian', 'Thai']),
      })
    ));
  });

  test('can select multiple categories in Speisekategorie field', async () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    const speisekategorieField = screen.getByLabelText('Speisekategorie (Mehrfachauswahl möglich)');

    // Wait for options to load
    await waitFor(() => expect(speisekategorieField.options.length).toBeGreaterThan(0));
    
    // Get the options
    const appetizerOption = screen.getByRole('option', { name: 'Appetizer' });
    const mainCourseOption = screen.getByRole('option', { name: 'Main Course' });
    
    // Select multiple options by setting selected property
    appetizerOption.selected = true;
    mainCourseOption.selected = true;
    
    // Trigger change event
    fireEvent.change(speisekategorieField);

    // Fill in required title and other required fields
    fireEvent.change(screen.getByLabelText('Rezepttitel *'), {
      target: { value: 'Test Recipe' },
    });

    fireEvent.change(screen.getByPlaceholderText('Zutat 1'), { target: { value: 'Test Zutat' } });
    fireEvent.change(screen.getByPlaceholderText('Schritt 1'), { target: { value: 'Test Schritt' } });

    // Submit form
    fireEvent.submit(document.querySelector('.recipe-form'));

    // Check that onSave was called with multiple categories
    await waitFor(() => expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        speisekategorie: expect.arrayContaining(['Appetizer', 'Main Course']),
      })
    ));
  });

  test('loads existing recipe with array kulinarik correctly', async () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    const existingRecipe = {
      id: 'recipe-1',
      title: 'Existing Recipe',
      authorId: 'user-1',
      portionen: 4,
      kulinarik: ['Italian', 'Chinese'],
      schwierigkeit: 3,
      kochdauer: 30,
      speisekategorie: ['Main Course'],
      ingredients: ['Ingredient 1'],
      steps: ['Step 1'],
      image: '',
    };

    render(
      <RecipeForm
        recipe={existingRecipe}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Wait for cuisine pills to appear and verify selected pills are shown active
    await waitFor(() => {
      const italianPill = screen.getByRole('button', { name: 'Italian' });
      expect(italianPill).toHaveAttribute('aria-pressed', 'true');
    });

    // Submit form and verify kulinarik values are preserved
    fireEvent.submit(document.querySelector('.recipe-form'));
    await waitFor(() => expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        kulinarik: expect.arrayContaining(['Italian', 'Chinese']),
      })
    ));
  });

  test('converts old string format speisekategorie to array', async () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    const existingRecipe = {
      id: 'recipe-1',
      title: 'Existing Recipe',
      authorId: 'user-1',
      portionen: 4,
      kulinarik: ['Italian'],
      schwierigkeit: 3,
      kochdauer: 30,
      speisekategorie: 'Dessert', // Old string format
      ingredients: ['Ingredient 1'],
      steps: ['Step 1'],
      image: '',
    };

    render(
      <RecipeForm
        recipe={existingRecipe}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Submit form
    fireEvent.submit(document.querySelector('.recipe-form'));

    // Check that speisekategorie was converted to array
    await waitFor(() => expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        speisekategorie: ['Dessert'],
      })
    ));
  });

  test('prevents saving when no Speisekategorie is selected', async () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Wait for customLists to load
    await waitFor(() => {
      expect(screen.getByLabelText('Speisekategorie (Mehrfachauswahl möglich)')).toBeInTheDocument();
    });

    // Fill in required title but leave speisekategorie empty
    fireEvent.change(screen.getByLabelText('Rezepttitel *'), {
      target: { value: 'Test Recipe' },
    });

    // Submit form without selecting a category
    fireEvent.submit(document.querySelector('.recipe-form'));

    expect(alertMock).toHaveBeenCalledWith('Bitte wählen Sie mindestens eine Speisekategorie aus');
    expect(mockOnSave).not.toHaveBeenCalled();

    alertMock.mockRestore();
  });

  test('new cuisine pill appears for search text with no exact match and activates type immediately', async () => {
    const { addCuisineProposal } = require('../utils/cuisineProposalsFirestore');
    const { saveCustomLists } = require('../utils/customLists');
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Wait for cuisine pills to load
    await waitFor(() => expect(screen.getByRole('button', { name: 'Italian' })).toBeInTheDocument());

    // Type a cuisine name that does not exist yet
    const kulinarikSearch = screen.getByLabelText('Kulinariktypen suchen');
    fireEvent.change(kulinarikSearch, { target: { value: 'Peruanisch' } });

    // The new pill (dashed border) should appear showing the typed text
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Peruanisch' })).toBeInTheDocument();
    });

    // Click the new cuisine pill
    fireEvent.click(screen.getByRole('button', { name: 'Peruanisch' }));

    // The input should be cleared immediately after clicking
    await waitFor(() => {
      expect(kulinarikSearch.value).toBe('');
    });

    // The new type should now be active in the pill list
    await waitFor(() => {
      const pill = screen.getByRole('button', { name: 'Peruanisch' });
      expect(pill).toHaveAttribute('aria-pressed', 'true');
    });

    // The type should have been saved to the main cuisineTypes list
    await waitFor(() => {
      expect(saveCustomLists).toHaveBeenCalledWith(
        expect.objectContaining({ cuisineTypes: expect.arrayContaining(['Peruanisch']) })
      );
    });

    // The proposal should also have been submitted for Küchenbetrieb visibility
    expect(addCuisineProposal).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Peruanisch', source: 'recipe_form' })
    );
  });

  test('new cuisine pill activates type even when addCuisineProposal fails', async () => {
    const { addCuisineProposal } = require('../utils/cuisineProposalsFirestore');
    addCuisineProposal.mockRejectedValueOnce(new Error('Firestore unavailable'));

    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Wait for cuisine pills to load
    await waitFor(() => expect(screen.getByRole('button', { name: 'Italian' })).toBeInTheDocument());

    // Type a new cuisine name
    const kulinarikSearch = screen.getByLabelText('Kulinariktypen suchen');
    fireEvent.change(kulinarikSearch, { target: { value: 'Mexikanisch' } });

    // Click the new cuisine pill
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mexikanisch' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Mexikanisch' }));

    // Type is immediately added to kulinarik even though the proposal save fails
    await waitFor(() => {
      const pill = screen.getByRole('button', { name: 'Mexikanisch' });
      expect(pill).toHaveAttribute('aria-pressed', 'true');
    });
  });

  test('does not call saveCustomLists when selecting an already existing cuisine type', async () => {
    const { saveCustomLists } = require('../utils/customLists');
    saveCustomLists.mockClear();

    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Wait for cuisine pills to load
    await waitFor(() => expect(screen.getByRole('button', { name: 'Italian' })).toBeInTheDocument());

    // Click the existing "Italian" pill directly (handleCuisinePillToggle)
    fireEvent.click(screen.getByRole('button', { name: 'Italian' }));

    // The Italian pill should now be active (selected)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Italian' })).toHaveAttribute('aria-pressed', 'true');
    });

    // saveCustomLists should NOT have been called since the type already exists
    expect(saveCustomLists).not.toHaveBeenCalled();
  });

  test('cuisine types that are also cuisine group names are shown as selectable pills', async () => {
    const customListsMock = require('../utils/customLists');
    // Override mock to include a cuisine type that is also a group name
    const spy = jest.spyOn(customListsMock, 'getCustomLists').mockResolvedValueOnce({
      cuisineTypes: ['Italian', 'Thai', 'Chinese', 'Asian'],
      cuisineGroups: [{ name: 'Asian', children: ['Thai', 'Chinese'] }],
      mealCategories: ['Appetizer', 'Main Course', 'Dessert'],
      units: [],
      portionUnits: [{ id: 'portion', singular: 'Portion', plural: 'Portionen' }],
    });

    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // All cuisine types should be visible as pills, including 'Asian' which is a group name
    await waitFor(() => expect(screen.getByRole('button', { name: 'Italian' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Thai' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chinese' })).toBeInTheDocument();
    // 'Asian' is a group name but must still appear as a selectable pill
    expect(screen.getByRole('button', { name: 'Asian' })).toBeInTheDocument();

    spy.mockRestore();
  });
});

describe('RecipeForm - Category Image Integration', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the mock implementation
    const { getImageForCategories } = require('../utils/categoryImages');
    getImageForCategories.mockReset();
  });

  test('uses category image as title image for new recipe without image', async () => {
    const { getImageForCategories } = require('../utils/categoryImages');
    getImageForCategories.mockResolvedValue('data:image/png;base64,category-image');

    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Fill in required title
    fireEvent.change(screen.getByLabelText('Rezepttitel *'), {
      target: { value: 'Test Recipe' },
    });

    // Fill in required ingredient and step
    fireEvent.change(screen.getByPlaceholderText('Zutat 1'), { target: { value: 'Test Zutat' } });
    fireEvent.change(screen.getByPlaceholderText('Schritt 1'), { target: { value: 'Test Schritt' } });

    // Select a meal category (wait for options to load first)
    const speisekategorieField = screen.getByLabelText('Speisekategorie (Mehrfachauswahl möglich)');
    await waitFor(() => expect(speisekategorieField.options.length).toBeGreaterThan(0));
    const mainCourseOption = screen.getByRole('option', { name: 'Main Course' });
    mainCourseOption.selected = true;
    fireEvent.change(speisekategorieField);

    // Submit form without uploading an image
    fireEvent.submit(document.querySelector('.recipe-form'));

    // Wait for async operations to complete
    await waitFor(() => {
      // Check that getImageForCategories was called with the selected category
      expect(getImageForCategories).toHaveBeenCalledWith(['Main Course']);

      // Check that onSave was called with the category image
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Recipe',
          image: 'data:image/png;base64,category-image',
          speisekategorie: ['Main Course'],
        })
      );
    });
  });

  test('uses category image as title image when updating recipe without image', async () => {
    const { getImageForCategories } = require('../utils/categoryImages');
    getImageForCategories.mockResolvedValue('data:image/png;base64,category-image');

    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    const existingRecipeWithoutImage = {
      id: 'recipe-1',
      title: 'Existing Recipe',
      authorId: 'user-1',
      portionen: 4,
      kulinarik: [],
      schwierigkeit: 3,
      kochdauer: 30,
      speisekategorie: ['Main Course'],
      ingredients: ['Ingredient 1'],
      steps: ['Step 1'],
      image: '',
    };

    render(
      <RecipeForm
        recipe={existingRecipeWithoutImage}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Submit form without uploading an image
    fireEvent.submit(document.querySelector('.recipe-form'));

    // Wait for async operations to complete
    await waitFor(() => {
      // Check that getImageForCategories was called with the selected category
      expect(getImageForCategories).toHaveBeenCalledWith(['Main Course']);

      // Check that onSave was called with the category image
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'recipe-1',
          image: 'data:image/png;base64,category-image',
          speisekategorie: ['Main Course'],
        })
      );
    });
  });

  test('does not use category image when recipe already has title image', async () => {
    const { getImageForCategories } = require('../utils/categoryImages');
    getImageForCategories.mockResolvedValue('data:image/png;base64,category-image');

    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    const existingRecipe = {
      id: 'recipe-1',
      title: 'Existing Recipe',
      authorId: 'user-1',
      portionen: 4,
      kulinarik: [],
      schwierigkeit: 3,
      kochdauer: 30,
      speisekategorie: ['Dessert'],
      ingredients: ['Ingredient 1'],
      steps: ['Step 1'],
      image: 'data:image/png;base64,existing-image',
    };

    render(
      <RecipeForm
        recipe={existingRecipe}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Submit form without changing the image
    fireEvent.submit(document.querySelector('.recipe-form'));

    // Wait for async operations
    await waitFor(() => {
      // Category image should NOT be used - existing image should be preserved
      expect(getImageForCategories).not.toHaveBeenCalled();

      // Check that onSave was called with the existing image
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'recipe-1',
          image: 'data:image/png;base64,existing-image',
        })
      );
    });
  });

  test('does not use category image when no categories selected', async () => {
    const { getImageForCategories } = require('../utils/categoryImages');
    getImageForCategories.mockResolvedValue(null);

    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Fill in required title
    fireEvent.change(screen.getByLabelText('Rezepttitel *'), {
      target: { value: 'Test Recipe' },
    });

    // Submit form without selecting categories
    fireEvent.submit(document.querySelector('.recipe-form'));

    // Category validation should block the save before getImageForCategories is called
    expect(getImageForCategories).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledWith('Bitte wählen Sie mindestens eine Speisekategorie aus');
    expect(mockOnSave).not.toHaveBeenCalled();

    alertMock.mockRestore();
  });
});

describe('RecipeForm - OCR Scan Integration', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows OCR scan button for new recipe', () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
      fotoscan: true,
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // OCR scan label and file input should be present for new recipes
    const ocrLabel = screen.getByTitle('Rezept mit Kamera scannen');
    expect(ocrLabel).toBeInTheDocument();
    expect(ocrLabel).toHaveClass('ocr-scan-button-header');
    
    // Verify the hidden file input exists
    const ocrInput = document.getElementById('ocrImageUpload');
    expect(ocrInput).toBeInTheDocument();
    expect(ocrInput).toHaveAttribute('type', 'file');
    expect(ocrInput).toHaveAttribute('accept', 'image/jpeg,image/jpg,image/png');
    expect(ocrInput).toHaveAttribute('multiple');
  });

  test('does not show OCR scan button when editing existing recipe', () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    const existingRecipe = {
      id: 'recipe-1',
      title: 'Existing Recipe',
      authorId: 'user-1',
      portionen: 4,
      kulinarik: [],
      schwierigkeit: 3,
      kochdauer: 30,
      speisekategorie: [],
      ingredients: ['Ingredient 1'],
      steps: ['Step 1'],
      image: '',
    };

    render(
      <RecipeForm
        recipe={existingRecipe}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // OCR scan label should NOT be present for existing recipes
    const ocrLabel = screen.queryByText('📷 Bild scannen');
    expect(ocrLabel).not.toBeInTheDocument();
    
    // Verify the file input also doesn't exist
    const ocrInput = document.getElementById('ocrImageUpload');
    expect(ocrInput).not.toBeInTheDocument();
  });

  test('OCR file upload opens OCR modal with image', async () => {
    const { fileToBase64 } = require('../utils/imageUtils');
    fileToBase64.mockResolvedValue('data:image/png;base64,test');

    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
      fotoscan: true,
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Select a file for OCR scanning
    const ocrInput = document.getElementById('ocrImageUpload');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.change(ocrInput, { target: { files: [file] } });

    // Verify OCR modal is open
    await waitFor(() => {
      expect(screen.getByText('Rezept scannen')).toBeInTheDocument();
    });
  });

  test('shows both OCR scan and import buttons for admin with fotoscan', () => {
    const adminWithFotoscan = {
      id: 'admin-1',
      vorname: 'Admin',
      nachname: 'User',
      email: 'admin@example.com',
      isAdmin: true,
      role: 'admin',
      fotoscan: true,
      recipeImport: true,
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={adminWithFotoscan}
      />
    );

    // Both OCR scan label and import button should be present for admin with fotoscan
    expect(screen.getByTitle('Rezept mit Kamera scannen')).toBeInTheDocument();
    expect(screen.getByTitle('Rezept aus externer Quelle importieren')).toBeInTheDocument();
  });
});

describe('RecipeForm - Fotoscan Feature', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows OCR scan button when user has fotoscan enabled', () => {
    const userWithFotoscan = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
      fotoscan: true,
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={userWithFotoscan}
      />
    );

    // OCR scan button should be visible
    const ocrLabel = screen.getByTitle('Rezept mit Kamera scannen');
    expect(ocrLabel).toBeInTheDocument();
    expect(ocrLabel).toHaveClass('ocr-scan-button-header');
    
    // Verify the hidden file input exists
    const ocrInput = document.getElementById('ocrImageUpload');
    expect(ocrInput).toBeInTheDocument();
    expect(ocrInput).toHaveAttribute('type', 'file');
  });

  test('hides OCR scan button when user has fotoscan disabled', () => {
    const userWithoutFotoscan = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
      fotoscan: false,
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={userWithoutFotoscan}
      />
    );

    // OCR scan button should NOT be visible
    const ocrLabel = screen.queryByTitle('Rezept mit Kamera scannen');
    expect(ocrLabel).not.toBeInTheDocument();
    
    // Verify the file input also doesn't exist
    const ocrInput = document.getElementById('ocrImageUpload');
    expect(ocrInput).not.toBeInTheDocument();
  });

  test('hides OCR scan button when fotoscan is undefined', () => {
    const userWithoutFotoscanField = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
      // fotoscan field is not set (undefined)
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={userWithoutFotoscanField}
      />
    );

    // OCR scan button should NOT be visible when fotoscan is undefined
    const ocrLabel = screen.queryByTitle('Rezept mit Kamera scannen');
    expect(ocrLabel).not.toBeInTheDocument();
  });

  test('import button is visible for admin regardless of fotoscan setting', () => {
    const adminWithoutFotoscan = {
      id: 'admin-1',
      vorname: 'Admin',
      nachname: 'User',
      email: 'admin@example.com',
      isAdmin: true,
      role: 'admin',
      fotoscan: false,
      recipeImport: true,
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={adminWithoutFotoscan}
      />
    );

    // Import button should be visible for admin even when fotoscan is disabled
    const importButton = screen.getByTitle('Rezept aus externer Quelle importieren');
    expect(importButton).toBeInTheDocument();
  });
});

describe('RecipeForm - Import Button Authorization', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows import button for admin users', () => {
    const adminUser = {
      id: 'admin-1',
      vorname: 'Admin',
      nachname: 'User',
      email: 'admin@example.com',
      isAdmin: true,
      role: 'admin',
      recipeImport: true,
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={adminUser}
      />
    );

    // Import button should be visible for admin users
    const importButton = screen.getByTitle('Rezept aus externer Quelle importieren');
    expect(importButton).toBeInTheDocument();
    expect(importButton).toHaveClass('import-button-header');
  });

  test('hides import button for non-admin users', () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
      recipeImport: false,
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Import button should NOT be visible for users without recipeImport permission
    const importButton = screen.queryByTitle('Rezept aus externer Quelle importieren');
    expect(importButton).not.toBeInTheDocument();
  });

  test('hides import button when isAdmin is undefined', () => {
    const userWithoutAdminFlag = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      role: 'edit',
      // recipeImport is undefined
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={userWithoutAdminFlag}
      />
    );

    // Import button should NOT be visible when recipeImport is undefined
    const importButton = screen.queryByTitle('Rezept aus externer Quelle importieren');
    expect(importButton).not.toBeInTheDocument();
  });

  test('hides import button when editing existing recipe (even for admin)', () => {
    const adminUser = {
      id: 'admin-1',
      vorname: 'Admin',
      nachname: 'User',
      email: 'admin@example.com',
      isAdmin: true,
      role: 'admin',
      recipeImport: true,
    };

    const existingRecipe = {
      id: 'recipe-1',
      title: 'Existing Recipe',
      authorId: 'user-1',
      portionen: 4,
      kulinarik: [],
      schwierigkeit: 3,
      kochdauer: 30,
      speisekategorie: [],
      ingredients: ['Ingredient 1'],
      steps: ['Step 1'],
      image: '',
    };

    render(
      <RecipeForm
        recipe={existingRecipe}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={adminUser}
      />
    );

    // Import button should NOT be visible when editing (even for admin)
    const importButton = screen.queryByTitle('Rezept aus externer Quelle importieren');
    expect(importButton).not.toBeInTheDocument();
  });

  test('hides import button when creating version (even for admin)', () => {
    const adminUser = {
      id: 'admin-1',
      vorname: 'Admin',
      nachname: 'User',
      email: 'admin@example.com',
      isAdmin: true,
      role: 'admin',
      recipeImport: true,
    };

    const existingRecipe = {
      id: 'recipe-1',
      title: 'Existing Recipe',
      authorId: 'user-1',
      portionen: 4,
      kulinarik: [],
      schwierigkeit: 3,
      kochdauer: 30,
      speisekategorie: [],
      ingredients: ['Ingredient 1'],
      steps: ['Step 1'],
      image: '',
    };

    render(
      <RecipeForm
        recipe={existingRecipe}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={adminUser}
        isCreatingVersion={true}
      />
    );

    // Import button should NOT be visible when creating a version
    const importButton = screen.queryByTitle('Rezept aus externer Quelle importieren');
    expect(importButton).not.toBeInTheDocument();
  });

  test('admin can click import button and it opens modal', () => {
    const adminUser = {
      id: 'admin-1',
      vorname: 'Admin',
      nachname: 'User',
      email: 'admin@example.com',
      isAdmin: true,
      role: 'admin',
      recipeImport: true,
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={adminUser}
      />
    );

    // Click the import button
    const importButton = screen.getByTitle('Rezept aus externer Quelle importieren');
    fireEvent.click(importButton);

    // Verify the import modal is opened
    expect(screen.getByText('Rezept importieren')).toBeInTheDocument();
  });
});

describe('RecipeForm - Ingredient Formatting', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('formats ingredients with spaces between numbers and units on save', async () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Fill in required title
    fireEvent.change(screen.getByLabelText('Rezepttitel *'), {
      target: { value: 'Test Recipe' },
    });

    // Add ingredients without spaces (e.g., "100ml", "250g")
    const ingredientInputs = screen.getAllByPlaceholderText(/Zutat/);
    fireEvent.change(ingredientInputs[0], { target: { value: '100ml Milch' } });
    
    // Add more ingredients
    fireEvent.click(screen.getByText('+ Zutat hinzufügen'));
    const updatedIngredientInputs = screen.getAllByPlaceholderText(/Zutat/);
    fireEvent.change(updatedIngredientInputs[1], { target: { value: '250g Mehl' } });

    fireEvent.click(screen.getByText('+ Zutat hinzufügen'));
    const finalIngredientInputs = screen.getAllByPlaceholderText(/Zutat/);
    fireEvent.change(finalIngredientInputs[2], { target: { value: '2EL Öl' } });

    // Fill in a step
    fireEvent.change(screen.getByPlaceholderText('Schritt 1'), { target: { value: 'Test Schritt' } });

    // Select a required category
    const speisekategorieSelect = screen.getByLabelText('Speisekategorie (Mehrfachauswahl möglich)');
    await waitFor(() => expect(speisekategorieSelect.options.length).toBeGreaterThan(0));
    speisekategorieSelect.options[0].selected = true;
    fireEvent.change(speisekategorieSelect);

    // Submit form
    fireEvent.submit(document.querySelector('.recipe-form'));

    // Verify onSave was called with formatted ingredients
    await waitFor(() => expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test Recipe',
        ingredients: ['100 ml Milch', '250 g Mehl', '2 EL Öl'],
      })
    ));
  });

  test('formats ingredients when editing existing recipe', async () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    const existingRecipe = {
      id: 'recipe-1',
      title: 'Existing Recipe',
      authorId: 'user-1',
      portionen: 4,
      kulinarik: [],
      schwierigkeit: 3,
      kochdauer: 30,
      speisekategorie: ['Main Course'],
      ingredients: ['100ml Wasser', '500g Zucker'],
      steps: ['Step 1'],
      image: '',
    };

    render(
      <RecipeForm
        recipe={existingRecipe}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Submit form without changing ingredients
    fireEvent.submit(document.querySelector('.recipe-form'));

    // Verify onSave was called with formatted ingredients
    await waitFor(() => expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'recipe-1',
        ingredients: ['100 ml Wasser', '500 g Zucker'],
      })
    ));
  });

  test('preserves already formatted ingredients', async () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Fill in required title
    fireEvent.change(screen.getByLabelText('Rezepttitel *'), {
      target: { value: 'Test Recipe' },
    });

    // Add ingredient with proper spacing
    const ingredientInputs = screen.getAllByPlaceholderText(/Zutat/);
    fireEvent.change(ingredientInputs[0], { target: { value: '100 ml Milch' } });

    // Fill in a step
    fireEvent.change(screen.getByPlaceholderText('Schritt 1'), { target: { value: 'Test Schritt' } });

    // Select a required category
    const speisekategorieSelect = screen.getByLabelText('Speisekategorie (Mehrfachauswahl möglich)');
    await waitFor(() => expect(speisekategorieSelect.options.length).toBeGreaterThan(0));
    speisekategorieSelect.options[0].selected = true;
    fireEvent.change(speisekategorieSelect);

    // Submit form
    fireEvent.submit(document.querySelector('.recipe-form'));

    // Verify the already-formatted ingredient is preserved
    await waitFor(() => expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredients: ['100 ml Milch'],
      })
    ));
  });

  test('filters out empty ingredients before formatting', async () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Fill in required title
    fireEvent.change(screen.getByLabelText('Rezepttitel *'), {
      target: { value: 'Test Recipe' },
    });

    // Add one ingredient and leave others empty
    const ingredientInputs = screen.getAllByPlaceholderText(/Zutat/);
    fireEvent.change(ingredientInputs[0], { target: { value: '100ml Milch' } });

    // Add empty ingredient
    fireEvent.click(screen.getByText('+ Zutat hinzufügen'));

    // Fill in a step
    fireEvent.change(screen.getByPlaceholderText('Schritt 1'), { target: { value: 'Test Schritt' } });

    // Select a required category
    const speisekategorieSelect = screen.getByLabelText('Speisekategorie (Mehrfachauswahl möglich)');
    await waitFor(() => expect(speisekategorieSelect.options.length).toBeGreaterThan(0));
    speisekategorieSelect.options[0].selected = true;
    fireEvent.change(speisekategorieSelect);

    // Submit form
    fireEvent.submit(document.querySelector('.recipe-form'));

    // Verify only non-empty ingredients were formatted
    await waitFor(() => expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredients: ['100 ml Milch'],
      })
    ));
  });
});

// Mock dnd-kit modules for drag and drop tests
jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }) => <div>{children}</div>,
  closestCenter: jest.fn(),
  KeyboardSensor: jest.fn(),
  PointerSensor: jest.fn(),
  TouchSensor: jest.fn(),
  useSensor: jest.fn(),
  useSensors: jest.fn(() => []),
}));

jest.mock('@dnd-kit/sortable', () => ({
  arrayMove: (array, fromIndex, toIndex) => {
    const newArray = [...array];
    const [movedItem] = newArray.splice(fromIndex, 1);
    newArray.splice(toIndex, 0, movedItem);
    return newArray;
  },
  SortableContext: ({ children }) => <div>{children}</div>,
  sortableKeyboardCoordinates: jest.fn(),
  verticalListSortingStrategy: jest.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

jest.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => '',
    },
  },
}));

describe('RecipeForm - Drag and Drop', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders drag handles for ingredients', () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Add a second ingredient to ensure drag handles are visible
    fireEvent.click(screen.getByText('+ Zutat hinzufügen'));

    // Check for drag handles (⋮⋮ symbol)
    const dragHandles = screen.getAllByLabelText('Zutat verschieben');
    expect(dragHandles.length).toBeGreaterThan(0);
  });

  test('renders drag handles for steps', () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Add a second step to ensure drag handles are visible
    fireEvent.click(screen.getByText('+ Schritt hinzufügen'));

    // Check for drag handles (⋮⋮ symbol)
    const dragHandles = screen.getAllByLabelText('Schritt verschieben');
    expect(dragHandles.length).toBeGreaterThan(0);
  });

  test('ingredients maintain order when submitted', async () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Fill in title
    fireEvent.change(screen.getByLabelText('Rezepttitel *'), {
      target: { value: 'Test Recipe' },
    });

    // Add ingredients in specific order
    const ingredientInputs = screen.getAllByPlaceholderText(/Zutat/);
    fireEvent.change(ingredientInputs[0], { target: { value: 'First Ingredient' } });
    
    fireEvent.click(screen.getByText('+ Zutat hinzufügen'));
    const updatedInputs = screen.getAllByPlaceholderText(/Zutat/);
    fireEvent.change(updatedInputs[1], { target: { value: 'Second Ingredient' } });

    fireEvent.click(screen.getByText('+ Zutat hinzufügen'));
    const finalInputs = screen.getAllByPlaceholderText(/Zutat/);
    fireEvent.change(finalInputs[2], { target: { value: 'Third Ingredient' } });

    // Fill in a step
    fireEvent.change(screen.getByPlaceholderText('Schritt 1'), { target: { value: 'Test Schritt' } });

    // Select a required category
    const speisekategorieSelect = screen.getByLabelText('Speisekategorie (Mehrfachauswahl möglich)');
    await waitFor(() => expect(speisekategorieSelect.options.length).toBeGreaterThan(0));
    speisekategorieSelect.options[0].selected = true;
    fireEvent.change(speisekategorieSelect);

    // Submit form
    fireEvent.submit(document.querySelector('.recipe-form'));

    // Verify ingredients are saved in the correct order
    await waitFor(() => expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredients: ['First Ingredient', 'Second Ingredient', 'Third Ingredient'],
      })
    ));
  });

  test('steps maintain order when submitted', async () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Fill in title
    fireEvent.change(screen.getByLabelText('Rezepttitel *'), {
      target: { value: 'Test Recipe' },
    });

    // Add steps in specific order
    const stepInputs = screen.getAllByPlaceholderText(/Schritt/);
    fireEvent.change(stepInputs[0], { target: { value: 'First Step' } });
    
    fireEvent.click(screen.getByText('+ Schritt hinzufügen'));
    const updatedInputs = screen.getAllByPlaceholderText(/Schritt/);
    fireEvent.change(updatedInputs[1], { target: { value: 'Second Step' } });

    fireEvent.click(screen.getByText('+ Schritt hinzufügen'));
    const finalInputs = screen.getAllByPlaceholderText(/Schritt/);
    fireEvent.change(finalInputs[2], { target: { value: 'Third Step' } });

    // Fill in a required ingredient
    fireEvent.change(screen.getByPlaceholderText('Zutat 1'), { target: { value: 'Test Zutat' } });

    // Select a required category
    const speisekategorieSelect = screen.getByLabelText('Speisekategorie (Mehrfachauswahl möglich)');
    await waitFor(() => expect(speisekategorieSelect.options.length).toBeGreaterThan(0));
    speisekategorieSelect.options[0].selected = true;
    fireEvent.change(speisekategorieSelect);

    // Submit form
    fireEvent.submit(document.querySelector('.recipe-form'));

    // Verify steps are saved in the correct order
    await waitFor(() => expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: ['First Step', 'Second Step', 'Third Step'],
      })
    ));
  });

  test('drag handles have proper accessibility attributes', () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Check ingredient drag handles
    const ingredientDragHandles = screen.getAllByLabelText('Zutat verschieben');
    ingredientDragHandles.forEach(handle => {
      expect(handle).toHaveAttribute('aria-label', 'Zutat verschieben');
      expect(handle.tagName).toBe('BUTTON');
    });

    // Check step drag handles
    const stepDragHandles = screen.getAllByLabelText('Schritt verschieben');
    stepDragHandles.forEach(handle => {
      expect(handle).toHaveAttribute('aria-label', 'Schritt verschieben');
      expect(handle.tagName).toBe('BUTTON');
    });
  });

  test('multiple ingredients can be added and each has a drag handle', () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Add multiple ingredients
    fireEvent.click(screen.getByText('+ Zutat hinzufügen'));
    fireEvent.click(screen.getByText('+ Zutat hinzufügen'));
    fireEvent.click(screen.getByText('+ Zutat hinzufügen'));

    // Should have 4 ingredients total (1 initial + 3 added)
    const ingredientInputs = screen.getAllByPlaceholderText(/Zutat/);
    expect(ingredientInputs).toHaveLength(4);

    // Should have 4 drag handles
    const dragHandles = screen.getAllByLabelText('Zutat verschieben');
    expect(dragHandles).toHaveLength(4);
  });

  test('multiple steps can be added and each has a drag handle', () => {
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Add multiple steps
    fireEvent.click(screen.getByText('+ Schritt hinzufügen'));
    fireEvent.click(screen.getByText('+ Schritt hinzufügen'));
    fireEvent.click(screen.getByText('+ Schritt hinzufügen'));

    // Should have 4 steps total (1 initial + 3 added)
    const stepInputs = screen.getAllByPlaceholderText(/Schritt/);
    expect(stepInputs).toHaveLength(4);

    // Should have 4 drag handles
    const dragHandles = screen.getAllByLabelText('Schritt verschieben');
    expect(dragHandles).toHaveLength(4);
  });
});

describe('RecipeForm - Heading Functionality', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();
  const mockUser = {
    id: 'user-1',
    vorname: 'Test',
    nachname: 'User',
    email: 'test@example.com',
    isAdmin: false,
    role: 'edit',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows format option in context menu for ingredients', async () => {
    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={mockUser}
      />
    );

    await waitFor(() => {
      const ingredientInput = screen.getByPlaceholderText('Zutat 1');
      expect(ingredientInput).toBeInTheDocument();
    });

    // Open context menu on ingredient input
    const ingredientInput = screen.getByPlaceholderText('Zutat 1');
    fireEvent.contextMenu(ingredientInput);

    await waitFor(() => {
      expect(screen.getByText('Als Überschrift formatieren')).toBeInTheDocument();
    });
  });

  test('can toggle ingredient to heading and back', async () => {
    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={mockUser}
      />
    );

    await waitFor(() => {
      const ingredientInput = screen.getByPlaceholderText('Zutat 1');
      expect(ingredientInput).toBeInTheDocument();
    });

    // Open context menu and toggle to heading
    const ingredientInput = screen.getByPlaceholderText('Zutat 1');
    fireEvent.contextMenu(ingredientInput);
    const toggleButton = screen.getByText('Als Überschrift formatieren');
    fireEvent.click(toggleButton);

    await waitFor(() => {
      const headingInput = screen.getByPlaceholderText('Zwischenüberschrift');
      expect(headingInput).toBeInTheDocument();
    });

    // Open context menu again and toggle back to ingredient
    const headingInput = screen.getByPlaceholderText('Zwischenüberschrift');
    fireEvent.contextMenu(headingInput);
    const toggleBackButton = screen.getByText('Als Zutat formatieren');
    expect(toggleBackButton).toBeInTheDocument();

    fireEvent.click(toggleBackButton);

    await waitFor(() => {
      const ingredientInput2 = screen.getByPlaceholderText('Zutat 1');
      expect(ingredientInput2).toBeInTheDocument();
    });
  });

  test('can toggle step to heading and back', async () => {
    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={mockUser}
      />
    );

    await waitFor(() => {
      const stepInput = screen.getByPlaceholderText('Schritt 1');
      expect(stepInput).toBeInTheDocument();
    });

    // Open context menu on step textarea and toggle to heading
    const stepInput = screen.getByPlaceholderText('Schritt 1');
    fireEvent.contextMenu(stepInput);
    const toggleButton = screen.getByText('Als Überschrift formatieren');
    fireEvent.click(toggleButton);

    await waitFor(() => {
      // Should have a heading placeholder
      const headingInputs = screen.getAllByPlaceholderText('Zwischenüberschrift');
      expect(headingInputs.length).toBeGreaterThan(0);
    });
  });

  test('saves recipe with heading items correctly', async () => {
    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={mockUser}
      />
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Zutat 1')).toBeInTheDocument();
    });

    // Add some text to ingredient
    const ingredientInput = screen.getByPlaceholderText('Zutat 1');
    fireEvent.change(ingredientInput, { target: { value: 'Teig' } });

    // Toggle to heading via context menu
    fireEvent.contextMenu(ingredientInput);
    const toggleButton = screen.getByText('Als Überschrift formatieren');
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Zwischenüberschrift')).toBeInTheDocument();
    });

    // Fill in title (required field)
    const titleInput = screen.getByPlaceholderText('z.B. Spaghetti Carbonara');
    fireEvent.change(titleInput, { target: { value: 'Test Rezept' } });

    // Add text to the step (required to have non-empty content)
    const stepInput = screen.getByPlaceholderText('Schritt 1');
    fireEvent.change(stepInput, { target: { value: 'Test Schritt' } });

    // Select a required category
    const speisekategorieSelect = screen.getByLabelText('Speisekategorie (Mehrfachauswahl möglich)');
    await waitFor(() => expect(speisekategorieSelect.options.length).toBeGreaterThan(0));
    speisekategorieSelect.options[0].selected = true;
    fireEvent.change(speisekategorieSelect);

    // Submit form
    const form = titleInput.closest('form');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalled();
    });

    const savedData = mockOnSave.mock.calls[0][0];
    
    // Check that ingredients array contains object with type and text
    expect(savedData.ingredients).toBeDefined();
    expect(savedData.ingredients.length).toBeGreaterThan(0);
    expect(savedData.ingredients[0]).toHaveProperty('type');
    expect(savedData.ingredients[0]).toHaveProperty('text');
    expect(savedData.ingredients[0].type).toBe('heading');
    expect(savedData.ingredients[0].text).toBe('Teig');
  });

  test('loads recipe with heading items correctly', async () => {
    const recipeWithHeadings = {
      id: 'test-1',
      title: 'Test Recipe',
      ingredients: [
        { type: 'heading', text: 'Für den Teig' },
        { type: 'ingredient', text: '200g Mehl' },
        { type: 'ingredient', text: '100ml Milch' },
      ],
      steps: [
        { type: 'heading', text: 'Vorbereitung' },
        { type: 'step', text: 'Mehl sieben' },
      ],
      portionen: 4,
      portionUnitId: 'portion',
      kulinarik: [],
      speisekategorie: [],
      schwierigkeit: 3,
      kochdauer: 30,
      authorId: 'user-1',
    };

    render(
      <RecipeForm
        recipe={recipeWithHeadings}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={mockUser}
      />
    );

    await waitFor(() => {
      // Should display heading placeholder for first ingredient
      const headingInputs = screen.getAllByPlaceholderText('Zwischenüberschrift');
      expect(headingInputs.length).toBeGreaterThan(0);
      
      // Should display heading text
      expect(headingInputs[0].value).toBe('Für den Teig');
      
      // Should display regular ingredient
      const ingredientInputs = screen.getAllByPlaceholderText(/Zutat/);
      expect(ingredientInputs.length).toBe(2);
      expect(ingredientInputs[0].value).toBe('200g Mehl');
    });
  });

  test('maintains backward compatibility with string-based ingredients', async () => {
    const oldRecipe = {
      id: 'test-old',
      title: 'Old Recipe',
      ingredients: ['200g Mehl', '100ml Milch'],
      steps: ['Mehl sieben', 'Milch hinzufügen'],
      portionen: 4,
      portionUnitId: 'portion',
      kulinarik: [],
      speisekategorie: [],
      schwierigkeit: 3,
      kochdauer: 30,
      authorId: 'user-1',
    };

    render(
      <RecipeForm
        recipe={oldRecipe}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={mockUser}
      />
    );

    await waitFor(() => {
      // Should convert strings to objects and display correctly
      const ingredientInputs = screen.getAllByPlaceholderText(/Zutat/);
      expect(ingredientInputs.length).toBe(2);
      expect(ingredientInputs[0].value).toBe('200g Mehl');
      expect(ingredientInputs[1].value).toBe('100ml Milch');
    });
  });
});

describe('RecipeForm - Private Checkbox', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();
  const { isCurrentUserAdmin } = require('../utils/userManagement');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows private checkbox for admin users', async () => {
    // Mock admin user
    isCurrentUserAdmin.mockReturnValue(true);
    
    const adminUser = {
      id: 'admin-1',
      vorname: 'Admin',
      nachname: 'User',
      email: 'admin@example.com',
      isAdmin: true,
      role: 'admin',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={adminUser}
      />
    );

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText(/Entwurf:/i)).toBeInTheDocument();
    });
    
    // Check that checkbox exists using aria-label
    const draftCheckbox = screen.getByRole('checkbox', { name: /Rezept als Entwurf markieren/i });
    expect(draftCheckbox).toBeInTheDocument();
    expect(draftCheckbox).not.toBeChecked();
  });

  test('does not show private checkbox for non-admin users', () => {
    // Mock non-admin user
    isCurrentUserAdmin.mockReturnValue(false);
    
    const regularUser = {
      id: 'user-1',
      vorname: 'Regular',
      nachname: 'User',
      email: 'user@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Private checkbox should not be visible
    expect(screen.queryByText(/Entwurf:/i)).not.toBeInTheDocument();
  });

  test('loads isPrivate value from existing recipe', async () => {
    // Mock admin user
    isCurrentUserAdmin.mockReturnValue(true);
    
    const adminUser = {
      id: 'admin-1',
      vorname: 'Admin',
      nachname: 'User',
      email: 'admin@example.com',
      isAdmin: true,
      role: 'admin',
    };

    const privateRecipe = {
      id: 'test-private',
      title: 'Private Recipe',
      ingredients: ['Test ingredient'],
      steps: ['Test step'],
      portionen: 4,
      portionUnitId: 'portion',
      kulinarik: [],
      speisekategorie: [],
      schwierigkeit: 3,
      kochdauer: 30,
      authorId: 'admin-1',
      isPrivate: true,
    };

    render(
      <RecipeForm
        recipe={privateRecipe}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={adminUser}
      />
    );

    await waitFor(() => {
      const draftCheckbox = screen.getByRole('checkbox', { name: /Rezept als Entwurf markieren/i });
      expect(draftCheckbox).toBeChecked();
    });
  });

  test('saves isPrivate value when submitting form', async () => {
    // Mock admin user
    isCurrentUserAdmin.mockReturnValue(true);
    
    const adminUser = {
      id: 'admin-1',
      vorname: 'Admin',
      nachname: 'User',
      email: 'admin@example.com',
      isAdmin: true,
      role: 'admin',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={adminUser}
      />
    );

    // Fill in required fields
    fireEvent.change(screen.getByLabelText('Rezepttitel *'), {
      target: { value: 'Test Private Recipe' },
    });

    fireEvent.change(screen.getByPlaceholderText('Zutat 1'), { target: { value: 'Test Zutat' } });
    fireEvent.change(screen.getByPlaceholderText('Schritt 1'), { target: { value: 'Test Schritt' } });

    // Check the draft checkbox using aria-label
    await waitFor(() => {
      const draftCheckbox = screen.getByRole('checkbox', { name: /Rezept als Entwurf markieren/i });
      fireEvent.click(draftCheckbox);
      expect(draftCheckbox).toBeChecked();
    });

    // Select a required category
    const speisekategorieSelect = screen.getByLabelText('Speisekategorie (Mehrfachauswahl möglich)');
    await waitFor(() => expect(speisekategorieSelect.options.length).toBeGreaterThan(0));
    speisekategorieSelect.options[0].selected = true;
    fireEvent.change(speisekategorieSelect);

    // Submit form
    fireEvent.submit(document.querySelector('.recipe-form'));

    // Check that onSave was called with isPrivate set to true
    await waitFor(() => expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test Private Recipe',
        isPrivate: true,
      })
    ));
  });

  test('defaults isPrivate to false for new recipes', async () => {
    // Mock admin user
    isCurrentUserAdmin.mockReturnValue(true);
    
    const adminUser = {
      id: 'admin-1',
      vorname: 'Admin',
      nachname: 'User',
      email: 'admin@example.com',
      isAdmin: true,
      role: 'admin',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={adminUser}
      />
    );

    // Fill in required fields
    fireEvent.change(screen.getByLabelText('Rezepttitel *'), {
      target: { value: 'Test Recipe' },
    });

    fireEvent.change(screen.getByPlaceholderText('Zutat 1'), { target: { value: 'Test Zutat' } });
    fireEvent.change(screen.getByPlaceholderText('Schritt 1'), { target: { value: 'Test Schritt' } });

    // Submit form without checking the private checkbox
    // Select a required category
    const speisekategorieSelect = screen.getByLabelText('Speisekategorie (Mehrfachauswahl möglich)');
    await waitFor(() => expect(speisekategorieSelect.options.length).toBeGreaterThan(0));
    speisekategorieSelect.options[0].selected = true;
    fireEvent.change(speisekategorieSelect);

    fireEvent.submit(document.querySelector('.recipe-form'));

    // Check that onSave was called with isPrivate set to false
    await waitFor(() => expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test Recipe',
        isPrivate: false,
      })
    ));
  });
});

describe('RecipeForm - AI OCR Limit', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();
  const { getUserAiOcrScanCount } = require('../utils/userManagement');

  const userWithPermissions = {
    id: 'user-1',
    vorname: 'Regular',
    nachname: 'User',
    email: 'user@example.com',
    isAdmin: false,
    role: 'edit',
    webimport: true,
    fotoscan: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('webimport and scan buttons are enabled when AI OCR count < 20', async () => {
    getUserAiOcrScanCount.mockResolvedValue(5);

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={userWithPermissions}
      />
    );

    await waitFor(() => {
      const webimportBtn = screen.getByLabelText('Webimport');
      expect(webimportBtn).not.toBeDisabled();
    });
  });

  test('webimport button is disabled when AI OCR count >= 20', async () => {
    getUserAiOcrScanCount.mockResolvedValue(20);

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={userWithPermissions}
      />
    );

    await waitFor(() => {
      const webimportBtn = screen.getByLabelText('Webimport');
      expect(webimportBtn).toBeDisabled();
    });
  });

  test('webimport button is disabled when AI OCR count > 20', async () => {
    getUserAiOcrScanCount.mockResolvedValue(25);

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={userWithPermissions}
      />
    );

    await waitFor(() => {
      const webimportBtn = screen.getByLabelText('Webimport');
      expect(webimportBtn).toBeDisabled();
    });
  });

  test('limit info text is not shown when AI OCR count >= 20', async () => {
    getUserAiOcrScanCount.mockResolvedValue(20);

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={userWithPermissions}
      />
    );

    await waitFor(() => {
      expect(getUserAiOcrScanCount).toHaveBeenCalled();
    });

    expect(screen.queryByText(/KI-OCR Limit/)).not.toBeInTheDocument();
  });

  test('disabled webimport button shows tooltip with limit reason', async () => {
    getUserAiOcrScanCount.mockResolvedValue(20);

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={userWithPermissions}
      />
    );

    await waitFor(() => {
      const webimportBtn = screen.getByLabelText('Webimport');
      expect(webimportBtn).toHaveAttribute('title', expect.stringContaining('KI-OCR Tageslimit'));
    });
  });

  test('scan button shows disabled state when AI OCR count >= 20', async () => {
    getUserAiOcrScanCount.mockResolvedValue(20);

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={userWithPermissions}
      />
    );

    await waitFor(() => {
      const scanLabel = screen.getByLabelText('Rezept mit Kamera scannen');
      expect(scanLabel).toHaveAttribute('aria-disabled', 'true');
    });
  });
});

describe('RecipeForm - Signature Sentence', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('appends signature sentence as last step for new recipe', async () => {
    const userWithSignature = {
      id: 'user-1',
      vorname: 'John',
      nachname: 'Doe',
      email: 'john@example.com',
      isAdmin: false,
      role: 'edit',
      signatureSatz: 'Guten Appetit!',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={userWithSignature}
      />
    );

    fireEvent.change(screen.getByLabelText('Rezepttitel *'), {
      target: { value: 'Test Recipe' },
    });

    // Fill in a required ingredient
    fireEvent.change(screen.getByPlaceholderText('Zutat 1'), { target: { value: 'Test Zutat' } });

    const stepInputs = screen.getAllByPlaceholderText(/Schritt/);
    fireEvent.change(stepInputs[0], { target: { value: 'Erster Schritt' } });

    // Select a required category
    const speisekategorieSelect = screen.getByLabelText('Speisekategorie (Mehrfachauswahl möglich)');
    await waitFor(() => expect(speisekategorieSelect.options.length).toBeGreaterThan(0));
    speisekategorieSelect.options[0].selected = true;
    fireEvent.change(speisekategorieSelect);

    fireEvent.submit(document.querySelector('.recipe-form'));

    await waitFor(() => expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: ['Erster Schritt', 'Guten Appetit!'],
      })
    ));
  });

  test('does not append signature sentence when editing existing recipe', async () => {
    const userWithSignature = {
      id: 'user-1',
      vorname: 'John',
      nachname: 'Doe',
      email: 'john@example.com',
      isAdmin: false,
      role: 'edit',
      signatureSatz: 'Guten Appetit!',
    };

    const existingRecipe = {
      id: 'recipe-1',
      title: 'Existing Recipe',
      ingredients: ['Zutat 1'],
      steps: ['Bestehender Schritt'],
      authorId: 'user-1',
      speisekategorie: ['Main Course'],
    };

    render(
      <RecipeForm
        recipe={existingRecipe}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={userWithSignature}
      />
    );

    fireEvent.submit(document.querySelector('.recipe-form'));

    await waitFor(() => expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: ['Bestehender Schritt'],
      })
    ));
  });

  test('does not append signature sentence when user has no signatureSatz', async () => {
    const userWithoutSignature = {
      id: 'user-1',
      vorname: 'John',
      nachname: 'Doe',
      email: 'john@example.com',
      isAdmin: false,
      role: 'edit',
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={userWithoutSignature}
      />
    );

    fireEvent.change(screen.getByLabelText('Rezepttitel *'), {
      target: { value: 'Test Recipe' },
    });

    // Fill in a required ingredient
    fireEvent.change(screen.getByPlaceholderText('Zutat 1'), { target: { value: 'Test Zutat' } });

    const stepInputs = screen.getAllByPlaceholderText(/Schritt/);
    fireEvent.change(stepInputs[0], { target: { value: 'Only Step' } });

    // Select a required category
    const speisekategorieSelect = screen.getByLabelText('Speisekategorie (Mehrfachauswahl möglich)');
    await waitFor(() => expect(speisekategorieSelect.options.length).toBeGreaterThan(0));
    speisekategorieSelect.options[0].selected = true;
    fireEvent.change(speisekategorieSelect);

    fireEvent.submit(document.querySelector('.recipe-form'));

    await waitFor(() => expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: ['Only Step'],
      })
    ));
  });
});

describe('RecipeForm - Group Assignment Indicator', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  const mockGroups = [
    { id: 'public-1', name: 'Öffentlich', type: 'public' },
    { id: 'private-1', name: 'Familie', type: 'private' },
  ];

  const mockUser = { id: 'user-1', vorname: 'Test', nachname: 'User' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows public group indicator when no activeGroupId is set', async () => {
    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={mockUser}
        groups={mockGroups}
        activeGroupId={null}
      />
    );

    const banner = await screen.findByText(/Wird in Liste/i);
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toContain('Öffentlich');
  });

  test('shows private group indicator when activeGroupId is a private group', async () => {
    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={mockUser}
        groups={mockGroups}
        activeGroupId="private-1"
      />
    );

    const banner = await screen.findByText(/Wird in Liste/i);
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toContain('Familie');
  });

  test('does not show group indicator when editing an existing recipe', () => {
    const existingRecipe = { id: 'r1', title: 'Existing', ingredients: [], steps: [] };
    render(
      <RecipeForm
        recipe={existingRecipe}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={mockUser}
        groups={mockGroups}
        activeGroupId={null}
      />
    );

    expect(screen.queryByText(/Wird in Liste/i)).not.toBeInTheDocument();
  });

  test('does not show group indicator when creating a version', () => {
    const existingRecipe = { id: 'r1', title: 'Existing', ingredients: [], steps: [] };
    render(
      <RecipeForm
        recipe={existingRecipe}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={mockUser}
        groups={mockGroups}
        activeGroupId={null}
        isCreatingVersion={true}
      />
    );

    expect(screen.queryByText(/Wird in Liste/i)).not.toBeInTheDocument();
  });

  test('shows public group indicator with fallback name when groups list is empty', () => {
    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={mockUser}
        groups={[]}
        activeGroupId={null}
      />
    );

    const banner = screen.getByText(/Wird in Liste/i);
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toContain('Öffentlich');
  });
});

describe('RecipeForm - Private List Selector', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  const mockGroups = [
    { id: 'public-1', name: 'Öffentlich', type: 'public' },
    { id: 'private-1', name: 'Familie', type: 'private' },
    { id: 'private-2', name: 'Arbeit', type: 'private' },
  ];

  const mockPrivateLists = [
    { id: 'private-1', name: 'Familie', type: 'private' },
    { id: 'private-2', name: 'Arbeit', type: 'private' },
  ];

  const mockUser = { id: 'user-1', vorname: 'Test', nachname: 'User' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not show private list selector when no private lists exist', () => {
    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={mockUser}
        groups={mockGroups}
        privateLists={[]}
        activeGroupId={null}
      />
    );

    expect(screen.queryByLabelText('Private Liste:')).not.toBeInTheDocument();
  });

  test('shows private list selector when private lists are available for new recipe', () => {
    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={mockUser}
        groups={mockGroups}
        privateLists={mockPrivateLists}
        activeGroupId={null}
      />
    );

    const selector = screen.getByLabelText('Private Liste:');
    expect(selector).toBeInTheDocument();
    expect(screen.getByText('Familie')).toBeInTheDocument();
    expect(screen.getByText('Arbeit')).toBeInTheDocument();
  });

  test('private list selector has a default empty option', () => {
    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={mockUser}
        groups={mockGroups}
        privateLists={mockPrivateLists}
        activeGroupId={null}
      />
    );

    const selector = screen.getByLabelText('Private Liste:');
    expect(selector.value).toBe('');
    expect(screen.getByText(/Keine \(öffentlich\)/i)).toBeInTheDocument();
  });

  test('does not show private list selector when editing an existing recipe', () => {
    const existingRecipe = { id: 'r1', title: 'Existing', ingredients: [], steps: [] };
    render(
      <RecipeForm
        recipe={existingRecipe}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={mockUser}
        groups={mockGroups}
        privateLists={mockPrivateLists}
        activeGroupId={null}
      />
    );

    expect(screen.queryByLabelText('Private Liste:')).not.toBeInTheDocument();
  });

  test('does not show private list selector when creating a version', () => {
    const existingRecipe = { id: 'r1', title: 'Existing', ingredients: [], steps: [] };
    render(
      <RecipeForm
        recipe={existingRecipe}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={mockUser}
        groups={mockGroups}
        privateLists={mockPrivateLists}
        activeGroupId={null}
        isCreatingVersion={true}
      />
    );

    expect(screen.queryByLabelText('Private Liste:')).not.toBeInTheDocument();
  });

  test('updates group assignment banner when a private list is selected', async () => {
    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={mockUser}
        groups={mockGroups}
        privateLists={mockPrivateLists}
        activeGroupId={null}
      />
    );

    // Initially shows public
    const banner = await screen.findByText(/Wird in Liste/i);
    expect(banner.textContent).toContain('Öffentlich');

    // Select a private list
    const selector = screen.getByLabelText('Private Liste:');
    fireEvent.change(selector, { target: { value: 'private-1' } });

    // Banner should now show the private list name
    expect(screen.getByText(/Wird in Liste/i).textContent).toContain('Familie');
  });

  test('banner shows private styling when a private list is selected', async () => {
    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={mockUser}
        groups={mockGroups}
        privateLists={mockPrivateLists}
        activeGroupId={null}
      />
    );

    // Select a private list
    const selector = screen.getByLabelText('Private Liste:');
    fireEvent.change(selector, { target: { value: 'private-1' } });

    // Banner should have 'private' class
    const bannerContainer = screen.getByText(/Wird in Liste/i).closest('.group-assignment-banner');
    expect(bannerContainer).toHaveClass('private');
    expect(bannerContainer).not.toHaveClass('public');
  });
});
