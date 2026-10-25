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

// Version des Workers, beim Build durch die App-Version ersetzt
// (vite.config.mjs, Plugin recipebook:messaging-sw-version). Dadurch ändert
// sich die Datei mit jedem Deploy, und die App kann anzeigen, welche Fassung
// auf dem Gerät läuft (Persönliche Daten → Protokoll Push-Tipps).
const MESSAGING_SW_VERSION = '__MESSAGING_SW_VERSION__';

let messaging = null;
const shownNotifications = new Set();
const NOTIFICATION_DEDUP_WINDOW_MS = 5000;

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
      // Even when payload.notification exists, we must explicitly show a
      // notification here because onBackgroundMessage handling suppresses
      // automatic browser/OS display.
      const notificationId = payload.data?.notificationId;
      if (notificationId && shownNotifications.has(notificationId)) {
        return;
      }
      if (notificationId) {
        shownNotifications.add(notificationId);
        setTimeout(() => shownNotifications.delete(notificationId), NOTIFICATION_DEDUP_WINDOW_MS);
      }

      // "Hintergrundaktualisierung": mirror the sender's pending-review count
      // onto the installed app's home screen/taskbar icon via the Badging
      // API, even while brouBook is fully closed. Feature-detected — most
      // browsers besides Chrome/Edge don't support it in a service worker.
      if (payload.data?.pendingReviewCount != null) {
        const count = parseInt(payload.data.pendingReviewCount, 10) || 0;
        try {
          if (count > 0 && typeof self.navigator?.setAppBadge === 'function') {
            self.navigator.setAppBadge(count).catch(() => {});
          } else if (count === 0 && typeof self.navigator?.clearAppBadge === 'function') {
            self.navigator.clearAppBadge().catch(() => {});
          }
        } catch (badgeErr) {
          // Badging API not available/allowed here — ignore.
        }
      }

      const notificationTitle =
        payload.notification?.title || payload.data?.title || 'RecipeBook';
      const notificationOptions = {
        body: payload.notification?.body || payload.data?.body || '',
        icon: payload.data?.icon || '/logo192.png',
        badge: payload.data?.badge || '/favicon.ico',
        tag: notificationId || 'default',
        data: payload.data || {},
      };
      self.registration.showNotification(notificationTitle, notificationOptions);
      if (payload.data?.type === 'import_ready' || payload.data?.type === 'import_failed') {
        appendPushLog('Mitteilung angezeigt (App im Hintergrund)', `Rezept ${payload.data.recipeId || '–'}`);
      }
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
  } else if (event.data && event.data.type === 'GET_MESSAGING_SW_VERSION') {
    event.ports?.[0]?.postMessage({version: MESSAGING_SW_VERSION});
  }
});

// ── Updates sofort übernehmen ─────────────────────────────────────────────────
// Dieser Worker steuert keine Seite (eigener Scope), eine neue Fassung muss auf
// nichts warten. skipWaiting macht das unabhängig vom Browser verbindlich.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(appendPushLog('Worker aktiv', MESSAGING_SW_VERSION));
});

// ── Notification click – bring the app to the foreground ──────────────────────
/**
 * Build the in-app URL a notification should deep-link to, based on its data payload.
 */
function buildNotificationTargetUrl(data) {
  if (data?.type === 'consumption_reminder' && data.eventId) {
    return `/?eventReminder=${encodeURIComponent(data.eventId)}`;
  }
  if (data?.type === 'import_ready' || data?.type === 'import_failed') {
    return `/?reviewImport=${encodeURIComponent(data.recipeId || '1')}`;
  }
  if (data?.type === 'follow_request') {
    return '/?followNetwork=1';
  }
  return '/';
}

