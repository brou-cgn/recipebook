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

describe('MobileSearchOverlay – author pills filtered by search term', () => {
  const mockAuthors = [
    { id: 'u1', name: 'Alice' },
    { id: 'u2', name: 'Bob' },
    { id: 'u3', name: 'Charlie' },
  ];

  beforeEach(() => {
    localStorage.clear();
  });

  test('shows all authors when search term is empty', () => {
    renderOverlay({ availableAuthors: mockAuthors, onAuthorFilterChange: jest.fn() });
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  test('filters authors to match the search term', async () => {
    renderOverlay({ availableAuthors: mockAuthors, onAuthorFilterChange: jest.fn() });
    const input = screen.getByRole('searchbox');

    fireEvent.change(input, { target: { value: 'ali' } });

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.queryByText('Bob')).not.toBeInTheDocument();
      expect(screen.queryByText('Charlie')).not.toBeInTheDocument();
    });
  });

  test('author filtering is case-insensitive', async () => {
    renderOverlay({ availableAuthors: mockAuthors, onAuthorFilterChange: jest.fn() });
    const input = screen.getByRole('searchbox');

    fireEvent.change(input, { target: { value: 'BOB' } });

    await waitFor(() => {
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    });
  });

  test('shows no author pills when no author matches the search term', async () => {
    renderOverlay({ availableAuthors: mockAuthors, onAuthorFilterChange: jest.fn() });
    const input = screen.getByRole('searchbox');

    fireEvent.change(input, { target: { value: 'xyz' } });

    await waitFor(() => {
      expect(screen.queryByText('Alice')).not.toBeInTheDocument();
      expect(screen.queryByText('Bob')).not.toBeInTheDocument();
      expect(screen.queryByText('Charlie')).not.toBeInTheDocument();
    });
  });
});

describe('MobileSearchOverlay – active cuisine pills shown leftmost', () => {
  beforeEach(() => {
    localStorage.clear();
    const { expandCuisineSelection } = require('../utils/customLists');
    expandCuisineSelection.mockImplementation((selected) => selected);
  });

  test('active pill moves to the first position after clicking', () => {
    renderOverlay();

    const pills = () =>
      screen.getAllByRole('button', { name: /Küche$/ });

    // Before clicking, get the initial order
    const initialFirstPill = pills()[0];

    // Click the last cuisine pill to make it active
    const lastPill = pills()[pills().length - 1];
    fireEvent.click(lastPill);

    // After clicking, the active pill should now be the first pill
    const updatedPills = pills();
    expect(updatedPills[0]).toHaveClass('active');
    // And the previously first pill (if it wasn't the one we clicked) should no longer be first
    if (initialFirstPill !== lastPill) {
      expect(updatedPills[0]).not.toBe(initialFirstPill);
    }
  });

  test('all active pills are shown before any inactive pills', () => {
    renderOverlay();

    // Select two cuisine pills (not the first one)
    const allPills = screen.getAllByRole('button', { name: /Küche$/ });
    fireEvent.click(allPills[1]);
    fireEvent.click(allPills[2]);

    // After clicking, the first two pills should be active
    const updatedPills = screen.getAllByRole('button', { name: /Küche$/ });
    expect(updatedPills[0]).toHaveClass('active');
    expect(updatedPills[1]).toHaveClass('active');
    // Remaining pills should be inactive
    for (let i = 2; i < updatedPills.length; i++) {
      expect(updatedPills[i]).not.toHaveClass('active');
    }
  });
});
