import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SortCarousel, { SORT_OPTIONS } from './SortCarousel';

// JSDOM does not implement scrollIntoView — provide a no-op mock.
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

describe('SortCarousel', () => {
  test('renders all option labels', () => {
    render(<SortCarousel activeSort="alphabetical" onSortChange={() => {}} />);
    SORT_OPTIONS.forEach(opt => {
      expect(screen.getByText(opt.label)).toBeInTheDocument();
    });
  });

  test('active item has aria-selected=true', () => {
    render(<SortCarousel activeSort="newest" onSortChange={() => {}} />);
    const activeItem = screen.getByRole('tab', { name: 'Neue Rezepte' });
    expect(activeItem).toHaveAttribute('aria-selected', 'true');
    expect(activeItem).toHaveClass('sort-carousel-item--active');
  });

  test('non-active items have aria-selected=false', () => {
    render(<SortCarousel activeSort="newest" onSortChange={() => {}} />);
    const inactiveItem = screen.getByRole('tab', { name: 'Alphabetisch' });
    expect(inactiveItem).toHaveAttribute('aria-selected', 'false');
    expect(inactiveItem).not.toHaveClass('sort-carousel-item--active');
  });

  test('clicking an option selects it directly', () => {
    const handleChange = jest.fn();
    render(<SortCarousel activeSort="alphabetical" onSortChange={handleChange} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Im Trend' }));

    expect(handleChange).toHaveBeenCalledWith('trending');
  });

  test('clicking the already-active option does not call onSortChange', () => {
    const handleChange = jest.fn();
    render(<SortCarousel activeSort="alphabetical" onSortChange={handleChange} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Alphabetisch' }));

    expect(handleChange).not.toHaveBeenCalled();
  });

  test('only the active option is reachable via Tab (roving tabindex)', () => {
    render(<SortCarousel activeSort="rating" onSortChange={() => {}} />);

    expect(screen.getByRole('tab', { name: 'Nach Bewertung' })).toHaveAttribute('tabIndex', '0');
    expect(screen.getByRole('tab', { name: 'Alphabetisch' })).toHaveAttribute('tabIndex', '-1');
  });

  test('keyboard: ArrowRight selects the next option', () => {
    const handleChange = jest.fn();
    render(<SortCarousel activeSort="alphabetical" onSortChange={handleChange} />);

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Alphabetisch' }), { key: 'ArrowRight' });

    expect(handleChange).toHaveBeenCalledWith('trending');
  });

  test('keyboard: ArrowLeft wraps around to the last option', () => {
    const handleChange = jest.fn();
    render(<SortCarousel activeSort="alphabetical" onSortChange={handleChange} />);

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Alphabetisch' }), { key: 'ArrowLeft' });

    expect(handleChange).toHaveBeenCalledWith(SORT_OPTIONS[SORT_OPTIONS.length - 1].id);
  });

  test('has an accessible tablist role', () => {
    render(<SortCarousel activeSort="alphabetical" onSortChange={() => {}} />);
    expect(screen.getByRole('tablist', { name: 'Sortierung' })).toBeInTheDocument();
  });
});
