// Wraps the Badging API (navigator.setAppBadge/clearAppBadge), which shows a
// count on the app icon on the home screen / taskbar for an installed PWA.
// Only supported by some browsers (e.g. Chrome/Edge on Android/desktop, not
// Firefox or Safari), so every call is feature-detected and failures are
// swallowed — this is a best-effort visual cue, never load-bearing.
export function updateAppBadge(count) {
  if (typeof navigator === 'undefined') return;
  const value = Math.max(0, Math.round(count) || 0);
  try {
    if (value > 0 && typeof navigator.setAppBadge === 'function') {
      navigator.setAppBadge(value).catch(() => {});
    } else if (value === 0 && typeof navigator.clearAppBadge === 'function') {
      navigator.clearAppBadge().catch(() => {});
    }
  } catch (error) {
    // Badging API not available/allowed in this context — ignore.
  }
}
