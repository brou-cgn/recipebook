import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ShoppingListModal from './ShoppingListModal';

describe('ShoppingListModal', () => {
  const mockItems = ['200g Mehl', '3 Eier', '100ml Milch'];
  const mockOnClose = jest.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
  });

  test('renders with title and items', () => {
    render(<ShoppingListModal items={mockItems} title="Test Rezept" onClose={mockOnClose} />);
    
    expect(screen.getByText('🛒 Einkaufsliste')).toBeInTheDocument();
    expect(screen.getByText('Test Rezept')).toBeInTheDocument();
    expect(screen.getByText('200g Mehl')).toBeInTheDocument();
    expect(screen.getByText('3 Eier')).toBeInTheDocument();
    expect(screen.getByText('100ml Milch')).toBeInTheDocument();
  });

  test('shows item count in footer', () => {
    render(<ShoppingListModal items={mockItems} title="Test" onClose={mockOnClose} />);
    expect(screen.getByText('0 / 3 erledigt')).toBeInTheDocument();
  });

  test('toggles item checked state', () => {
    render(<ShoppingListModal items={mockItems} title="Test" onClose={mockOnClose} />);
    
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(screen.getByText('1 / 3 erledigt')).toBeInTheDocument();
  });

  test('calls onClose when close button is clicked', () => {
    render(<ShoppingListModal items={mockItems} title="Test" onClose={mockOnClose} />);
    
    const closeBtn = screen.getByLabelText('Einkaufsliste schließen');
    fireEvent.click(closeBtn);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test('calls onClose when overlay is clicked', () => {
    render(<ShoppingListModal items={mockItems} title="Test" onClose={mockOnClose} />);
    
    const overlay = document.querySelector('.shopping-list-overlay');
    fireEvent.click(overlay);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test('resets checked items when reset button is clicked', () => {
    render(<ShoppingListModal items={mockItems} title="Test" onClose={mockOnClose} />);
    
    // Check an item first
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(screen.getByText('1 / 3 erledigt')).toBeInTheDocument();
    
    // Reset
    fireEvent.click(screen.getByText('Zurücksetzen'));
    expect(screen.getByText('0 / 3 erledigt')).toBeInTheDocument();
  });

  test('shows empty message when no items', () => {
    render(<ShoppingListModal items={[]} title="Test" onClose={mockOnClose} />);
    expect(screen.getByText('Keine Zutaten vorhanden.')).toBeInTheDocument();
  });
});
