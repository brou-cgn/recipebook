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
}));

jest.mock('../utils/customLists', () => ({
  getCustomLists: () => ({
    cuisineTypes: ['Italian', 'Thai', 'Chinese'],
    mealCategories: ['Appetizer', 'Main Course', 'Dessert'],
    units: [],
  }),
}));

jest.mock('../utils/userManagement', () => ({
  getUsers: () => [
    { id: 'admin-1', vorname: 'Admin', nachname: 'User', email: 'admin@example.com', isAdmin: true, role: 'admin' },
    { id: 'user-1', vorname: 'Regular', nachname: 'User', email: 'user@example.com', isAdmin: false, role: 'edit' },
  ],
  ROLES: {
    ADMIN: 'admin',
    EDIT: 'edit',
    COMMENT: 'comment',
    READ: 'read',
    GUEST: 'guest'
  }
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
