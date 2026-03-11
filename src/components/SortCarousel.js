import React, { useState, useRef, useCallback } from 'react';
import './SortCarousel.css';

export const SORT_OPTIONS = [
  { id: 'alphabetical', label: 'Alphabetisch' },
  { id: 'trending',     label: 'Im Trend'     },
  { id: 'newest',       label: 'Neue Rezepte' },
  { id: 'rating',       label: 'Nach Bewertung' },
];

const SWIPE_THRESHOLD = 50; // px

function SortCarousel({ activeSort = 'alphabetical', onSortChange }) {
  const [expanded, setExpanded] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStart = useRef(null);
  const trackRef = useRef(null);

  const activeIndex = SORT_OPTIONS.findIndex(o => o.id === activeSort);
  const safeIndex = activeIndex >= 0 ? activeIndex : 0;

  const selectIndex = useCallback((idx) => {
    const clamped = (idx + SORT_OPTIONS.length) % SORT_OPTIONS.length;
    if (onSortChange) onSortChange(SORT_OPTIONS[clamped].id);
    setExpanded(false);
  }, [onSortChange]);

  // --- pointer events (mouse + touch) ---
  const onPointerDown = useCallback((e) => {
    if (!expanded) {
      setExpanded(true);
      return;
    }
    dragStart.current = e.touches ? e.touches[0].clientX : e.clientX;
    setDragOffset(0);
  }, [expanded]);

  const onPointerMove = useCallback((e) => {
    if (dragStart.current === null) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    setDragOffset(clientX - dragStart.current);
  }, []);

  const onPointerUp = useCallback((e) => {
    if (dragStart.current === null) return;
    const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const delta = clientX - dragStart.current;
    dragStart.current = null;
    setDragOffset(0);

    // Try real item widths; fall back to threshold-based approach in JSDOM
    let itemWidth = 0;
    if (trackRef.current) {
      const items = trackRef.current.querySelectorAll('.sort-carousel-item');
      if (items.length > 0) {
        itemWidth = items[0].getBoundingClientRect().width;
      }
    }

    const threshold = itemWidth > 0 ? itemWidth / 2 : SWIPE_THRESHOLD;
    if (delta < -threshold) {
      selectIndex(safeIndex + 1);
    } else if (delta > threshold) {
      selectIndex(safeIndex - 1);
    } else {
      // No change in sort but still collapse
      setExpanded(false);
    }
  }, [safeIndex, selectIndex]);

  // Keyboard navigation
  const onKeyDown = useCallback((e) => {
    if (!expanded) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setExpanded(true);
      }
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selectIndex(safeIndex - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      selectIndex(safeIndex + 1);
    } else if (e.key === 'Escape') {
      setExpanded(false);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setExpanded(false);
    }
  }, [expanded, safeIndex, selectIndex]);

  // translateX so the active item is always at the center of the track
  const translateX = expanded ? dragOffset : 0;

  return (
    <div
      className={`sort-carousel${expanded ? ' sort-carousel--expanded' : ''}`}
      role="listbox"
      aria-label="Sortierung"
      aria-expanded={expanded}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseDown={onPointerDown}
      onTouchStart={onPointerDown}
      onMouseMove={onPointerMove}
      onTouchMove={onPointerMove}
      onMouseUp={onPointerUp}
      onMouseLeave={onPointerUp}
      onTouchEnd={onPointerUp}
    >
      <div
        className="sort-carousel-track"
        ref={trackRef}
        style={{ transform: `translateX(calc(-${safeIndex * 100}% + ${translateX}px))` }}
      >
        {SORT_OPTIONS.map((option, idx) => (
          <div
            key={option.id}
            className={`sort-carousel-item${idx === safeIndex ? ' sort-carousel-item--active' : ''}`}
            role="option"
            aria-selected={idx === safeIndex}
            onClick={(e) => {
              e.stopPropagation();
              if (expanded && idx !== safeIndex) {
                selectIndex(idx);
              } else if (!expanded) {
                setExpanded(true);
              } else {
                setExpanded(false);
              }
            }}
          >
            {option.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default SortCarousel;
