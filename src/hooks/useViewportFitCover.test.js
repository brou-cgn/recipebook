import fs from 'fs';
import path from 'path';
import { renderHook } from '@testing-library/react';
import useViewportFitCover, { readViewportFit, withViewportFit } from './useViewportFitCover';

const INITIAL = 'width=device-width, initial-scale=1';

function viewportMeta() {
  return document.querySelector('meta[name="viewport"]');
}

beforeEach(() => {
  document.head.innerHTML = `<meta name="viewport" content="${INITIAL}" />`;
});

afterEach(() => {
  document.head.innerHTML = '';
  jest.useRealTimers();
});

describe('withViewportFit / readViewportFit', () => {
  test('setzt, ersetzt und entfernt viewport-fit, der Rest bleibt', () => {
    expect(withViewportFit(INITIAL, 'cover')).toBe(`${INITIAL}, viewport-fit=cover`);
    expect(withViewportFit(`${INITIAL}, viewport-fit=contain`, 'cover')).toBe(`${INITIAL}, viewport-fit=cover`);
    expect(withViewportFit(`${INITIAL},viewport-fit=cover`, null)).toBe(INITIAL);
    expect(readViewportFit(`${INITIAL}, viewport-fit=contain`)).toBe('contain');
    expect(readViewportFit(INITIAL)).toBeNull();
  });
});

describe('useViewportFitCover', () => {
  test('reicht bis an den Displayrand, solange aktiv, und setzt danach zurück', () => {
    const { rerender, unmount } = renderHook(({ active }) => useViewportFitCover(active), { initialProps: { active: false } });
    expect(viewportMeta().getAttribute('content')).toBe(INITIAL);

    rerender({ active: true });
    expect(viewportMeta().getAttribute('content')).toBe(`${INITIAL}, viewport-fit=cover`);

    rerender({ active: false });
    expect(viewportMeta().getAttribute('content')).toBe(INITIAL);

    rerender({ active: true });
    unmount();
    expect(viewportMeta().getAttribute('content')).toBe(INITIAL);
  });

  test('stellt einen vorher gesetzten Wert wieder her und lässt andere Änderungen stehen', () => {
    viewportMeta().setAttribute('content', `${INITIAL}, viewport-fit=contain`);
    const { unmount } = renderHook(() => useViewportFitCover(true));
    expect(readViewportFit(viewportMeta().getAttribute('content'))).toBe('cover');

    // Inzwischen ändert jemand anderes den Viewport (Zoom-Reset nach dem Drehen)
    viewportMeta().setAttribute('content', `${viewportMeta().getAttribute('content')}, maximum-scale=1.0`);
    unmount();
    expect(viewportMeta().getAttribute('content')).toBe(`${INITIAL}, maximum-scale=1.0, viewport-fit=contain`);
  });

  test('ohne meta viewport passiert nichts', () => {
    document.head.innerHTML = '';
    const { unmount } = renderHook(() => useViewportFitCover(true));
    unmount();
    expect(viewportMeta()).toBeNull();
  });
});

describe('Zoom-Reset nach dem Drehen (index.html)', () => {
  // Das Skript setzt kurz maximum-scale=1.0 und nimmt es wieder weg. Früher stellte es dazu den alten
  // Inhalt wieder her und hätte ein inzwischen gesetztes viewport-fit=cover überschrieben.
  test('nimmt nur den eigenen Zusatz zurück, viewport-fit=cover bleibt', () => {
    jest.useFakeTimers();
    const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const listeners = [];
    const fakeWindow = { addEventListener: (type, fn) => listeners.push({ type, fn }) };
    // Das Inline-Skript mit eigenem window ausführen, damit kein Listener am echten window hängen bleibt
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'setTimeout', script)(fakeWindow, document, setTimeout);
    expect(listeners.map((l) => l.type)).toEqual(['orientationchange']);

    listeners[0].fn();
    jest.advanceTimersByTime(400);
    expect(viewportMeta().getAttribute('content')).toBe(`${INITIAL}, maximum-scale=1.0`);

    // Der Kochmodus quer schaltet in diesem Moment viewport-fit=cover ein
    const { unmount } = renderHook(() => useViewportFitCover(true));
    jest.advanceTimersByTime(300);
    expect(viewportMeta().getAttribute('content')).toBe(`${INITIAL}, viewport-fit=cover`);
    unmount();
    expect(viewportMeta().getAttribute('content')).toBe(INITIAL);
  });
});
