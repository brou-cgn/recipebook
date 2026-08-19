import React, { useRef, useEffect, useCallback, useState } from 'react';
import './SortCarousel.css';

// Newton-Raphson solver for a CSS-style cubic-bezier(x1, y1, x2, y2) easing
// curve, so the scrollLeft reset in collapseNow (below) can move on exactly
// the same curve as the CSS max-width transition instead of the browser's
// own (differently-timed) native smooth scroll.
function cubicBezier(x1, y1, x2, y2) {
  const a = (a1, a2) => 1.0 - 3.0 * a2 + 3.0 * a1;
  const b = (a1, a2) => 3.0 * a2 - 6.0 * a1;
  const c = (a1) => 3.0 * a1;

  const calc = (t, a1, a2) => ((a(a1, a2) * t + b(a1, a2)) * t + c(a1)) * t;
  const slope = (t, a1, a2) => 3.0 * a(a1, a2) * t * t + 2.0 * b(a1, a2) * t + c(a1);

  const solveT = (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const currentSlope = slope(t, x1, x2);
      if (currentSlope === 0) return t;
      t -= (calc(t, x1, x2) - x) / currentSlope;
    }
    return t;
  };

  return (x) => calc(solveT(x), y1, y2);
}

export const SORT_OPTIONS = [
  { id: 'alphabetical', label: 'Alphabetisch' },
  { id: 'trending', label: 'Im Trend' },
  { id: 'newest', label: 'Neue Rezepte' },
  { id: 'rating', label: 'Nach Bewertung' },
  { id: 'index', label: 'Nach Relevanz' },
];

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

// Must match the `max-width` transition on .sort-carousel-item in
// SortCarousel.css (duration and curve). The active pill's on-screen
// position during collapse is the sum of that width transition (which
// shifts it as shrinking siblings reflow) and the scrollLeft reset below;
// if the two run on different timings they drift apart mid-collapse and
// the pill visibly jumps instead of moving smoothly to its resting spot.
const COLLAPSE_DURATION_MS = 340;
const collapseEasing = cubicBezier(0.32, 0.72, 0, 1);

// Tap-to-select pill bar with native horizontal scrolling/snapping. Only
// the active pill is shown until the user swipes (or taps/focuses it),
// which reveals the rest. Expansion is driven purely by the browser's own
// scroll/focus events — no custom touch-position or velocity tracking —
// unlike the previous long-press + drag gesture carousel, whose
// reimplemented touch physics reacted unpredictably.
function SortCarousel({ activeSort = 'alphabetical', onSortChange }) {
  const containerRef = useRef(null);
  const itemRefs = useRef([]);
  const collapseTimer = useRef(null);
  const ignoreScrollTimer = useRef(null);
  const ignoreScroll = useRef(false);
  const scrollAnimFrame = useRef(null);
  // Starts collapsed, showing just the active pill, until the user swipes,
  // taps, or focuses it (see the expand handlers below).
  const [expanded, setExpanded] = useState(false);

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
      cancelAnimationFrame(scrollAnimFrame.current);
    },
    []
  );

  // Once collapsed, only the active pill remains (the rest shrink to
  // max-width: 0), so the container's scroll position always ends up at
  // 0. Left to itself the browser only clamps scrollLeft once the
  // shrinking content can no longer contain it, and that clamp is an
  // instant jump, not part of the width transition — most jarring for a
  // pill that was scrolled deep into the middle (e.g. "Neue Rezepte",
  // "Nach Bewertung"), since it has the furthest to snap back.
  //
  // Native `scrollTo({ behavior: 'smooth' })` avoids that clamp, but runs
  // on the browser's own (unrelated) timing and easing, not the pills'
  // CSS transition — the two drift apart mid-collapse and the active pill
  // visibly wobbles. Driving scrollLeft by hand on the same duration and
  // curve as the CSS keeps it moving in lockstep with the shrinking pills
  // instead.
  const animateScrollToStart = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    cancelAnimationFrame(scrollAnimFrame.current);
    const startLeft = el.scrollLeft;
    if (startLeft === 0) return;
    const startTime = performance.now();

    const step = (now) => {
      const progress = Math.min((now - startTime) / COLLAPSE_DURATION_MS, 1);
      el.scrollLeft = startLeft * (1 - collapseEasing(progress));
      if (progress < 1) {
        scrollAnimFrame.current = requestAnimationFrame(step);
      }
    };
    scrollAnimFrame.current = requestAnimationFrame(step);
  }, []);

  // Collapsing itself can trigger a spurious scroll event (see
  // IGNORE_SCROLL_MS above), so every path that collapses the carousel
  // goes through here rather than calling setExpanded(false) directly.
  const collapseNow = useCallback(() => {
    suppressScroll();
    animateScrollToStart();
    setExpanded(false);
  }, [suppressScroll, animateScrollToStart]);

  const scheduleCollapse = useCallback(
    (delay) => {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = setTimeout(collapseNow, delay);
    },
    [collapseNow]
  );

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
      ref={containerRef}
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
