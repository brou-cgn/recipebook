import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RecipeTypeahead from './RecipeTypeahead';

// Mock fuzzyFilter
jest.mock('../utils/fuzzySearch', () => ({
  fuzzyFilter: (items, query, getSearchString) => {
    if (!query) return items;
    return items.filter(item => 
      getSearchString(item).toLowerCase().includes(query.toLowerCase())
    );
  }
}));

describe('RecipeTypeahead', () => {
  const mockRecipes = [
    { id: '1', title: 'Tomatensoße', speisekategorie: ['Sauce'], image: 'image1.jpg' },
    { id: '2', title: 'Pizzateig', speisekategorie: ['Grundrezept'], image: null },
    { id: '3', title: 'Tomatensuppe', speisekategorie: ['Suppe'] },
  ];

  const mockOnSelect = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders with search input', () => {
    render(
      <RecipeTypeahead
        recipes={mockRecipes}
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
        inputValue="#"
      />
    );

    expect(screen.getByPlaceholderText('Rezept suchen...')).toBeInTheDocument();
  });

  test('displays all recipes when no search query', () => {
    render(
      <RecipeTypeahead
        recipes={mockRecipes}
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
        inputValue="#"
      />
    );

    expect(screen.getByText('Tomatensoße')).toBeInTheDocument();
    expect(screen.getByText('Pizzateig')).toBeInTheDocument();
    expect(screen.getByText('Tomatensuppe')).toBeInTheDocument();
  });

  test('filters recipes based on search query', () => {
    render(
      <RecipeTypeahead
        recipes={mockRecipes}
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
        inputValue="#tomate"
      />
    );

    expect(screen.getByText('Tomatensoße')).toBeInTheDocument();
    expect(screen.getByText('Tomatensuppe')).toBeInTheDocument();
    expect(screen.queryByText('Pizzateig')).not.toBeInTheDocument();
  });

  test('calls onSelect when recipe is clicked', () => {
    render(
      <RecipeTypeahead
        recipes={mockRecipes}
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
        inputValue="#"
      />
    );

    fireEvent.click(screen.getByText('Tomatensoße'));
    expect(mockOnSelect).toHaveBeenCalledWith(mockRecipes[0]);
  });

  test('calls onCancel when close button is clicked', () => {
    render(
      <RecipeTypeahead
        recipes={mockRecipes}
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
        inputValue="#"
      />
    );

    const closeButton = screen.getByText('✕');
    fireEvent.click(closeButton);
    expect(mockOnCancel).toHaveBeenCalled();
  });

  test('calls onCancel when overlay is clicked', () => {
    render(
      <RecipeTypeahead
        recipes={mockRecipes}
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
        inputValue="#"
      />
    );

    const overlay = document.querySelector('.recipe-typeahead-overlay');
    fireEvent.click(overlay);
    expect(mockOnCancel).toHaveBeenCalled();
  });

  test('displays recipe images when available', () => {
    render(
      <RecipeTypeahead
        recipes={mockRecipes}
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
        inputValue="#"
      />
    );

    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', 'image1.jpg');
  });

  test('displays category information', () => {
    render(
      <RecipeTypeahead
        recipes={mockRecipes}
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
        inputValue="#"
      />
    );

    expect(screen.getByText('Sauce')).toBeInTheDocument();
    expect(screen.getByText('Grundrezept')).toBeInTheDocument();
  });

  test('shows empty state when no recipes match', () => {
    render(
      <RecipeTypeahead
        recipes={mockRecipes}
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
        inputValue="#xyz"
      />
    );

    expect(screen.getByText('Keine Rezepte gefunden')).toBeInTheDocument();
  });

  test('handles keyboard navigation with ArrowDown', () => {
    render(
      <RecipeTypeahead
        recipes={mockRecipes}
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
        inputValue="#"
      />
    );

    const input = screen.getByPlaceholderText('Rezept suchen...');
    
    // First item should be selected by default
    let selectedItem = document.querySelector('.recipe-typeahead-item.selected');
    expect(selectedItem.textContent).toContain('Tomatensoße');

    // Press ArrowDown
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    selectedItem = document.querySelector('.recipe-typeahead-item.selected');
    expect(selectedItem.textContent).toContain('Pizzateig');
  });

  test('handles Enter key to select recipe', () => {
    render(
      <RecipeTypeahead
        recipes={mockRecipes}
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
        inputValue="#"
      />
    );

    const input = screen.getByPlaceholderText('Rezept suchen...');
    fireEvent.keyDown(input, { key: 'Enter' });
    
    expect(mockOnSelect).toHaveBeenCalledWith(mockRecipes[0]);
  });

  test('handles Escape key to cancel', () => {
    render(
      <RecipeTypeahead
        recipes={mockRecipes}
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
        inputValue="#"
      />
    );

    const input = screen.getByPlaceholderText('Rezept suchen...');
    fireEvent.keyDown(input, { key: 'Escape' });
    
    expect(mockOnCancel).toHaveBeenCalled();
  });
});
