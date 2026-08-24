// Shared between index.js (which sets the flag right before forcing a reload
// to activate a newly installed service worker) and SplashScreen.js (which
// reads it once on mount). Lets the splash screen skip its logo/tagline
// entrance animations on that specific reload, so an app-update on open
// doesn't show as a jarring re-flash of the tagline. Uses sessionStorage
// (not a JS module variable) because the flag has to survive the actual
// page reload.
const SW_UPDATE_RELOAD_KEY = 'recipebook_sw_update_reload';

export function markSwUpdateReload() {
  try {
    sessionStorage.setItem(SW_UPDATE_RELOAD_KEY, '1');
  } catch (e) {
    // sessionStorage unavailable (e.g. private browsing) — safe to ignore,
    // worst case the splash just replays its entrance animation once more.
  }
}

export function consumeSwUpdateReloadFlag() {
  try {
    if (sessionStorage.getItem(SW_UPDATE_RELOAD_KEY) === '1') {
      sessionStorage.removeItem(SW_UPDATE_RELOAD_KEY);
      return true;
    }
  } catch (e) {
    // ignore
  }
  return false;
}
