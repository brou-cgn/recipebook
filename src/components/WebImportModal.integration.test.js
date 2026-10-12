import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import RecipeForm from './RecipeForm';

// Mock all utility modules
jest.mock('../utils/emojiUtils', () => ({
  removeEmojis: (text) => text,
  containsEmojis: () => false,
}));

jest.mock('../utils/imageUtils', () => ({
  fileToBase64: jest.fn(),
  isBase64Image: jest.fn(() => false),
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
  getButtonIcons: () => Promise.resolve({
    cookingMode: '👨‍🍳',
    importRecipe: '📥',
    scanImage: '📷',
    webImport: '🌐'
  }),
  getEffectiveIcon: (icons, key) => (icons && icons[key]) || '',
  getDarkModePreference: () => false,
  DEFAULT_BUTTON_ICONS: {},
  saveCustomLists: () => Promise.resolve(),
}));

jest.mock('../utils/userManagement', () => ({
  getUsers: () => Promise.resolve([
    { id: 'admin-1', vorname: 'Admin', nachname: 'User', email: 'admin@example.com', isAdmin: true, role: 'admin' },
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

jest.mock('../utils/ingredientUtils', () => ({
  ...jest.requireActual('../utils/ingredientUtils'),
  formatIngredients: (ingredients) => ingredients,
  formatIngredientSpacing: (text) => text,
}));

jest.mock('../utils/storageUtils', () => ({
  uploadRecipeImage: jest.fn(),
  deleteRecipeImage: jest.fn(),
}));

jest.mock('../utils/recipeLinks', () => ({
  ...jest.requireActual('../utils/recipeLinks'),
  encodeRecipeLink: jest.fn((id, title) => `#${id}-${title}`),
  startsWithHash: (text) => text.startsWith('#'),
}));

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
  CSS: { Transform: { toString: jest.fn(() => '') } },
}));

// Mock WebImportModal component
jest.mock('./WebImportModal', () => {
  return function MockWebImportModal({ onImported, onCancel, initialUrl }) {
    return (
      <div data-testid="web-import-modal">
        <h2>Rezept von Website importieren</h2>
        {initialUrl && <span data-testid="initial-url">{initialUrl}</span>}
        <button onClick={() => onImported()}>Übernehmen</button>
        <button onClick={onCancel}>Abbrechen</button>
      </div>
    );
  };
});

describe('WebImportModal Integration - Dialog Close on Apply', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('WebImportModal closes when "Übernehmen" button is clicked', async () => {
    const userWithWebImport = {
      id: 'admin-1',
      vorname: 'Admin',
      nachname: 'User',
      email: 'admin@example.com',
      isAdmin: true,
      role: 'admin',
      webimport: true, // Enable webimport feature
    };

    renderWithProviders(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={userWithWebImport}
      />
    );

    // Wait for the component to fully render
    await waitFor(() => {
      expect(screen.getByLabelText('Rezepttitel *')).toBeInTheDocument();
    });

    // Click the web import button to open the modal
    const webImportButton = screen.getByTitle('Rezept von Website importieren');
    fireEvent.click(webImportButton);

    // Verify modal is opened
    await waitFor(() => {
      expect(screen.getByTestId('web-import-modal')).toBeInTheDocument();
    });

    // Click the "Übernehmen" button in the modal
    const uebernehmenButton = screen.getByText('Übernehmen');
    fireEvent.click(uebernehmenButton);

    // The modal saves the imported recipe itself; the form then closes via onCancel
    await waitFor(() => {
      expect(screen.queryByTestId('web-import-modal')).not.toBeInTheDocument();
    });
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  test('WebImportModal closes when "Abbrechen" button is clicked', async () => {
    const userWithWebImport = {
      id: 'admin-1',
      vorname: 'Admin',
      nachname: 'User',
      email: 'admin@example.com',
      isAdmin: true,
      role: 'admin',
      webimport: true,
    };

    renderWithProviders(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={userWithWebImport}
      />
    );

    // Wait for the component to fully render
    await waitFor(() => {
      expect(screen.getByLabelText('Rezepttitel *')).toBeInTheDocument();
    });

    // Click the web import button to open the modal
    const webImportButton = screen.getByTitle('Rezept von Website importieren');
    fireEvent.click(webImportButton);

    // Verify modal is opened
    await waitFor(() => {
      expect(screen.getByTestId('web-import-modal')).toBeInTheDocument();
    });

    // Click the "Abbrechen" button in the modal (there are multiple buttons with this text)
    const modal = screen.getByTestId('web-import-modal');
    const abbrechenButton = modal.querySelector('button:last-child');
    fireEvent.click(abbrechenButton);

    // Verify the modal is closed
    await waitFor(() => {
      expect(screen.queryByTestId('web-import-modal')).not.toBeInTheDocument();
    });
  });
});

describe('WebImportModal Integration - initialWebImportUrl deeplink', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  const userWithWebImport = {
    id: 'admin-1',
    vorname: 'Admin',
    nachname: 'User',
    email: 'admin@example.com',
    isAdmin: true,
    role: 'admin',
    webimport: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('WebImportModal opens automatically when initialWebImportUrl is provided', async () => {
    renderWithProviders(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={userWithWebImport}
        initialWebImportUrl="https://www.chefkoch.de/rezepte/123"
      />
    );

    // The modal should be opened automatically
    await waitFor(() => {
      expect(screen.getByTestId('web-import-modal')).toBeInTheDocument();
    });
  });

  test('WebImportModal receives initialUrl prop when opened via initialWebImportUrl', async () => {
    const testUrl = 'https://www.chefkoch.de/rezepte/123';

    renderWithProviders(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={userWithWebImport}
        initialWebImportUrl={testUrl}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('web-import-modal')).toBeInTheDocument();
    });

    // The initialUrl should be passed through to the modal
    expect(screen.getByTestId('initial-url')).toHaveTextContent(testUrl);
  });

  test('WebImportModal does not open automatically when recipe is being edited', async () => {
    const existingRecipe = { id: 'recipe-1', title: 'Existing Recipe' };

    renderWithProviders(
      <RecipeForm
        recipe={existingRecipe}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={userWithWebImport}
        initialWebImportUrl="https://www.chefkoch.de/rezepte/123"
      />
    );

    // Wait for the component to render
    await waitFor(() => {
      expect(screen.getByLabelText('Rezepttitel *')).toBeInTheDocument();
    });

    // Modal should NOT be opened when editing an existing recipe
    expect(screen.queryByTestId('web-import-modal')).not.toBeInTheDocument();
  });

  test('WebImportModal does not open automatically when initialWebImportUrl is empty', async () => {
    renderWithProviders(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={userWithWebImport}
        initialWebImportUrl=""
      />
    );

    // Wait for the component to render
    await waitFor(() => {
      expect(screen.getByLabelText('Rezepttitel *')).toBeInTheDocument();
    });

    // Modal should NOT be opened when no URL is provided
    expect(screen.queryByTestId('web-import-modal')).not.toBeInTheDocument();
  });
});
