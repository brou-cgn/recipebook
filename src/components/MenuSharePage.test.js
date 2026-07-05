import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { NutritionReferenceProvider } from '../contexts/NutritionReferenceContext';
import MenuSharePage from './MenuSharePage';

// MockRecipeDetail calls useNutritionReference — reproduces the real component's
// context dependency. Without a NutritionReferenceProvider in the tree this
// would throw: "useNutritionReference muss innerhalb eines NutritionReferenceProvider
// verwendet werden".
jest.mock('./RecipeDetail', () => {
  const React = require('react');
  const { useNutritionReference } = require('../contexts/NutritionReferenceContext');
  return function MockRecipeDetail({ recipe }) {
    const { rows } = useNutritionReference();
    return (
      <div data-testid="recipe-detail">
        {recipe?.title} rows:{rows.length}
      </div>
    );
  };
});

jest.mock('./MenuDetail', () => function MockMenuDetail({ menu, onSelectRecipe }) {
  return (
    <div data-testid="menu-detail">
      {menu?.title}
      {menu?.sections?.map((s) =>
        s.recipeIds?.map((id) => (
          <button key={id} data-testid={`select-recipe-${id}`} onClick={() => onSelectRecipe({ id, title: `Recipe ${id}` })}>
            Select {id}
          </button>
        ))
      )}
    </div>
  );
});

const mockGetMenuByShareId = jest.fn();
const mockGetRecipesByIds = jest.fn();

jest.mock('../utils/menuFirestore', () => ({
  getMenuByShareId: (...args) => mockGetMenuByShareId(...args),
}));

jest.mock('../utils/recipeFirestore', () => ({
  getRecipesByIds: (...args) => mockGetRecipesByIds(...args),
}));

// Firestore stubs required by NutritionReferenceProvider — use top-level
// variables so beforeEach can configure return values (same pattern as
// NutritionReferenceContext.test.js).
const mockGetDocs = jest.fn();
const mockGetDoc = jest.fn();

jest.mock('../firebase', () => ({ db: {} }));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => 'nutritionReferences-collection'),
  getDocs: (...args) => mockGetDocs(...args),
  doc: jest.fn(() => 'appConfig/nutritionReferences'),
  getDoc: (...args) => mockGetDoc(...args),
}));

function renderWithProvider(ui) {
  return render(<NutritionReferenceProvider>{ui}</NutritionReferenceProvider>);
}

describe('MenuSharePage', () => {
  beforeEach(() => {
    mockGetMenuByShareId.mockReset();
    mockGetRecipesByIds.mockReset();
    mockGetDocs.mockResolvedValue({ docs: [] });
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => null });
  });

  test('renders MenuDetail when menu is found', async () => {
    mockGetMenuByShareId.mockResolvedValue({
      id: 'menu-1',
      title: 'Shared Menu',
      sections: [{ recipeIds: ['r1', 'r2'] }],
    });
    mockGetRecipesByIds.mockResolvedValue([
      { id: 'r1', title: 'Recipe One' },
      { id: 'r2', title: 'Recipe Two' },
    ]);

    await act(async () => {
      renderWithProvider(
        <MenuSharePage shareId="menu-share-abc" currentUser={null} onClose={() => {}} />
      );
    });

    expect(screen.getByTestId('menu-detail')).toBeInTheDocument();
    expect(screen.getByText('Shared Menu')).toBeInTheDocument();
  });

  test('renders RecipeDetail inside NutritionReferenceProvider without context crash when a recipe is selected', async () => {
    mockGetMenuByShareId.mockResolvedValue({
      id: 'menu-1',
      title: 'Shared Menu',
      sections: [{ recipeIds: ['r1'] }],
    });
    mockGetRecipesByIds.mockResolvedValue([{ id: 'r1', title: 'Recipe One' }]);

    await act(async () => {
      renderWithProvider(
        <MenuSharePage shareId="menu-share-abc" currentUser={null} onClose={() => {}} />
      );
    });

    expect(screen.getByTestId('menu-detail')).toBeInTheDocument();

    // Select a recipe — this triggers rendering of RecipeDetail which calls
    // useNutritionReference(). Without the provider this would throw.
    await act(async () => {
      screen.getByTestId('select-recipe-r1').click();
    });

    expect(screen.getByTestId('recipe-detail')).toBeInTheDocument();
    // MockMenuDetail passes { id, title: `Recipe ${id}` }, so title is "Recipe r1"
    expect(screen.getByText(/Recipe r1/)).toBeInTheDocument();
  });

  test('shows loading state while fetching menu', () => {
    mockGetMenuByShareId.mockImplementation(() => new Promise(() => {}));

    renderWithProvider(
      <MenuSharePage shareId="menu-share-abc" currentUser={null} onClose={() => {}} />
    );

    expect(screen.getByText('Menü wird geladen\u2026')).toBeInTheDocument();
  });

  test('shows not-found message when share link is invalid', async () => {
    mockGetMenuByShareId.mockResolvedValue(null);

    await act(async () => {
      renderWithProvider(
        <MenuSharePage shareId="unknown-menu-id" currentUser={null} onClose={() => {}} />
      );
    });

    expect(screen.getByText('Menü nicht gefunden')).toBeInTheDocument();
    expect(
      screen.getByText(/Dieser Share-Link ist ungültig/)
    ).toBeInTheDocument();
  });
});
