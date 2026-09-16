/**
 * Remembers where the user was, so an app restart they didn't ask for lands
 * them back there instead of at the top of the recipe overview.
 *
 * Background: iOS reclaims memory by discarding backgrounded Safari tabs and
 * by killing the WebKit content process outright. Neither is preventable from
 * JavaScript - there is no event to hook, no flag to set, and no amount of
 * cleanup in our own code that stops it. What we *can* do is make the
 * restart invisible: the app already skips the splash screen on such a boot
 * (see utils/navigationType.js), and this module adds back the missing half -
 * the view, the open recipe and the scroll position.
 *
 * Deliberately localStorage, not sessionStorage: sessionStorage is restored
 * with the tab in most cases, but not reliably after the content process is
 * killed, which is precisely the case this exists for.
 *
 * The snapshot is only ever consumed on a recovery navigation ('reload' /
 * 'back_forward'), never on a deliberate fresh open - opening the app on
 * purpose should start where the user's own preference says, not drop them
 * back into yesterday's recipe.
 */
import { isRecoveryNavigation } from './navigationType';

const KEY = 'lastSessionSnapshot';

// Beyond this the snapshot is treated as stale: a restart hours later is no
// longer "the user was just here", it's a new visit that happens to reuse
// the tab.
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

// Views that render correctly from currentView alone. Anything that needs
// additional state to make sense (a selected group, a step inside the
// Atelier flow, an admin tab selection) is deliberately not restored - the
// recipe overview is a better landing place than a half-populated screen.
const RESTORABLE_VIEWS = new Set([
  'recipes',
  'startseite',
  'menus',
  'events',
  'kueche',
  'tagesmenu',
  'meineKuechenstars',
]);

// Long enough that a flick-scroll writes once instead of per frame, short
// enough that the position is committed well before the user puts the phone
// down. Unlike a polling heartbeat this costs nothing while the app is idle.
const SCROLL_DEBOUNCE_MS = 400;

// How long restoreScrollPosition() keeps trying before giving up, and how
// often it retries. The target may be unreachable for a while after a
// restart: the view is code-split (React.lazy), so the Suspense fallback is
// on screen first, and list images load lazily on top of that - the document
// simply isn't tall enough to scroll to yet.
const SCROLL_RESTORE_TIMEOUT_MS = 3000;
const SCROLL_RESTORE_RETRY_MS = 100;

/**
 * Scrolls to targetY and keeps re-trying while the page is still growing,
 * until the position is actually reached or the timeout expires. Gives up
 * immediately once the user touches the screen - fighting them for the
 * viewport is worse than landing at the wrong offset.
 *
 * Returns a cancel function.
 */
export function restoreScrollPosition(targetY) {
  if (!targetY || targetY <= 0) return () => {};

  const deadline = Date.now() + SCROLL_RESTORE_TIMEOUT_MS;
  let timer = null;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    window.removeEventListener('touchstart', stop);
    window.removeEventListener('wheel', stop);
  };

  const step = () => {
    if (stopped) return;
    const maxScrollable = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight
    );
    window.scrollTo(0, Math.min(targetY, maxScrollable));
    // Reached (within a pixel of rounding), out of patience, or the page is
    // as tall as it will get and still too short - nothing left to wait for.
    if (Math.abs(window.scrollY - targetY) <= 1 || Date.now() >= deadline) {
      stop();
      return;
    }
    timer = setTimeout(step, SCROLL_RESTORE_RETRY_MS);
  };

  window.addEventListener('touchstart', stop, { passive: true, once: true });
  window.addEventListener('wheel', stop, { passive: true, once: true });
  step();

  return stop;
}

export function saveSessionSnapshot({ view, recipeId, scrollY }) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        view: view || null,
        recipeId: recipeId || null,
        scrollY: Math.max(0, Math.round(scrollY || 0)),
        ts: Date.now(),
      })
    );
  } catch {
    // Best-effort - private mode or a full quota must never break navigation.
  }
}

export function clearSessionSnapshot() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}

/**
 * Reads and clears the snapshot left behind by the previous session, but only
 * if this page load is an involuntary restart and the snapshot is recent.
 * Returns null otherwise. Call once, at module scope, before the first render.
 */
export function readRecoverySnapshot() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    if (!isRecoveryNavigation()) return null;
    const snapshot = JSON.parse(raw);
    if (!snapshot || typeof snapshot !== 'object') return null;
    if (Date.now() - (snapshot.ts || 0) > MAX_AGE_MS) return null;
    return {
      view: RESTORABLE_VIEWS.has(snapshot.view) ? snapshot.view : null,
      recipeId: typeof snapshot.recipeId === 'string' ? snapshot.recipeId : null,
      scrollY: typeof snapshot.scrollY === 'number' ? snapshot.scrollY : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Keeps the snapshot's scroll position current while the user reads. getState
 * is called at write time (not captured once) so the caller can hand over a
 * ref and doesn't have to re-register listeners on every view change.
 *
 * Returns a cleanup function.
 */
export function trackSessionScroll(getState) {
  let timer = null;
  const write = () => {
    const state = getState();
    if (!state) return;
    saveSessionSnapshot({ ...state, scrollY: window.scrollY });
  };
  const onScroll = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(write, SCROLL_DEBOUNCE_MS);
  };
  // A backgrounded tab is exactly what iOS discards, so commit immediately
  // rather than waiting out the debounce. 'pagehide' is not used: Safari
  // does not reliably flush localStorage writes made from it.
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      if (timer) clearTimeout(timer);
      write();
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    if (timer) clearTimeout(timer);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
