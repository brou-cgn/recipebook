/**
 * Temporary, broader diagnostic for the still-unresolved "app resets to the
 * start view instantly on iPhone" report. The tutorial-video-specific
 * breadcrumb (tutorialVideoCloseDebug.js) never caught anything, which rules
 * out a crash *during* that component's own close logic - so whatever is
 * resetting the app must be happening some other way.
 *
 * The one confirmed reload trigger already in this codebase is
 * firebase.js's handleFirestoreQuotaCrash(): it calls
 * window.location.reload() on any uncaught error/unhandledrejection whose
 * message matches a specific Firestore-quota signature. This logs *any*
 * uncaught error or rejection - not just that one signature - the instant it
 * happens, so the next app boot can show what actually fired: whether it
 * matches the Firestore theory or is something else entirely.
 *
 * Remove installGlobalErrorLogger() (called from index.js), this file, and
 * the checkForLastUncaughtError() call in index.js once the bug is
 * understood.
 */
const KEY = 'lastUncaughtErrorDebug';

export function installGlobalErrorLogger() {
  const record = (type, message, extra) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ type, message, extra, ts: Date.now() }));
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

export function checkForLastUncaughtError() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
