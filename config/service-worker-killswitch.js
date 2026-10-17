/* eslint-env serviceworker */
/**
 * Notausgang für defekte Service-Worker-Versionen (Tech-Check M9).
 *
 * Diese Datei wird NIE im normalen Build ausgeliefert. Im Notfall ersetzt
 * scripts/apply-killswitch.js damit build/service-worker.js (Deploy-Workflow,
 * Eingabe „killswitch"). Geräte mit einer defekten Kopie holen sich diese Datei
 * über die gewohnte URL /service-worker.js, weil Browser sie bei Navigationen
 * auf Änderungen prüfen (Hosting liefert sie mit no-cache aus).
 *
 * Ablauf auf dem Gerät: sofort aktivieren, alle Zwischenspeicher leeren, sich
 * selbst abmelden und offene Fenster einmal neu laden. Danach lädt die App
 * wieder direkt vom Netz. Ein normaler Deploy stellt anschließend den
 * regulären Service-Worker wieder her (die App meldet ihn beim Laden neu an).
 *
 * Bewusst ohne Imports und ohne Abhängigkeiten, damit die Datei selbst nichts
 * mitbringt, was kaputtgehen kann. /firebase-messaging-sw.js (Push) hat einen
 * eigenen Scope und bleibt unberührt.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();

      // Neu laden nur, wenn es etwas aufzuräumen gab. Solange dieser Notausgang
      // ausgeliefert wird, meldet die App ihn bei jedem Start erneut an; ohne
      // diese Bedingung entstünde eine Neuladeschleife.
      if (keys.length === 0) return;
      const clients = await self.clients.matchAll({ type: 'window' });
      await Promise.all(clients.map((client) => client.navigate(client.url).catch(() => {})));
    })()
  );
});
