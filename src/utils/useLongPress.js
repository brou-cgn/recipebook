import { useState, useRef } from 'react';

export const LONGPRESS_DURATION_MS = 500;

/**
 * Custom hook providing long-press interaction handlers.
 *
 * Returns:
 *   - activeId:      the ID currently being long-pressed (or null)
 *   - triggeredRef:  ref flag set to true when a long-press fires (checked in onClick to suppress the click)
 *   - start(id, onLongPress): call on mousedown / touchstart
 *   - end():         call on mouseup / mouseleave / touchend / touchcancel
 */
export function useLongPress(duration = LONGPRESS_DURATION_MS) {
  const [activeId, setActiveId] = useState(null);
  const timerRef = useRef(null);
  const triggeredRef = useRef(false);

  const start = (id, onLongPress) => {
    setActiveId(id);
    timerRef.current = setTimeout(() => {
      triggeredRef.current = true;
      onLongPress();
      setActiveId(null);
    }, duration);
  };

  const end = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setActiveId(null);
  };

  return { activeId, triggeredRef, start, end };
}
