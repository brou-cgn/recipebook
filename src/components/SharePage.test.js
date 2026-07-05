import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { NutritionReferenceProvider } from '../contexts/NutritionReferenceContext';
import SharePage from './SharePage';

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

const mockGetRecipeByShareId = jest.fn();

jest.mock('../utils/recipeFirestore', () => ({
  getRecipeByShareId: (...args) => mockGetRecipeByShareId(...args),
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

describe('SharePage', () => {
  beforeEach(() => {
    mockGetRecipeByShareId.mockReset();
    mockGetDocs.mockResolvedValue({ docs: [] });
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => null });
  });

  test('renders RecipeDetail inside NutritionReferenceProvider without context crash', async () => {
    mockGetRecipeByShareId.mockResolvedValue({
      id: 'recipe-1',
      title: 'Shared Recipe',
      zutaten: [],
    });

    await act(async () => {
      renderWithProvider(
        <SharePage shareId="share-abc" currentUser={null} onClose={() => {}} />
      );
    });

    expect(screen.getByTestId('recipe-detail')).toBeInTheDocument();
    expect(screen.getByText(/Shared Recipe/)).toBeInTheDocument();
  });

  test('shows loading state while fetching recipe', () => {
    // Never resolves — keeps loading state
    mockGetRecipeByShareId.mockImplementation(() => new Promise(() => {}));

    renderWithProvider(
      <SharePage shareId="share-abc" currentUser={null} onClose={() => {}} />
    );

    expect(screen.getByText('Rezept wird geladen\u2026')).toBeInTheDocument();
  });

  test('shows not-found message when share link is invalid', async () => {
    mockGetRecipeByShareId.mockResolvedValue(null);

    await act(async () => {
      renderWithProvider(
        <SharePage shareId="unknown-id" currentUser={null} onClose={() => {}} />
      );
    });

    expect(screen.getByText('Rezept nicht gefunden')).toBeInTheDocument();
    expect(
      screen.getByText(/Dieser Share-Link ist ungültig/)
    ).toBeInTheDocument();
  });
});
