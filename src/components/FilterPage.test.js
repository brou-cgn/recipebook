import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterPage from './FilterPage';

// Mock the custom lists utility
jest.mock('../utils/customLists', () => ({
  getCustomLists: () => Promise.resolve({
    cuisineTypes: ['Italienisch', 'Asiatisch', 'Deutsch']
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
      selectedAuthors: [],
      selectedGroup: ''
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
      selectedAuthors: [],
      selectedGroup: ''
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
      expect(screen.getByText('Italienisch')).toBeInTheDocument();
      expect(screen.getByText('Asiatisch')).toBeInTheDocument();
      expect(screen.getByText('Deutsch')).toBeInTheDocument();
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
      expect(screen.getByText('Asiatisch')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox', { name: 'Asiatisch' });
    fireEvent.click(checkbox);

    // Apply filters
    fireEvent.click(screen.getByText('Anwenden'));

    expect(mockOnApply).toHaveBeenCalledWith({
      showDrafts: 'all',
      selectedCuisines: ['Asiatisch'],
      selectedAuthors: [],
      selectedGroup: ''
    });
  });

  test('initializes selectedCuisines from currentFilters', async () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all', selectedCuisines: ['Deutsch'], selectedAuthors: [] }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Deutsch')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox', { name: 'Deutsch' });
    expect(checkbox.checked).toBe(true);
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

    const checkbox = screen.getByRole('checkbox', { name: 'Anna Müller' });
    fireEvent.click(checkbox);

    fireEvent.click(screen.getByText('Anwenden'));

    expect(mockOnApply).toHaveBeenCalledWith({
      showDrafts: 'all',
      selectedCuisines: [],
      selectedAuthors: ['user-1'],
      selectedGroup: ''
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

    const checkbox = screen.getByRole('checkbox', { name: 'Ben Schmidt' });
    expect(checkbox.checked).toBe(true);
  });

  test('clears cuisine and author selections when "Filter löschen" is clicked', async () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'yes', selectedCuisines: ['Italienisch'], selectedAuthors: ['user-1'] }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
        availableAuthors={mockAuthors}
        isAdmin={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Italienisch')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Filter löschen'));

    // Draft filter reset
    const statusSelect = screen.getByDisplayValue('Alle Rezepte');
    expect(statusSelect.value).toBe('all');

    // Author checkbox has no selection
    const authorCheckbox = screen.getByRole('checkbox', { name: 'Anna Müller' });
    expect(authorCheckbox.checked).toBe(false);

    // Apply and verify all empty
    fireEvent.click(screen.getByText('Anwenden'));
    expect(mockOnApply).toHaveBeenCalledWith({
      showDrafts: 'all',
      selectedCuisines: [],
      selectedAuthors: [],
      selectedGroup: ''
    });
  });

  test('renders private group (Private Liste) filter when privateGroups are provided', () => {
    const privateGroups = [
      { id: 'group-1', name: 'Familie', type: 'private' },
      { id: 'group-2', name: 'Freunde', type: 'private' }
    ];

    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
        privateGroups={privateGroups}
      />
    );

    expect(screen.getByText('Private Liste')).toBeInTheDocument();
    expect(screen.getByText('Alle Listen')).toBeInTheDocument();
    expect(screen.getByText('Familie')).toBeInTheDocument();
    expect(screen.getByText('Freunde')).toBeInTheDocument();
  });

  test('does not render Private Liste filter when no privateGroups are provided', () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.queryByText('Private Liste')).not.toBeInTheDocument();
  });

  test('Private Liste filter is placed at the top of the filter page', async () => {
    const privateGroups = [{ id: 'group-1', name: 'Familie', type: 'private' }];

    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
        privateGroups={privateGroups}
        isAdmin={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Kulinarik')).toBeInTheDocument();
    });

    const sections = screen.getAllByRole('heading', { level: 3 });
    expect(sections[0].textContent).toBe('Private Liste');
  });

  test('selecting a private group includes it in applied filters', () => {
    const privateGroups = [
      { id: 'group-1', name: 'Familie', type: 'private' },
      { id: 'group-2', name: 'Freunde', type: 'private' }
    ];

    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
        privateGroups={privateGroups}
      />
    );

    const select = screen.getByRole('combobox', { name: /private liste/i });
    fireEvent.change(select, { target: { value: 'group-1' } });

    fireEvent.click(screen.getByText('Anwenden'));

    expect(mockOnApply).toHaveBeenCalledWith({
      showDrafts: 'all',
      selectedCuisines: [],
      selectedAuthors: [],
      selectedGroup: 'group-1'
    });
  });

  test('initializes selectedGroup from currentFilters', () => {
    const privateGroups = [
      { id: 'group-1', name: 'Familie', type: 'private' }
    ];

    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all', selectedGroup: 'group-1' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
        privateGroups={privateGroups}
      />
    );

    const select = screen.getByRole('combobox', { name: /private liste/i });
    expect(select.value).toBe('group-1');
  });

  test('clears selectedGroup when "Filter löschen" is clicked', () => {
    const privateGroups = [
      { id: 'group-1', name: 'Familie', type: 'private' }
    ];

    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all', selectedGroup: 'group-1' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
        privateGroups={privateGroups}
      />
    );

    fireEvent.click(screen.getByText('Filter löschen'));

    const select = screen.getByRole('combobox', { name: /private liste/i });
    expect(select.value).toBe('');
  });
});
