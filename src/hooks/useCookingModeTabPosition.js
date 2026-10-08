import { useState, useEffect, useRef, useCallback } from 'react';

export const DEFAULT_TAB_TOP = 0.38;
const EDGE_MARGIN = 0.06;
const KEY_STEP = 0.05;

const storageKey = (userId) => `cookingModeTabTop_${userId || 'guest'}`;

const readStored = (userId) => {
  try {
    const value = parseFloat(localStorage.getItem(storageKey(userId)));
    return Number.isFinite(value) ? value : DEFAULT_TAB_TOP;
  } catch {
    return DEFAULT_TAB_TOP;
  }
};

/**
 * Vertikale Position der Kochmodus-Seitenlasche, je Anwender gespeichert
 * (Anteil der Viewport-Höhe, 0–1, für die Oberkante der Lasche).
 *
 * Gibt `top` (Anteil), `tabRef` für die Lasche sowie Props für die gesamte Lasche (außer Buttons) zurück:
 * Ziehen per Pointer (Maus/Touch) und Pfeil hoch/runter per Tastatur.
 */
export default function useCookingModeTabPosition(userId) {
  const [top, setTop] = useState(() => readStored(userId));
  const tabRef = useRef(null);
  const drag = useRef(null);
  const topRef = useRef(top);
  topRef.current = top;

  useEffect(() => {
    setTop(readStored(userId));
  }, [userId]);

  const clamp = useCallback((value) => {
    const tabHeight = tabRef.current?.offsetHeight || 0;
    const max = Math.max(EDGE_MARGIN, 1 - EDGE_MARGIN - tabHeight / window.innerHeight);
    return Math.min(max, Math.max(EDGE_MARGIN, value));
  }, []);

  const persist = useCallback((value) => {
    try {
      localStorage.setItem(storageKey(userId), String(value));
    } catch {
      /* Speicher nicht verfügbar – Position gilt nur für diese Sitzung */
    }
  }, [userId]);

  const onPointerDown = (e) => {
    // Buttons (z. B. „Kochmodus beenden“) bleiben normal klickbar und starten kein Ziehen
    if (e.target.closest?.('button')) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { startY: e.clientY, startTop: topRef.current };
  };

  const onPointerMove = (e) => {
    if (!drag.current) return;
    const delta = (e.clientY - drag.current.startY) / window.innerHeight;
    setTop(clamp(drag.current.startTop + delta));
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    persist(topRef.current);
  };

  const onKeyDown = (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const next = clamp(topRef.current + (e.key === 'ArrowUp' ? -KEY_STEP : KEY_STEP));
    setTop(next);
    persist(next);
  };

  return {
    top,
    tabRef,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onKeyDown,
    },
  };
}
