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
    scanImage: '📷'
  }),
}));

jest.mock('../utils/userManagement', () => ({
  getUsers: () => Promise.resolve([
    { id: 'admin-1', vorname: 'Admin', nachname: 'User', email: 'admin@example.com', isAdmin: true, role: 'admin' },
    { id: 'user-1', vorname: 'Regular', nachname: 'User', email: 'user@example.com', isAdmin: false, role: 'edit' },
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

describe('RecipeForm - Author Field', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows author dropdown for admin user', () => {
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

    // Check that it contains options for all users
    expect(screen.getByText('Admin User (admin@example.com)')).toBeInTheDocument();
    expect(screen.getByText('Regular User (user@example.com)')).toBeInTheDocument();
  });

  test('shows author as disabled text input for non-admin user', () => {
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

    // Check that author field is a disabled text input
    const authorField = screen.getByLabelText('Autor');
    expect(authorField.tagName).toBe('INPUT');
    expect(authorField).toBeDisabled();
    expect(authorField).toHaveValue('Regular User');
  });

  test('sets current user as author for new recipe', () => {
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

    // Submit form
    fireEvent.click(screen.getByText('Rezept speichern'));

    // Check that onSave was called with authorId set to current user
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test Recipe',
        authorId: 'user-1',
      })
    );
  });

  test('admin can change author when creating recipe', () => {
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

    // Change author
    const authorField = screen.getByLabelText('Autor');
    fireEvent.change(authorField, { target: { value: 'user-1' } });

    // Submit form
    fireEvent.click(screen.getByText('Rezept speichern'));

    // Check that onSave was called with the selected authorId
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test Recipe',
        authorId: 'user-1',
      })
    );
  });

  test('preserves authorId when editing existing recipe', () => {
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
      speisekategorie: '',
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
    fireEvent.click(screen.getByText('Rezept aktualisieren'));

    // Check that onSave was called with the original authorId
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'recipe-1',
        title: 'Existing Recipe',
        authorId: 'user-1',
      })
    );
  });

  test('admin can change author when editing existing recipe', () => {
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
      speisekategorie: '',
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

    // Change author
    const authorField = screen.getByLabelText('Autor');
    fireEvent.change(authorField, { target: { value: 'admin-1' } });

    // Submit form
    fireEvent.click(screen.getByText('Rezept aktualisieren'));

    // Check that onSave was called with the new authorId
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'recipe-1',
        authorId: 'admin-1',
      })
    );
  });
});

