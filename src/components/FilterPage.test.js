import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterPage from './FilterPage';

describe('FilterPage', () => {
  const mockOnApply = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders filter page with all options', () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
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

  test('initializes with current filter values', () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'yes' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />
    );

    const yesRadio = screen.getByDisplayValue('yes');
    expect(yesRadio).toBeChecked();
  });

  test('allows selecting different draft filter options', () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />
    );

    const noRadio = screen.getByDisplayValue('no');
    fireEvent.click(noRadio);
    expect(noRadio).toBeChecked();
  });

  test('clears filters when "Filter löschen" is clicked', () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'yes' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />
    );

    const clearButton = screen.getByText('Filter löschen');
    fireEvent.click(clearButton);

    const allRadio = screen.getByDisplayValue('all');
    expect(allRadio).toBeChecked();
  });

  test('calls onApply with selected filters when "Anwenden" is clicked', () => {
    render(
      <FilterPage
        currentFilters={{ showDrafts: 'all' }}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />
    );

    // Select "Nur Entwürfe"
    const yesRadio = screen.getByDisplayValue('yes');
    fireEvent.click(yesRadio);

    // Click apply button
    const applyButton = screen.getByText('Anwenden');
    fireEvent.click(applyButton);

    expect(mockOnApply).toHaveBeenCalledWith({
      showDrafts: 'yes'
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
      showDrafts: 'all'
    });
  });
});
