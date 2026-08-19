import { useCallback, useRef, useState } from 'react';

// Shared left-swipe-to-reveal-delete gesture for mobile list rows (events,
// drinks, guests, recipe ingredients/steps). See CLAUDE.md: mobile uses this
// gesture in place of the desktop DeleteRowButton.
export const SWIPE_DELETE_THRESHOLD = 56;
export const SWIPE_DELETE_MAX_OFFSET = 96;
export const SWIPE_DIRECTION_LOCK_THRESHOLD = 6;

/**
 * @param {Object} [options]
 * @param {boolean} [options.disabled] - Disables the gesture entirely (e.g. no permission, predefined item).
 * @param {boolean} [options.isDeleteVisible] - Pass to control the revealed-delete-button state externally
 *   (e.g. so only one row in a list has its delete button open at a time). Omit for internal state.
 * @param {(visible: boolean) => void} [options.onDeleteVisibleChange] - Required when isDeleteVisible is controlled.
 * @param {(info: {deltaX: number, deltaY: number, absX: number, absY: number, direction: string|null}|null) => void} [options.onMove] -
 *   Called on every touchmove with the raw gesture delta (or null when the move is ignored), for callers that need
 *   to react to movement beyond the swipe itself (e.g. cancelling a long-press timer).
 * @param {number} [options.maxOffset] - Overrides SWIPE_DELETE_MAX_OFFSET for callers whose row is narrower
 *   or wants a shorter reveal (e.g. MenuForm's recipe/drink rows).
 */
export default function useSwipeToDelete({
  disabled = false,
  isDeleteVisible: controlledVisible,
  onDeleteVisibleChange,
  onMove,
  maxOffset = SWIPE_DELETE_MAX_OFFSET,
} = {}) {
  const touchStartXRef = useRef(null);
  const touchStartYRef = useRef(null);
  const swipeDirectionLockedRef = useRef(null);
  const isSwipingRef = useRef(false);
  const swipeOffsetRef = useRef(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [internalVisible, setInternalVisible] = useState(false);

  const isControlled = controlledVisible !== undefined;
  const isDeleteVisible = isControlled ? controlledVisible : internalVisible;
  const setIsDeleteVisible = useCallback((value) => {
    if (isControlled) onDeleteVisibleChange?.(value);
    else setInternalVisible(value);
  }, [isControlled, onDeleteVisibleChange]);

  const offset = isDeleteVisible ? -maxOffset : swipeOffset;

  const reset = useCallback(({ keepDelete = false } = {}) => {
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    swipeDirectionLockedRef.current = null;
    isSwipingRef.current = false;
    swipeOffsetRef.current = 0;
    setSwipeOffset(0);
    if (!keepDelete) setIsDeleteVisible(false);
  }, [setIsDeleteVisible]);

  const onTouchStart = useCallback((e) => {
    const touch = e.touches?.[0];
    if (!touch || disabled) return;
    setIsDeleteVisible(false);
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    swipeDirectionLockedRef.current = null;
    isSwipingRef.current = false;
  }, [disabled, setIsDeleteVisible]);

  const onTouchMove = useCallback((e) => {
    const touch = e.touches?.[0];
    if (!touch || touchStartXRef.current === null || touchStartYRef.current === null || disabled) {
      onMove?.(null);
      return;
    }

    const deltaX = touch.clientX - touchStartXRef.current;
    const deltaY = touch.clientY - touchStartYRef.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!swipeDirectionLockedRef.current && (absX > SWIPE_DIRECTION_LOCK_THRESHOLD || absY > SWIPE_DIRECTION_LOCK_THRESHOLD)) {
      swipeDirectionLockedRef.current = absX > absY ? 'horizontal' : 'vertical';
    }
    const direction = swipeDirectionLockedRef.current;

    if (direction === 'horizontal' && deltaX < 0) {
      isSwipingRef.current = true;
      const clamped = Math.max(deltaX, -maxOffset);
      swipeOffsetRef.current = clamped;
      setSwipeOffset(clamped);
      if (e.cancelable) e.preventDefault();
    }
    onMove?.({ deltaX, deltaY, absX, absY, direction });
  }, [disabled, maxOffset, onMove]);

  const onTouchEnd = useCallback(() => {
    if (isSwipingRef.current && Math.abs(swipeOffsetRef.current) >= SWIPE_DELETE_THRESHOLD) {
      setIsDeleteVisible(true);
      reset({ keepDelete: true });
      return;
    }
    reset();
  }, [reset, setIsDeleteVisible]);

  const onTouchCancel = useCallback(() => reset(), [reset]);

  return {
    offset,
    isDeleteVisible,
    reset,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel },
  };
}
