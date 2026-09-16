import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './darkMode.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import reportWebVitals from './reportWebVitals';
import { markSwUpdateReload } from './utils/swUpdateReloadFlag';
import { checkForStaleClose, renderStaleCloseBanner } from './utils/tutorialVideoCloseDebug';

// Temporary diagnostic for the "app restarts on iPhone when closing the
// tutorial video dialog" report - see utils/tutorialVideoCloseDebug.js. If
// the previous session left an unfinished close breadcrumb behind, that
// breadcrumb only survives a real page reload/app relaunch, so surface it
// as a DOM banner (window.alert() at boot has no user gesture behind it and
// was silently swallowed by iOS on the first attempt). Remove once the bug
// is confirmed fixed.
const staleClose = checkForStaleClose();
if (staleClose) {
  renderStaleCloseBanner(staleClose);
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