// ── Übergabe an die Seite über Cache Storage ──────────────────────────────────
// Der Tipp auf „Rezept bereit zur Prüfung" muss die Rezept-ID an die App
// bringen. postMessage, URL beim Öffnen und Fokus hängen davon ab, wie iOS die
// pausierte PWA behandelt; keiner dieser Wege ist am Gerät belegt. Deshalb legt
// der Worker die ID zusätzlich hier ab, und die App liest sie, sobald sie
// sichtbar wird (src/utils/pushTapHandoff.js, gleiche Namen).
// Dort steht auch ein kurzes Protokoll der Schritte, sichtbar unter
// Persönliche Daten → Hintergrundaktualisierung.
const PUSH_HANDOFF_CACHE = 'recipebook-push-handoff';
const PUSH_HANDOFF_PENDING_KEY = '/__push-handoff/pending-review-import';
// Jeder Protokolleintrag unter einem eigenen Schlüssel: Worker und App
// schreiben oft in derselben Sekunde, ein gemeinsamer Eintrag
// (lesen, anhängen, schreiben) verlor dabei Schritte. Gekürzt wird beim Lesen.
const PUSH_HANDOFF_LOG_PREFIX = '/__push-handoff/log/';
// Wie lange der Worker beim Tipp höchstens auf das Ablegen wartet, bevor er
// die App nach vorn holt.
const PUSH_HANDOFF_WRITE_WAIT_MS = 500;

async function appendPushLog(step, detail) {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(PUSH_HANDOFF_CACHE);
    const at = Date.now();
    const key = `${PUSH_HANDOFF_LOG_PREFIX}${at}-sw-${Math.random().toString(36).slice(2, 8)}`;
    await cache.put(key, new Response(JSON.stringify({at, by: 'sw', step, detail: detail || ''})));
  } catch (err) {
    // Protokoll ist Diagnose, nie ein Grund für einen Fehler
  }
}

async function storePendingReviewImport(recipeId) {
  if (typeof caches === 'undefined') return;
  const cache = await caches.open(PUSH_HANDOFF_CACHE);
  await cache.put(
      PUSH_HANDOFF_PENDING_KEY,
      new Response(JSON.stringify({recipeId, at: Date.now()})),
  );
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise.catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data;
  const targetUrl = buildNotificationTargetUrl(data);
  const isImportNotification =
    data?.type === 'import_ready' || data?.type === 'import_failed';

  event.waitUntil((async () => {
    if (isImportNotification) {
      await withTimeout(
          Promise.all([
            storePendingReviewImport(data.recipeId || '1'),
            appendPushLog('Tipp empfangen', `Rezept ${data.recipeId || '–'}`),
          ]),
          PUSH_HANDOFF_WRITE_WAIT_MS,
      );
    }
    const clientList = await clients.matchAll({type: 'window', includeUncontrolled: true});
    const client = clientList.find((c) => c.url && 'focus' in c);
    let outcome;
    if (client) {
      if (isImportNotification) {
        // Eine laufende App (auch eine im Hintergrund pausierte installierte
        // PWA) nicht neu laden: WindowClient.navigate() wird auf iOS nicht
        // zuverlässig ausgeführt, die App käme dann nur nach vorn und bliebe
        // in ihrer letzten Ansicht. Stattdessen die Ziel-ID direkt an die
        // Seite schicken (App.js: Nachricht REVIEW_IMPORT); die Ablage oben
        // greift, falls die Nachricht nicht ankommt.
        client.postMessage({
          type: 'REVIEW_IMPORT',
          recipeId: data.recipeId || '',
        });
        outcome = client.focus();
      } else if (data?.type === 'follow_request') {
        // Laufende App nicht neu laden (navigate ist auf iOS unzuverlässig):
        // Nachricht an die Seite, App.js öffnet die Netzwerk-Seite.
        client.postMessage({type: 'OPEN_NETWORK'});
        outcome = client.focus();
      } else if ('navigate' in client) {
        outcome = client.navigate(targetUrl).then((c) => c.focus());
      } else {
        outcome = client.focus();
      }
    } else if (clients.openWindow) {
      outcome = clients.openWindow(targetUrl);
    }
    if (!isImportNotification) return outcome;
    let result = client ?
      `${clientList.length} Fenster, Nachricht + Fokus (${client.visibilityState || '?'})` :
      `kein Fenster, öffne ${targetUrl}`;
    try {
      await outcome;
    } catch (err) {
      result += ` – Fehler: ${err && err.message ? err.message : err}`;
    }
    await appendPushLog('Tipp weitergegeben', result);
  })());
});
