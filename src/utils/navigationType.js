/**
 * Whether the current page load is something other than a deliberate, fresh
 * app open (navigation.type 'navigate') - i.e. 'reload' or 'back_forward'.
 *
 * Covers both reloads we trigger ourselves (service worker update, the
 * Firestore-quota recovery in firebase.js) and ones we don't - notably iOS
 * silently killing the backgrounded WebKit process for memory and restoring
 * it later, which surfaces as navigation.type 'back_forward' with no
 * 'pagehide' beforehand (see utils/crashDiagnostics.js). Whatever the cause,
 * the user didn't intentionally relaunch the app, so it shouldn't look or
 * behave like a first open: see SplashScreen.js (skip entrance animation)
 * and App.js's getInitialViewForUser() (land on the recipe overview instead
 * of the Startseite, regardless of that preference).
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
