/**
 * Push Notification Utilities
 *
 * Manages Firebase Cloud Messaging (FCM) push notifications:
 *  - Requesting browser notification permission
 *  - Obtaining and persisting FCM tokens
 *  - Registering the FCM service worker and forwarding the Firebase config to it
 *  - Triggering server-side notifications via Cloud Functions
 */

import { getToken, onMessage } from 'firebase/messaging';
import { httpsCallable } from 'firebase/functions';
import { isMessagingSupported, firebaseConfig, functions } from '../firebase';

/** Env-var: Web-push VAPID key generated in the Firebase Console */
const getVapidKey = () => process.env.REACT_APP_FIREBASE_VAPID_KEY;

/**
 * Register the FCM service worker and forward the Firebase config so the SW
 * can initialise Firebase Messaging for background notifications.
 *
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export const registerMessagingServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register(
      '/firebase-messaging-sw.js',
      { scope: '/' }
    );

    // Give the service worker time to activate, then send the config
    await navigator.serviceWorker.ready;
    const sw =
      registration.active ||
      registration.installing ||
      registration.waiting;
    if (sw) {
      sw.postMessage({ type: 'FIREBASE_CONFIG', config: firebaseConfig });
    }

    return registration;
  } catch (err) {
    console.warn('pushNotifications: service worker registration failed', err);
    return null;
  }
};

/**
 * Request notification permission and retrieve the current FCM token.
 *
 * @returns {Promise<string|null>} The FCM token, or null when unavailable.
 */
export const requestNotificationPermission = async () => {
  try {
    const supported = await isMessagingSupported();
    if (!supported) return null;
    if (typeof Notification === 'undefined') return null;
    const vapidKey = getVapidKey();

    if (!vapidKey) {
      console.warn(
        'pushNotifications: REACT_APP_FIREBASE_VAPID_KEY is not set. ' +
        'Push notifications will not work until a VAPID key is configured.'
      );
      return null;
    }

    if (Notification.permission === 'denied') return null;

    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return null;
    }

    const swRegistration = await registerMessagingServiceWorker();

    // Dynamically import messagingPromise and await the resolved instance
    const { messagingPromise } = await import('../firebase');
    const messagingInstance = await messagingPromise;
    if (!messagingInstance) return null;

    const token = await getToken(messagingInstance, {
      vapidKey,
      serviceWorkerRegistration: swRegistration ?? undefined,
    });

    return token || null;
  } catch (err) {
    console.warn('pushNotifications: could not get FCM token', err);
    return null;
  }
};

/**
 * Set up a foreground message listener.
 * When the app is visible in the browser, FCM delivers notification+data
 * payloads here instead of auto-showing them via the browser.  We manually
 * show a notification via the service worker so the user is always informed,
 * regardless of whether the app is in the foreground or background.
 * Deduplication via notificationId/tag prevents double-display.
 *
 * @returns {Function} Unsubscribe function
 */
const shownNotificationIds = new Set();
const NOTIFICATION_DEDUP_WINDOW_MS = 5000;

export const setupForegroundMessageListener = () => {
  let unsubscribe = () => {};
  isMessagingSupported()
    .then((supported) => {
      if (!supported) return;
      import('../firebase')
        .then(({ messagingPromise }) => messagingPromise)
        .then((messagingInstance) => {
          if (!messagingInstance) return;
          unsubscribe = onMessage(messagingInstance, (payload) => {
            // onMessage fires when the app is in the foreground (page visible).
            // For notification+data payloads in the background, the browser
            // auto-shows the notification and onMessage is not called, so there
            // is no risk of duplicates here.
            const notificationId = payload.data?.notificationId;
            if (notificationId && shownNotificationIds.has(notificationId)) {
              return;
            }
            if (notificationId) {
              shownNotificationIds.add(notificationId);
              setTimeout(() => shownNotificationIds.delete(notificationId), NOTIFICATION_DEDUP_WINDOW_MS);
            }

            const title = payload.data?.title || payload.notification?.title || 'RecipeBook';
            const body = payload.data?.body || payload.notification?.body || '';
            const isVisible = document.visibilityState === 'visible';
            if (Notification.permission === 'granted') {
              if (isVisible) {
                new Notification(title, {
                  body,
                  icon: '/logo192.png',
                  tag: notificationId || 'default',
                  data: payload.data || {},
                });
              } else {
                navigator.serviceWorker.ready.then((registration) => {
                  registration.showNotification(title, {
                    body,
                    icon: '/logo192.png',
                    tag: notificationId || 'default',
                    data: payload.data || {},
                  });
                });
              }
            }
          });
        });
    })
    .catch(() => {});
  return () => unsubscribe();
};

/**
 * Notify all members of a private list (except the acting user) that a recipe
 * was created or added to the list.
 *
 * The actual notification delivery is handled by the Cloud Function
 * `notifyPrivateListMembers` which reads FCM tokens and sends messages
 * server-side via Firebase Admin SDK.
 *
 * @param {string} groupId   - Firestore ID of the private list
 * @param {string} recipeId  - Firestore ID of the recipe
 * @param {string} actorId   - Firestore ID of the user who performed the action
 * @param {'created'|'added'} action - Whether the recipe was newly created or added
 * @returns {Promise<void>}
 */
export const notifyPrivateListMembers = async (groupId, recipeId, actorId, action) => {
  if (!groupId || !recipeId || !actorId) return;
  try {
    const fn = httpsCallable(functions, 'notifyPrivateListMembers');
    await fn({ groupId, recipeId, actorId, action });
  } catch (err) {
    // Notification failure must never break the main user flow
    console.warn('pushNotifications: notifyPrivateListMembers call failed', err);
  }
};
