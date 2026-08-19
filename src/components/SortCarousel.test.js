import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import SortCarousel, { SORT_OPTIONS } from './SortCarousel';

// JSDOM does not implement scrollIntoView or scrollTo — provide no-op mocks.
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
  Element.prototype.scrollTo = jest.fn();
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

  describe('expand/collapse', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('starts expanded, showing all pills, then folds down to the active pill on its own', () => {
      render(<SortCarousel activeSort="alphabetical" onSortChange={() => {}} />);
      expect(screen.getByRole('tablist')).toHaveClass('sort-carousel--expanded');

      act(() => {
        jest.advanceTimersByTime(1400);
      });
      expect(screen.getByRole('tablist')).not.toHaveClass('sort-carousel--expanded');
    });

    test('a native scroll event (the swipe gesture) expands the carousel', () => {
      render(<SortCarousel activeSort="alphabetical" onSortChange={() => {}} />);
      // Past both the mount collapse (1400ms) and the scroll-suppression
      // window it triggers (400ms), so this scroll reads as a real swipe.
      act(() => {
        jest.advanceTimersByTime(1800);
      });
      expect(screen.getByRole('tablist')).not.toHaveClass('sort-carousel--expanded');

      fireEvent.scroll(screen.getByRole('tablist'));
      expect(screen.getByRole('tablist')).toHaveClass('sort-carousel--expanded');
    });

    test('tapping the active pill toggles the expanded state without selecting', () => {
      const handleChange = jest.fn();
      render(<SortCarousel activeSort="alphabetical" onSortChange={handleChange} />);
      act(() => {
        jest.advanceTimersByTime(1400);
      });
      const activeTab = screen.getByRole('tab', { name: 'Alphabetisch' });

      fireEvent.click(activeTab);
      expect(screen.getByRole('tablist')).toHaveClass('sort-carousel--expanded');

      fireEvent.click(activeTab);
      expect(screen.getByRole('tablist')).not.toHaveClass('sort-carousel--expanded');
      expect(handleChange).not.toHaveBeenCalled();
    });

    test('focusing the carousel expands it; blurring away from it schedules a collapse', () => {
      render(<SortCarousel activeSort="alphabetical" onSortChange={() => {}} />);
      const tablist = screen.getByRole('tablist');
      const activeTab = screen.getByRole('tab', { name: 'Alphabetisch' });

      fireEvent.focus(activeTab);
      expect(tablist).toHaveClass('sort-carousel--expanded');

      // React's onBlur is backed by the (bubbling) native "focusout" event,
      // not "blur" — fire that directly rather than fireEvent.blur, which
      // jsdom does not pair with a focusout on its own.
      fireEvent.focusOut(activeTab, { relatedTarget: null });
      act(() => {
        jest.advanceTimersByTime(2600);
      });
      expect(tablist).not.toHaveClass('sort-carousel--expanded');
    });

    test('selecting an option keeps it expanded briefly, then collapses', () => {
      const handleChange = jest.fn();
      render(<SortCarousel activeSort="alphabetical" onSortChange={handleChange} />);
      const tablist = screen.getByRole('tablist');

      fireEvent.click(screen.getByRole('tab', { name: 'Im Trend' }));
      expect(handleChange).toHaveBeenCalledWith('trending');
      expect(tablist).toHaveClass('sort-carousel--expanded');

      act(() => {
        jest.advanceTimersByTime(900);
      });
      expect(tablist).not.toHaveClass('sort-carousel--expanded');
    });

    test('a scroll event fired right after collapsing (the layout-shift side effect of the pills shrinking) does not re-expand the carousel', () => {
      const handleChange = jest.fn();
      render(<SortCarousel activeSort="alphabetical" onSortChange={handleChange} />);
      const tablist = screen.getByRole('tablist');

      fireEvent.click(screen.getByRole('tab', { name: 'Nach Relevanz' }));
      act(() => {
        jest.advanceTimersByTime(900);
      });
      expect(tablist).not.toHaveClass('sort-carousel--expanded');

      // The collapse CSS transition shrinking the other pills can itself
      // trigger a native scroll event as the container's scrollLeft is
      // clamped to the new (smaller) scrollWidth. That should be ignored,
      // not mistaken for a user swipe.
      fireEvent.scroll(tablist);
      expect(tablist).not.toHaveClass('sort-carousel--expanded');

      // Once the ignore window has passed, real swipes work again.
      act(() => {
        jest.advanceTimersByTime(400);
      });
      fireEvent.scroll(tablist);
      expect(tablist).toHaveClass('sort-carousel--expanded');
    });
  });
});
