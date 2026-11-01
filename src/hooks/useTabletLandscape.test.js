import { renderHook, act } from '@testing-library/react';
import useTabletLandscape, { isTabletLandscape } from './useTabletLandscape';

function setViewport(width, height) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: height });
}

function mockPointer(coarse) {
  window.matchMedia = jest.fn((query) => ({ matches: query === '(pointer: coarse)' ? coarse : false }));
}

describe('useTabletLandscape', () => {
  const originalMatchMedia = window.matchMedia;
  const originalMaxTouchPoints = navigator.maxTouchPoints;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: originalMaxTouchPoints });
    setViewport(1024, 768);
    jest.useRealTimers();
  });

  test('iPad quer (Finger als Zeiger) zählt als Tablet im Querformat', () => {
    mockPointer(true);
    setViewport(1194, 834);
    expect(isTabletLandscape()).toBe(true);
    // iPad mini quer
    setViewport(1133, 744);
    expect(isTabletLandscape()).toBe(true);
  });

  test('iPad hochkant, Handy quer und ein schmales Fenster zählen nicht', () => {
    mockPointer(true);
    setViewport(834, 1194);
    expect(isTabletLandscape()).toBe(false);
    setViewport(852, 393);
    expect(isTabletLandscape()).toBe(false);
    setViewport(880, 600);
    expect(isTabletLandscape()).toBe(false);
  });

  test('ein Desktop-Browser mit Maus zählt nicht, auch nicht in einem breiten Fenster', () => {
    mockPointer(false);
    setViewport(1440, 900);
    expect(isTabletLandscape()).toBe(false);
  });

  test('ohne matchMedia entscheiden die Touch-Punkte', () => {
    window.matchMedia = undefined;
    setViewport(1194, 834);
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
    expect(isTabletLandscape()).toBe(true);
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 });
    expect(isTabletLandscape()).toBe(false);
  });

  test('folgt dem Drehen, entprellt', () => {
    jest.useFakeTimers();
    mockPointer(true);
    setViewport(834, 1194);
    const { result } = renderHook(() => useTabletLandscape());
    expect(result.current).toBe(false);

    setViewport(1194, 834);
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(result.current).toBe(false);
    act(() => { jest.advanceTimersByTime(150); });
    expect(result.current).toBe(true);

    setViewport(834, 1194);
    act(() => {
      window.dispatchEvent(new Event('orientationchange'));
      jest.advanceTimersByTime(150);
    });
    expect(result.current).toBe(false);
  });
});
