import React, { useRef, useEffect, useCallback } from 'react';
import './SortCarousel.css';

export const SORT_OPTIONS = [
  { id: 'alphabetical', label: 'Alphabetisch' },
  { id: 'trending', label: 'Im Trend' },
  { id: 'newest', label: 'Neue Rezepte' },
  { id: 'rating', label: 'Nach Bewertung' },
  { id: 'index', label: 'Nach Relevanz' },
];

// Simple tap-to-select pill bar with native horizontal scrolling/snapping.
// Replaces the previous long-press + drag gesture carousel, whose custom
// touch-velocity math reacted unpredictably.
function SortCarousel({ activeSort = 'alphabetical', onSortChange }) {
  const itemRefs = useRef([]);

  const activeIndex = SORT_OPTIONS.findIndex((o) => o.id === activeSort);
  const safeIndex = activeIndex >= 0 ? activeIndex : 0;

  useEffect(() => {
    itemRefs.current[safeIndex]?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [safeIndex]);

  const handleSelect = useCallback(
    (id) => {
      if (id !== activeSort) onSortChange?.(id);
    },
    [activeSort, onSortChange]
  );

  const onKeyDown = useCallback(
    (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const delta = e.key === 'ArrowRight' ? 1 : -1;
      const nextIndex = (safeIndex + delta + SORT_OPTIONS.length) % SORT_OPTIONS.length;
      handleSelect(SORT_OPTIONS[nextIndex].id);
      itemRefs.current[nextIndex]?.focus();
    },
    [safeIndex, handleSelect]
  );

  return (
    <div className="sort-carousel" role="tablist" aria-label="Sortierung">
      {SORT_OPTIONS.map((option, idx) => (
        <button
          key={option.id}
          ref={(el) => {
            itemRefs.current[idx] = el;
          }}
          type="button"
          role="tab"
          aria-selected={idx === safeIndex}
          tabIndex={idx === safeIndex ? 0 : -1}
          className={`sort-carousel-item${idx === safeIndex ? ' sort-carousel-item--active' : ''}`}
          onClick={() => handleSelect(option.id)}
          onKeyDown={onKeyDown}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default React.memo(SortCarousel);
