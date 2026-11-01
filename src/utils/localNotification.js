/**
 * Mitteilungen, die die App selbst anzeigt (ohne Push vom Server), z. B. „Timer abgelaufen!“.
 *
 * Immer über einen Service Worker: Chrome auf Android erlaubt `new Notification()` nicht und wirft
 * einen Fehler („Illegal constructor“). Bevorzugt der Messaging-Worker, weil nur er auf einen Tipp
 * reagiert (`public/firebase-messaging-sw.js`, notificationclick); sonst der Worker der App.
 *
 * Ohne eigene Firebase-Abhängigkeit, damit z. B. die Kochsitzung es leicht einbinden kann.
 */

/** Scope des FCM-Service-Workers (`public/firebase-messaging-sw.js`). */
export const MESSAGING_SW_SCOPE = '/firebase-cloud-messaging-push-scope';

/**
 * Zeigt eine Mitteilung, wenn sie erlaubt ist. Wirft nie.
 * @param {string} title
 * @param {NotificationOptions} options
 * @returns {Promise<boolean>} ob die Mitteilung angezeigt wurde
 */
export async function showLocalNotification(title, options) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    if ('serviceWorker' in navigator) {
      const registration = (await navigator.serviceWorker.getRegistration(MESSAGING_SW_SCOPE))
        || (await navigator.serviceWorker.ready);
      await registration.showNotification(title, options);
      return true;
    }
    // Desktop-Browser ohne Service Worker
    // eslint-disable-next-line no-new
    new Notification(title, options);
    return true;
  } catch (_) {
    return false;
  }
}
