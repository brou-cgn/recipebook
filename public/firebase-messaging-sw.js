/* eslint-disable no-undef */
/**
 * Firebase Cloud Messaging Service Worker
 * Handles background push notifications for the RecipeBook PWA.
 *
 * This file must be served from the root of the app (public/) so that its
 * scope covers the full origin.  It is intentionally kept minimal – all
 * complex application logic stays in the main bundle.
 */

// Import the Firebase scripts needed for background messaging.
// The exact version is kept in sync with the main app's firebase dependency.
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

let messaging = null;

/**
 * Initialise Firebase and register the background message handler.
 * Safe to call multiple times – subsequent calls are ignored.
 */
function initFirebase(config) {
  if (messaging) return; // already initialised
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(config);
    }
    messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      const notificationTitle =
        payload.data?.title || payload.notification?.title || 'RecipeBook';
      const notificationOptions = {
        body: payload.data?.body || payload.notification?.body || '',
        icon: '/logo192.png',
        badge: '/favicon.ico',
        data: payload.data || {},
      };
      self.registration.showNotification(notificationTitle, notificationOptions);
    });
  } catch (err) {
    console.error('[firebase-messaging-sw] initFirebase failed', err);
  }
}

// ── Primary: Firebase Hosting auto-config ─────────────────────────────────────
// Firebase Hosting automatically serves /__/firebase/init.js with the project
// config.  Using this means Firebase is initialised as soon as the SW starts,
// even when the main app window is closed.
try {
  importScripts('/__/firebase/init.js');
  // After the script runs, firebase.app().options contains the config.
  initFirebase(firebase.app().options);
} catch (e) {
  // Running locally or outside Firebase Hosting – fall back to postMessage.
  console.warn('[firebase-messaging-sw] /__/firebase/init.js not available, waiting for FIREBASE_CONFIG message');
}

// ── Fallback: config injected from the main app thread ────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    initFirebase(event.data.config);
  }
});

// ── Notification click – bring the app to the foreground ──────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
      clients.matchAll({type: 'window', includeUncontrolled: true}).then(
          (clientList) => {
            for (const client of clientList) {
              if (client.url && 'focus' in client) {
                return client.focus();
              }
            }
            if (clients.openWindow) {
              return clients.openWindow('/');
            }
          },
      ),
  );
});
