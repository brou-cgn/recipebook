import React, { useRef, useEffect, useCallback, useState } from 'react';
import './SortCarousel.css';

export const SORT_OPTIONS = [
  { id: 'alphabetical', label: 'Alphabetisch' },
  { id: 'trending', label: 'Im Trend' },
  { id: 'newest', label: 'Neue Rezepte' },
  { id: 'rating', label: 'Nach Bewertung' },
  { id: 'index', label: 'Nach Relevanz' },
];

// How long the carousel stays expanded on first mount, giving the user a
// glance at all the options before it folds down to just the active pill.
const MOUNT_COLLAPSE_DELAY_MS = 1400;

// How long it stays expanded after the user picks an option, so the
// selection is visible for a moment before the pill bar folds away.
const SELECT_COLLAPSE_DELAY_MS = 900;

// How long it stays expanded after the user opens it without selecting
// anything (scrolling, tapping the active pill, or focusing it).
const EXPAND_COLLAPSE_DELAY_MS = 2600;

// Collapsing shrinks the inactive pills' max-width to 0 (see
// SortCarousel.css), which can shrink the scroll container's content
// enough that the browser adjusts scrollLeft to keep it in range. That
// adjustment fires its own native "scroll" event, which would otherwise
// be mistaken for a user swipe and re-expand the carousel mid-collapse.
// Scroll events are ignored for this long after any collapse we trigger
// ourselves.
const IGNORE_SCROLL_MS = 400;

// Tap-to-select pill bar with native horizontal scrolling/snapping. Only
// the active pill is shown until the user swipes (or taps/focuses it),
// which reveals the rest. Expansion is driven purely by the browser's own
// scroll/focus events — no custom touch-position or velocity tracking —
// unlike the previous long-press + drag gesture carousel, whose
// reimplemented touch physics reacted unpredictably.
function SortCarousel({ activeSort = 'alphabetical', onSortChange }) {
  const itemRefs = useRef([]);
  const collapseTimer = useRef(null);
  const ignoreScrollTimer = useRef(null);
  const ignoreScroll = useRef(false);
  // Starts expanded so the user sees all options at a glance, then folds
  // down to the active pill on its own (see MOUNT_COLLAPSE_DELAY_MS below).
  const [expanded, setExpanded] = useState(true);

  const activeIndex = SORT_OPTIONS.findIndex((o) => o.id === activeSort);
  const safeIndex = activeIndex >= 0 ? activeIndex : 0;

  const suppressScroll = useCallback(() => {
    ignoreScroll.current = true;
    clearTimeout(ignoreScrollTimer.current);
    ignoreScrollTimer.current = setTimeout(() => {
      ignoreScroll.current = false;
    }, IGNORE_SCROLL_MS);
  }, []);

  useEffect(() => {
    itemRefs.current[safeIndex]?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [safeIndex]);

  useEffect(
    () => () => {
      clearTimeout(collapseTimer.current);
      clearTimeout(ignoreScrollTimer.current);
    },
    []
  );

  // Collapsing itself can trigger a spurious scroll event (see
  // IGNORE_SCROLL_MS above), so every path that collapses the carousel
  // goes through here rather than calling setExpanded(false) directly.
  const collapseNow = useCallback(() => {
    suppressScroll();
    setExpanded(false);
  }, [suppressScroll]);

  const scheduleCollapse = useCallback(
    (delay) => {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = setTimeout(collapseNow, delay);
    },
    [collapseNow]
  );

  // Reveal all options briefly on mount, then fold down to the active pill.
  useEffect(() => {
    scheduleCollapse(MOUNT_COLLAPSE_DELAY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = useCallback(
    (id) => {
      if (id !== activeSort) onSortChange?.(id);
      // Keep it expanded a moment so the new selection is visible before
      // folding away, instead of collapsing instantly.
      setExpanded(true);
      scheduleCollapse(SELECT_COLLAPSE_DELAY_MS);
    },
    [activeSort, onSortChange, scheduleCollapse]
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

  // A real swipe moves the container's native scroll position; we just
  // react to that signal instead of tracking touch points ourselves. Scroll
  // events caused by our own collapse animation are filtered out via
  // ignoreScroll, so they don't get mistaken for a swipe and re-expand.
  const handleScroll = useCallback(() => {
    if (ignoreScroll.current) return;
    setExpanded(true);
    scheduleCollapse(EXPAND_COLLAPSE_DELAY_MS);
  }, [scheduleCollapse]);

  // Lets mouse, keyboard and screen-reader users reach the other pills
  // without needing a swipe gesture.
  const handleActivePillTap = useCallback(() => {
    if (expanded) {
      clearTimeout(collapseTimer.current);
      collapseNow();
    } else {
      setExpanded(true);
      scheduleCollapse(EXPAND_COLLAPSE_DELAY_MS);
    }
  }, [expanded, collapseNow, scheduleCollapse]);

  const handleFocus = useCallback(() => {
    clearTimeout(collapseTimer.current);
    setExpanded(true);
  }, []);

  const handleBlur = useCallback(
    (e) => {
      if (e.currentTarget.contains(e.relatedTarget)) return;
      scheduleCollapse(EXPAND_COLLAPSE_DELAY_MS);
    },
    [scheduleCollapse]
  );

  return (
    <div
      className={`sort-carousel${expanded ? ' sort-carousel--expanded' : ''}`}
      role="tablist"
      aria-label="Sortierung"
      onScroll={handleScroll}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {SORT_OPTIONS.map((option, idx) => {
        const isActive = idx === safeIndex;
        return (
          <button
            key={option.id}
            ref={(el) => {
              itemRefs.current[idx] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={`sort-carousel-item${isActive ? ' sort-carousel-item--active' : ''}`}
            onClick={() => (isActive ? handleActivePillTap() : handleSelect(option.id))}
            onKeyDown={onKeyDown}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default React.memo(SortCarousel);
