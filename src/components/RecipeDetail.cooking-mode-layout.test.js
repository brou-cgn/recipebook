import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RecipeDetail from './RecipeDetail';

// Mock the utility modules
jest.mock('../utils/imageUtils', () => ({
  isBase64Image: jest.fn(() => false),
}));

jest.mock('../utils/userFavorites', () => ({
  getUserFavorites: () => Promise.resolve([]),
}));

jest.mock('../utils/userManagement', () => ({
  canDirectlyEditRecipe: () => true,
  canCreateNewVersion: () => true,
  canDeleteRecipe: () => true,
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

jest.mock('../utils/recipeLinks', () => ({
  decodeRecipeLink: () => null,
}));

describe('RecipeDetail - Cooking Mode Layout', () => {
  const mockRecipe = {
    id: 'recipe-1',
    title: 'Test Recipe',
    authorId: 'user-1',
    portionen: 4,
    ingredients: ['200 g Ingredient 1', '300 g Ingredient 2'],
    steps: ['First step instructions', 'Second step instructions', 'Third step instructions'],
    image: 'test-image.jpg',
  };

  const currentUser = {
    id: 'user-1',
    vorname: 'Test',
    nachname: 'User',
  };

  const setMockWindowWidth = (width) => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: width,
    });
  };

  // Mock Wake Lock API
  beforeEach(() => {
    Object.defineProperty(navigator, 'wakeLock', {
      writable: true,
      value: {
        request: jest.fn().mockResolvedValue({
          release: jest.fn().mockResolvedValue(undefined),
        }),
      },
    });
  });

  test('step counter is positioned at bottom right inside step container', () => {
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

    // Activate cooking mode
    const staticIcon = document.querySelector('.overlay-cooking-mode-static');
    fireEvent.click(staticIcon);

    // Get the step card elements
    const stepCards = document.querySelectorAll('.step-card');
    expect(stepCards.length).toBe(3);

    // Get the first step card and its counter
    const firstStepCard = stepCards[0];
    const stepCounter = firstStepCard.querySelector('.step-counter');
    
    expect(stepCounter).toBeInTheDocument();
    expect(firstStepCard).toContainElement(stepCounter);
    
    // Check that step counter has the correct text
    expect(stepCounter).toHaveTextContent('Schritt 1 von 3');
  });

  test('step text is left-aligned', () => {
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

    // Activate cooking mode
    const staticIcon = document.querySelector('.overlay-cooking-mode-static');
    fireEvent.click(staticIcon);

    // Get the first step card
    const firstStepCard = document.querySelector('.step-card');
    expect(firstStepCard).toBeInTheDocument();
    
    // Verify it contains the step text (via step content)
    const stepContent = firstStepCard.querySelector('.step-content');
    expect(stepContent).toHaveTextContent('First step instructions');
  });

  test('step counter updates when navigating between steps', () => {
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

    // Activate cooking mode
    const staticIcon = document.querySelector('.overlay-cooking-mode-static');
    fireEvent.click(staticIcon);

    // Initial state - check first step card is active
    const firstStepCard = document.querySelectorAll('.step-card')[0];
    expect(firstStepCard).toHaveClass('active');
    expect(firstStepCard.querySelector('.step-counter')).toHaveTextContent('Schritt 1 von 3');

    // Click on the second step card to navigate to it
    const secondStepCard = document.querySelectorAll('.step-card')[1];
    fireEvent.click(secondStepCard);

    // Check that second step card is now active
    expect(secondStepCard).toHaveClass('active');
    expect(secondStepCard.querySelector('.step-counter')).toHaveTextContent('Schritt 2 von 3');
  });

  test('progress indicator dots are displayed and clickable', () => {
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

    // Activate cooking mode
    const staticIcon = document.querySelector('.overlay-cooking-mode-static');
    fireEvent.click(staticIcon);

    // Check that dots are present
    const dots = document.querySelectorAll('.step-dot');
    expect(dots.length).toBe(3);

    // Check that first dot is active
    expect(dots[0]).toHaveClass('active');
    expect(dots[1]).not.toHaveClass('active');
    expect(dots[2]).not.toHaveClass('active');

    // Click on the third dot
    fireEvent.click(dots[2]);

    // Check that third dot is now active
    expect(dots[0]).not.toHaveClass('active');
    expect(dots[1]).not.toHaveClass('active');
    expect(dots[2]).toHaveClass('active');

    // Check that the third step card is active
    const stepCards = document.querySelectorAll('.step-card');
    expect(stepCards[2]).toHaveClass('active');
  });

  test('keyboard navigation with arrow keys', () => {
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

    // Activate cooking mode
    const staticIcon = document.querySelector('.overlay-cooking-mode-static');
    fireEvent.click(staticIcon);

    // Check initial state
    const stepCards = document.querySelectorAll('.step-card');
    expect(stepCards[0]).toHaveClass('active');

    // Press right arrow key
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    // Check that second step is now active
    expect(stepCards[1]).toHaveClass('active');
    expect(stepCards[0]).not.toHaveClass('active');

    // Press left arrow key
    fireEvent.keyDown(window, { key: 'ArrowLeft' });

    // Check that first step is active again
    expect(stepCards[0]).toHaveClass('active');
    expect(stepCards[1]).not.toHaveClass('active');
  });
});
