import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RecipeFilterSidebar from './RecipeFilterSidebar';

const mockRecipes = [
  { id: '1', title: 'Sushi', kulinarik: ['Japanische Küche'], speisekategorie: ['Hauptgericht'] },
  { id: '2', title: 'Pad Thai', kulinarik: ['Thailändische Küche'], speisekategorie: ['Hauptgericht'] },
  { id: '3', title: 'Tiramisu', kulinarik: ['Italienische Küche'], speisekategorie: ['Dessert'] },
];

const mockCuisineTypes = ['Japanische Küche', 'Thailändische Küche', 'Italienische Küche', 'Unbenutzte Küche'];
const mockCuisineGroups = [
  { name: 'Asiatische Küche', children: ['Japanische Küche', 'Thailändische Küche'] },
];
const mockMealCategories = ['Hauptgericht', 'Dessert', 'Ungenutzte Kategorie'];
const mockAuthors = [{ id: 'a1', name: 'Johannes' }, { id: 'a2', name: 'Katrin' }];
const mockPrivateLists = [{ id: 'l1', name: 'Alltagsrezepte' }, { id: 'l2', name: 'Inspirationen' }];
const mockCurrentUser = { id: 'u1' };

function renderSidebar(props = {}) {
  return render(
    <RecipeFilterSidebar
      recipes={mockRecipes}
      currentUser={mockCurrentUser}
      cuisineTypes={mockCuisineTypes}
      cuisineGroups={mockCuisineGroups}
      mealCategories={mockMealCategories}
      availableAuthors={mockAuthors}
      privateLists={mockPrivateLists}
      {...props}
    />
  );
}

describe('RecipeFilterSidebar', () => {
  test('renders favorites and seasonal toggles', () => {
    renderSidebar();
    expect(screen.getByRole('button', { name: /Favoriten/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Saisonal/i })).toBeInTheDocument();
  });

  test('only shows categories/cuisines with at least one matching recipe', () => {
    renderSidebar();
    expect(screen.getByText('Hauptgericht')).toBeInTheDocument();
    expect(screen.getByText('Dessert')).toBeInTheDocument();
    expect(screen.queryByText('Ungenutzte Kategorie')).not.toBeInTheDocument();
    expect(screen.queryByText('Unbenutzte Küche')).not.toBeInTheDocument();
  });

  test('shows cuisine group name alongside its children', () => {
    renderSidebar();
    expect(screen.getByText('Asiatische Küche')).toBeInTheDocument();
    expect(screen.getByText('Japanische Küche')).toBeInTheDocument();
  });

  test('renders author and private list pills', () => {
    renderSidebar();
    expect(screen.getByText('Johannes')).toBeInTheDocument();
    expect(screen.getByText('Katrin')).toBeInTheDocument();
    expect(screen.getByText('Alltagsrezepte')).toBeInTheDocument();
    expect(screen.getByText('Inspirationen')).toBeInTheDocument();
  });

  test('calls onFavoritesToggle when clicking the Favoriten pill', () => {
    const onFavoritesToggle = jest.fn();
    renderSidebar({ onFavoritesToggle });
    fireEvent.click(screen.getByRole('button', { name: /Favoriten/i }));
    expect(onFavoritesToggle).toHaveBeenCalledWith(true);
  });

  test('toggles a cuisine on and off via onCuisineFilterChange', () => {
    const onCuisineFilterChange = jest.fn();
    renderSidebar({ onCuisineFilterChange, selectedCuisines: [] });
    fireEvent.click(screen.getByText('Japanische Küche'));
    expect(onCuisineFilterChange).toHaveBeenCalledWith(['Japanische Küche']);
  });

  test('private list selection is single-select', () => {
    const onPrivateListFilterChange = jest.fn();
    renderSidebar({ onPrivateListFilterChange, selectedPrivateLists: ['l1'] });
    fireEvent.click(screen.getByText('Inspirationen'));
    expect(onPrivateListFilterChange).toHaveBeenCalledWith(['l2']);
  });

  test('hides private list section when showPrivateListFilters is false', () => {
    renderSidebar({ showPrivateListFilters: false });
    expect(screen.queryByText('Alltagsrezepte')).not.toBeInTheDocument();
  });

  test('shows reset button only when filters are active', () => {
    const { rerender } = renderSidebar();
    expect(screen.queryByRole('button', { name: /Filter zurücksetzen/i })).not.toBeInTheDocument();

    rerender(
      <RecipeFilterSidebar
        recipes={mockRecipes}
        currentUser={mockCurrentUser}
        cuisineTypes={mockCuisineTypes}
        cuisineGroups={mockCuisineGroups}
        mealCategories={mockMealCategories}
        availableAuthors={mockAuthors}
        privateLists={mockPrivateLists}
        showFavoritesOnly={true}
      />
    );
    expect(screen.getByRole('button', { name: /Filter zurücksetzen/i })).toBeInTheDocument();
  });

  test('calls onSearchChange when typing in the search input', () => {
    const onSearchChange = jest.fn();
    renderSidebar({ onSearchChange });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Sushi' } });
    expect(onSearchChange).toHaveBeenCalledWith('Sushi');
  });
});

