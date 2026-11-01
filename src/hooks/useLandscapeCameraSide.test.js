import { renderHook, act } from '@testing-library/react';
import useLandscapeCameraSide, { getCameraSide } from './useLandscapeCameraSide';

// jsdom kennt weder window.orientation noch screen.orientation: je Test setzen, danach entfernen
function setLegacyOrientation(value) {
  Object.defineProperty(window, 'orientation', { configurable: true, writable: true, value });
}

function setScreenOrientation(angle) {
  const listeners = new Set();
  const orientation = {
    angle,
    addEventListener: (type, fn) => { if (type === 'change') listeners.add(fn); },
    removeEventListener: (type, fn) => { if (type === 'change') listeners.delete(fn); },
    rotateTo(next) {
      this.angle = next;
      listeners.forEach((fn) => fn());
    },
  };
  Object.defineProperty(window.screen, 'orientation', { configurable: true, value: orientation });
  return orientation;
}

afterEach(() => {
  delete window.orientation;
  delete window.screen.orientation;
});

describe('getCameraSide', () => {
  test('window.orientation: 90 (nach links gedreht, Home-Taste rechts) heißt Kamera links, -90 rechts', () => {
    setLegacyOrientation(90);
    expect(getCameraSide()).toBe('left');
    setLegacyOrientation(-90);
    expect(getCameraSide()).toBe('right');
  });

  test('im Hochformat keine Seite', () => {
    setLegacyOrientation(0);
    expect(getCameraSide()).toBeNull();
    setLegacyOrientation(180);
    expect(getCameraSide()).toBeNull();
  });

  test('window.orientation geht vor screen.orientation (Safari zählt dort andersherum als Android)', () => {
    setLegacyOrientation(-90);
    setScreenOrientation(90);
    expect(getCameraSide()).toBe('right');
  });

  test('ohne window.orientation zählt der Winkel wie auf Android: 90 links, 270 rechts', () => {
    setScreenOrientation(90);
    expect(getCameraSide()).toBe('left');
    setScreenOrientation(270);
    expect(getCameraSide()).toBe('right');
    setScreenOrientation(0);
    expect(getCameraSide()).toBeNull();
  });

  test('meldet der Browser keine Richtung (Desktop), gibt es keine Seite', () => {
    expect(getCameraSide()).toBeNull();
  });
});

describe('useLandscapeCameraSide', () => {
  test('folgt dem Drehen von quer nach quer (orientationchange, ohne resize)', () => {
    setLegacyOrientation(90);
    const { result } = renderHook(() => useLandscapeCameraSide());
    expect(result.current).toBe('left');

    setLegacyOrientation(-90);
    act(() => { window.dispatchEvent(new Event('orientationchange')); });
    expect(result.current).toBe('right');

    setLegacyOrientation(0);
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(result.current).toBeNull();
  });

  test('folgt screen.orientation, wenn es window.orientation nicht gibt', () => {
    const orientation = setScreenOrientation(270);
    const { result, unmount } = renderHook(() => useLandscapeCameraSide());
    expect(result.current).toBe('right');

    act(() => { orientation.rotateTo(90); });
    expect(result.current).toBe('left');
    unmount();
  });
});
