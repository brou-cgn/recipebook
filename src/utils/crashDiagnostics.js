/**
 * Temporary, broader diagnostic for the still-unresolved "app resets to the
 * start view on iPhone" report. The tutorial-video-specific breadcrumb
 * (tutorialVideoCloseDebug.js) never caught anything, ruling out a crash
 * *during* that component's own close logic.
 *
 * Two complementary pieces:
 *
 * 1. A rolling log (not a single overwritten entry - an earlier attempt did
 *    that and risked hiding the real trigger behind a later, merely
 *    coincidental error/rejection fired while the page was already tearing
 *    down for reload) of every uncaught error/rejection, for context.
 *
 * 2. An explicit marker at each of the exactly three places in this codebase
 *    that call window.location.reload() (serviceWorkerRegistration.js,
 *    firebase.js, index.js's controllerchange handler) - written the instant
 *    before that specific reload() call fires. This is the actual proof of
 *    which reload path ran, instead of inferring it from timing/correlation
 *    with logged errors.
 *
 * Remove installGlobalErrorLogger() + checkForUncaughtErrorLog() (index.js),
 * markReloadTriggered() + its 3 call sites, checkForReloadMarker()
 * (index.js), and this file once the bug is understood.
 */
const ERROR_LOG_KEY = 'uncaughtErrorLogDebug';
const RELOAD_MARKER_KEY = 'reloadTriggerDebug';
const MAX_LOG_ENTRIES = 5;

export function installGlobalErrorLogger() {
  const record = (type, message, extra) => {
    try {
      const raw = localStorage.getItem(ERROR_LOG_KEY);
      const list = raw ? JSON.parse(raw) : [];
      list.push({ type, message, extra, ts: Date.now() });
      while (list.length > MAX_LOG_ENTRIES) list.shift();
      localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(list));
    } catch {
      // best-effort - if localStorage itself is the problem (e.g. quota
      // exceeded), there's nothing more we can safely do here
    }
  };
  window.addEventListener('error', (e) => {
    record('error', e?.message, { filename: e?.filename, lineno: e?.lineno });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e?.reason;
    record('unhandledrejection', reason?.message || String(reason));
  });
}

export function checkForUncaughtErrorLog() {
  try {
    const raw = localStorage.getItem(ERROR_LOG_KEY);
    if (!raw) return null;
    localStorage.removeItem(ERROR_LOG_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Call this immediately before each of the three window.location.reload()
// call sites, with a label identifying which one.
export function markReloadTriggered(source, extra) {
  try {
    localStorage.setItem(
      RELOAD_MARKER_KEY,
      JSON.stringify({ source, extra, ts: Date.now() })
    );
  } catch {
    // best-effort
  }
}

export function checkForReloadMarker() {
  try {
    const raw = localStorage.getItem(RELOAD_MARKER_KEY);
    if (!raw) return null;
    localStorage.removeItem(RELOAD_MARKER_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
