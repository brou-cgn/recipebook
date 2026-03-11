import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import SortCarousel, { SORT_OPTIONS } from './SortCarousel';

// Helper: fire a complete touch gesture (touchStart → [expand step] → [drag-start step] → touchMove → touchEnd).
// For swipes larger than 10 px, two intermediate touchMove events are fired:
// 1. at startX ± 11 px to trigger expansion (crosses HORIZONTAL_SWIPE_MIN),
// 2. at the same position again so the next event becomes the first movement after
//    expansion, which starts drag tracking (sets dragStartX).
function simulateTouchSwipe(element, startX, endX, startY = 100, endY = 100) {
  fireEvent.touchStart(element, { touches: [{ clientX: startX, clientY: startY }] });
  if (Math.abs(endX - startX) > 10) {
    const expandX = endX < startX ? startX - 11 : startX + 11;
    // First intermediate: triggers expansion (crosses HORIZONTAL_SWIPE_MIN threshold)
    fireEvent.touchMove(element, { touches: [{ clientX: expandX, clientY: startY }] });
    // Second intermediate: first movement after expansion — starts drag tracking
    fireEvent.touchMove(element, { touches: [{ clientX: expandX, clientY: startY }] });
  }
  fireEvent.touchMove(element, { touches: [{ clientX: endX, clientY: endY }] });
  fireEvent.touchEnd(element, { changedTouches: [{ clientX: endX, clientY: endY }] });
}

// Helper: mock the first carousel item's getBoundingClientRect to return a known width
function mockItemWidth(container, width) {
  const items = container.firstChild
    .querySelector('.sort-carousel-track')
    .querySelectorAll('.sort-carousel-item');
  jest.spyOn(items[0], 'getBoundingClientRect').mockReturnValue({
    width, height: 40, top: 0, left: 0, right: width, bottom: 40,
  });
}

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

  test('expands on long press', () => {
    jest.useFakeTimers();
    const { container } = render(
      <SortCarousel activeSort="alphabetical" onSortChange={() => {}} />
    );
    fireEvent.touchStart(container.firstChild, { touches: [{ clientX: 100, clientY: 100 }] });
    expect(container.firstChild).not.toHaveClass('sort-carousel--expanded');
    act(() => { jest.advanceTimersByTime(300); });
    expect(container.firstChild).toHaveClass('sort-carousel--expanded');
    jest.useRealTimers();
  });

  test('expands immediately on horizontal swipe', () => {
    const { container } = render(
      <SortCarousel activeSort="alphabetical" onSortChange={() => {}} />
    );
    fireEvent.touchStart(container.firstChild, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(container.firstChild, { touches: [{ clientX: 115, clientY: 100 }] });
    expect(container.firstChild).toHaveClass('sort-carousel--expanded');
  });

  test('sets dragging class while finger is moving', () => {
    const { container } = render(
      <SortCarousel activeSort="alphabetical" onSortChange={() => {}} />
    );
    fireEvent.touchStart(container.firstChild, { touches: [{ clientX: 200, clientY: 100 }] });
    // First move crosses HORIZONTAL_SWIPE_MIN: expands, but dragging has NOT started yet
    fireEvent.touchMove(container.firstChild, { touches: [{ clientX: 215, clientY: 100 }] });
    expect(container.firstChild).not.toHaveClass('sort-carousel--dragging');
    // Second move: first movement after expansion — drag tracking begins
    fireEvent.touchMove(container.firstChild, { touches: [{ clientX: 220, clientY: 100 }] });
    expect(container.firstChild).toHaveClass('sort-carousel--dragging');
  });

  test('selects next sort option via swipe left and collapses', () => {
    const handleChange = jest.fn();
    const { container } = render(
      <SortCarousel activeSort="alphabetical" onSortChange={handleChange} />
    );
    simulateTouchSwipe(container.firstChild, 200, 100); // -100 px > threshold
    expect(handleChange).toHaveBeenCalledWith('trending');
    expect(container.firstChild).not.toHaveClass('sort-carousel--expanded');
  });

  test('selects previous sort option via swipe right', () => {
    const handleChange = jest.fn();
    const { container } = render(
      <SortCarousel activeSort="trending" onSortChange={handleChange} />
    );
    simulateTouchSwipe(container.firstChild, 100, 200); // +100 px > threshold
    expect(handleChange).toHaveBeenCalledWith('alphabetical');
  });

  test('multi-step swipe left skips multiple options based on item width', () => {
    const handleChange = jest.fn();
    const { container } = render(
      <SortCarousel activeSort="alphabetical" onSortChange={handleChange} />
    );
    // swipe left ~500 px from drag origin (after expansion step): 489/160 ≈ 3.06 → 3 steps from 'alphabetical' → 'rating'
    simulateTouchSwipe(container.firstChild, 600, 100);
    expect(handleChange).toHaveBeenCalledWith('rating');
  });

  test('multi-step swipe right skips multiple options based on item width', () => {
    const handleChange = jest.fn();
    const { container } = render(
      <SortCarousel activeSort="rating" onSortChange={handleChange} />
    );
    // swipe right ~500 px from drag origin (after expansion step): 489/160 ≈ 3.06 → 3 steps back → index 0 → 'alphabetical'
    simulateTouchSwipe(container.firstChild, 100, 600);
    expect(handleChange).toHaveBeenCalledWith('alphabetical');
  });

  test('short swipe collapses without changing sort', () => {
    const handleChange = jest.fn();
    const { container } = render(
      <SortCarousel activeSort="alphabetical" onSortChange={handleChange} />
    );
    // 20 px: expands (> 10 px) but below the 30 px sort threshold
    simulateTouchSwipe(container.firstChild, 200, 220);
    expect(handleChange).not.toHaveBeenCalled();
    expect(container.firstChild).not.toHaveClass('sort-carousel--expanded');
  });

  test('very short tap (< 10 px) does not expand', () => {
    const { container } = render(
      <SortCarousel activeSort="alphabetical" onSortChange={() => {}} />
    );
    simulateTouchSwipe(container.firstChild, 200, 205); // 5 px — below expand threshold
    expect(container.firstChild).not.toHaveClass('sort-carousel--expanded');
  });

  test('initial dragOffset on expansion is 0 (no visual jump)', () => {
    const { container } = render(
      <SortCarousel activeSort="alphabetical" onSortChange={() => {}} />
    );
    const track = container.firstChild.querySelector('.sort-carousel-track');
    const transformBefore = track.style.transform;
    // Trigger expansion via horizontal swipe (deltaX = 15 > 10 px threshold)
    fireEvent.touchStart(container.firstChild, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(container.firstChild, { touches: [{ clientX: 115, clientY: 100 }] });
    // Carousel should be expanded…
    expect(container.firstChild).toHaveClass('sort-carousel--expanded');
    // …but the track transform must not have shifted (dragOffset = 0, no visual jump)
    expect(track.style.transform).toBe(transformBefore);
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
    fireEvent.keyDown(container.firstChild, { key: 'Enter' });
    expect(container.firstChild).toHaveClass('sort-carousel--expanded');
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
