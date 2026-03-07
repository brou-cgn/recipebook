import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import MeineKuechenstarsPage from './MeineKuechenstarsPage';

jest.mock('../utils/recipeCallsFirestore', () => ({
  getRecipeCalls: jest.fn(),
}));

jest.mock('../utils/customLists', () => ({
  getButtonIcons: () => Promise.resolve({}),
  DEFAULT_BUTTON_ICONS: { privateListBack: '✕' },
}));

jest.mock('../utils/imageUtils', () => ({
  isBase64Image: jest.fn().mockReturnValue(false),
}));

const mockCurrentUser = { id: 'user-1' };
const mockRecipes = [
  { id: 'r1', title: 'Pasta Bolognese', authorId: 'user-1' },
  { id: 'r2', title: 'Pizza Margherita', authorId: 'user-1' },
  { id: 'r3', title: 'Tiramisu', authorId: 'user-1' },
  { id: 'r4', title: 'Other User Recipe', authorId: 'user-2' },
];

describe('MeineKuechenstarsPage', () => {
  beforeEach(() => {
    const { getRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecipeCalls.mockResolvedValue([]);
  });

  test('renders the header with title', () => {
    render(
      <MeineKuechenstarsPage
        onBack={() => {}}
        currentUser={mockCurrentUser}
        recipes={[]}
      />
    );
    expect(screen.getByText('Meine Küchenstars')).toBeInTheDocument();
  });

  test('renders close button', () => {
    render(
      <MeineKuechenstarsPage
        onBack={() => {}}
        currentUser={mockCurrentUser}
        recipes={[]}
      />
    );
    expect(screen.getByRole('button', { name: /schließen/i })).toBeInTheDocument();
  });

  test('calls onBack when close button is clicked', () => {
    const handleBack = jest.fn();
    render(
      <MeineKuechenstarsPage
        onBack={handleBack}
        currentUser={mockCurrentUser}
        recipes={[]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /schließen/i }));
    expect(handleBack).toHaveBeenCalled();
  });

  test('shows loading state initially', () => {
    const { getRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecipeCalls.mockImplementation(() => new Promise(() => {}));
    render(
      <MeineKuechenstarsPage
        onBack={() => {}}
        currentUser={mockCurrentUser}
        recipes={mockRecipes}
      />
    );
    expect(screen.getByText('Laden...')).toBeInTheDocument();
  });

  test('shows empty message when no recipe calls exist', async () => {
    const { getRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecipeCalls.mockResolvedValue([]);
    render(
      <MeineKuechenstarsPage
        onBack={() => {}}
        currentUser={mockCurrentUser}
        recipes={mockRecipes}
      />
    );
    expect(await screen.findByText('Noch keine Rezeptaufrufe vorhanden.')).toBeInTheDocument();
  });

  test('shows top recipes sorted by call count', async () => {
    const { getRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecipeCalls.mockResolvedValue([
      { id: 'c1', recipeId: 'r2' },
      { id: 'c2', recipeId: 'r2' },
      { id: 'c3', recipeId: 'r2' },
      { id: 'c4', recipeId: 'r1' },
      { id: 'c5', recipeId: 'r1' },
    ]);
    render(
      <MeineKuechenstarsPage
        onBack={() => {}}
        currentUser={mockCurrentUser}
        recipes={mockRecipes}
      />
    );
    const rows = await screen.findAllByRole('row');
    // rows[0] is the header, rows[1] is rank 1, rows[2] is rank 2
    expect(rows[1]).toHaveTextContent('Pizza Margherita');
    expect(rows[1]).toHaveTextContent('3');
    expect(rows[2]).toHaveTextContent('Pasta Bolognese');
    expect(rows[2]).toHaveTextContent('2');
  });

  test('only shows own recipes, not other users recipes', async () => {
    const { getRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecipeCalls.mockResolvedValue([
      { id: 'c1', recipeId: 'r4' },
      { id: 'c2', recipeId: 'r4' },
    ]);
    render(
      <MeineKuechenstarsPage
        onBack={() => {}}
        currentUser={mockCurrentUser}
        recipes={mockRecipes}
      />
    );
    // r4 belongs to user-2, so it shouldn't appear
    await waitFor(() => {
      expect(screen.queryByText('Other User Recipe')).not.toBeInTheDocument();
    });
  });

  test('limits results to top 20 recipes', async () => {
    const { getRecipeCalls } = require('../utils/recipeCallsFirestore');
    const manyRecipes = Array.from({ length: 25 }, (_, i) => ({
      id: `recipe-${i}`,
      title: `Recipe ${i}`,
      authorId: 'user-1',
    }));
    const calls = manyRecipes.map((r, i) =>
      Array.from({ length: 25 - i }, (_, j) => ({ id: `c${i}-${j}`, recipeId: r.id }))
    ).flat();
    getRecipeCalls.mockResolvedValue(calls);
    render(
      <MeineKuechenstarsPage
        onBack={() => {}}
        currentUser={mockCurrentUser}
        recipes={manyRecipes}
      />
    );
    const rows = await screen.findAllByRole('row');
    // 1 header row + max 20 data rows
    expect(rows.length).toBe(21);
  });
});
