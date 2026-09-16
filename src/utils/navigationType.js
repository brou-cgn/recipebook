/**
 * Whether the current page load is something other than a deliberate, fresh
 * app open (navigation.type 'navigate') - i.e. 'reload' or 'back_forward'.
 *
 * Covers both reloads we trigger ourselves (service worker update, the
 * Firestore-quota recovery in firebase.js) and ones we don't - notably iOS
 * reclaiming memory by discarding a backgrounded Safari tab or killing the
 * WebKit content process, which comes back as navigation.type
 * 'back_forward' with no 'pagehide' beforehand. The latter is not
 * preventable from JavaScript, so the app treats it as a fact of life and
 * makes it unobtrusive instead: whatever the cause, the user didn't ask to
 * relaunch, so it shouldn't look or behave like a first open. See
 * SplashScreen.js (skip entrance animation), utils/sessionRestore.js
 * (return to the view, recipe and scroll position the user left) and
 * App.js's getInitialViewForUser().
 */
export function isRecoveryNavigation() {
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    const type = nav ? nav.type : null;
    return type === 'reload' || type === 'back_forward';
  } catch {
    return false;
  }
}
