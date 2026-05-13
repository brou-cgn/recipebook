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
 *
 * FCM delivers messages to onMessage when a client page is open.
 * Behaviour depends on document.visibilityState:
 *
 *  visible  → dispatch CustomEvent for in-app toast (better UX than OS popup)
 *             + reg.showNotification() as fallback if no handler registered
 *  hidden   → reg.showNotification() via SW Registration (works on iOS PWA)
 *
 * IMPORTANT: Do NOT use new Notification() – unsupported on iOS PWA 16.4+
 * from the main thread. Only ServiceWorkerRegistration.showNotification()
 * works reliably on iOS Safari standalone PWA, Chrome, and Firefox.
 *
 * Race condition protection: Ref-pattern ensures cleanup always calls
 * the correct unsubscribe function, and the cancelled flag prevents a
 * leaked listener when React Strict Mode double-invokes effects.
 *
 * @returns {Function} Unsubscribe function
 */
const shownNotificationIds = new Set();
const NOTIFICATION_DEDUP_WINDOW_MS = 5000;
const SW_READY_TIMEOUT_MS = 3000;

export const setupForegroundMessageListener = () => {
  const unsubscribeRef = { current: () => {} };
  let cancelled = false;

  isMessagingSupported()
    .then(async (supported) => {
      if (!supported || cancelled) return;
      const { messagingPromise } = await import('../firebase');
      const messagingInstance = await messagingPromise;
      if (!messagingInstance || cancelled) return;

      const unsubscribeFn = onMessage(messagingInstance, async (payload) => {
        console.debug('[FCM onMessage] received', {
          visibilityState: document.visibilityState,
          notificationId: payload.data?.notificationId,
          hasNotificationKey: !!payload.notification,
        });

        // De-duplicate within the time window
        const notificationId = payload.data?.notificationId;
        if (notificationId && shownNotificationIds.has(notificationId)) {
          console.debug('[FCM onMessage] duplicate – skipped', notificationId);
          return;
        }
        if (notificationId) {
          shownNotificationIds.add(notificationId);
          setTimeout(() => shownNotificationIds.delete(notificationId), NOTIFICATION_DEDUP_WINDOW_MS);
        }

        const title = payload.data?.title || payload.notification?.title || 'RecipeBook';
        const body  = payload.data?.body  || payload.notification?.body  || '';
        const notificationOptions = {
          body,
          icon: '/logo192.png',
          tag: notificationId || 'default',
          data: payload.data || {},
        };

        const isVisible = document.visibilityState === 'visible';

        if (isVisible) {
          // Foreground: dispatch CustomEvent so App.js can show an in-app toast.
          // This avoids an intrusive OS popup while the user is actively using the app.
          const handled = dispatchForegroundEvent(payload, title, body);
          if (handled) {
            console.debug('[FCM onMessage] dispatched fcm-foreground-message event');
            return;
          }
          // No in-app handler registered → fall through to reg.showNotification()
        }

        // Background tab OR foreground without in-app handler:
        // reg.showNotification() is the only method that works on iOS 16.4+ PWA.
        // new Notification() from the main thread is silently ignored on iOS.
        if (Notification.permission === 'granted' && 'serviceWorker' in navigator) {
          try {
            const reg = await Promise.race([
              navigator.serviceWorker.ready,
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('SW ready timeout')), SW_READY_TIMEOUT_MS),
              ),
            ]);
            await reg.showNotification(title, notificationOptions);
            console.debug('[FCM onMessage] reg.showNotification() called successfully');
          } catch (swErr) {
            console.warn('[FCM onMessage] reg.showNotification() failed:', swErr);
          }
        }
      });

      unsubscribeRef.current = unsubscribeFn;
      console.debug('[FCM onMessage] listener registered');
    })
    .catch((err) => {
      console.warn('[FCM] setupForegroundMessageListener: setup failed', err);
    });

  return () => {
    cancelled = true;
    unsubscribeRef.current();
    console.debug('[FCM onMessage] listener unsubscribed');
  };
};

/**
 * Dispatches a CustomEvent for in-app foreground notification handling.
 * Returns true if App.js has registered a handler (window.__fcmForegroundHandlerActive),
 * false otherwise (caller should fall back to reg.showNotification).
 */
function dispatchForegroundEvent(payload, title, body) {
  if (!window.__fcmForegroundHandlerActive) return false;
  window.dispatchEvent(
    new CustomEvent('fcm-foreground-message', {
      detail: { payload, title, body },
    }),
  );
  return true;
}

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
