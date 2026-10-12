import { renderHook, act } from '@testing-library/react';
import usePrefersReducedMotion from './usePrefersReducedMotion';

function mockMatchMedia(matches) {
  const listeners = new Set();
  const mql = {
    matches,
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  };
  window.matchMedia = jest.fn(() => mql);
  return {
    change: (next) => {
      mql.matches = next;
      listeners.forEach((fn) => fn({ matches: next }));
    },
    listeners,
  };
}

describe('usePrefersReducedMotion', () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  test('false, wenn matchMedia nicht verfügbar ist', () => {
    window.matchMedia = undefined;
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  test('übernimmt den Systemwert', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  test('reagiert auf Änderungen und räumt den Listener auf', () => {
    const mm = mockMatchMedia(false);
    const { result, unmount } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
    act(() => mm.change(true));
    expect(result.current).toBe(true);
    unmount();
    expect(mm.listeners.size).toBe(0);
  });
});
