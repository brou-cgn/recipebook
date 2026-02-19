import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterPage from './FilterPage';

// Mock the custom lists utility
jest.mock('../utils/customLists', () => ({
  getCustomLists: () => Promise.resolve({
    mealCategories: ['Vorspeise', 'Hauptspeise', 'Dessert']
  })
}));

describe('FilterPage', () => {
  const mockOnApply = jest.fn();
  const mockOnCancel = jest.fn();

  const mockAuthors = [
    { id: 'user-1', name: 'Anna Müller' },
    { id: 'user-2', name: 'Ben Schmidt' }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders filter page with all options', () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
        isAdmin={true}
      />
    );

    expect(screen.getByText('Filter')).toBeInTheDocument();
    expect(screen.getByText('Rezept-Status')).toBeInTheDocument();
    expect(screen.getByText('Alle Rezepte')).toBeInTheDocument();
    expect(screen.getByText('Nur Entwürfe')).toBeInTheDocument();
    expect(screen.getByText('Keine Entwürfe')).toBeInTheDocument();
    expect(screen.getByText('Filter löschen')).toBeInTheDocument();
    expect(screen.getByText('Anwenden')).toBeInTheDocument();
  });

  test('does not render Rezept-Status filter for non-admins', () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
        isAdmin={false}
      />
    );

    expect(screen.queryByText('Rezept-Status')).not.toBeInTheDocument();
  });

  test('initializes with current filter values', () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'yes' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
        isAdmin={true}
      />
    );

    const select = screen.getByDisplayValue('Nur Entwürfe');
    expect(select.value).toBe('yes');
  });

  test('allows selecting different draft filter options', () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
        isAdmin={true}
      />
    );

    const select = screen.getByDisplayValue('Alle Rezepte');
    fireEvent.change(select, { target: { value: 'no' } });
    expect(select.value).toBe('no');
  });

  test('clears filters when "Filter löschen" is clicked', () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'yes' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
        isAdmin={true}
      />
    );

    const clearButton = screen.getByText('Filter löschen');
    fireEvent.click(clearButton);

    const select = screen.getByDisplayValue('Alle Rezepte');
    expect(select.value).toBe('all');
  });

  test('calls onApply with selected filters when "Anwenden" is clicked', () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
        isAdmin={true}
      />
    );

    const select = screen.getByDisplayValue('Alle Rezepte');
    fireEvent.change(select, { target: { value: 'yes' } });

    // Click apply button
    const applyButton = screen.getByText('Anwenden');
    fireEvent.click(applyButton);

    expect(mockOnApply).toHaveBeenCalledWith({
      showDrafts: 'yes',
      selectedCuisines: [],
      selectedAuthors: []
    });
  });

  test('applies filters with default value when no selection is made', () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />
    );

    const applyButton = screen.getByText('Anwenden');
    fireEvent.click(applyButton);

    expect(mockOnApply).toHaveBeenCalledWith({
      showDrafts: 'all',
      selectedCuisines: [],
      selectedAuthors: []
    });
  });

  test('renders cuisine (Kulinarik) filter section when categories are available', async () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Kulinarik')).toBeInTheDocument();
      expect(screen.getByText('Vorspeise')).toBeInTheDocument();
      expect(screen.getByText('Hauptspeise')).toBeInTheDocument();
      expect(screen.getByText('Dessert')).toBeInTheDocument();
    });
  });

  test('toggles cuisine selection and includes it in applied filters', async () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Hauptspeise')).toBeInTheDocument();
    });

    const select = screen.getByRole('listbox', { name: /kulinarik/i });
    await userEvent.selectOptions(select, ['Hauptspeise']);

    // Apply filters
    fireEvent.click(screen.getByText('Anwenden'));

    expect(mockOnApply).toHaveBeenCalledWith({
      showDrafts: 'all',
      selectedCuisines: ['Hauptspeise'],
      selectedAuthors: []
    });
  });

  test('initializes selectedCuisines from currentFilters', async () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all', selectedCuisines: ['Dessert'], selectedAuthors: [] }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Dessert')).toBeInTheDocument();
    });

    const select = screen.getByRole('listbox', { name: /kulinarik/i });
    const dessertOption = Array.from(select.options).find(o => o.value === 'Dessert');
    expect(dessertOption.selected).toBe(true);
  });

  test('renders author (Autor) filter section when authors are provided', () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
        availableAuthors={mockAuthors}
      />
    );

    expect(screen.getByText('Autor')).toBeInTheDocument();
    expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    expect(screen.getByText('Ben Schmidt')).toBeInTheDocument();
  });

  test('does not render author filter section when no authors are provided', () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.queryByText('Autor')).not.toBeInTheDocument();
  });

  test('toggles author selection and includes it in applied filters', async () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
        availableAuthors={mockAuthors}
      />
    );

    const select = screen.getByRole('listbox', { name: /autor/i });
    await userEvent.selectOptions(select, ['user-1']);

    fireEvent.click(screen.getByText('Anwenden'));

    expect(mockOnApply).toHaveBeenCalledWith({
      showDrafts: 'all',
      selectedCuisines: [],
      selectedAuthors: ['user-1']
    });
  });

  test('initializes selectedAuthors from currentFilters', () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all', selectedCuisines: [], selectedAuthors: ['user-2'] }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
        availableAuthors={mockAuthors}
      />
    );

    const select = screen.getByRole('listbox', { name: /autor/i });
    const benOption = Array.from(select.options).find(o => o.value === 'user-2');
    expect(benOption.selected).toBe(true);
  });

  test('clears cuisine and author selections when "Filter löschen" is clicked', async () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'yes', selectedCuisines: ['Vorspeise'], selectedAuthors: ['user-1'] }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
        availableAuthors={mockAuthors}
        isAdmin={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Vorspeise')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Filter löschen'));

    // Draft filter reset
    const statusSelect = screen.getByDisplayValue('Alle Rezepte');
    expect(statusSelect.value).toBe('all');

    // Author select has no selection
    const authorSelect = screen.getByRole('listbox', { name: /autor/i });
    const anySelected = Array.from(authorSelect.options).some(o => o.selected);
    expect(anySelected).toBe(false);

    // Apply and verify all empty
    fireEvent.click(screen.getByText('Anwenden'));
    expect(mockOnApply).toHaveBeenCalledWith({
      showDrafts: 'all',
      selectedCuisines: [],
      selectedAuthors: []
    });
  });
});
