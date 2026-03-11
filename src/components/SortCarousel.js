import React, { useState, useRef, useCallback, useEffect } from 'react';
import './SortCarousel.css';

export const SORT_OPTIONS = [
  { id: 'alphabetical', label: 'Alphabetisch' },
  { id: 'trending',     label: 'Im Trend'     },
  { id: 'newest',       label: 'Neue Rezepte' },
  { id: 'rating',       label: 'Nach Bewertung' },
];

const SWIPE_THRESHOLD = 50; // px — minimum swipe distance to trigger a sort change
const LONG_PRESS_DELAY = 300; // ms — hold time required to expand via long press
const HORIZONTAL_SWIPE_MIN = 10; // px — minimum horizontal movement to detect a swipe
const ITEM_WIDTH_CSS = 'var(--sort-item-width, 165px)';

function SortCarousel({ activeSort = 'alphabetical', onSortChange, onExpandChange }) {
  const [expanded, setExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const trackRef = useRef(null);

  // Ref holds mutable gesture state for synchronous access inside event handlers
  const gestureRef = useRef({
    startX: null,
    startY: null,
    longPressTimer: null,
    isExpanded: false,
    isDragging: false,
  });

  const activeIndex = SORT_OPTIONS.findIndex(o => o.id === activeSort);
  const safeIndex = activeIndex >= 0 ? activeIndex : 0;

  const selectIndex = useCallback((idx) => {
    const clamped = (idx + SORT_OPTIONS.length) % SORT_OPTIONS.length;
    if (onSortChange) onSortChange(SORT_OPTIONS[clamped].id);
    gestureRef.current.isExpanded = false;
    gestureRef.current.isDragging = false;
    setExpanded(false);
    setIsDragging(false);
    setDragOffset(0);
  }, [onSortChange]);

  const collapse = useCallback(() => {
    gestureRef.current.isExpanded = false;
    gestureRef.current.isDragging = false;
    gestureRef.current.startX = null;
    gestureRef.current.startY = null;
    setExpanded(false);
    setIsDragging(false);
    setDragOffset(0);
  }, []);

  // --- Touch events (mobile-only) ---
  const onTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    gestureRef.current.startX = touch.clientX;
    gestureRef.current.startY = touch.clientY;

    if (!gestureRef.current.isExpanded) {
      // Expand after a long press (finger held without significant movement)
      gestureRef.current.longPressTimer = setTimeout(() => {
        gestureRef.current.longPressTimer = null;
        gestureRef.current.isExpanded = true;
        setExpanded(true);
      }, LONG_PRESS_DELAY);
    } else {
      gestureRef.current.isDragging = true;
      setIsDragging(true);
      setDragOffset(0);
    }
  }, []);

  const onTouchMove = useCallback((e) => {
    if (gestureRef.current.startX === null) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - gestureRef.current.startX;
    const deltaY = touch.clientY - gestureRef.current.startY;

    if (!gestureRef.current.isExpanded) {
      // Expand immediately on a clear horizontal swipe
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > HORIZONTAL_SWIPE_MIN) {
        if (gestureRef.current.longPressTimer) {
          clearTimeout(gestureRef.current.longPressTimer);
          gestureRef.current.longPressTimer = null;
        }
        gestureRef.current.isExpanded = true;
        gestureRef.current.isDragging = true;
        setExpanded(true);
        setIsDragging(true);
        setDragOffset(deltaX);
      }
      return;
    }

    if (gestureRef.current.isDragging) {
      setDragOffset(deltaX);
    } else {
      // First movement after long-press expansion — start tracking drag
      gestureRef.current.isDragging = true;
      setIsDragging(true);
      setDragOffset(deltaX);
    }
  }, []);

  const onTouchEnd = useCallback((e) => {
    if (gestureRef.current.longPressTimer) {
      clearTimeout(gestureRef.current.longPressTimer);
      gestureRef.current.longPressTimer = null;
    }

    if (gestureRef.current.startX === null) return;

    const touch = e.changedTouches[0];
    const delta = touch.clientX - gestureRef.current.startX;
    const wasExpanded = gestureRef.current.isExpanded;

    gestureRef.current.startX = null;
    gestureRef.current.startY = null;
    gestureRef.current.isDragging = false;
    gestureRef.current.isExpanded = false;
    setIsDragging(false);
    setDragOffset(0);

    if (!wasExpanded) {
      // Tap without expansion (< 300 ms, no horizontal swipe) — do nothing
      return;
    }

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
      const steps = itemWidth > 0 ? Math.max(1, Math.round(-delta / itemWidth)) : 1;
      selectIndex(safeIndex + steps);
    } else if (delta > threshold) {
      const steps = itemWidth > 0 ? Math.max(1, Math.round(delta / itemWidth)) : 1;
      selectIndex(safeIndex - steps);
    } else {
      // No sort change — just collapse
      setExpanded(false);
    }
  }, [safeIndex, selectIndex]);

  // Keyboard navigation (accessibility / screen-reader support)
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
      collapse();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      collapse();
    }
  }, [expanded, safeIndex, selectIndex, collapse]);

  // Keep a stable ref to onExpandChange so the effect doesn't re-run on every render
  const onExpandChangeRef = useRef(onExpandChange);
  useEffect(() => { onExpandChangeRef.current = onExpandChange; });

  // Pixel-accurate translateX: shift by safeIndex item-widths, then apply live drag offset
  const translateX = expanded ? dragOffset : 0;

  // Notify parent whenever the expanded state changes
  useEffect(() => {
    if (onExpandChangeRef.current) onExpandChangeRef.current(expanded);
  }, [expanded]);

  return (
    <>
      <div
        className={`sort-carousel${expanded ? ' sort-carousel--expanded' : ''}${isDragging ? ' sort-carousel--dragging' : ''}`}
        role="listbox"
        aria-label="Sortierung"
        aria-expanded={expanded}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="sort-carousel-track"
          ref={trackRef}
          style={{ transform: `translateX(calc(${-safeIndex} * ${ITEM_WIDTH_CSS} + ${translateX}px))` }}
        >
          {SORT_OPTIONS.map((option, idx) => (
            <div
              key={option.id}
              className={`sort-carousel-item${idx === safeIndex ? ' sort-carousel-item--active' : ''}`}
              role="option"
              aria-selected={idx === safeIndex}
            >
              {option.label}
            </div>
          ))}
        </div>
      </div>
      <div className="sort-carousel-indicator" aria-hidden="true">
        {SORT_OPTIONS.map((option, idx) => (
          <span
            key={option.id}
            className={`sort-carousel-dot${idx === safeIndex ? ' sort-carousel-dot--active' : ''}`}
          />
        ))}
      </div>
    </>
  );
}

export default SortCarousel;
