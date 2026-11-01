import fs from 'fs';
import path from 'path';
import { renderHook } from '@testing-library/react';
import useViewportFitCover, {
  isViewportCoverActive,
  readViewportFit,
  resetViewportCoverForTests,
  withViewportFit,
} from './useViewportFitCover';

const INITIAL = 'width=device-width, initial-scale=1';
const COVER = `${INITIAL}, viewport-fit=cover`;

function viewportContent() {
  return document.querySelector('meta[name="viewport"]').getAttribute('content');
}

function setOrientation(value) {
  Object.defineProperty(window, 'orientation', { configurable: true, writable: true, value });
}

// Drehen: iOS setzt window.orientation und meldet orientationchange
function rotate(value) {
  setOrientation(value);
  window.dispatchEvent(new Event('orientationchange'));
}

beforeEach(() => {
  document.head.innerHTML = `<meta name="viewport" content="${INITIAL}" />`;
  setOrientation(0);
});

afterEach(() => {
  resetViewportCoverForTests();
  delete window.orientation;
  document.head.innerHTML = '';
  jest.useRealTimers();
});

describe('withViewportFit / readViewportFit', () => {
  test('setzt, ersetzt und entfernt viewport-fit, der Rest bleibt', () => {
    expect(withViewportFit(INITIAL, 'cover')).toBe(COVER);
    expect(withViewportFit(`${INITIAL}, viewport-fit=contain`, 'cover')).toBe(COVER);
    expect(withViewportFit(`${INITIAL},viewport-fit=cover`, null)).toBe(INITIAL);
    expect(readViewportFit(`${INITIAL}, viewport-fit=contain`)).toBe('contain');
    expect(readViewportFit(INITIAL)).toBeNull();
  });
});

describe('useViewportFitCover', () => {
  test('schaltet nur beim Drehen um: quer an, hochkant aus', () => {
    renderHook(() => useViewportFitCover(true));
    expect(viewportContent()).toBe(INITIAL);

    rotate(90);
    expect(viewportContent()).toBe(COVER);
    expect(isViewportCoverActive()).toBe(true);

    // Halbe Drehung von quer nach quer: bleibt
    rotate(-90);
    expect(viewportContent()).toBe(COVER);

    rotate(0);
    expect(viewportContent()).toBe(INITIAL);
    expect(isViewportCoverActive()).toBe(false);
  });

  test('schon quer geöffnet: kein Umschalten zwischendurch, erst beim nächsten Drehen', () => {
    setOrientation(90);
    renderHook(() => useViewportFitCover(true));
    window.dispatchEvent(new Event('resize'));
    expect(viewportContent()).toBe(INITIAL);

    rotate(-90);
    expect(viewportContent()).toBe(COVER);
  });

  test('quer verlassen: cover bleibt bis zum Drehen, hochkant ist es weg', () => {
    const { unmount } = renderHook(() => useViewportFitCover(true));
    rotate(90);
    unmount();
    expect(viewportContent()).toBe(COVER);

    // Ohne Ansicht, die es will, schaltet auch eine Drehung von quer nach quer nicht wieder ein
    rotate(0);
    expect(viewportContent()).toBe(INITIAL);
    rotate(90);
    expect(viewportContent()).toBe(INITIAL);
  });

  test('Rückfall: hochkant ohne orientationchange (z. B. im Hintergrund gedreht) entfernt cover beim nächsten resize', () => {
    renderHook(() => useViewportFitCover(true));
    rotate(90);
    setOrientation(0);
    window.dispatchEvent(new Event('resize'));
    expect(viewportContent()).toBe(INITIAL);
  });

  test('ohne Wunsch (kein Flag, kein Handy) passiert beim Drehen nichts', () => {
    renderHook(() => useViewportFitCover(false));
    rotate(90);
    expect(viewportContent()).toBe(INITIAL);
  });

  test('stellt einen vorher gesetzten Wert wieder her und lässt andere Änderungen stehen', () => {
    document.querySelector('meta[name="viewport"]').setAttribute('content', `${INITIAL}, viewport-fit=contain`);
    renderHook(() => useViewportFitCover(true));
    rotate(90);
    expect(readViewportFit(viewportContent())).toBe('cover');

    document.querySelector('meta[name="viewport"]').setAttribute('content', `${viewportContent()}, maximum-scale=1.0`);
    rotate(0);
    expect(viewportContent()).toBe(`${INITIAL}, maximum-scale=1.0, viewport-fit=contain`);
  });

  test('ohne meta viewport passiert nichts', () => {
    document.head.innerHTML = '';
    renderHook(() => useViewportFitCover(true));
    rotate(90);
    expect(document.querySelector('meta[name="viewport"]')).toBeNull();
    expect(isViewportCoverActive()).toBe(false);
  });
});

describe('Zoom-Reset nach dem Drehen (index.html)', () => {
  // Das Skript setzt 400 ms nach dem Drehen kurz maximum-scale=1.0 und nimmt es wieder weg. Früher
  // stellte es dazu den alten Inhalt wieder her und hätte ein inzwischen geändertes viewport-fit überschrieben.
  test('nimmt nur den eigenen Zusatz zurück, viewport-fit bleibt', () => {
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
    expect(viewportContent()).toBe(`${INITIAL}, maximum-scale=1.0`);

    // Währenddessen ändert sich viewport-fit (etwa ein zweites Drehen)
    document.querySelector('meta[name="viewport"]')
      .setAttribute('content', withViewportFit(viewportContent(), 'cover'));
    jest.advanceTimersByTime(300);
    expect(viewportContent()).toBe(COVER);
  });
});
