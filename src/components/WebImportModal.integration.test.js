import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
}));

jest.mock('../utils/userManagement', () => ({
  getUsers: () => Promise.resolve([
    { id: 'admin-1', vorname: 'Admin', nachname: 'User', email: 'admin@example.com', isAdmin: true, role: 'admin' },
  ]),
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
  formatIngredients: (ingredients) => ingredients,
}));

// Mock WebImportModal component
jest.mock('./WebImportModal', () => {
  return function MockWebImportModal({ onImport, onCancel }) {
    return (
      <div data-testid="web-import-modal">
        <h2>Rezept von Website importieren</h2>
        <button
          onClick={() => {
            // Simulate the import with test data
            onImport({
              title: 'Test Web Recipe',
              ingredients: ['100g flour', '2 eggs'],
              steps: ['Mix ingredients', 'Bake at 180°C'],
              portionen: 4,
              kochdauer: 30,
              kulinarik: ['Italian'],
              schwierigkeit: 3,
              speisekategorie: ['Main Course'],
            });
          }}
        >
          Übernehmen
        </button>
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

    render(
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

    // Verify the modal is closed (should not be in the document anymore)
    await waitFor(() => {
      expect(screen.queryByTestId('web-import-modal')).not.toBeInTheDocument();
    });

    // Verify the form was populated with the imported data
    expect(screen.getByDisplayValue('Test Web Recipe')).toBeInTheDocument();
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

    render(
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