describe('RecipeFilterSidebar top-5 category/cuisine cap', () => {
  const manyRecipes = [
    { id: '1', title: 'A', kulinarik: ['Küche 1'], speisekategorie: ['Kategorie 1'] },
    { id: '2', title: 'B', kulinarik: ['Küche 1'], speisekategorie: ['Kategorie 1'] },
    { id: '3', title: 'C', kulinarik: ['Küche 2'], speisekategorie: ['Kategorie 2'] },
    { id: '4', title: 'D', kulinarik: ['Küche 3'], speisekategorie: ['Kategorie 3'] },
    { id: '5', title: 'E', kulinarik: ['Küche 4'], speisekategorie: ['Kategorie 4'] },
    { id: '6', title: 'F', kulinarik: ['Küche 5'], speisekategorie: ['Kategorie 5'] },
    { id: '7', title: 'G', kulinarik: ['Küche 6'], speisekategorie: ['Kategorie 6'] },
  ];
  const manyCategories = ['Kategorie 1', 'Kategorie 2', 'Kategorie 3', 'Kategorie 4', 'Kategorie 5', 'Kategorie 6'];
  const manyCuisines = ['Küche 1', 'Küche 2', 'Küche 3', 'Küche 4', 'Küche 5', 'Küche 6'];

  function renderManySidebar(props = {}) {
    return render(
      <RecipeFilterSidebar
        recipes={manyRecipes}
        mealCategories={manyCategories}
        cuisineTypes={manyCuisines}
        {...props}
      />
    );
  }

  test('shows only the top 5 categories and cuisines by recipe count, most-used first', () => {
    renderManySidebar();
    expect(screen.getByText('Kategorie 1')).toBeInTheDocument();
    expect(screen.getByText('Kategorie 5')).toBeInTheDocument();
    expect(screen.queryByText('Kategorie 6')).not.toBeInTheDocument();
    expect(screen.getByText('Küche 1')).toBeInTheDocument();
    expect(screen.getByText('Küche 5')).toBeInTheDocument();
    expect(screen.queryByText('Küche 6')).not.toBeInTheDocument();
  });

  test('expands to show all categories via the "+" pill, then collapses again via "-"', () => {
    renderManySidebar();
    fireEvent.click(screen.getByRole('button', { name: /weitere Kategorien anzeigen/i }));
    expect(screen.getByText('Kategorie 6')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Weniger Kategorien anzeigen/i }));
    expect(screen.queryByText('Kategorie 6')).not.toBeInTheDocument();
  });

  test('expands to show all cuisines via the "+" pill, then collapses again via "-"', () => {
    renderManySidebar();
    fireEvent.click(screen.getByRole('button', { name: /weitere Kulinariktypen anzeigen/i }));
    expect(screen.getByText('Küche 6')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Weniger Kulinariktypen anzeigen/i }));
    expect(screen.queryByText('Küche 6')).not.toBeInTheDocument();
  });

  test('does not cap results while a search term is active', () => {
    renderManySidebar({ searchTerm: 'Kategorie' });
    expect(screen.getByText('Kategorie 6')).toBeInTheDocument();
  });
});
