/**
 * Temporary forensic breadcrumb for the "app restarts on iPhone when closing
 * the tutorial video dialog" bug (see TutorialVideoModal.js). Not a fix -
 * localStorage survives a real WebKit content-process crash/relaunch (unlike
 * in-memory state), so it lets us tell, after the fact, whether a reported
 * "restart" was:
 *   - an actual page reload (a stale breadcrumb from a previous session
 *     survives, and/or 'pagehide' fired before the close sequence finished), or
 *   - something else (e.g. only in-app navigation resetting UI state).
 *
 * Remove this + its two call sites in TutorialVideoModal.js and the
 * checkForStaleClose() call in index.js once the bug is confirmed fixed.
 */
const KEY = 'tutorialVideoCloseDebug';

export function markCloseStart(context) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...context, ts: Date.now(), stage: 'closing' })
    );
  } catch {
    // localStorage unavailable (private mode, quota, …) - breadcrumb is
    // best-effort diagnostics, never worth breaking the close flow over.
  }
}

export function markPagehideFired() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...parsed, pagehideTs: Date.now(), stage: 'pagehide-fired' })
    );
  } catch {
    // best-effort
  }
}

export function markCloseDone() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}

// Call once, early, on app startup. Returns the breadcrumb left behind by an
// unfinished close (i.e. the process died mid-close) or null if the last
// close completed normally / nothing to report.
export function checkForStaleClose() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// window.alert() at boot time (no user gesture behind it) can be silently
// suppressed by iOS/WebKit's anti-abuse heuristics - which is exactly what
// happened on first try, so this renders a plain DOM banner instead. Inserted
// directly via the DOM API (not through React state) so it shows up even if
// something about React's own boot is implicated in the restart. Stacks
// (rather than replaces) if called more than once, so an unrelated
// crashDiagnostics.js banner can appear alongside this one.
export function renderDebugBanner(title, data) {
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    const existing = document.querySelectorAll('.debug-crash-banner').length;
    const banner = document.createElement('div');
    banner.className = 'debug-crash-banner';
    banner.textContent =
      `${title}\n` +
      `${JSON.stringify(data, null, 2)}\n` +
      `navigation.type: ${nav ? nav.type : 'unbekannt'}`;
    banner.style.cssText =
      `position:fixed;top:${existing * 33}vh;left:0;right:0;z-index:999999;` +
      'background:#a33a26;color:#fff;font:12px/1.4 monospace;' +
      'padding:12px;white-space:pre-wrap;word-break:break-word;' +
      'max-height:30vh;overflow:auto;border-bottom:2px solid #fff;';
    banner.addEventListener('click', () => banner.remove());
    document.body.appendChild(banner);
  } catch {
    // best-effort
  }
}
