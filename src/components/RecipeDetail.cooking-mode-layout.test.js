import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
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
  canDeleteRecipes: () => true,
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
    conversionTable: [],
  }),
  getButtonIcons: () => Promise.resolve({
    cookingMode: '👨‍🍳',
    importRecipe: '📥',
    scanImage: '📷',
    timerStart: '⏱',
    timerStop: '⏹',
    cookDate: '📅',
  }),
  getTimelineBubbleIcon: () => Promise.resolve(null),
  getTimelineCookEventBubbleIcon: () => Promise.resolve(null),
  getTimelineCookEventDefaultImage: () => Promise.resolve(null),
  addMissingConversionEntries: jest.fn(() => Promise.resolve()),
  DEFAULT_BUTTON_ICONS: {
    cookingMode: '👨‍🍳',
    cookingModeAlt: '👨‍🍳',
    importRecipe: '📥',
    scanImage: '📷',
    webImport: '🌐',
    closeButton: '✕',
    closeButtonAlt: '✕',
    menuCloseButton: '✕',
    filterButton: '⚙',
    filterButtonActive: '🔽',
    copyLink: '📋',
    nutritionEmpty: '➕',
    nutritionFilled: '🥦',
    ratingHeartEmpty: '♡',
    ratingHeartEmptyModal: '♡',
    ratingHeartFilled: '♥',
    privateListBack: '✕',
    shoppingList: '🛒',
    bringButton: '🛍️',
    timerStart: '⏱',
    timerStop: '⏹',
    cookDate: '📅',
    addRecipe: '➕',
  },
  getEffectiveIcon: (icons, key) => icons[key] ?? '',
  getDarkModePreference: () => false,
  ALARM_SOUNDS: [
    { key: 'radar',   label: 'Radar' },
    { key: 'chime',   label: 'Glockenspiel' },
    { key: 'beep',    label: 'Piepton' },
    { key: 'crystal', label: 'Kristall' },
    { key: 'alert',   label: 'Alarm' },
  ],
  DEFAULT_ALARM_SOUND: 'radar',
  getAlarmSoundPreference: () => 'radar',
  saveAlarmSoundPreference: () => {},
}));

jest.mock('../utils/recipeLinks', () => ({
  decodeRecipeLink: () => null,
}));

jest.mock('../utils/recipeCookDates', () => ({
  setCookDate: jest.fn(() => Promise.resolve(true)),
  getAllCookDates: jest.fn(() => Promise.resolve([])),
  deleteCookDate: jest.fn(() => Promise.resolve()),
}));

jest.mock('../utils/recipeRatings', () => ({
  getUserRating: jest.fn(() => Promise.resolve(null)),
  getUserRatingData: jest.fn(() => Promise.resolve(null)),
  rateRecipe: jest.fn(() => Promise.resolve()),
  getAllRatings: jest.fn(() => Promise.resolve([])),
  getAverageRating: jest.fn(() => Promise.resolve({ average: 0, count: 0 })),
  deleteRating: jest.fn(() => Promise.resolve()),
  subscribeToRatingSummary: jest.fn(() => () => {}),
  getGuestId: jest.fn(() => 'guest-id'),
  getRaterKey: jest.fn(() => 'rater-key'),
}));

jest.mock('./RecipeRating', () => () => <div data-testid="recipe-rating-mock" />);

