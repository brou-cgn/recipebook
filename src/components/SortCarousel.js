import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import './SortCarousel.css';

export const SORT_OPTIONS = [
  { id: 'alphabetical', label: 'Alphabetisch' },
  { id: 'trending',     label: 'Im Trend'     },
  { id: 'newest',       label: 'Neue Rezepte' },
  { id: 'rating',       label: 'Nach Bewertung' },
];

const SWIPE_THRESHOLD = 30; // px — minimum swipe distance to trigger a sort change (fallback)
const LONG_PRESS_DELAY = 300; // ms — hold time required to expand via long press
const HORIZONTAL_SWIPE_MIN = 10; // px — minimum horizontal movement to detect a swipe
const ITEM_WIDTH_CSS = 'var(--sort-item-width, 160px)';
const FALLBACK_ITEM_WIDTH = 160; // used in JSDOM where measurements return 0

function SortCarousel({ activeSort = 'alphabetical', onSortChange, onExpandChange }) {
  const [expanded, setExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const trackRef = useRef(null);
  const carouselRef = useRef(null);

  // Ref holds mutable gesture state for synchronous access inside event handlers
  const gestureRef = useRef({
    startX: null,
    startY: null,
    longPressTimer: null,
    isExpanded: false,
    isDragging: false,
    dragStartX: null, // set when dragging begins, to avoid a jump at gesture start
  });

  const activeIndex = SORT_OPTIONS.findIndex(o => o.id === activeSort);
  const safeIndex = activeIndex >= 0 ? activeIndex : 0;

  // Stores the measured max item width; used as fallback in onTouchEnd snap logic
  const measuredWidthRef = useRef(0);

  const selectIndex = useCallback((idx) => {
    const clamped = (idx + SORT_OPTIONS.length) % SORT_OPTIONS.length;
    if (onSortChange) onSortChange(SORT_OPTIONS[clamped].id);
    gestureRef.current.isExpanded = false;
    gestureRef.current.isDragging = false;
    gestureRef.current.dragStartX = null;
    setExpanded(false);
    setIsDragging(false);
    setDragOffset(0);
  }, [onSortChange]);

  const collapse = useCallback(() => {
    gestureRef.current.isExpanded = false;
    gestureRef.current.isDragging = false;
    gestureRef.current.startX = null;
    gestureRef.current.startY = null;
    gestureRef.current.dragStartX = null;
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
      gestureRef.current.dragStartX = touch.clientX;
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
        setExpanded(true);
        setDragOffset(0);
      }
      return;
    }

    if (gestureRef.current.isDragging) {
      setDragOffset(touch.clientX - gestureRef.current.dragStartX);
    } else {
      // First movement after long-press expansion — start tracking drag
      gestureRef.current.isDragging = true;
      gestureRef.current.dragStartX = touch.clientX;
      setIsDragging(true);
      setDragOffset(0);
    }
  }, []);

  const onTouchEnd = useCallback((e) => {
    if (gestureRef.current.longPressTimer) {
      clearTimeout(gestureRef.current.longPressTimer);
      gestureRef.current.longPressTimer = null;
    }

    if (gestureRef.current.startX === null) return;

    const touch = e.changedTouches[0];
    const delta = touch.clientX - (gestureRef.current.dragStartX ?? gestureRef.current.startX);
    const wasExpanded = gestureRef.current.isExpanded;

    gestureRef.current.startX = null;
    gestureRef.current.startY = null;
    gestureRef.current.isDragging = false;
    gestureRef.current.isExpanded = false;
    gestureRef.current.dragStartX = null;
    setIsDragging(false);

    if (!wasExpanded) {
      // Tap without expansion (< 300 ms, no horizontal swipe) — do nothing
      setDragOffset(0);
      return;
    }

    // Pill-based snap: find item whose center is closest to the carousel center.
    // Items' getBoundingClientRect() still reflects the current visual position
    // because dragOffset state has not been reset yet (React batches state updates).
    if (carouselRef.current && trackRef.current) {
      const carouselRect = carouselRef.current.getBoundingClientRect();
      if (carouselRect.width > 0) {
        const carouselCenter = carouselRect.left + carouselRect.width / 2;
        const items = trackRef.current.querySelectorAll('.sort-carousel-item');
        let closestIndex = -1;
        let closestDist = Infinity;
        items.forEach((item, idx) => {
          const rect = item.getBoundingClientRect();
          const itemCenter = rect.left + rect.width / 2;
          const dist = Math.abs(itemCenter - carouselCenter);
          if (dist < closestDist) {
            closestDist = dist;
            closestIndex = idx;
          }
        });
        if (closestIndex >= 0) {
          selectIndex(closestIndex);
          return;
        }
      }
    }

    // Fallback for JSDOM (getBoundingClientRect returns zero-width rects):
    // use drag delta with the dynamically measured item width (or fallback)
    const itemWidth = measuredWidthRef.current || FALLBACK_ITEM_WIDTH;
    if (delta < -SWIPE_THRESHOLD) {
      const steps = Math.max(1, Math.round(-delta / itemWidth));
      selectIndex(safeIndex + steps);
    } else if (delta > SWIPE_THRESHOLD) {
      const steps = Math.max(1, Math.round(delta / itemWidth));
      selectIndex(safeIndex - steps);
    } else {
      // No sort change — just collapse
      setDragOffset(0);
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

  // After mount, measure all items and set --sort-item-width so the carousel and pill
  // are wide enough to display the longest option label without clipping.
  useLayoutEffect(() => {
    if (!trackRef.current || !carouselRef.current) return;
    const items = trackRef.current.querySelectorAll('.sort-carousel-item');
    let maxWidth = 0;
    items.forEach(item => {
      const w = Math.max(item.scrollWidth, item.offsetWidth);
      if (w > maxWidth) maxWidth = w;
    });
    if (maxWidth === 0) maxWidth = FALLBACK_ITEM_WIDTH; // JSDOM returns 0
    measuredWidthRef.current = maxWidth;
    carouselRef.current.style.setProperty('--sort-item-width', maxWidth + 'px');
    items.forEach(item => {
      item.style.width = maxWidth + 'px';
    });
  }, []);

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
        ref={carouselRef}
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
