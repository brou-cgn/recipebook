import {
  saveSessionSnapshot,
  clearSessionSnapshot,
  readRecoverySnapshot,
  trackSessionScroll,
  restoreScrollPosition,
} from './sessionRestore';
import { isRecoveryNavigation } from './navigationType';

jest.mock('./navigationType', () => ({
  isRecoveryNavigation: jest.fn(),
}));

const KEY = 'lastSessionSnapshot';

describe('sessionRestore', () => {
  beforeEach(() => {
    localStorage.clear();
    isRecoveryNavigation.mockReturnValue(true);
  });

  describe('readRecoverySnapshot', () => {
    test('returns view, recipe and scroll position after an involuntary restart', () => {
      saveSessionSnapshot({ view: 'recipes', recipeId: 'abc123', scrollY: 840 });

      expect(readRecoverySnapshot()).toEqual({
        view: 'recipes',
        recipeId: 'abc123',
        scrollY: 840,
      });
    });

    test('returns null on a deliberate fresh open, even with a snapshot present', () => {
      saveSessionSnapshot({ view: 'recipes', recipeId: 'abc123', scrollY: 840 });
      isRecoveryNavigation.mockReturnValue(false);

      expect(readRecoverySnapshot()).toBeNull();
    });

    test('consumes the snapshot, so a later read returns null', () => {
      saveSessionSnapshot({ view: 'recipes', recipeId: 'abc123', scrollY: 840 });

      expect(readRecoverySnapshot()).not.toBeNull();
      expect(readRecoverySnapshot()).toBeNull();
    });

    test('ignores a snapshot older than the freshness window', () => {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          view: 'recipes',
          recipeId: 'abc123',
          scrollY: 10,
          ts: Date.now() - 7 * 60 * 60 * 1000,
        })
      );

      expect(readRecoverySnapshot()).toBeNull();
    });

    test('drops a view that needs additional state to render', () => {
      saveSessionSnapshot({ view: 'atelierCategorySelection', recipeId: null, scrollY: 0 });

      expect(readRecoverySnapshot()).toEqual({ view: null, recipeId: null, scrollY: 0 });
    });

    test('returns null for corrupted storage content instead of throwing', () => {
      localStorage.setItem(KEY, 'not json');

      expect(readRecoverySnapshot()).toBeNull();
    });

    test('returns null after clearSessionSnapshot (e.g. logout)', () => {
      saveSessionSnapshot({ view: 'recipes', recipeId: 'abc123', scrollY: 840 });
      clearSessionSnapshot();

      expect(readRecoverySnapshot()).toBeNull();
    });
  });

  describe('trackSessionScroll', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('writes the current scroll position once the user stops scrolling', () => {
      const cleanup = trackSessionScroll(() => ({ view: 'recipes', recipeId: 'abc123' }));

      window.scrollY = 500;
      window.dispatchEvent(new Event('scroll'));
      window.scrollY = 1200;
      window.dispatchEvent(new Event('scroll'));

      // Debounced: nothing written while the scroll is still in flight.
      expect(localStorage.getItem(KEY)).toBeNull();

      jest.advanceTimersByTime(400);

      expect(JSON.parse(localStorage.getItem(KEY))).toMatchObject({
        view: 'recipes',
        recipeId: 'abc123',
        scrollY: 1200,
      });

      cleanup();
    });

    test('commits immediately when the tab is backgrounded', () => {
      const cleanup = trackSessionScroll(() => ({ view: 'menus', recipeId: null }));

      window.scrollY = 300;
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(JSON.parse(localStorage.getItem(KEY))).toMatchObject({
        view: 'menus',
        scrollY: 300,
      });

      cleanup();
    });

    test('stops writing after cleanup', () => {
      const cleanup = trackSessionScroll(() => ({ view: 'recipes', recipeId: null }));
      cleanup();

      window.scrollY = 700;
      window.dispatchEvent(new Event('scroll'));
      jest.advanceTimersByTime(400);

      expect(localStorage.getItem(KEY)).toBeNull();
    });
  });

  describe('restoreScrollPosition', () => {
    // jsdom does not lay out, so scrollTo is stubbed to behave like a browser
    // would: clamp to whatever the document currently allows.
    let pageHeight;

    const setPageHeight = (height) => {
      pageHeight = height;
      Object.defineProperty(document.documentElement, 'scrollHeight', {
        get: () => pageHeight,
        configurable: true,
      });
    };

    beforeEach(() => {
      jest.useFakeTimers();
      window.innerHeight = 800;
      window.scrollY = 0;
      setPageHeight(800);
      window.scrollTo = jest.fn((x, y) => {
        window.scrollY = Math.max(0, Math.min(y, pageHeight - window.innerHeight));
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('scrolls straight to the target when the page is already tall enough', () => {
      setPageHeight(5000);

      restoreScrollPosition(1200);

      expect(window.scrollY).toBe(1200);
    });

    test('keeps retrying while the page is still growing, then lands on target', () => {
      // Page starts at viewport height (Suspense fallback on screen) and only
      // reaches its real height after a few hundred ms.
      restoreScrollPosition(1200);
      expect(window.scrollY).toBe(0);

      jest.advanceTimersByTime(100);
      setPageHeight(1400); // partially rendered - can't reach 1200 yet
      jest.advanceTimersByTime(100);
      expect(window.scrollY).toBe(600);

      setPageHeight(5000); // fully rendered
      jest.advanceTimersByTime(100);
      expect(window.scrollY).toBe(1200);
    });

    test('gives up after the timeout when the target stays unreachable', () => {
      restoreScrollPosition(1200);
      jest.advanceTimersByTime(3000);

      const callsAfterTimeout = window.scrollTo.mock.calls.length;
      jest.advanceTimersByTime(5000);

      expect(window.scrollTo.mock.calls.length).toBe(callsAfterTimeout);
    });

    test('aborts as soon as the user scrolls themselves', () => {
      restoreScrollPosition(1200);
      const callsBeforeTouch = window.scrollTo.mock.calls.length;

      window.dispatchEvent(new Event('touchstart'));
      jest.advanceTimersByTime(1000);

      expect(window.scrollTo.mock.calls.length).toBe(callsBeforeTouch);
    });

    test('does nothing for a target of zero', () => {
      restoreScrollPosition(0);

      expect(window.scrollTo).not.toHaveBeenCalled();
    });
  });
});
