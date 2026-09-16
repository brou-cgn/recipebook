import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './darkMode.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import reportWebVitals from './reportWebVitals';
import { markSwUpdateReload } from './utils/swUpdateReloadFlag';
import { checkForStaleClose, renderDebugBanner } from './utils/tutorialVideoCloseDebug';
import { installGlobalErrorLogger, checkForLastUncaughtError } from './utils/crashDiagnostics';

// Temporary diagnostics for the "app resets to the start view instantly on
// iPhone when closing the tutorial video dialog" report - see
// utils/tutorialVideoCloseDebug.js and utils/crashDiagnostics.js. The
// tutorial-video-specific breadcrumb never showed anything, which rules out
// a crash *during* that component's own close logic, so this also logs any
// uncaught error/rejection anywhere in the app the instant it happens -
// which would explain an *instant* reset with no trace in the narrower
// breadcrumb. Both survive a real page reload (unlike in-memory state), and
// are surfaced as a DOM banner rather than alert() - alert() at boot has no
// user gesture behind it and was silently swallowed by iOS on first try.
// Remove all of this once the bug is confirmed fixed.
installGlobalErrorLogger();

const staleClose = checkForStaleClose();
if (staleClose) {
  renderDebugBanner('Tutorial-Video-Debug: Schließen kam nicht durch.', staleClose);
}

const lastUncaughtError = checkForLastUncaughtError();
if (lastUncaughtError) {
  renderDebugBanner('Crash-Debug: unbehandelter Fehler vor Neustart.', lastUncaughtError);
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Guard against triggering more than one reload: onUpdate can fire again
// before the pending reload has happened, and controllerchange can also
// fire for unrelated service worker registrations (e.g. Firebase Messaging).
let refreshingAfterSwUpdate = false;
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (refreshingAfterSwUpdate) return;
  refreshingAfterSwUpdate = true;
  // Skip the splash screen's entrance animations on the reload we're about
  // to force, so activating a newly installed version reads as a seamless
  // continuation instead of the tagline visibly re-animating.
  markSwUpdateReload();
  window.location.reload();
});

serviceWorkerRegistration.register({
  onUpdate: (registration) => {
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  },
});

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
