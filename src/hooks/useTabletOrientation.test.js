import { renderHook, act } from '@testing-library/react';
import useTabletOrientation, { getTabletOrientation, isTabletLandscape, isTabletPortrait } from './useTabletOrientation';

function setViewport(width, height) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: height });
}

function mockPointer(coarse) {
  window.matchMedia = jest.fn((query) => ({ matches: query === '(pointer: coarse)' ? coarse : false }));
}

describe('useTabletOrientation', () => {
  const originalMatchMedia = window.matchMedia;
  const originalMaxTouchPoints = navigator.maxTouchPoints;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: originalMaxTouchPoints });
    setViewport(1024, 768);
    jest.useRealTimers();
  });

  describe('quer (Entwurf I4)', () => {
    test('iPad quer (Finger als Zeiger) zählt als Tablet im Querformat', () => {
      mockPointer(true);
      setViewport(1194, 834);
      expect(isTabletLandscape()).toBe(true);
      expect(getTabletOrientation()).toBe('landscape');
      // iPad mini quer
      setViewport(1133, 744);
      expect(isTabletLandscape()).toBe(true);
    });

    test('iPad hochkant, Handy quer und ein schmales Fenster zählen nicht als quer', () => {
      mockPointer(true);
      setViewport(834, 1194);
      expect(isTabletLandscape()).toBe(false);
      setViewport(852, 393);
      expect(isTabletLandscape()).toBe(false);
      expect(getTabletOrientation()).toBeNull();
      setViewport(880, 600);
      expect(isTabletLandscape()).toBe(false);
    });
  });

  describe('hochkant (Entwurf T1)', () => {
    test('iPad hochkant zählt, auch das iPad mini (744 px) und das große iPad', () => {
      mockPointer(true);
      setViewport(834, 1194);
      expect(isTabletPortrait()).toBe(true);
      expect(getTabletOrientation()).toBe('portrait');
      setViewport(744, 1133);
      expect(getTabletOrientation()).toBe('portrait');
      setViewport(1024, 1366);
      expect(getTabletOrientation()).toBe('portrait');
    });

    test('Handys hochkant und iPad-Fenster in Split View bleiben beim Handy-Layout', () => {
      mockPointer(true);
      // iPhone 16 Pro Max
      setViewport(440, 956);
      expect(isTabletPortrait()).toBe(false);
      // iPad Pro 11" quer, App in der halben Breite
      setViewport(597, 834);
      expect(isTabletPortrait()).toBe(false);
      setViewport(743, 1133);
      expect(getTabletOrientation()).toBeNull();
    });
  });

  test('ein Desktop-Browser mit Maus zählt nicht, auch nicht in einem breiten oder hohen Fenster', () => {
    mockPointer(false);
    setViewport(1440, 900);
    expect(getTabletOrientation()).toBeNull();
    setViewport(900, 1200);
    expect(getTabletOrientation()).toBeNull();
  });

  test('ohne matchMedia entscheiden die Touch-Punkte', () => {
    window.matchMedia = undefined;
    setViewport(1194, 834);
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
    expect(getTabletOrientation()).toBe('landscape');
    setViewport(834, 1194);
    expect(getTabletOrientation()).toBe('portrait');
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 });
    expect(getTabletOrientation()).toBeNull();
  });

  test('folgt dem Drehen, entprellt', () => {
    jest.useFakeTimers();
    mockPointer(true);
    setViewport(834, 1194);
    const { result } = renderHook(() => useTabletOrientation());
    expect(result.current).toBe('portrait');

    setViewport(1194, 834);
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(result.current).toBe('portrait');
    act(() => { jest.advanceTimersByTime(150); });
    expect(result.current).toBe('landscape');

    setViewport(834, 1194);
    act(() => {
      window.dispatchEvent(new Event('orientationchange'));
      jest.advanceTimersByTime(150);
    });
    expect(result.current).toBe('portrait');
  });
});