jest.mock('./CookDateModal', () => ({ prefillToday }) => (
  <div className="cook-date-modal" data-testid="cook-date-modal-mock" data-prefill-today={String(prefillToday ?? false)} />
));

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

  const setMockWindowHeight = (height) => {
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: height,
    });
  };

  const setLandscapeMode = () => {
    // width > 480, height <= 480 → isMobileLandscape = true
    setMockWindowWidth(900);
    setMockWindowHeight(400);
  };

  const setPortraitMode = () => {
    setMockWindowWidth(400);
    setMockWindowHeight(900);
  };

  let wakeLockRequestMock;
  let wakeLockReleaseMock;

  const waitForResponsiveUpdate = async () => {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 220));
    });
  };

  const rotateViewport = async (setViewportMode) => {
    setViewportMode();
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
      await new Promise(resolve => setTimeout(resolve, 220));
    });
  };

  // Mock Wake Lock API
  beforeEach(() => {
    wakeLockReleaseMock = jest.fn().mockResolvedValue(undefined);
    wakeLockRequestMock = jest.fn().mockResolvedValue({
      release: wakeLockReleaseMock,
    });
    Object.defineProperty(navigator, 'wakeLock', {
      writable: true,
      value: {
        request: wakeLockRequestMock,
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

  test('auto-activates card on scroll/swipe', async () => {
    setMockWindowWidth(400);

    const { findByText } = render(
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

    // Get the step carousel container
    const carousel = document.querySelector('.step-carousel');
    expect(carousel).toBeInTheDocument();

    // Get step cards
    const stepCards = document.querySelectorAll('.step-card');
    expect(stepCards.length).toBe(3);

    // Initially, first card should be active
    expect(stepCards[0]).toHaveClass('active');

    // Mock getBoundingClientRect for the container and cards
    // Simulate scrolling to the second card by mocking positions
    const containerRect = { left: 0, width: 400, getBoundingClientRect: jest.fn() };
    carousel.getBoundingClientRect = jest.fn(() => ({ left: 0, width: 400 }));
    
    // Card 0: far left (not centered)
    stepCards[0].getBoundingClientRect = jest.fn(() => ({ left: -200, width: 398 }));
    // Card 1: centered
    stepCards[1].getBoundingClientRect = jest.fn(() => ({ left: 1, width: 398 }));
    // Card 2: far right (not centered)
    stepCards[2].getBoundingClientRect = jest.fn(() => ({ left: 414, width: 398 }));

    // Trigger scroll event
    fireEvent.scroll(carousel);

    // Wait for debounce timeout (100ms)
    await new Promise(resolve => setTimeout(resolve, 150));

    // Second card should now be active
    expect(stepCards[1]).toHaveClass('active');
    expect(stepCards[0]).not.toHaveClass('active');
  });

  test('"Heute gekocht" button appears only on the last step card', () => {
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

    const stepCards = document.querySelectorAll('.step-card');
    expect(stepCards.length).toBe(3);

    // Button should NOT be on the first two cards
    expect(stepCards[0].querySelector('.step-heute-gekocht-btn')).toBeNull();
    expect(stepCards[1].querySelector('.step-heute-gekocht-btn')).toBeNull();

    // Button SHOULD be on the last card
    const lastCardBtn = stepCards[2].querySelector('.step-heute-gekocht-btn');
    expect(lastCardBtn).toBeInTheDocument();
    expect(lastCardBtn).toHaveTextContent('Heute gekocht');
  });

  test('"Heute gekocht" button opens CookDateModal', () => {
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

    // CookDateModal should not be visible yet
    expect(document.querySelector('.cook-date-modal')).toBeNull();

    // Click the button on the last step card
    const stepCards = document.querySelectorAll('.step-card');
    const lastCardBtn = stepCards[2].querySelector('.step-heute-gekocht-btn');
    fireEvent.click(lastCardBtn);

    // CookDateModal should now be visible
    expect(document.querySelector('.cook-date-modal')).toBeInTheDocument();
  });

  test('"Heute gekocht" button is not shown when user is not logged in', () => {
    setMockWindowWidth(400);

    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={null}
      />
    );

    // Activate cooking mode
    const staticIcon = document.querySelector('.overlay-cooking-mode-static');
    fireEvent.click(staticIcon);

    const stepCards = document.querySelectorAll('.step-card');
    expect(stepCards[2].querySelector('.step-heute-gekocht-btn')).toBeNull();
  });

  test('CookDateModal opened from cooking mode last step has prefillToday=true', () => {
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

    // Click "Heute gekocht" on the last step
    const stepCards = document.querySelectorAll('.step-card');
    const lastCardBtn = stepCards[2].querySelector('.step-heute-gekocht-btn');
    fireEvent.click(lastCardBtn);

    const modal = document.querySelector('.cook-date-modal');
    expect(modal).toBeInTheDocument();
    expect(modal.getAttribute('data-prefill-today')).toBe('true');
  });

  test('CookDateModal opened from recipe detail view has prefillToday=false', () => {
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

    // Click the cook-date-button in the detail view (not in cooking mode)
    const cookDateButton = document.querySelector('.cook-date-button');
    fireEvent.click(cookDateButton);

    const modal = document.querySelector('.cook-date-modal');
    expect(modal).toBeInTheDocument();
    expect(modal.getAttribute('data-prefill-today')).toBe('false');
  });

  describe('Landscape cooking mode', () => {
    test('auto-activates cooking mode when rotating to landscape on mobile', () => {
      setLandscapeMode();

      render(
        <RecipeDetail
          recipe={mockRecipe}
          onBack={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          currentUser={currentUser}
        />
      );

      // Cooking mode should be auto-activated without any user interaction
      const content = document.querySelector('.recipe-detail-content');
      expect(content).toHaveClass('cooking-mode-active');
      expect(content).toHaveClass('cooking-mode-landscape');
    });

    test('adds cooking-mode-landscape class when in landscape and cooking mode is active', () => {
      setLandscapeMode();

      render(
        <RecipeDetail
          recipe={mockRecipe}
          onBack={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          currentUser={currentUser}
        />
      );

      // Cooking mode is auto-activated in landscape
      const content = document.querySelector('.recipe-detail-content');
      expect(content).toHaveClass('cooking-mode-active');
      expect(content).toHaveClass('cooking-mode-landscape');
    });

    test('does not add cooking-mode-landscape class in portrait mode', () => {
      setPortraitMode();

      render(
        <RecipeDetail
          recipe={mockRecipe}
          onBack={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          currentUser={currentUser}
        />
      );

      // Activate cooking mode manually in portrait
      const staticIcon = document.querySelector('.overlay-cooking-mode-static');
      fireEvent.click(staticIcon);

      const content = document.querySelector('.recipe-detail-content');
      expect(content).toHaveClass('cooking-mode-active');
      expect(content).not.toHaveClass('cooking-mode-landscape');
    });

    test('cooking mode banner is not shown in landscape mode', () => {
      setLandscapeMode();

      render(
        <RecipeDetail
          recipe={mockRecipe}
          onBack={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          currentUser={currentUser}
        />
      );

      // Cooking mode is auto-activated but banner should be hidden
      expect(document.querySelector('.cooking-mode-indicator')).not.toBeInTheDocument();
    });

    test('hides app header in landscape mode via onHeaderVisibilityChange', () => {
      setLandscapeMode();
      const onHeaderVisibilityChange = jest.fn();

      render(
        <RecipeDetail
          recipe={mockRecipe}
          onBack={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          currentUser={currentUser}
          onHeaderVisibilityChange={onHeaderVisibilityChange}
        />
      );

      // Header should be hidden in landscape mode
      const calls = onHeaderVisibilityChange.mock.calls.map(c => c[0]);
      expect(calls[calls.length - 1]).toBe(false);
    });

    test('landscape cooking mode shows both ingredients and steps sections', () => {
      setLandscapeMode();

      render(
        <RecipeDetail
          recipe={mockRecipe}
          onBack={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          currentUser={currentUser}
        />
      );

      // Both sections should be visible simultaneously (auto-activated)
      expect(document.querySelector('.cooking-mode-ingredients')).toBeInTheDocument();
      expect(document.querySelector('.cooking-mode-steps')).toBeInTheDocument();
    });

    test('landscape cooking mode step cards are rendered correctly', () => {
      setLandscapeMode();

      render(
        <RecipeDetail
          recipe={mockRecipe}
          onBack={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          currentUser={currentUser}
        />
      );

      // All step cards should be rendered (auto-activated)
      const stepCards = document.querySelectorAll('.step-card');
      expect(stepCards.length).toBe(3);
      expect(stepCards[0]).toHaveClass('active');
    });

    test('ArrowUp navigates to previous step in landscape mode', () => {
      setLandscapeMode();

      render(
        <RecipeDetail
          recipe={mockRecipe}
          onBack={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          currentUser={currentUser}
        />
      );

      // Cooking mode is auto-activated in landscape
      const stepCards = document.querySelectorAll('.step-card');

      // Navigate forward with ArrowDown first
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      expect(stepCards[1]).toHaveClass('active');

      // Now navigate back with ArrowUp
      fireEvent.keyDown(window, { key: 'ArrowUp' });
      expect(stepCards[0]).toHaveClass('active');
    });

    test('ArrowDown navigates to next step in landscape mode', () => {
      setLandscapeMode();

      render(
        <RecipeDetail
          recipe={mockRecipe}
          onBack={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          currentUser={currentUser}
        />
      );

      // Cooking mode is auto-activated in landscape
      const stepCards = document.querySelectorAll('.step-card');
      expect(stepCards[0]).toHaveClass('active');

      fireEvent.keyDown(window, { key: 'ArrowDown' });
      expect(stepCards[1]).toHaveClass('active');
      expect(stepCards[0]).not.toHaveClass('active');
    });

    test('landscape cooking mode shows step dots for navigation', () => {
      setLandscapeMode();

      render(
        <RecipeDetail
          recipe={mockRecipe}
          onBack={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          currentUser={currentUser}
        />
      );

      // Step dots should be present for navigation (auto-activated)
      const dots = document.querySelectorAll('.step-dot');
      expect(dots.length).toBe(3);
      expect(dots[0]).toHaveClass('active');
    });

    test('deactivates cooking mode after rotating back to portrait', async () => {
      setPortraitMode();

      render(
        <RecipeDetail
          recipe={mockRecipe}
          onBack={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          currentUser={currentUser}
        />
      );

      // Manually activate in portrait first
      const staticIcon = document.querySelector('.overlay-cooking-mode-static');
      fireEvent.click(staticIcon);

      const content = document.querySelector('.recipe-detail-content');
      expect(content).toHaveClass('cooking-mode-active');
      await waitForResponsiveUpdate();
      expect(wakeLockRequestMock).toHaveBeenCalledWith('screen');

      // Rotate to landscape -> landscape cooking mode should be active
      await rotateViewport(setLandscapeMode);
      expect(content).toHaveClass('cooking-mode-active');
      expect(content).toHaveClass('cooking-mode-landscape');

      // Rotate back to portrait -> cooking mode should end and wake lock released
      await rotateViewport(setPortraitMode);

      expect(content).not.toHaveClass('cooking-mode-active');
      expect(content).not.toHaveClass('cooking-mode-landscape');
      expect(wakeLockReleaseMock).toHaveBeenCalled();
    });
  });
});
