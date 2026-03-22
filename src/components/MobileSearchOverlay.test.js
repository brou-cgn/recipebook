import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MobileSearchOverlay from './MobileSearchOverlay';

jest.mock('../utils/userFavorites', () => ({
  getUserFavorites: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../utils/customLists', () => ({
  expandCuisineSelection: jest.fn((selected) => selected),
}));

const mockRecipes = [
  { id: '1', title: 'Sushi', kulinarik: ['Japanische Küche'] },
  { id: '2', title: 'Pad Thai', kulinarik: ['Thailändische Küche'] },
  { id: '3', title: 'Pizza', kulinarik: ['Italienische Küche'] },
];

const mockCuisineTypes = ['Japanische Küche', 'Thailändische Küche', 'Italienische Küche'];

const mockCuisineGroups = [
  { name: 'Asiatische Küche', children: ['Japanische Küche', 'Thailändische Küche'] },
  { name: 'Europäische Küche', children: ['Italienische Küche'] },
];

function renderOverlay(props = {}) {
  return render(
    <MobileSearchOverlay
      isOpen={true}
      onClose={jest.fn()}
      recipes={mockRecipes}
      onSelectRecipe={jest.fn()}
      onSearch={jest.fn()}
      currentUser={null}
      cuisineTypes={mockCuisineTypes}
      cuisineGroups={mockCuisineGroups}
      onCuisineFilterChange={jest.fn()}
      {...props}
    />
  );
}

describe('MobileSearchOverlay – cuisine group children in search', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('shows cuisine group pills when search matches group name', async () => {
    renderOverlay();
    const input = screen.getByRole('searchbox');

    fireEvent.change(input, { target: { value: 'Asia' } });

    await waitFor(() => {
      expect(screen.getByText('Asiatische Küche')).toBeInTheDocument();
    });
  });

  test('also shows child cuisine types when parent group matches the search', async () => {
    renderOverlay();
    const input = screen.getByRole('searchbox');

    fireEvent.change(input, { target: { value: 'Asia' } });

    await waitFor(() => {
      expect(screen.getByText('Asiatische Küche')).toBeInTheDocument();
      expect(screen.getByText('Japanische Küche')).toBeInTheDocument();
      expect(screen.getByText('Thailändische Küche')).toBeInTheDocument();
    });
  });

  test('does not show unrelated group children when another group matches', async () => {
    renderOverlay();
    const input = screen.getByRole('searchbox');

    fireEvent.change(input, { target: { value: 'Asia' } });

    await waitFor(() => {
      expect(screen.queryByText('Europäische Küche')).not.toBeInTheDocument();
      expect(screen.queryByText('Italienische Küche')).not.toBeInTheDocument();
    });
  });

  test('shows all group pills without filtering when search term is empty', () => {
    renderOverlay();
    // With no search term, all group names should be visible
    expect(screen.getByText('Asiatische Küche')).toBeInTheDocument();
    expect(screen.getByText('Europäische Küche')).toBeInTheDocument();
  });
});

