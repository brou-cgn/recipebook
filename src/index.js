import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './darkMode.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import reportWebVitals from './reportWebVitals';
import { markSwUpdateReload } from './utils/swUpdateReloadFlag';

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

// In the installed iOS home-screen app, `overscroll-behavior-x: none` (see
// index.css) doesn't reliably suppress WebKit's native edge-swipe back
// gesture — a known gap between standalone display mode and regular Safari
// tabs, where the same CSS property does work. The gesture then drags the
// SPA's real DOM sideways with nothing behind it, showing rounded-corner
// card fragments mid-swipe. Block it at the source: only touches that start
// within iOS's edge recognition strip AND turn clearly horizontal get
// preventDefault'd — the direction lock (mirrored on useSwipeToDelete.js's
// SWIPE_DIRECTION_LOCK_THRESHOLD) keeps an ordinary vertical scroll that
// happens to start near the edge untouched.
const EDGE_GESTURE_ZONE_PX = 24;
const EDGE_GESTURE_DIRECTION_LOCK_PX = 6;
let edgeGestureStartX = null;
let edgeGestureStartY = null;
let edgeGestureDirection = null;

document.addEventListener('touchstart', (e) => {
  const touch = e.touches[0];
  const inEdgeZone = touch && (touch.clientX < EDGE_GESTURE_ZONE_PX || touch.clientX > window.innerWidth - EDGE_GESTURE_ZONE_PX);
  edgeGestureStartX = inEdgeZone ? touch.clientX : null;
  edgeGestureStartY = inEdgeZone ? touch.clientY : null;
  edgeGestureDirection = null;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (edgeGestureStartX === null) return;
  const touch = e.touches[0];
  if (!touch) return;
  const deltaX = touch.clientX - edgeGestureStartX;
  const deltaY = touch.clientY - edgeGestureStartY;
  if (!edgeGestureDirection && (Math.abs(deltaX) > EDGE_GESTURE_DIRECTION_LOCK_PX || Math.abs(deltaY) > EDGE_GESTURE_DIRECTION_LOCK_PX)) {
    edgeGestureDirection = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
  }
  if (edgeGestureDirection === 'horizontal' && e.cancelable) {
    e.preventDefault();
  }
}, { passive: false });

document.addEventListener('touchend', () => {
  edgeGestureStartX = null;
  edgeGestureStartY = null;
  edgeGestureDirection = null;
}, { passive: true });

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
