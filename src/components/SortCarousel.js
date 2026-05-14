import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
} from 'react';
import './SortCarousel.css';

export const SORT_OPTIONS = [
  { id: 'alphabetical', label: 'Alphabetisch' },
  { id: 'trending', label: 'Im Trend' },
  { id: 'newest', label: 'Neue Rezepte' },
  { id: 'rating', label: 'Nach Bewertung' },
];

const LONG_PRESS_DELAY = 300;
const HORIZONTAL_SWIPE_MIN = 10;
const SWIPE_THRESHOLD = 12;
const FALLBACK_ITEM_WIDTH = 160;

function clampLoop(index, length) {
  return ((index % length) + length) % length;
}

function SortCarousel({ activeSort = 'alphabetical', onSortChange, onExpandChange }) {
  const carouselRef = useRef(null);
  const trackRef = useRef(null);
  const itemRefs = useRef([]);
  const itemMetricsRef = useRef([]);
  const gestureViewportWidthRef = useRef(null);

  const [expanded, setExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isMeasured, setIsMeasured] = useState(false);
  const [freezeViewportWidth, setFreezeViewportWidth] = useState(null);

  const onExpandChangeRef = useRef(onExpandChange);

  const gestureRef = useRef({
    startX: null,
    startY: null,
    dragStartX: null,
    longPressTimer: null,
    isExpanded: false,
    isDragging: false,
  });

  const activeIndex = SORT_OPTIONS.findIndex((o) => o.id === activeSort);
  const safeIndex = activeIndex >= 0 ? activeIndex : 0;

  useEffect(() => {
    onExpandChangeRef.current = onExpandChange;
  }, [onExpandChange]);

  useEffect(() => {
    onExpandChangeRef.current?.(expanded);
  }, [expanded]);

  // --- Wiederverwendbare Helfer ---

  const clearLongPressTimer = useCallback(() => {
    if (gestureRef.current.longPressTimer) {
      clearTimeout(gestureRef.current.longPressTimer);
      gestureRef.current.longPressTimer = null;
    }
  }, []);

  const resetGesture = useCallback(() => {
    clearLongPressTimer();
    gestureRef.current.startX = null;
    gestureRef.current.startY = null;
    gestureRef.current.dragStartX = null;
    gestureRef.current.isDragging = false;
  }, [clearLongPressTimer]);

  const collapse = useCallback(() => {
    resetGesture();
    gestureRef.current.isExpanded = false;
    gestureViewportWidthRef.current = null;
    setFreezeViewportWidth(null);
    setExpanded(false);
    setIsDragging(false);
    setDragOffset(0);
  }, [resetGesture]);

  const selectIndex = useCallback(
    (idx) => {
      const nextIndex = clampLoop(idx, SORT_OPTIONS.length);
      onSortChange?.(SORT_OPTIONS[nextIndex].id);
      collapse();
    },
    [collapse, onSortChange]
  );

  // --- Messung ---  
  const applyMeasurementsToDom = useCallback(() => {
    const carouselEl = carouselRef.current;
    const trackEl = trackRef.current;
    if (!carouselEl || !trackEl) return;

    const items = itemRefs.current.filter(Boolean);
    if (!items.length) return;

    const trackRect = trackEl.getBoundingClientRect();

  const metrics = items.map((item) => {
    const rect = item.getBoundingClientRect();
    const width = rect.width || item.scrollWidth || FALLBACK_ITEM_WIDTH;
    const left = rect.left - trackRect.left;
    const center = left + width / 2;
  
    return {
      width,
      left,
      center,
    };
  });
  
  const maxWidth = Math.max(...metrics.map(m => m.width));
  
  carouselEl.style.setProperty('--sort-max-item-width', `${maxWidth}px`);

    itemMetricsRef.current = metrics;
    setIsMeasured(true);
  }, []);
  
  useLayoutEffect(() => {
    applyMeasurementsToDom();

    const carouselEl = carouselRef.current;
    if (!carouselEl) return;

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => {
        applyMeasurementsToDom();
      });

      resizeObserver.observe(carouselEl);

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [applyMeasurementsToDom]);

  // --- Keyboard ---

  const onKeyDown = useCallback(
    (e) => {
      if (!expanded) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          gestureRef.current.isExpanded = true;
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
        e.preventDefault();
        collapse();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        collapse();
      }
    },
    [collapse, expanded, safeIndex, selectIndex]
  );

  const activeMetric = itemMetricsRef.current?.[safeIndex];
  const activeWidth = activeMetric?.width ?? FALLBACK_ITEM_WIDTH;

  const expandWithFrozenViewport = useCallback(() => {
    const currentWidth =
      carouselRef.current?.getBoundingClientRect().width || activeWidth;
  
    setFreezeViewportWidth(currentWidth);
    gestureViewportWidthRef.current = currentWidth;
  
    setExpanded(true);
  
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFreezeViewportWidth(null);
        gestureViewportWidthRef.current = null;
      });
    });
  }, [activeWidth]);

  // --- Touch-Gesten ---

  const beginExpandedDrag = useCallback((clientX) => {
    gestureRef.current.isExpanded = true;
    gestureRef.current.isDragging = true;
    gestureRef.current.dragStartX = clientX;
  
    if (!expanded) {
      expandWithFrozenViewport();
    }
  
    setIsDragging(true);
    setDragOffset(0);
  }, [expanded, expandWithFrozenViewport]);

  const onTouchStart = useCallback(
    (e) => {
      const touch = e.touches[0];
      if (!touch) return;

      gestureRef.current.startX = touch.clientX;
      gestureRef.current.startY = touch.clientY;

      if (!gestureRef.current.isExpanded) {
        const startX = touch.clientX;
      
          gestureRef.current.longPressTimer = setTimeout(() => {
            gestureRef.current.longPressTimer = null;
            gestureRef.current.isExpanded = true;
            setExpanded(true);
          }, LONG_PRESS_DELAY);
        
      } else {
        beginExpandedDrag(touch.clientX);
      }
    },
    [beginExpandedDrag, expandWithFrozenViewport]
  );

  const onTouchMove = useCallback(
    (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      if (gestureRef.current.startX === null || gestureRef.current.startY === null) return;

      const deltaX = touch.clientX - gestureRef.current.startX;
      const deltaY = touch.clientY - gestureRef.current.startY;

      if (!gestureRef.current.isExpanded) {
        const isHorizontalIntent =
          Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > HORIZONTAL_SWIPE_MIN;

        if (isHorizontalIntent) {
          clearLongPressTimer();
          beginExpandedDrag(touch.clientX);
        }
        return;
      }

      if (!gestureRef.current.isDragging) {
        gestureRef.current.isDragging = true;
        gestureRef.current.dragStartX = touch.clientX;

        gestureViewportWidthRef.current =
          carouselRef.current?.getBoundingClientRect().width || null;
        
        setIsDragging(true);
        return;
      }

      setDragOffset(touch.clientX - gestureRef.current.dragStartX);
    },
    [beginExpandedDrag, clearLongPressTimer]
  );

  const onTouchEnd = useCallback(
    (e) => {
      clearLongPressTimer();

      const touch = e.changedTouches[0];
      if (!touch || gestureRef.current.startX === null) {
        resetGesture();
        return;
      }

      const wasExpanded = gestureRef.current.isExpanded;
      const effectiveStartX =
        gestureRef.current.dragStartX ?? gestureRef.current.startX;
      const delta = touch.clientX - effectiveStartX;

      resetGesture();
      gestureRef.current.isExpanded = false;
      setIsDragging(false);

      if (!wasExpanded) {
        setDragOffset(0);
        return;
      }

      // Erst präziser visueller Snap, dann Fallback über Delta
      const carouselEl = carouselRef.current;
      const trackEl = trackRef.current;

      if (carouselEl && trackEl) {
        const carouselRect = carouselEl.getBoundingClientRect();

        if (carouselRect.width > 0) {
          const carouselCenter = carouselRect.left + carouselRect.width / 2;
          const items = trackEl.querySelectorAll('.sort-carousel-item');

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

      // Fallback, falls Rects z. B. in Tests unbrauchbar sind
      
      const currentMetric = itemMetricsRef.current[safeIndex];
      const referenceWidth = currentMetric?.width || FALLBACK_ITEM_WIDTH;

      if (delta < -SWIPE_THRESHOLD) {
        const steps = Math.max(1, Math.round(-delta / referenceWidth));
        selectIndex(safeIndex + steps);
        return;
      }

      if (delta > SWIPE_THRESHOLD) {
        const steps = Math.max(1, Math.round(delta / referenceWidth));
        selectIndex(safeIndex - steps);
        return;
      }

      collapse();
    },
    [clearLongPressTimer, collapse, resetGesture, safeIndex, selectIndex]
  );
  
  const targetExpandedWidth = Math.min(window.innerWidth * 0.85, 320);
  const effectiveCarouselWidth =
    freezeViewportWidth ?? (expanded ? targetExpandedWidth : activeWidth);
  
  const carouselStyle = {
    width: `${effectiveCarouselWidth}px`,
  };
  
  /*const liveViewportWidth =
    freezeViewportWidth ||
    carouselRef.current?.getBoundingClientRect().width ||
    effectiveCarouselWidth; */
  
  const currentViewportWidth =
    isDragging && gestureViewportWidthRef.current
      ? gestureViewportWidthRef.current
      : effectiveCarouselWidth;
  
  const viewportCenter = currentViewportWidth / 2;
  
  const activeCenter =
    activeMetric?.center ??
    (safeIndex * activeWidth + activeWidth / 2);
  
  const trackStyle = {
    transform: `translate3d(${viewportCenter - activeCenter + dragOffset}px, 0, 0)`,
  };
  
  return (
    <>
      <div
        ref={carouselRef}
        style={carouselStyle}
        className={[
          'sort-carousel',
          expanded && 'sort-carousel--expanded',
          isDragging && 'sort-carousel--dragging',
          isMeasured && 'sort-carousel--measured',
        ]
          .filter(Boolean)
          .join(' ')}
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
          ref={trackRef}
          className="sort-carousel-track"
          style={trackStyle}
        >
          {SORT_OPTIONS.map((option, idx) => (
            <div
              key={option.id}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
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