describe('RecipeForm - Multi-Select Fields', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Kulinarik field is a multi-select dropdown', () => {
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

    const kulinarikField = screen.getByLabelText('Kulinarik (Mehrfachauswahl möglich)');
    expect(kulinarikField.tagName).toBe('SELECT');
    expect(kulinarikField).toHaveAttribute('multiple');
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

  test('can select multiple cuisines in Kulinarik field', () => {
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

    const kulinarikField = screen.getByLabelText('Kulinarik (Mehrfachauswahl möglich)');
    
    // Get the options
    const italianOption = screen.getByRole('option', { name: 'Italian' });
    const thaiOption = screen.getByRole('option', { name: 'Thai' });
    
    // Select multiple options by setting selected property
    italianOption.selected = true;
    thaiOption.selected = true;
    
    // Trigger change event
    fireEvent.change(kulinarikField);

    // Fill in required title
    fireEvent.change(screen.getByLabelText('Rezepttitel *'), {
      target: { value: 'Test Recipe' },
    });

    // Submit form
    fireEvent.click(screen.getByText('Rezept speichern'));

    // Check that onSave was called with multiple cuisines
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        kulinarik: expect.arrayContaining(['Italian', 'Thai']),
      })
    );
  });

  test('can select multiple categories in Speisekategorie field', () => {
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
    
    // Get the options
    const appetizerOption = screen.getByRole('option', { name: 'Appetizer' });
    const mainCourseOption = screen.getByRole('option', { name: 'Main Course' });
    
    // Select multiple options by setting selected property
    appetizerOption.selected = true;
    mainCourseOption.selected = true;
    
    // Trigger change event
    fireEvent.change(speisekategorieField);

    // Fill in required title
    fireEvent.change(screen.getByLabelText('Rezepttitel *'), {
      target: { value: 'Test Recipe' },
    });

    // Submit form
    fireEvent.click(screen.getByText('Rezept speichern'));

    // Check that onSave was called with multiple categories
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        speisekategorie: expect.arrayContaining(['Appetizer', 'Main Course']),
      })
    );
  });

  test('loads existing recipe with array kulinarik correctly', () => {
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

    const kulinarikField = screen.getByLabelText('Kulinarik (Mehrfachauswahl möglich)');
    
    // Check that Italian and Chinese are selected
    const options = Array.from(kulinarikField.selectedOptions).map(opt => opt.value);
    expect(options).toContain('Italian');
    expect(options).toContain('Chinese');
  });

  test('converts old string format speisekategorie to array', () => {
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
    fireEvent.click(screen.getByText('Rezept aktualisieren'));

    // Check that speisekategorie was converted to array
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        speisekategorie: ['Dessert'],
      })
    );
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

  test('uses category image as title image for new recipe without image', () => {
    const { getImageForCategories } = require('../utils/categoryImages');
    getImageForCategories.mockReturnValue('data:image/png;base64,category-image');

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

    // Select a meal category
    const speisekategorieField = screen.getByLabelText('Speisekategorie (Mehrfachauswahl möglich)');
    const mainCourseOption = screen.getByRole('option', { name: 'Main Course' });
    mainCourseOption.selected = true;
    fireEvent.change(speisekategorieField);

    // Submit form without uploading an image
    fireEvent.click(screen.getByText('Rezept speichern'));

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

  test('does not use category image when recipe already has title image', () => {
    const { getImageForCategories } = require('../utils/categoryImages');
    getImageForCategories.mockReturnValue('data:image/png;base64,category-image');

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
    fireEvent.click(screen.getByText('Rezept aktualisieren'));

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

  test('does not use category image when no categories selected', () => {
    const { getImageForCategories } = require('../utils/categoryImages');
    getImageForCategories.mockReturnValue(null);

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

    // Submit form without selecting categories
    fireEvent.click(screen.getByText('Rezept speichern'));

    // Check that onSave was called with empty image
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test Recipe',
        image: '',
        speisekategorie: [],
      })
    );
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
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={regularUser}
      />
    );

    // Import button should NOT be visible for non-admin users
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
      // isAdmin is undefined
    };

    render(
      <RecipeForm
        recipe={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        currentUser={userWithoutAdminFlag}
      />
    );

    // Import button should NOT be visible when isAdmin is undefined
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

  test('formats ingredients with spaces between numbers and units on save', () => {
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

    // Submit form
    fireEvent.click(screen.getByText('Rezept speichern'));

    // Verify onSave was called with formatted ingredients
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test Recipe',
        ingredients: ['100 ml Milch', '250 g Mehl', '2 EL Öl'],
      })
    );
  });

  test('formats ingredients when editing existing recipe', () => {
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
    fireEvent.click(screen.getByText('Rezept aktualisieren'));

    // Verify onSave was called with formatted ingredients
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'recipe-1',
        ingredients: ['100 ml Wasser', '500 g Zucker'],
      })
    );
  });

  test('preserves already formatted ingredients', () => {
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

    // Submit form
    fireEvent.click(screen.getByText('Rezept speichern'));

    // Verify the already-formatted ingredient is preserved
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredients: ['100 ml Milch'],
      })
    );
  });

  test('filters out empty ingredients before formatting', () => {
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

    // Submit form
    fireEvent.click(screen.getByText('Rezept speichern'));

    // Verify only non-empty ingredients were formatted
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredients: ['100 ml Milch'],
      })
    );
  });
});
