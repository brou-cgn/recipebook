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

    // The first step card should contain a timer start button for "10 Minuten"
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
  });

  test('clicking timer start button shows countdown display', () => {
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

    // Timer display should now be visible
    expect(document.querySelector('.step-timer-inline')).toBeInTheDocument();
    expect(document.querySelector('.step-timer-time')).toBeInTheDocument();
    // Should show 10:00 (600 seconds = 10 minutes)
    expect(document.querySelector('.step-timer-time').textContent).toBe('10:00');
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

  test('pause button stops the countdown', () => {
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
    expect(document.querySelector('.step-timer-time').textContent).toBe('09:58');

    // Pause
    const pauseBtn = document.querySelector('.step-timer-btn.pause');
    fireEvent.click(pauseBtn);

    act(() => { jest.advanceTimersByTime(3000); });
    // Should still be at 09:58 (paused)
    expect(document.querySelector('.step-timer-time').textContent).toBe('09:58');
  });

  test('resume button restarts the countdown after pause', () => {
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
    act(() => { jest.advanceTimersByTime(1000); });
    fireEvent.click(document.querySelector('.step-timer-btn.pause'));

    // Resume
    const resumeBtn = document.querySelector('.step-timer-btn.resume');
    expect(resumeBtn).toBeInTheDocument();
    fireEvent.click(resumeBtn);

    act(() => { jest.advanceTimersByTime(2000); });
    // 1 second before pause + 2 seconds after resume = 09:57
    expect(document.querySelector('.step-timer-time').textContent).toBe('09:57');
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
    expect(document.querySelector('.step-timer-inline')).toBeInTheDocument();

    fireEvent.click(document.querySelector('.step-timer-btn.stop'));

    // Timer display gone, start button should be back
    expect(document.querySelector('.step-timer-inline')).toBeNull();
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
