import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import MobileSearchOverlay from './MobileSearchOverlay';

// Use the real fuzzyFilter – it handles empty queries correctly
// Only mock side-effectful modules
jest.mock('../utils/userFavorites', () => ({
  getUserFavorites: () => Promise.resolve([]),
}));

jest.mock('../utils/customLists', () => ({
  expandCuisineSelection: (selected) => selected,
}));

function renderOverlay(props = {}) {
  const defaults = {
    isOpen: true,
    onClose: jest.fn(),
    recipes: [],
    onSelectRecipe: jest.fn(),
    onSearch: jest.fn(),
    currentUser: null,
    showFavoritesOnly: false,
    onFavoritesToggle: jest.fn(),
    cuisineTypes: [],
    cuisineGroups: [],
    onCuisineFilterChange: jest.fn(),
  };
  return render(<MobileSearchOverlay {...defaults} {...props} />);
}

beforeEach(() => {
  localStorage.clear();
});

describe('MobileSearchOverlay – cuisine pill dynamic expansion', () => {
  const cuisineTypes = [
    'Italienisch', 'Asiatisch', 'Deutsch', 'Mexikanisch', 'Französisch',
    'Spanisch', 'Griechisch',
  ];

  // 7 recipes – each belongs to one cuisine type
  const recipes = cuisineTypes.map((ct, i) => ({
    id: String(i + 1),
    title: `Rezept ${ct}`,
    kulinarik: [ct],
  }));

  test('shows top 5 cuisine type pills when no search term is active', () => {
    renderOverlay({ recipes, cuisineTypes });

    // All cuisines have 1 recipe each → no usage data → first 5 from list are shown
    // Buttons with "filtern" in their title attribute = cuisine pills
    const pills = screen.getAllByTitle(/Nach .+ filtern/);
    expect(pills).toHaveLength(5);
  });

  test('supplements pills from the full list when search reduces visible count below 5', async () => {
    // Use custom type names so we can control which ones match the search term precisely.
    // Top-5: Alpha, Beta, Gamma, Delta, Epsilon (these all have 1 recipe each)
    // Non-top-5: Omega, Zeta (also 1 recipe each but outside the initial top-5)
    // Search "a" → matches Alpha, Gamma, Delta from top-5 (3 matches) + Omega, Zeta from non-top-5
    // Since 3 < MAX(5), we expect supplements: Omega and Zeta should appear
    const types = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Omega', 'Zeta'];
    const testRecipes = types.map((ct, i) => ({
      id: String(i + 1),
      title: `Rezept ${ct}`,
      kulinarik: [ct],
    }));

    renderOverlay({ recipes: testRecipes, cuisineTypes: types });

    const input = screen.getByRole('searchbox');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'a' } });
      await new Promise((r) => setTimeout(r, 250));
    });

    // "a" matches: Alpha ✓, Beta (no 'a'? b-e-t-a → yes!), Gamma ✓, Delta ✓, Epsilon (no), Omega ✓, Zeta ✓
    // Actually Beta contains 'a' too (b-e-t-a). Let's verify:
    // Top-5 matches: Alpha, Beta, Gamma, Delta → 4 matches (Epsilon has no 'a')
    // 4 < 5 → supplement needed with 1 more
    // Non-top-5 matching 'a': Omega (o-m-e-g-a → yes), Zeta (z-e-t-a → yes)
    // supplement = slice(0, 5-4=1) = [Omega] (first alphabetically from sorted non-top-5)
    await waitFor(() => {
      // Top-5 matching pills should all be present
      expect(screen.queryByTitle('Nach Alpha filtern')).toBeInTheDocument();
      expect(screen.queryByTitle('Nach Beta filtern')).toBeInTheDocument();
      expect(screen.queryByTitle('Nach Gamma filtern')).toBeInTheDocument();
      expect(screen.queryByTitle('Nach Delta filtern')).toBeInTheDocument();
      // At least one supplement from non-top-5 should appear
      const omegaOrZeta =
        screen.queryByTitle('Nach Omega filtern') || screen.queryByTitle('Nach Zeta filtern');
      expect(omegaOrZeta).toBeInTheDocument();
    });
  });

  test('does not exceed MAX_CUISINE_TYPE_PILLS (5) when many types match', async () => {
    const manyTypes = ['Aaaa', 'Aabb', 'Aacc', 'Aadd', 'Aaee', 'Aaff', 'Aagg', 'Aahh'];
    const manyRecipes = manyTypes.map((ct, i) => ({
      id: String(i),
      title: `Rezept ${ct}`,
      kulinarik: [ct],
    }));

    renderOverlay({ recipes: manyRecipes, cuisineTypes: manyTypes });

    const input = screen.getByRole('searchbox');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'aa' } });
      await new Promise((r) => setTimeout(r, 250));
    });

    await waitFor(() => {
      // all 8 types match "aa", but only 5 should appear (MAX_CUISINE_TYPE_PILLS)
      const pills = screen.getAllByTitle(/Nach .+ filtern/);
      expect(pills.length).toBeLessThanOrEqual(5);
    });
  });

  test('shows supplemental pill that is not in the top-5 but matches the search term', async () => {
    // TypeF has 3 recipes → highest recipe count → it would normally be in top-5
    // but because A-E all have 1 recipe, all are sorted equally and F ends up 6th (or any position)
    // We use a type "Seltenertyp" that definitely is outside top-5 but matches a specific query
    const types = ['TypeA', 'TypeB', 'TypeC', 'TypeD', 'TypeE', 'Seltenertyp'];
    const recipesForTest = [
      ...['TypeA', 'TypeB', 'TypeC', 'TypeD', 'TypeE'].map((ct, i) => ({
        id: String(i + 1),
        title: `Rezept ${ct}`,
        kulinarik: [ct],
      })),
      { id: '6', title: 'Seltenes Rezept', kulinarik: ['Seltenertyp'] },
    ];

    renderOverlay({ recipes: recipesForTest, cuisineTypes: types });

    const input = screen.getByRole('searchbox');

    // "seltener" matches only "Seltenertyp" (which is outside top-5)
    await act(async () => {
      fireEvent.change(input, { target: { value: 'seltener' } });
      await new Promise((r) => setTimeout(r, 250));
    });

    await waitFor(() => {
      // Seltenertyp should appear even though it is not in the initial top-5
      expect(screen.queryByTitle('Nach Seltenertyp filtern')).toBeInTheDocument();
    });
  });
});
