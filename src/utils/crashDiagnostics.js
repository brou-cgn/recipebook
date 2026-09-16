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

// Third piece, added after a reproduction with NO trace at all in any of the
// above (no stale close, no reload marker, no logged error): if the WebKit
// content process is killed by iOS directly (out-of-memory jetsam or an
// actual WebKit crash), the entire JS context - including all the listeners
// above - is torn down before any of them get a chance to run. There is no
// JS-observable event for this at all; the only way to catch it indirectly
// is a heartbeat that keeps overwriting a timestamp while the app is alive,
// so the next boot can see how recently it was still running and whether a
// 'pagehide' (a graceful unload, however brief) fired before the gap.
const HEARTBEAT_KEY = 'lifecycleHeartbeatDebug';
const PAGEHIDE_KEY = 'lastPagehideDebug';
const HEARTBEAT_INTERVAL_MS = 5000;
// Only meaningful if the leftover heartbeat is recent - i.e. the app was
// actively running moments before this fresh boot, not just "last used
// yesterday" staleness from a normal new visit.
const RECENT_HEARTBEAT_THRESHOLD_MS = 30000;

// Call once, early, BEFORE installLifecycleHeartbeat() re-arms these keys
// for the current session - reads and clears whatever the previous session
// left behind.
export function checkForAbruptTermination() {
  try {
    const heartbeatRaw = localStorage.getItem(HEARTBEAT_KEY);
    const pagehideRaw = localStorage.getItem(PAGEHIDE_KEY);
    localStorage.removeItem(HEARTBEAT_KEY);
    localStorage.removeItem(PAGEHIDE_KEY);
    if (!heartbeatRaw) return null;
    const heartbeat = JSON.parse(heartbeatRaw);
    if (Date.now() - heartbeat.ts > RECENT_HEARTBEAT_THRESHOLD_MS) return null;
    const pagehide = pagehideRaw ? JSON.parse(pagehideRaw) : null;
    const hadCleanPagehide = !!pagehide && pagehide.ts >= heartbeat.ts - 500;
    return { heartbeat, pagehide, hadCleanPagehide };
  } catch {
    return null;
  }
}

export function installLifecycleHeartbeat() {
  const beat = () => {
    try {
      localStorage.setItem(
        HEARTBEAT_KEY,
        JSON.stringify({ ts: Date.now(), path: window.location.pathname })
      );
    } catch {
      // best-effort
    }
  };
  beat();
  setInterval(beat, HEARTBEAT_INTERVAL_MS);
  window.addEventListener('pagehide', () => {
    try {
      localStorage.setItem(
        PAGEHIDE_KEY,
        JSON.stringify({ ts: Date.now(), path: window.location.pathname })
      );
    } catch {
      // best-effort
    }
  });
}
