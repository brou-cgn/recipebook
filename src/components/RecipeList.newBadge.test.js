import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import RecipeList, { isNewRecipe } from './RecipeList';
import * as userFavorites from '../utils/userFavorites';
import * as recipeRatings from '../utils/recipeRatings';

// Mock dependencies
jest.mock('../utils/userManagement', () => ({
  canEditRecipes: jest.fn(() => false),
  getUsers: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../utils/customLists', () => ({
  getCustomLists: () => Promise.resolve({ mealCategories: [] }),
  getButtonIcons: () => Promise.resolve({ filterButton: '⚙' }),
  getSortSettings: () => Promise.resolve({
    trendingDays: 30,
    trendingMinViews: 5,
    newRecipeDays: 30,
    ratingMinVotes: 5,
  }),
  DEFAULT_BUTTON_ICONS: { filterButton: '⚙' },
  getEffectiveIcon: (icons, key) => icons[key] ?? '',
  getDarkModePreference: () => false,
  DEFAULT_TRENDING_DAYS: 30,
  DEFAULT_TRENDING_MIN_VIEWS: 5,
  DEFAULT_NEW_RECIPE_DAYS: 30,
  DEFAULT_RATING_MIN_VOTES: 5,
}));

jest.mock('../utils/recipeCallsFirestore', () => ({
  getRecentRecipeCalls: () => Promise.resolve([]),
}));

// ─── Unit tests for isNewRecipe helper ────────────────────────────────────────

describe('isNewRecipe helper', () => {
  const now = Date.now();

  test('returns true for a recipe created today', () => {
    const recipe = { createdAt: new Date(now).toISOString() };
    expect(isNewRecipe(recipe, { newRecipeDays: 30 })).toBe(true);
  });

  test('returns true for a recipe created exactly on the cutoff boundary', () => {
    const cutoff = now - 7 * 24 * 60 * 60 * 1000;
    const recipe = { createdAt: new Date(cutoff + 1000).toISOString() };
    expect(isNewRecipe(recipe, { newRecipeDays: 7 })).toBe(true);
  });

  test('returns false for a recipe older than the configured days', () => {
    const old = now - 31 * 24 * 60 * 60 * 1000;
    const recipe = { createdAt: new Date(old).toISOString() };
    expect(isNewRecipe(recipe, { newRecipeDays: 30 })).toBe(false);
  });

  test('uses DEFAULT_NEW_RECIPE_DAYS (30) when sortSettings is null', () => {
    const recentRecipe = { createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString() };
    const oldRecipe = { createdAt: new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString() };
    expect(isNewRecipe(recentRecipe, null)).toBe(true);
    expect(isNewRecipe(oldRecipe, null)).toBe(false);
  });

  test('returns false when recipe has no createdAt', () => {
    expect(isNewRecipe({}, { newRecipeDays: 30 })).toBe(false);
    expect(isNewRecipe(null, { newRecipeDays: 30 })).toBe(false);
  });

  test('handles Firestore Timestamp-like objects with toDate()', () => {
    const recentDate = new Date(now - 2 * 24 * 60 * 60 * 1000);
    const recipe = { createdAt: { toDate: () => recentDate } };
    expect(isNewRecipe(recipe, { newRecipeDays: 30 })).toBe(true);
  });

  test('handles Firestore Timestamp for old recipes', () => {
    const oldDate = new Date(now - 60 * 24 * 60 * 60 * 1000);
    const recipe = { createdAt: { toDate: () => oldDate } };
    expect(isNewRecipe(recipe, { newRecipeDays: 30 })).toBe(false);
  });

  test('respects custom newRecipeDays value (e.g. 7 days)', () => {
    const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
    const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(isNewRecipe({ createdAt: eightDaysAgo }, { newRecipeDays: 7 })).toBe(false);
    expect(isNewRecipe({ createdAt: fiveDaysAgo }, { newRecipeDays: 7 })).toBe(true);
  });

  test('uses publishedAt instead of createdAt when publishedAt is present', () => {
    const oldCreatedAt = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
    const recentPublishedAt = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    const recipe = { createdAt: oldCreatedAt, publishedAt: recentPublishedAt };
    expect(isNewRecipe(recipe, { newRecipeDays: 30 })).toBe(true);
  });

  test('falls back to createdAt when publishedAt is absent', () => {
    const recentCreatedAt = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    const recipe = { createdAt: recentCreatedAt };
    expect(isNewRecipe(recipe, { newRecipeDays: 30 })).toBe(true);
  });

  test('returns false when only publishedAt is older than cutoff', () => {
    const oldPublishedAt = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
    const recentCreatedAt = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    const recipe = { createdAt: recentCreatedAt, publishedAt: oldPublishedAt };
    expect(isNewRecipe(recipe, { newRecipeDays: 30 })).toBe(false);
  });

  test('returns true for a recipe with only publishedAt (no createdAt) within cutoff', () => {
    const recentPublishedAt = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    const recipe = { publishedAt: recentPublishedAt };
    expect(isNewRecipe(recipe, { newRecipeDays: 30 })).toBe(true);
  });
});

