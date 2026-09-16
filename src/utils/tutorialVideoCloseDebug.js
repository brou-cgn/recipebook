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

// Unconditional interaction log (unlike markCloseStart/markCloseDone above,
// which only leave a trace when the close sequence didn't finish). Needed
// because a captured restart with staleClose: null is ambiguous - it looks
// identical whether the user tapped X right before the restart or never
// touched the modal at all in that session. Logging every open/play/close
// with a timestamp lets the next boot check whether a 'closeRequested' entry
// actually lines up with the last heartbeat before an abrupt termination, or
// whether the restart was unrelated to the modal entirely.
const INTERACTION_LOG_KEY = 'tutorialVideoInteractionLog';
const MAX_INTERACTION_ENTRIES = 10;

export function logInteraction(event) {
  try {
    const raw = localStorage.getItem(INTERACTION_LOG_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.push({ event, ts: Date.now() });
    while (list.length > MAX_INTERACTION_ENTRIES) list.shift();
    localStorage.setItem(INTERACTION_LOG_KEY, JSON.stringify(list));
  } catch {
    // best-effort
  }
}

export function checkForInteractionLog() {
  try {
    const raw = localStorage.getItem(INTERACTION_LOG_KEY);
    if (!raw) return null;
    localStorage.removeItem(INTERACTION_LOG_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
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
