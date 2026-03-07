import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import RecipeDetail from './RecipeDetail';

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
    portionUnits: [{ id: 'portion', singular: 'Portion', plural: 'Portionen' }],
    cuisineTypes: [],
    mealCategories: [],
    units: [],
  }),
  getButtonIcons: () => Promise.resolve({
    cookingMode: '👨‍🍳',
    timerStart: '⏱',
    timerStop: '⏹',
  }),
}));

jest.mock('../utils/recipeLinks', () => ({
  decodeRecipeLink: () => null,
}));

const mockRecipe = {
  id: 'recipe-timer',
  title: 'Timer Test Recipe',
  authorId: 'user-1',
  portionen: 2,
  ingredients: ['Salz'],
  steps: [
    'Wasser aufkochen und 10 Minuten köcheln lassen.',
    'Schritt ohne Zeitangabe.',
    '2 Stunden einweichen lassen.',
  ],
  image: 'test-image.jpg',
};

const currentUser = { id: 'user-1', vorname: 'Test', nachname: 'User' };

function enterCookingMode() {
  const icon = document.querySelector('.overlay-cooking-mode-static');
  fireEvent.click(icon);
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 400 });
  Object.defineProperty(navigator, 'wakeLock', {
    writable: true,
    value: { request: jest.fn().mockResolvedValue({ release: jest.fn().mockResolvedValue(undefined) }) },
  });
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('RecipeDetail - Step Timer', () => {
  test('renders timer start button for time mention in step text', () => {
    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );
    enterCookingMode();

    // The first step card should contain a timer start button at the top right
    const timerBtn = document.querySelector('.step-timer-start-btn');
    expect(timerBtn).toBeInTheDocument();
    expect(timerBtn.textContent).toContain('10 Minuten');
  });

  test('step with no time mention has no timer button', () => {
    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );
    enterCookingMode();

    // Navigate to second step (no time)
    const secondDot = document.querySelectorAll('.step-dot')[1];
    fireEvent.click(secondDot);

    const secondCard = document.querySelectorAll('.step-card')[1];
    expect(secondCard.querySelector('.step-timer-start-btn')).toBeNull();
    expect(secondCard.querySelector('.step-timer-header')).toBeNull();
  });

  test('clicking timer start button shows countdown and stop button', () => {
    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );
    enterCookingMode();

    const timerBtn = document.querySelector('.step-timer-start-btn');
    fireEvent.click(timerBtn);

    // Top area with stop button and countdown should now be visible
    expect(document.querySelector('.step-timer-top-area')).toBeInTheDocument();
    expect(document.querySelector('.step-timer-time')).toBeInTheDocument();
    // Should show 10:00 (600 seconds = 10 minutes)
    expect(document.querySelector('.step-timer-time').textContent).toBe('10:00');
    // Start button on the first card should be gone (third step still has its own start button)
    const firstCard = document.querySelectorAll('.step-card')[0];
    expect(firstCard.querySelector('.step-timer-start-btn')).toBeNull();
  });

  test('timer counts down after 1 second', () => {
    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );
    enterCookingMode();

    const timerBtn = document.querySelector('.step-timer-start-btn');
    fireEvent.click(timerBtn);

    act(() => { jest.advanceTimersByTime(1000); });

    expect(document.querySelector('.step-timer-time').textContent).toBe('09:59');
  });

  test('progress bar is shown while timer is running', () => {
    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );
    enterCookingMode();

    // No progress bar before timer starts
    expect(document.querySelector('.step-timer-progress-bar')).toBeNull();

    fireEvent.click(document.querySelector('.step-timer-start-btn'));

    // Progress bar should appear after starting the timer
    expect(document.querySelector('.step-timer-progress-bar')).toBeInTheDocument();
    expect(document.querySelector('.step-timer-progress-fill')).toBeInTheDocument();
  });

  test('stop button resets the timer and shows start button again', () => {
    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );
    enterCookingMode();

    fireEvent.click(document.querySelector('.step-timer-start-btn'));
    act(() => { jest.advanceTimersByTime(2000); });

    // Stop
    const stopBtn = document.querySelector('.step-timer-btn.stop');
    expect(stopBtn).toBeInTheDocument();
    fireEvent.click(stopBtn);

    // Timer display gone, start button should be back
    expect(document.querySelector('.step-timer-top-area')).toBeNull();
    expect(document.querySelector('.step-timer-progress-bar')).toBeNull();
    expect(document.querySelector('.step-timer-start-btn')).toBeInTheDocument();
  });

  test('stop button removes the timer display', () => {
    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );
    enterCookingMode();

    fireEvent.click(document.querySelector('.step-timer-start-btn'));
    expect(document.querySelector('.step-timer-top-area')).toBeInTheDocument();

    fireEvent.click(document.querySelector('.step-timer-btn.stop'));

    // Timer display gone, start button should be back
    expect(document.querySelector('.step-timer-top-area')).toBeNull();
    expect(document.querySelector('.step-timer-start-btn')).toBeInTheDocument();
  });

  test('timer shows checkmark when finished', () => {
    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );
    enterCookingMode();

    fireEvent.click(document.querySelector('.step-timer-start-btn'));
    // 10 minutes = 600 seconds
    act(() => { jest.advanceTimersByTime(600 * 1000); });

    const timeDisplay = document.querySelector('.step-timer-time');
    expect(timeDisplay).toBeInTheDocument();
    expect(timeDisplay.textContent).toBe('✓');
    expect(timeDisplay).toHaveClass('finished');
  });

  test('Stunden timer parses to correct seconds', () => {
    const recipeWithHours = {
      ...mockRecipe,
      steps: ['2 Stunden einweichen.'],
    };

    render(
      <RecipeDetail
        recipe={recipeWithHours}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        currentUser={currentUser}
      />
    );
    enterCookingMode();

    const btn = document.querySelector('.step-timer-start-btn');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);

    // 2 Stunden = 7200 seconds → should display 2:00:00
    expect(document.querySelector('.step-timer-time').textContent).toBe('2:00:00');
  });
});
