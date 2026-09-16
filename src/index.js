import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './darkMode.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import reportWebVitals from './reportWebVitals';
import { markSwUpdateReload } from './utils/swUpdateReloadFlag';
import { checkForStaleClose, checkForInteractionLog } from './utils/tutorialVideoCloseDebug';
import {
  installGlobalErrorLogger,
  checkForUncaughtErrorLog,
  checkForReloadMarker,
  markReloadTriggered,
  checkForAbruptTermination,
  installLifecycleHeartbeat
} from './utils/crashDiagnostics';

// Temporary diagnostics for the still-unresolved "app resets to the start
// view on iPhone" report - see utils/tutorialVideoCloseDebug.js and
// utils/crashDiagnostics.js. The tutorial-video-specific breadcrumb never
// showed anything, ruling out a crash *during* that component's own close
// logic, and neither did any of the 3 known reload() call sites nor any
// uncaught error - a reproduction came back with zero trace in any of them.
// That combination (navigation.type 'reload', but nothing our own JS could
// have logged) is the signature of iOS killing the WebKit content process
// directly: the entire JS context, including every listener below, is torn
// down before any of them get a chance to run - there's no JS-observable
// event for that at all. checkForAbruptTermination()/installLifecycleHeartbeat()
// try to catch it indirectly via a timestamp that's kept fresh while the app
// runs, so the next boot can see how recently it was alive and whether a
// 'pagehide' fired before the gap. Every reload that isn't explained by a
// known marker also gets logged now (not just the ones with a known cause),
// per explicit request to document *all* restarts. Findings go to Firestore
// (see debugReloadEventsFirestore.js / App.js) rather than an on-screen
// banner - a red banner on every involuntary restart was itself disruptive.
// Remove all of this once the bug is understood.
const abruptTermination = checkForAbruptTermination();
installGlobalErrorLogger();
installLifecycleHeartbeat();

const staleClose = checkForStaleClose();

// Unconditional log of every open/play/close on the tutorial video modal -
// unlike staleClose above, this doesn't require the close to have been
// interrupted. A captured restart with staleClose: null is ambiguous (looks
// identical whether the user touched the modal at all), so this lets us
// check whether a 'closeRequested' timestamp actually lines up with
// abruptTermination's last heartbeat, or whether the restart was unrelated
// to the modal entirely.
const interactionLog = checkForInteractionLog();

const reloadMarker = checkForReloadMarker();
const errorLog = checkForUncaughtErrorLog();

const navigationType = performance.getEntriesByType('navigation')[0]?.type || 'unbekannt';
const isUnexplainedReload = navigationType === 'reload' && !staleClose && !reloadMarker;

// Stash whatever was collected for App.js to write to Firestore once auth is
// ready (the debugReloadEvents write requires an authenticated user, which
// isn't available yet this early in boot). Every restart gets documented,
// not just ones matching a known cause - an unexplained 'reload' with no
// trace anywhere is itself the most useful data point right now.
// See utils/debugReloadEventsFirestore.js.
if (staleClose || reloadMarker || errorLog || abruptTermination || isUnexplainedReload) {
  window.__pendingDebugReloadEvent = {
    staleClose,
    reloadMarker,
    errorLog,
    abruptTermination,
    navigationType,
    interactionLog
  };
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
