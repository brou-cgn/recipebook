import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './darkMode.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import reportWebVitals from './reportWebVitals';
import { markSwUpdateReload } from './utils/swUpdateReloadFlag';
import { checkForStaleClose, renderDebugBanner } from './utils/tutorialVideoCloseDebug';
import {
  installGlobalErrorLogger,
  checkForUncaughtErrorLog,
  checkForReloadMarker,
  markReloadTriggered
} from './utils/crashDiagnostics';

// Temporary diagnostics for the still-unresolved "app resets to the start
// view on iPhone" report - see utils/tutorialVideoCloseDebug.js and
// utils/crashDiagnostics.js. The tutorial-video-specific breadcrumb never
// showed anything, ruling out a crash *during* that component's own close
// logic. A first broader attempt (log the single latest uncaught
// error/rejection) found an unhandledrejection about service-worker.js
// failing to load right as navigation.type was 'reload' - but that's only a
// correlation, and risked being a side effect of the reload (an in-flight
// fetch aborted by the navigation) rather than its cause. This now marks,
// definitively, which of the exactly three window.location.reload() call
// sites in this codebase actually fired (see markReloadTriggered() calls in
// serviceWorkerRegistration.js, firebase.js, and below), plus a rolling log
// (not a single overwritten entry) of every uncaught error/rejection for
// context. Both survive a real page reload (unlike in-memory state), and are
// surfaced as a DOM banner rather than alert() - alert() at boot has no user
// gesture behind it and was silently swallowed by iOS on first try.
// Remove all of this once the bug is understood.
installGlobalErrorLogger();

const staleClose = checkForStaleClose();
if (staleClose) {
  renderDebugBanner('Tutorial-Video-Debug: Schließen kam nicht durch.', staleClose);
}

const reloadMarker = checkForReloadMarker();
if (reloadMarker) {
  renderDebugBanner('Reload-Debug: dieser Reload-Pfad hat gefeuert.', reloadMarker);
}

const errorLog = checkForUncaughtErrorLog();
if (errorLog) {
  renderDebugBanner('Crash-Debug: unbehandelte Fehler vor Neustart (Verlauf).', errorLog);
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
  markReloadTriggered('index.controllerchange');
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