describe('MobileSearchOverlay – dynamic cuisine type expansion on search', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('adds extra matching cuisine types when search reduces visible count below max', async () => {
    // 7 cuisine types, each with at least 1 recipe. Only the top 5 appear by default.
    // When user types "isch", only some of the top-5 match, so the remainder should
    // be filled from the full sorted list.
    const extendedCuisineTypes = [
      'Französisch', 'Spanisch', 'Japanisch', 'Mexikanisch', 'Indisch',
      'Griechisch', 'Türkisch',
    ];
    const extendedRecipes = extendedCuisineTypes.map((k, i) => ({
      id: String(i + 1),
      title: `Rezept ${i + 1}`,
      kulinarik: [k],
    }));

    render(
      <MobileSearchOverlay
        isOpen={true}
        onClose={jest.fn()}
        recipes={extendedRecipes}
        onSelectRecipe={jest.fn()}
        onSearch={jest.fn()}
        currentUser={null}
        cuisineTypes={extendedCuisineTypes}
        cuisineGroups={[]}
        onCuisineFilterChange={jest.fn()}
      />
    );

    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'isch' } });

    // All 7 types contain "isch", so up to MAX_CUISINE_TYPE_PILLS (5) should appear
    // even though only a subset are in the initial top-5.
    await waitFor(() => {
      const pills = screen.getAllByRole('button', { name: /isch/i });
      expect(pills.length).toBeGreaterThanOrEqual(5);
    });
  });

  test('does not exceed MAX_CUISINE_TYPE_PILLS from dynamic expansion alone', async () => {
    const extendedCuisineTypes = [
      'Französisch', 'Spanisch', 'Japanisch', 'Mexikanisch', 'Indisch',
      'Griechisch', 'Türkisch',
    ];
    const extendedRecipes = extendedCuisineTypes.map((k, i) => ({
      id: String(i + 1),
      title: `Rezept ${i + 1}`,
      kulinarik: [k],
    }));

    render(
      <MobileSearchOverlay
        isOpen={true}
        onClose={jest.fn()}
        recipes={extendedRecipes}
        onSelectRecipe={jest.fn()}
        onSearch={jest.fn()}
        currentUser={null}
        cuisineTypes={extendedCuisineTypes}
        cuisineGroups={[]}
        onCuisineFilterChange={jest.fn()}
      />
    );

    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'isch' } });

    await waitFor(() => {
      const pills = screen.getAllByRole('button', { name: /isch/i });
      // Exactly 5 cuisine type pills (the cancel button does not match /isch/)
      expect(pills.length).toBe(5);
    });
  });

  test('shows all matching types when fewer than max match the search', async () => {
    // Only 2 cuisine types, both matching the search – both should be shown.
    const fewCuisineTypes = ['Griechisch', 'Türkisch'];
    const fewRecipes = fewCuisineTypes.map((k, i) => ({
      id: String(i + 1),
      title: `Rezept ${i + 1}`,
      kulinarik: [k],
    }));

    render(
      <MobileSearchOverlay
        isOpen={true}
        onClose={jest.fn()}
        recipes={fewRecipes}
        onSelectRecipe={jest.fn()}
        onSearch={jest.fn()}
        currentUser={null}
        cuisineTypes={fewCuisineTypes}
        cuisineGroups={[]}
        onCuisineFilterChange={jest.fn()}
      />
    );

    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'isch' } });

    await waitFor(() => {
      expect(screen.getByText('Griechisch')).toBeInTheDocument();
      expect(screen.getByText('Türkisch')).toBeInTheDocument();
    });
  });

  test('cuisine types without recipes are not added by dynamic expansion', async () => {
    // 'Spanisch' has no recipes → should not appear even though it matches 'isch'
    const types = ['Griechisch', 'Spanisch'];
    const recipesOnlyGreek = [{ id: '1', title: 'Tzatziki', kulinarik: ['Griechisch'] }];

    render(
      <MobileSearchOverlay
        isOpen={true}
        onClose={jest.fn()}
        recipes={recipesOnlyGreek}
        onSelectRecipe={jest.fn()}
        onSearch={jest.fn()}
        currentUser={null}
        cuisineTypes={types}
        cuisineGroups={[]}
        onCuisineFilterChange={jest.fn()}
      />
    );

    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'isch' } });

    await waitFor(() => {
      expect(screen.getByText('Griechisch')).toBeInTheDocument();
      expect(screen.queryByText('Spanisch')).not.toBeInTheDocument();
    });
  });
});

describe('MobileSearchOverlay – cuisine pills stay active when favorites toggled', () => {
  beforeEach(() => {
    localStorage.clear();
    const { expandCuisineSelection } = require('../utils/customLists');
    expandCuisineSelection.mockImplementation((selected) => selected);
  });

  test('cuisine pill remains active after favorites pill is toggled on', () => {
    const onFavoritesToggle = jest.fn();
    renderOverlay({ onFavoritesToggle });

    // Click a cuisine pill to select it
    const cuisinePill = screen.getByText('Japanische Küche');
    fireEvent.click(cuisinePill);
    expect(cuisinePill).toHaveClass('active');

    // Now toggle favorites on
    const favoritesPill = screen.getByText('★ Favoriten');
    fireEvent.click(favoritesPill);
    expect(favoritesPill).toHaveClass('active');

    // Cuisine pill should still be active
    expect(cuisinePill).toHaveClass('active');
  });

  test('multiple cuisine pills remain active after favorites pill is toggled', () => {
    renderOverlay();

    // Select two cuisine pills
    const japanPill = screen.getByText('Japanische Küche');
    const itaPill = screen.getByText('Italienische Küche');
    fireEvent.click(japanPill);
    fireEvent.click(itaPill);
    expect(japanPill).toHaveClass('active');
    expect(itaPill).toHaveClass('active');

    // Toggle favorites
    const favoritesPill = screen.getByText('★ Favoriten');
    fireEvent.click(favoritesPill);

    // Both cuisine pills should still be active
    expect(japanPill).toHaveClass('active');
    expect(itaPill).toHaveClass('active');
  });
});
