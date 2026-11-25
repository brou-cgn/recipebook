import { useLayoutEffect, useRef, useState } from 'react';

export const CM_TO_PX = 96 / 2.54;

/**
 * Scale factor that fits a page of `widthCm` into its wrapper element (preview only).
 * Starts with a small default so the first paint is never huge; falls back to it
 * where ResizeObserver does not exist (tests).
 *
 * @returns {{ wrapperRef: React.RefObject<HTMLElement>, scale: number }}
 */
export default function usePreviewScale(widthCm, enabled = true) {
  const wrapperRef = useRef(null);
  const [scale, setScale] = useState(0.4);

  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;
    const update = () => {
      const w = wrapper.clientWidth;
      if (w > 0) setScale(w / (widthCm * CM_TO_PX));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [enabled, widthCm]);

  return { wrapperRef, scale };
}
