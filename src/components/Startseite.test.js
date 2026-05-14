import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Startseite from './Startseite';

jest.mock('../utils/recipeCallsFirestore', () => ({
  getRecentRecipeCalls: jest.fn(),
}));

jest.mock('../utils/customLists', () => ({
  getDarkModePreference: jest.fn(() => false),
  DEFAULT_BUTTON_ICONS: {},
  getButtonIcons: jest.fn(() => Promise.resolve({})),
  getEffectiveIcon: jest.fn((icons, key) => ''),
}));

jest.mock('./TrendingCard', () => ({ recipe, onSelectRecipe, difficultyIcon, timeIcon }) => (
  <div data-testid="trending-card" onClick={() => onSelectRecipe?.(recipe)}>{recipe.title}</div>
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

  test('limits trending carousel to top 10 recipes', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    const manyRecipes = Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, title: `Rezept ${i}` }));
    const calls = manyRecipes.map((r, i) => ({ id: `c${i}`, recipeId: r.id }));
    getRecentRecipeCalls.mockResolvedValue(calls);
    const { container } = render(<Startseite currentUser={{ id: 'u1' }} recipes={manyRecipes} />);
    await screen.findByText('Rezept 0');
    // Both carousels (Im Trend + Neue Rezepte) cap at 10 each → 20 items total
    const items = container.querySelectorAll('.startseite-carousel-item');
    expect(items.length).toBe(20);
  });

  test('renders "mehr" buttons for both carousels', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} />);
    await screen.findByText('Keine Trendrezepte vorhanden.');
    const mehrButtons = screen.getAllByRole('button', { name: /mehr/i });
    expect(mehrButtons.length).toBe(2);
  });

  test('"mehr" button of "Im Trend" calls onViewChange with trendingRecipes', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    const onViewChange = jest.fn();
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} onViewChange={onViewChange} />);
    await screen.findByText('Keine Trendrezepte vorhanden.');
    const mehrButtons = screen.getAllByRole('button', { name: /mehr/i });
    fireEvent.click(mehrButtons[0]);
    expect(onViewChange).toHaveBeenCalledWith('trendingRecipes');
  });

  test('"mehr" button of "Im Trend" sets sessionStorage sort to trending', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    const onViewChange = jest.fn();
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} onViewChange={onViewChange} />);
    await screen.findByText('Keine Trendrezepte vorhanden.');
    const mehrButtons = screen.getAllByRole('button', { name: /mehr/i });
    fireEvent.click(mehrButtons[0]);
    expect(sessionStorage.getItem('recipebook_active_sort')).toBe('trending');
  });

  test('clicking a trending card calls onSelectRecipe with the recipe', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([
      { id: 'c1', recipeId: 'r1' },
    ]);
    const onSelectRecipe = jest.fn();
    render(
      <Startseite
        currentUser={{ id: 'u1' }}
        recipes={mockRecipes}
        onSelectRecipe={onSelectRecipe}
      />
    );
    const card = await screen.findByText('Rezept 1');
    fireEvent.click(card);
    expect(onSelectRecipe).toHaveBeenCalledWith(mockRecipes[0]);
  });

  // ─── Neue Rezepte carousel ─────────────────────────────────────────────────

  test('shows "Neue Rezepte" section title', () => {
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} />);
    expect(screen.getByText('Neue Rezepte')).toBeInTheDocument();
  });

  test('shows empty state for Neue Rezepte when no recipes provided', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    render(<Startseite currentUser={{ id: 'u1' }} recipes={[]} />);
    expect(await screen.findByText('Keine Rezepte vorhanden.')).toBeInTheDocument();
  });

  test('shows up to 10 newest recipes in Neue Rezepte carousel', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    const now = Date.now();
    const manyRecipes = Array.from({ length: 11 }, (_, i) => ({
      id: `r${i}`,
      title: `Rezept ${i}`,
      createdAt: new Date(now - i * 1000).toISOString(),
    }));
    const { container } = render(<Startseite currentUser={{ id: 'u1' }} recipes={manyRecipes} />);
    await screen.findByText('Keine Trendrezepte vorhanden.');
    // Only one carousel (Neue Rezepte) has items; it should show 10
    const items = container.querySelectorAll('.startseite-carousel-item');
    expect(items.length).toBe(10);
  });

  test('Neue Rezepte carousel sorts recipes by createdAt descending', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    const now = Date.now();
    const recipes = [
      { id: 'old', title: 'Altes Rezept', createdAt: new Date(now - 10000).toISOString() },
      { id: 'new', title: 'Neues Rezept', createdAt: new Date(now).toISOString() },
    ];
    render(<Startseite currentUser={{ id: 'u1' }} recipes={recipes} />);
    await screen.findByText('Keine Trendrezepte vorhanden.');
    const cards = screen.getAllByTestId('trending-card');
    // The first card in the "Neue Rezepte" section should be the newest recipe
    expect(cards[0].textContent).toBe('Neues Rezept');
  });

  test('"mehr" button of "Neue Rezepte" calls onViewChange with neueRezepte', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    const onViewChange = jest.fn();
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} onViewChange={onViewChange} />);
    await screen.findByText('Keine Trendrezepte vorhanden.');
    const mehrButtons = screen.getAllByRole('button', { name: /mehr/i });
    fireEvent.click(mehrButtons[1]);
    expect(onViewChange).toHaveBeenCalledWith('neueRezepte');
  });

  test('"mehr" button of "Neue Rezepte" sets sessionStorage sort to newest', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    const onViewChange = jest.fn();
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} onViewChange={onViewChange} />);
    await screen.findByText('Keine Trendrezepte vorhanden.');
    const mehrButtons = screen.getAllByRole('button', { name: /mehr/i });
    fireEvent.click(mehrButtons[1]);
    expect(sessionStorage.getItem('recipebook_active_sort')).toBe('newest');
  });
});