// ─── Integration tests: "Neu" badge in RecipeList ────────────────────────────

describe('RecipeList - Neu badge', () => {
  const now = Date.now();

  beforeEach(() => {
    jest.spyOn(userFavorites, 'getUserFavorites').mockResolvedValue([]);
    jest.spyOn(recipeRatings, 'getUserRating').mockResolvedValue(null);
    jest.spyOn(recipeRatings, 'subscribeToRatingSummary').mockImplementation(() => () => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('shows "Neu" badge for a recipe created recently', async () => {
    const recentRecipe = [
      {
        id: '1',
        title: 'Neues Rezept',
        createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      },
    ];

    render(
      <RecipeList
        recipes={recentRecipe}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Neu')).toBeInTheDocument();
    });

    const badge = screen.getByText('Neu');
    expect(badge).toHaveClass('new-badge');
  });

  test('does NOT show "Neu" badge for a recipe older than newRecipeDays', async () => {
    // getSortSettings returns newRecipeDays: 30, so 31 days ago is outside the window
    const oldRecipe = [
      {
        id: '2',
        title: 'Altes Rezept',
        createdAt: new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    render(
      <RecipeList
        recipes={oldRecipe}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
      />
    );

    // Give the async load time to settle
    await waitFor(() => {
      expect(screen.getByText('Altes Rezept')).toBeInTheDocument();
    });

    expect(screen.queryByText('Neu')).not.toBeInTheDocument();
  });

  test('does NOT show "Neu" badge when recipe has no createdAt', async () => {
    const recipeWithoutDate = [
      {
        id: '3',
        title: 'Rezept ohne Datum',
      },
    ];

    render(
      <RecipeList
        recipes={recipeWithoutDate}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Rezept ohne Datum')).toBeInTheDocument();
    });

    expect(screen.queryByText('Neu')).not.toBeInTheDocument();
  });

  test('shows "Neu" badge alongside favorite badge when recipe is both new and favorite', async () => {
    jest.spyOn(userFavorites, 'getUserFavorites').mockResolvedValue(['1']);

    const recentFavorite = [
      {
        id: '1',
        title: 'Neues Favoriten-Rezept',
        createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      },
    ];

    render(
      <RecipeList
        recipes={recentFavorite}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        currentUser={{ id: 'user-1' }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Neu')).toBeInTheDocument();
    });

    const starElements = screen.getAllByText('★');
    expect(starElements.some(el => el.classList.contains('recipe-favorite-badge'))).toBe(true);
    expect(screen.getByText('Neu')).toBeInTheDocument();
  });

  test('shows "Neu" badges only for recipes within the time window', async () => {
    const mixedRecipes = [
      {
        id: '1',
        title: 'Neues Rezept',
        createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago – new
      },
      {
        id: '2',
        title: 'Altes Rezept',
        createdAt: new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago – old
      },
    ];

    render(
      <RecipeList
        recipes={mixedRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Neues Rezept')).toBeInTheDocument();
      expect(screen.getByText('Altes Rezept')).toBeInTheDocument();
    });

    // Only one "Neu" badge should appear (for the recent recipe)
    const badges = screen.queryAllByText('Neu');
    expect(badges).toHaveLength(1);
  });
});
