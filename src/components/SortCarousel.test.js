import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SortCarousel, { SORT_OPTIONS } from './SortCarousel';

describe('SortCarousel', () => {
  test('renders the active option label', () => {
    render(<SortCarousel activeSort="alphabetical" onSortChange={() => {}} />);
    expect(screen.getByText('Alphabetisch')).toBeInTheDocument();
  });

  test('renders all option labels', () => {
    render(<SortCarousel activeSort="alphabetical" onSortChange={() => {}} />);
    SORT_OPTIONS.forEach(opt => {
      expect(screen.getByText(opt.label)).toBeInTheDocument();
    });
  });

  test('starts collapsed (no expanded class)', () => {
    const { container } = render(
      <SortCarousel activeSort="alphabetical" onSortChange={() => {}} />
    );
    expect(container.firstChild).not.toHaveClass('sort-carousel--expanded');
  });

  test('expands on click', () => {
    const { container } = render(
      <SortCarousel activeSort="alphabetical" onSortChange={() => {}} />
    );
    fireEvent.mouseDown(container.firstChild);
    expect(container.firstChild).toHaveClass('sort-carousel--expanded');
  });

  test('calls onSortChange when a non-active item is clicked in expanded state', () => {
    const handleChange = jest.fn();
    const { container } = render(
      <SortCarousel activeSort="alphabetical" onSortChange={handleChange} />
    );
    // Expand first
    fireEvent.mouseDown(container.firstChild);
    // Click "Im Trend" item
    fireEvent.click(screen.getByText('Im Trend'));
    expect(handleChange).toHaveBeenCalledWith('trending');
  });

  test('collapses after selecting an option', () => {
    const { container } = render(
      <SortCarousel activeSort="alphabetical" onSortChange={() => {}} />
    );
    fireEvent.mouseDown(container.firstChild);
    fireEvent.click(screen.getByText('Im Trend'));
    expect(container.firstChild).not.toHaveClass('sort-carousel--expanded');
  });

  test('keyboard: Enter expands the carousel', () => {
    const { container } = render(
      <SortCarousel activeSort="alphabetical" onSortChange={() => {}} />
    );
    fireEvent.keyDown(container.firstChild, { key: 'Enter' });
    expect(container.firstChild).toHaveClass('sort-carousel--expanded');
  });

  test('keyboard: Escape collapses the carousel', () => {
    const { container } = render(
      <SortCarousel activeSort="alphabetical" onSortChange={() => {}} />
    );
    // Expand first
    fireEvent.keyDown(container.firstChild, { key: 'Enter' });
    expect(container.firstChild).toHaveClass('sort-carousel--expanded');
    // Then Escape
    fireEvent.keyDown(container.firstChild, { key: 'Escape' });
    expect(container.firstChild).not.toHaveClass('sort-carousel--expanded');
  });

  test('keyboard: ArrowRight advances to next option', () => {
    const handleChange = jest.fn();
    const { container } = render(
      <SortCarousel activeSort="alphabetical" onSortChange={handleChange} />
    );
    fireEvent.keyDown(container.firstChild, { key: 'Enter' }); // expand
    fireEvent.keyDown(container.firstChild, { key: 'ArrowRight' });
    expect(handleChange).toHaveBeenCalledWith('trending');
  });

  test('keyboard: ArrowLeft wraps around to last option', () => {
    const handleChange = jest.fn();
    const { container } = render(
      <SortCarousel activeSort="alphabetical" onSortChange={handleChange} />
    );
    fireEvent.keyDown(container.firstChild, { key: 'Enter' }); // expand
    fireEvent.keyDown(container.firstChild, { key: 'ArrowLeft' });
    // 'alphabetical' is index 0, wrapping back goes to last item
    expect(handleChange).toHaveBeenCalledWith(SORT_OPTIONS[SORT_OPTIONS.length - 1].id);
  });

  test('swipe left advances to next sort option', () => {
    const handleChange = jest.fn();
    const { container } = render(
      <SortCarousel activeSort="alphabetical" onSortChange={handleChange} />
    );
    // Expand
    fireEvent.mouseDown(container.firstChild);

    // Simulate drag: start at 200, end at 100 => delta -100 (left swipe)
    fireEvent.mouseDown(container.firstChild, { clientX: 200 });
    fireEvent.mouseMove(container.firstChild, { clientX: 100 });
    fireEvent.mouseUp(container.firstChild, { clientX: 100 });

    expect(handleChange).toHaveBeenCalledWith('trending');
  });

  test('swipe right goes to previous sort option', () => {
    const handleChange = jest.fn();
    const { container } = render(
      <SortCarousel activeSort="trending" onSortChange={handleChange} />
    );
    // Expand
    fireEvent.mouseDown(container.firstChild);

    // Simulate drag: start at 100, end at 200 => delta +100 (right swipe)
    fireEvent.mouseDown(container.firstChild, { clientX: 100 });
    fireEvent.mouseMove(container.firstChild, { clientX: 200 });
    fireEvent.mouseUp(container.firstChild, { clientX: 200 });

    expect(handleChange).toHaveBeenCalledWith('alphabetical');
  });

  test('short swipe (<50px) collapses without changing sort', () => {
    const handleChange = jest.fn();
    const { container } = render(
      <SortCarousel activeSort="alphabetical" onSortChange={handleChange} />
    );
    // Expand
    fireEvent.mouseDown(container.firstChild);

    // Simulate small drag (20px)
    fireEvent.mouseDown(container.firstChild, { clientX: 200 });
    fireEvent.mouseMove(container.firstChild, { clientX: 180 });
    fireEvent.mouseUp(container.firstChild, { clientX: 180 });

    expect(handleChange).not.toHaveBeenCalled();
    expect(container.firstChild).not.toHaveClass('sort-carousel--expanded');
  });

  test('active item has aria-selected=true', () => {
    render(<SortCarousel activeSort="newest" onSortChange={() => {}} />);
    const activeItem = screen.getByRole('option', { name: 'Neue Rezepte' });
    expect(activeItem).toHaveAttribute('aria-selected', 'true');
  });

  test('non-active items have aria-selected=false', () => {
    render(<SortCarousel activeSort="newest" onSortChange={() => {}} />);
    const inactiveItem = screen.getByRole('option', { name: 'Alphabetisch' });
    expect(inactiveItem).toHaveAttribute('aria-selected', 'false');
  });
});
