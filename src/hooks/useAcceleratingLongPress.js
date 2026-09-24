import { useRef, useCallback } from 'react';

export const LONGPRESS_INITIAL_DELAY_MS = 500;
export const LONGPRESS_TICK_MS = 150;

// Step size used once the hold has lasted at least `afterMs`, checked
// longest-first so the escalation is 1 -> 10 -> 20 -> 50 -> 100.
export const LONGPRESS_STEP_THRESHOLDS = [
  { afterMs: 9000, step: 100 },
  { afterMs: 6000, step: 50 },
  { afterMs: 4000, step: 20 },
  { afterMs: 2000, step: 10 },
  { afterMs: 0, step: 1 },
];

function stepForElapsed(elapsedMs) {
  return LONGPRESS_STEP_THRESHOLDS.find(({ afterMs }) => elapsedMs >= afterMs).step;
}

/**
 * Press-and-hold repeat for steppers, with the step size escalating the
 * longer the button is held (see LONGPRESS_STEP_THRESHOLDS).
 *
 * `onStep(delta)` fires on every tick after the initial delay, where delta
 * is `direction * currentStepSize`. `triggeredRef` flips to true once the
 * repeat has fired at least once for the current press, so the caller's
 * onClick can skip its own single-step action for that press.
 *
 * Usage: start(1) / start(-1) on mousedown/touchstart, end() on
 * mouseup/mouseleave/touchend/touchcancel.
 */
export function useAcceleratingLongPress(onStep) {
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
        onStep(direction * stepForElapsed(elapsed));
      }, LONGPRESS_TICK_MS);
    }, LONGPRESS_INITIAL_DELAY_MS);
  }, [clear, onStep]);

  const end = useCallback(() => {
    clear();
  }, [clear]);

  return { start, end, triggeredRef };
}
