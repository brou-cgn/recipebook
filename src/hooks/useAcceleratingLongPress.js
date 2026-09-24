import { useRef, useCallback } from 'react';

export const LONGPRESS_INITIAL_DELAY_MS = 500;
export const LONGPRESS_TICK_MS = 150;

// Step size used once the hold has lasted at least `afterMs`, checked
// longest-first so the escalation is 1 -> 2 -> 5 -> 10 -> 20 -> 50 -> 100.
export const LONGPRESS_STEP_THRESHOLDS = [
  { afterMs: 9000, step: 100 },
  { afterMs: 7000, step: 50 },
  { afterMs: 5000, step: 20 },
  { afterMs: 3500, step: 10 },
  { afterMs: 2000, step: 5 },
  { afterMs: 1000, step: 2 },
  { afterMs: 0, step: 1 },
];

function stepForElapsed(elapsedMs) {
  return LONGPRESS_STEP_THRESHOLDS.find(({ afterMs }) => elapsedMs >= afterMs).step;
}

/**
 * Moves `value` one step in `direction`, landing on the next multiple of
 * `stepSize` in that direction rather than just adding/subtracting it - so
 * repeated ticks always land on numbers evenly divisible by the current
 * step size (e.g. holding at step 10 goes ...20, 30, 40, never 23, 33).
 * `value` is expected to already be an integer.
 */
export function stepToNextMultiple(value, direction, stepSize) {
  const onGrid = value % stepSize === 0;
  if (direction > 0) {
    return onGrid ? value + stepSize : Math.ceil(value / stepSize) * stepSize;
  }
  return onGrid ? value - stepSize : Math.floor(value / stepSize) * stepSize;
}

/**
 * Press-and-hold repeat for steppers, with the step size escalating the
 * longer the button is held (see LONGPRESS_STEP_THRESHOLDS).
 *
 * `onTick(direction, stepSize)` fires on every tick after the initial delay.
 * `triggeredRef` flips to true once the repeat has fired at least once for
 * the current press, so the caller's onClick can skip its own single-step
 * action for that press.
 *
 * Usage: start(1) / start(-1) on mousedown/touchstart, end() on
 * mouseup/mouseleave/touchend/touchcancel.
 */
export function useAcceleratingLongPress(onTick) {
  const timeoutRef = useRef(null);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const triggeredRef = useRef(false);

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback((direction) => {
    clear();
    startTimeRef.current = Date.now();
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        triggeredRef.current = true;
        const elapsed = Date.now() - startTimeRef.current;
        onTick(direction, stepForElapsed(elapsed));
      }, LONGPRESS_TICK_MS);
    }, LONGPRESS_INITIAL_DELAY_MS);
  }, [clear, onTick]);

  const end = useCallback(() => {
    clear();
  }, [clear]);

  return { start, end, triggeredRef };
}
