import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ShoppingListModal from './ShoppingListModal';

// Mock the shoppingListFirestore utility
jest.mock('../utils/shoppingListFirestore', () => ({
  createSharedShoppingList: jest.fn(),
}));

import { createSharedShoppingList } from '../utils/shoppingListFirestore';

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

  describe('Bring! integration', () => {
    let windowOpenSpy;

    beforeEach(() => {
      windowOpenSpy = jest.spyOn(window, 'open').mockImplementation(() => {});
      createSharedShoppingList.mockResolvedValue('generated-share-id-789');
    });

    afterEach(() => {
      windowOpenSpy.mockRestore();
      createSharedShoppingList.mockReset();
    });

    test('renders Bring! button', () => {
      render(<ShoppingListModal items={mockItems} title="Test" onClose={mockOnClose} />);
      expect(screen.getByTitle('Einkaufsliste an Bring! übergeben')).toBeInTheDocument();
    });

    test('Bring! button is disabled when there are no items', () => {
      render(<ShoppingListModal items={[]} title="Test" onClose={mockOnClose} />);
      const bringBtn = screen.getByTitle('Einkaufsliste an Bring! übergeben');
      expect(bringBtn).toBeDisabled();
    });

    test('creates shared shopping list and opens Bring! deeplink', async () => {
      render(
        <ShoppingListModal
          items={mockItems}
          title="Test Rezept"
          onClose={mockOnClose}
        />
      );

      const bringBtn = screen.getByTitle('Einkaufsliste an Bring! übergeben');
      fireEvent.click(bringBtn);

      await waitFor(() => {
        expect(createSharedShoppingList).toHaveBeenCalledTimes(1);
        expect(createSharedShoppingList).toHaveBeenCalledWith('Test Rezept', mockItems);
        expect(windowOpenSpy).toHaveBeenCalledTimes(1);
        const calledUrl = windowOpenSpy.mock.calls[0][0];
        expect(calledUrl).toContain('api.getbring.com/rest/bringrecipes/deeplink');
        expect(calledUrl).toContain('generated-share-id-789');
        expect(calledUrl).toContain('source=web');
      });
    });

    test('shows alert when createSharedShoppingList fails', async () => {
      createSharedShoppingList.mockRejectedValue(new Error('Firestore error'));
      const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});

      render(
        <ShoppingListModal
          items={mockItems}
          title="Test Rezept"
          onClose={mockOnClose}
        />
      );

      const bringBtn = screen.getByTitle('Einkaufsliste an Bring! übergeben');
      fireEvent.click(bringBtn);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Fehler beim Exportieren zu Bring!. Bitte versuchen Sie es erneut.'
        );
        expect(windowOpenSpy).not.toHaveBeenCalled();
      });

      alertSpy.mockRestore();
    });
  });
});
