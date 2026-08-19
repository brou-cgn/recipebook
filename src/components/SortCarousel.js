import React, { useRef, useEffect, useCallback, useState } from 'react';
import './SortCarousel.css';

// Newton-Raphson solver for a CSS-style cubic-bezier(x1, y1, x2, y2) easing
// curve, so the scrollLeft reset in animateScrollToStart (below) can move on
// exactly the same curve as the CSS max-width transition instead of the
// browser's own (differently-timed) native smooth scroll.
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

// Fallback for the "swipe active pill to its target" pre-collapse step
// below, in case the browser never fires 'scrollend' (older Safari).
// Comfortably longer than any native smooth-scroll over a pill's width.
const SWIPE_SETTLE_TIMEOUT_MS = 500;

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
  const swipeSettleCleanup = useRef(null);
  // Starts collapsed, showing just the active pill, until the user swipes,
  // taps, or focuses it (see the expand handlers below).
  const [expanded, setExpanded] = useState(false);

  const activeIndex = SORT_OPTIONS.findIndex((o) => o.id === activeSort);
  const safeIndex = activeIndex >= 0 ? activeIndex : 0;

  // Starts (or extends) an ignore window that ends automatically after
  // IGNORE_SCROLL_MS. Used for scroll noise we expect to settle quickly on
  // its own (the shrink's own scrollLeft clamp).
  const suppressScroll = useCallback(() => {
    ignoreScroll.current = true;
    clearTimeout(ignoreScrollTimer.current);
    ignoreScrollTimer.current = setTimeout(() => {
      ignoreScroll.current = false;
    }, IGNORE_SCROLL_MS);
  }, []);

  // Starts an open-ended ignore window with no auto-revert, for scroll
  // noise whose end we detect explicitly (the pre-collapse swipe below).
  const holdScroll = useCallback(() => {
    ignoreScroll.current = true;
    clearTimeout(ignoreScrollTimer.current);
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
      swipeSettleCleanup.current?.();
    },
    []
  );

  // Once collapsed, only the active pill remains (the rest shrink to
  // max-width: 0), so the container's scroll position always ends up at
  // 0. Left to itself the browser only clamps scrollLeft once the
  // shrinking content can no longer contain it, and that clamp is an
  // instant jump, not part of the width transition.
  //
  // Native `scrollTo({ behavior: 'smooth' })` avoids that clamp, but runs
  // on the browser's own (unrelated) timing and easing, not the pills'
  // CSS transition — the two drift apart mid-collapse and the active pill
  // visibly wobbles. Driving scrollLeft by hand on the same duration and
  // curve as the CSS keeps it moving in lockstep with the shrinking pills
  // instead.
  //
  // This only works cleanly if scrollLeft is already flush with the
  // active pill's left edge (see swipeActiveToTarget below) *before* this
  // runs — otherwise the pill both shrinks into view and slides sideways
  // at once, which is the "hop" this used to produce. It also needs to
  // start on the same frame as the CSS transition it's shadowing (see the
  // rAF scheduling in shrinkTrack below), or the two still drift apart for
  // their first few frames even with matching duration/easing.
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

  // Phase 2: shrink the inactive pills (and the track around them) now
  // that the active pill sits flush left. Collapsing itself can trigger a
  // spurious scroll event (see IGNORE_SCROLL_MS above), so this is the
  // only place that calls setExpanded(false).
  const shrinkTrack = useCallback(() => {
    suppressScroll();
    setExpanded(false);
    // animateScrollToStart must begin on the exact same frame the CSS
    // max-width transition (triggered by the class change above) visually
    // starts, or the two drift apart for their first few frames and the
    // active pill wobbles as shrinking siblings briefly peek back into
    // view. React only commits the class removal — and the browser only
    // starts transitioning from the old value — after this frame paints,
    // so wait two rAFs (commit, then paint) before starting the scrollLeft
    // animation to line its start up with that.
    requestAnimationFrame(() => {
      requestAnimationFrame(animateScrollToStart);
    });
  }, [suppressScroll, animateScrollToStart]);

  // Phase 1: before touching any widths, bring the active pill to the
  // position it'll occupy once collapsed (flush against the track's left
  // edge) via a plain native smooth scroll, and wait for the browser to
  // actually finish it. Doing this first — instead of animating scrollLeft
  // by hand at the same time as the shrink, as we used to — means phase 2
  // never has to fight leftover touch momentum or scroll-snap settling; by
  // the time it starts, the pill is already stationary and correctly
  // positioned, so the shrink can't make it hop.
  const swipeActiveToTarget = useCallback(
    (onSettled) => {
      const el = containerRef.current;
      const activeEl = itemRefs.current[safeIndex];
      if (!el || !activeEl) {
        onSettled();
        return;
      }

      const target = activeEl.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
      if (Math.abs(target - el.scrollLeft) < 1) {
        onSettled();
        return;
      }

      holdScroll();
      // Cancel any still-pending swipe from a previous call (without
      // firing its onSettled) before starting this one.
      swipeSettleCleanup.current?.();

      let settled = false;
      const cleanup = () => {
        el.removeEventListener('scrollend', finish);
        clearTimeout(fallback);
        swipeSettleCleanup.current = null;
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        onSettled();
      };
      const fallback = setTimeout(finish, SWIPE_SETTLE_TIMEOUT_MS);
      swipeSettleCleanup.current = cleanup;
      el.addEventListener('scrollend', finish);
      el.scrollTo({ left: target, behavior: 'smooth' });
    },
    [safeIndex, holdScroll]
  );

  const collapseNow = useCallback(() => {
    swipeActiveToTarget(shrinkTrack);
  }, [swipeActiveToTarget, shrinkTrack]);

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
