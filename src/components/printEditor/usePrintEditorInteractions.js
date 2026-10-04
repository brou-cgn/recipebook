import { useCallback, useEffect, useRef, useState } from 'react';
import { clamp, computeSnap, effectiveDimensions, getMaxY, MIN_ELEMENT_H, MIN_ELEMENT_W } from '../../utils/printLayout';

// Minimum pointer movement (in % of page width) before a press becomes a drag
const DRAG_THRESHOLD = 0.5;

/**
 * Pointer-based drag and resize for the print format canvas (mouse, touch, pen).
 * Updates are applied at most once per animation frame so the editor does not
 * re-render on every pointer event.
 *
 * @param {object} options
 * @param {React.RefObject<HTMLElement>} options.pageRef  canvas page element
 * @param {Array}    options.elements       current elements (merged with defaults)
 * @param {object}   options.page           { widthCm, heightCm }
 * @param {(id: string, patch: object) => void} options.updateElement
 * @param {(id: string) => void} options.onSelect  called when a press ends without a drag
 * @returns {{ startDrag, startResize, snapGuides }}
 */
export default function usePrintEditorInteractions({ pageRef, elements, page, updateElement, onSelect }) {
  const interactionRef = useRef(null);
  const didDragRef = useRef(false);
  const frameRef = useRef(null);
  const pendingRef = useRef(null);
  const [snapGuides, setSnapGuides] = useState({ h: [], v: [] });

  // Latest values for the long-lived document listeners.
  const latest = useRef({});
  latest.current = { elements, page, updateElement, onSelect };

  const begin = useCallback((e, elementId, extra) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = pageRef.current?.getBoundingClientRect();
    const el = latest.current.elements.find((item) => item.id === elementId);
    if (!rect || !el) return;
    interactionRef.current = {
      elementId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startElemX: el.x,
      startElemY: el.y,
      startElemW: el.w,
      startElemH: el.h,
      pageWidth: rect.width,
      pageHeight: rect.height,
      ...extra,
    };
  }, [pageRef]);

  const startDrag = useCallback((e, elementId) => {
    didDragRef.current = false;
    begin(e, elementId, { type: 'drag' });
  }, [begin]);

  const startResize = useCallback((e, elementId, handle) => {
    didDragRef.current = true; // a resize is never a click
    begin(e, elementId, { type: 'resize', handle });
  }, [begin]);

  useEffect(() => {
    const apply = (clientX, clientY) => {
      const state = interactionRef.current;
      if (!state || !didDragRef.current) return;
      const { elements: els, page: pg, updateElement: update } = latest.current;
      const dx = ((clientX - state.startMouseX) / state.pageWidth) * 100;
      const dy = ((clientY - state.startMouseY) / state.pageWidth) * 100;
      const maxY = getMaxY(pg);

      if (state.type === 'drag') {
        const el = els.find((item) => item.id === state.elementId);
        if (!el) return;
        const { effW, effH } = effectiveDimensions(el);
        const rawX = clamp(state.startElemX + dx, 0, 100 - effW);
        const rawY = clamp(state.startElemY + dy, 0, maxY - effH);
        const snapped = computeSnap(el, rawX, rawY, els);
        setSnapGuides(snapped.guides);
        update(state.elementId, {
          x: clamp(snapped.x, 0, 100 - effW),
          y: clamp(snapped.y, 0, maxY - effH),
        });
        return;
      }

      const { handle } = state;
      let x = state.startElemX;
      let y = state.startElemY;
      let w = state.startElemW;
      let h = state.startElemH;
      if (handle.includes('e')) w = Math.max(MIN_ELEMENT_W, state.startElemW + dx);
      if (handle.includes('s')) h = Math.max(MIN_ELEMENT_H, state.startElemH + dy);
      if (handle.includes('w')) {
        const newW = Math.max(MIN_ELEMENT_W, state.startElemW - dx);
        x = clamp(state.startElemX + (state.startElemW - newW), 0, 100 - MIN_ELEMENT_W);
        w = newW;
      }
      if (handle.includes('n')) {
        const newH = Math.max(MIN_ELEMENT_H, state.startElemH - dy);
        y = clamp(state.startElemY + (state.startElemH - newH), 0, maxY - MIN_ELEMENT_H);
        h = newH;
      }
      w = Math.min(w, 100 - x);
      h = Math.min(h, maxY - y);
      update(state.elementId, { x, y, w, h });
    };

    const flush = () => {
      frameRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) apply(pending.x, pending.y);
    };

    const onMove = (e) => {
      const state = interactionRef.current;
      if (!state) return;
      const dx = ((e.clientX - state.startMouseX) / state.pageWidth) * 100;
      const dy = ((e.clientY - state.startMouseY) / state.pageWidth) * 100;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) didDragRef.current = true;
      if (!didDragRef.current) return;
      pendingRef.current = { x: e.clientX, y: e.clientY };
      if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(flush);
    };

    const onUp = (e) => {
      const state = interactionRef.current;
      if (state && frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        flush();
      }
      if (state && !didDragRef.current) latest.current.onSelect(state.elementId);
      interactionRef.current = null;
      pendingRef.current = null;
      setSnapGuides({ h: [], v: [] });
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return { startDrag, startResize, snapGuides };
}
