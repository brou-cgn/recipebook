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

// Firebase configuration is injected at runtime via the 'firebase-config'
// message sent from the main app thread (see pushNotifications.js).
// Until we receive the config, we store a pending flag.
let messaging = null;

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    if (!messaging) {
      firebase.initializeApp(event.data.config);
      messaging = firebase.messaging();

      // Handle background messages
      messaging.onBackgroundMessage((payload) => {
        const notificationTitle =
          payload.notification?.title || 'RecipeBook';
        const notificationOptions = {
          body: payload.notification?.body || '',
          icon: '/logo192.png',
          badge: '/favicon.ico',
          data: payload.data || {},
        };

        self.registration.showNotification(
            notificationTitle,
            notificationOptions,
        );
      });
    }
  }
});

// Handle notification click – bring the app window to focus
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
