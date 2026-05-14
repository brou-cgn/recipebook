import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Startseite from './Startseite';

jest.mock('../utils/recipeCallsFirestore', () => ({
  getRecentRecipeCalls: jest.fn(),
}));

jest.mock('../utils/customLists', () => ({
  getDarkModePreference: jest.fn(() => false),
  DEFAULT_BUTTON_ICONS: {},
}));

jest.mock('./RecipeCard', () => ({ recipe }) => (
  <div data-testid="recipe-card">{recipe.title}</div>
));

const mockRecipes = [
  { id: 'r1', title: 'Rezept 1' },
  { id: 'r2', title: 'Rezept 2' },
  { id: 'r3', title: 'Rezept 3' },
];

beforeEach(() => {
  const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
  getRecentRecipeCalls.mockResolvedValue([]);
});

describe('Startseite', () => {
  test('renders without crashing', () => {
    const { container } = render(<Startseite currentUser={{ id: 'u1' }} />);
    expect(container.querySelector('.startseite-container')).toBeInTheDocument();
  });

  test('renders without a currentUser', () => {
    const { container } = render(<Startseite />);
    expect(container.querySelector('.startseite-container')).toBeInTheDocument();
  });

  test('shows "Im Trend" section title', () => {
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} />);
    expect(screen.getByText('Im Trend')).toBeInTheDocument();
  });

  test('shows loading state initially', () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockReturnValue(new Promise(() => {}));
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} />);
    expect(screen.getByText('Laden…')).toBeInTheDocument();
  });

  test('shows empty state when no trending recipes', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} />);
    expect(await screen.findByText('Keine Trendrezepte vorhanden.')).toBeInTheDocument();
  });

  test('shows top recipes in carousel sorted by call count', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([
      { id: 'c1', recipeId: 'r2' },
      { id: 'c2', recipeId: 'r2' },
      { id: 'c3', recipeId: 'r1' },
    ]);
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} />);
    expect(await screen.findByText('Rezept 2')).toBeInTheDocument();
    expect(screen.getByText('Rezept 1')).toBeInTheDocument();
  });

  test('limits carousel to top 10 recipes', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    const manyRecipes = Array.from({ length: 15 }, (_, i) => ({ id: `r${i}`, title: `Rezept ${i}` }));
    const calls = manyRecipes.map((r, i) => ({ id: `c${i}`, recipeId: r.id }));
    getRecentRecipeCalls.mockResolvedValue(calls);
    const { container } = render(<Startseite currentUser={{ id: 'u1' }} recipes={manyRecipes} />);
    await screen.findByText('Rezept 0');
    const items = container.querySelectorAll('.startseite-carousel-item');
    expect(items.length).toBeLessThanOrEqual(10);
  });

  test('renders "mehr" button', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} />);
    await screen.findByText('Keine Trendrezepte vorhanden.');
    expect(screen.getByRole('button', { name: /mehr/i })).toBeInTheDocument();
  });

  test('"mehr" button calls onViewChange with trendingRecipes', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    const onViewChange = jest.fn();
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} onViewChange={onViewChange} />);
    await screen.findByText('Keine Trendrezepte vorhanden.');
    fireEvent.click(screen.getByRole('button', { name: /mehr/i }));
    expect(onViewChange).toHaveBeenCalledWith('trendingRecipes');
  });

  test('"mehr" button sets sessionStorage sort to trending', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    const onViewChange = jest.fn();
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} onViewChange={onViewChange} />);
    await screen.findByText('Keine Trendrezepte vorhanden.');
    fireEvent.click(screen.getByRole('button', { name: /mehr/i }));
    expect(sessionStorage.getItem('recipebook_active_sort')).toBe('trending');
  });
});
