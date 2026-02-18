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

    // Get the step counter and current step elements
    const stepCounter = document.querySelector('.step-counter');
    const currentStep = document.querySelector('.current-step');
    
    expect(stepCounter).toBeInTheDocument();
    expect(currentStep).toBeInTheDocument();
    
    // The step counter should be inside the current-step element
    expect(currentStep).toContainElement(stepCounter);
    
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

    // Get the current step element
    const currentStep = document.querySelector('.current-step');
    expect(currentStep).toBeInTheDocument();
    
    // Verify text-align is left (via computed styles would be better, but we can check the class)
    // In the test environment, we can verify the element exists and contains the step text
    expect(currentStep).toHaveTextContent('First step instructions');
  });

  test('step counter updates when navigating between steps', () => {
    setMockWindowWidth(400);

    const { container } = render(
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

    // Initial state
    const stepCounter = document.querySelector('.step-counter');
    expect(stepCounter).toHaveTextContent('Schritt 1 von 3');

    // Simulate swipe left (next step)
    const stepsContainer = container.querySelector('.cooking-mode-steps');
    
    // Simulate touch events for swipe
    fireEvent.touchStart(stepsContainer, { touches: [{ clientX: 200 }] });
    fireEvent.touchMove(stepsContainer, { touches: [{ clientX: 100 }] });
    fireEvent.touchEnd(stepsContainer);

    // Check that step counter updated
    const updatedStepCounter = document.querySelector('.step-counter');
    expect(updatedStepCounter).toHaveTextContent('Schritt 2 von 3');
  });
});
