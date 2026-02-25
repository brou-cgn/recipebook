import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  describe('Bring! integration', () => {
    let windowOpenSpy;
    let fetchSpy;

    beforeEach(() => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ exportId: 'test-export-id' }),
      });
      windowOpenSpy = jest.spyOn(window, 'open').mockImplementation(() => {});
    });

    afterEach(() => {
      fetchSpy.mockRestore();
      windowOpenSpy.mockRestore();
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

    test('opens Bring! deeplink with existing shareId', async () => {
      render(
        <ShoppingListModal
          items={mockItems}
          title="Test Rezept"
          onClose={mockOnClose}
          shareId="test-share-id-123"
        />
      );

      const bringBtn = screen.getByTitle('Einkaufsliste an Bring! übergeben');
      fireEvent.click(bringBtn);

      await waitFor(() => {
        expect(windowOpenSpy).toHaveBeenCalledTimes(1);
        const calledUrl = windowOpenSpy.mock.calls[0][0];
        expect(calledUrl).toContain('api.getbring.com/rest/bringrecipes/deeplink');
        expect(calledUrl).toContain('test-share-id-123');
        expect(calledUrl).toContain('source=web');
      });
    });

    test('POSTs all unchecked items to /bring-export and uses exportId in URL', async () => {
      render(
        <ShoppingListModal
          items={mockItems}
          title="Test Rezept"
          onClose={mockOnClose}
          shareId="test-share-id-123"
        />
      );

      const bringBtn = screen.getByTitle('Einkaufsliste an Bring! übergeben');
      fireEvent.click(bringBtn);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith('/bring-export', expect.objectContaining({
          method: 'POST',
        }));
        const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
        expect(body.items).toEqual(mockItems);
        const calledUrl = windowOpenSpy.mock.calls[0][0];
        const exportUrl = decodeURIComponent(calledUrl.split('url=')[1].split('&source=')[0]);
        expect(exportUrl).toContain('exportId=test-export-id');
        expect(exportUrl).not.toContain('items=');
      });
    });

    test('excludes checked (done) items from POST body', async () => {
      render(
        <ShoppingListModal
          items={mockItems}
          title="Test Rezept"
          onClose={mockOnClose}
          shareId="test-share-id-123"
        />
      );

      // Mark the first item as done
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);

      const bringBtn = screen.getByTitle('Einkaufsliste an Bring! übergeben');
      fireEvent.click(bringBtn);

      await waitFor(() => {
        const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
        // First item (200g Mehl) is checked, so only the other two should appear
        expect(body.items).toEqual(['3 Eier', '100ml Milch']);
      });
    });

    test('calls onEnableSharing and opens Bring! deeplink when no shareId', async () => {
      const mockEnableSharing = jest.fn().mockResolvedValue('new-share-id-456');

      render(
        <ShoppingListModal
          items={mockItems}
          title="Test Rezept"
          onClose={mockOnClose}
          onEnableSharing={mockEnableSharing}
        />
      );

      const bringBtn = screen.getByTitle('Einkaufsliste an Bring! übergeben');
      fireEvent.click(bringBtn);

      await waitFor(() => {
        expect(mockEnableSharing).toHaveBeenCalledTimes(1);
        expect(windowOpenSpy).toHaveBeenCalledTimes(1);
        const calledUrl = windowOpenSpy.mock.calls[0][0];
        expect(calledUrl).toContain('api.getbring.com/rest/bringrecipes/deeplink');
        expect(calledUrl).toContain('new-share-id-456');
      });
    });
  });
});
