# PWA-Abnahme der Vite-Migration (Tech-Check B1)

Fachliche Abnahmeliste für die Ablösung von Create React App durch Vite
(Befund B1 im Dashboard „RecipeBook Tech-Check“). Jeder Punkt beschreibt, was
ein Nutzer erlebt und welches Risiko dahintersteht; technische Begriffe stehen
nur in Klammern.

Immer auf einem **Preview-Deploy** und einem **echten Gerät** mit installierter
PWA testen, nicht nur im Dev-Server oder in der DevTools-Emulation.

## Kurzfassung für den Release (11 Nutzer)

Bei einem kleinen, persönlich erreichbaren Nutzerkreis reicht diese Abnahme;
die ausführliche Liste unten bleibt die Referenz.

1. **Vorher:** Nutzer informieren, dass ein Update ansteht und Probleme gemeldet werden sollen.
2. **Eigener Test auf einem Preview-Kanal**, auf dem eigenen Handy mit installierter PWA:
   Update von der alten Version (Abschnitt 1), Start ohne Netz (2), Test-Push (3).
3. **Zeitpunkt:** Release, wenn du danach erreichbar bist.
4. **Danach:** Bei den Nutzern nachfragen, vor allem nach Push-Benachrichtigungen.

## Bereits automatisch geprüft (Chromium, 14.10.2026)

Vor dem Merge im Browser mit dem gebauten Stand geprüft – ersetzt nicht den
Test auf einem echten iPhone/Android-Gerät, deckt aber die Mechanik ab:

- [x] Alte CRA-Version installiert → neue Vite-Version deployt → beim nächsten
      Öffnen übernimmt der neue Service-Worker automatisch, die App lädt einmal neu
      und zeigt die neue Version. Alte Dateien sind danach aus dem Cache entfernt.
- [x] Service-Worker liegt weiter unter `/service-worker.js`, Precache: `index.html`
      plus alle gebündelten JS/CSS-Dateien (wie bisher, ohne Dateien aus `public/`).
- [x] Start ohne Netz und Deep-Link ohne Netz zeigen die App.
- [x] `/firebase-messaging-sw.js` und `manifest.json` (inkl. `share_target`) werden unverändert ausgeliefert.
- [x] Alle `REACT_APP_*`-Werte landen im Build (Namen unverändert, GitHub-Secrets bleiben gültig).
- [x] Tests: identisches Ergebnis wie vorher, auch in den Quarantäne-Suites (3.736 Tests, dieselben 101 rot).
- [x] Bauzeit 38,7 s → 2,5 s; `npm audit` 108 → 46 Meldungen (davon 2 in Laufzeit-Abhängigkeiten, beide aus dem Firebase-SDK).

Offen bleiben die Punkte, die nur ein echtes Gerät zeigt: Installation auf
iOS/Android, Push-Zustellung, Teilen aus einer anderen App.

## Abnahme am Gerät (17.10.2026, nach dem Live-Gang am 14.10.)

Durch den Betreiber auf dem eigenen Handy mit installierter PWA:

- [x] Abschnitt 1: Update der installierten Version fehlerfrei.
- [x] Abschnitt 3: Push-Nachricht in allen drei Zuständen (App offen, Hintergrund, geschlossen) zugestellt; Tipp öffnet die App (nicht das konkrete Rezept, siehe Tech-Check M8).
- [x] Abschnitt 5: nach dem Update weiter angemeldet.
- [x] Abschnitt 2: Offline-Start geprüft; Rezeptbilder offline nicht sichtbar (keine Regression, M7).
- [ ] Nicht einzeln geprüft: Logo/Startbild, Abschnitt 4 (Installation, Teilen).
- [ ] Notausgang-Service-Worker war zum Zeitpunkt der Abnahme nicht vorhanden (Tech-Check M9, danach umgesetzt).

Befund B1 wurde vom Betreiber trotz dieser Restpunkte als behoben abgenommen.

## Hintergrund

Die App ist eine installierte Web-App (PWA). Auf dem Handy liegt eine Kopie der
App, die sich im Hintergrund selbst aktualisiert. Die Migration tauscht das
Werkzeug aus, das diese Kopie baut. Das Risiko liegt darin, dass Nutzer mit
einer bereits installierten alten Version die neue nicht sauber bekommen.

## 1. Bestehende Nutzer bekommen das Update (kritischste Abnahme)

Wer die App heute installiert hat, muss nach dem Release ohne eigenes Zutun die
neue Version erhalten. Bestandsnutzer dürfen nicht auf einer kaputten
Zwischenversion hängen bleiben.

- [ ] Ausgangslage: alte Version (CRA) auf dem Handy installiert und einmal genutzt.
- [ ] Neue Version veröffentlichen. Die App zeigt danach die neue Version an.
- [ ] Der Hinweis „Neue Version verfügbar“ erscheint, „Aktualisieren“ lädt die neue Version
      (`SKIP_WAITING`-Message aus `serviceWorkerRegistration.js`).
- [ ] Kein weißer Bildschirm und keine 404 auf alte Dateinamen nach dem Update.
- [ ] Alter Zwischenspeicher wird aufgeräumt (DevTools → Application → Cache Storage).
- [ ] Im gebauten Service-Worker ist `self.__WB_MANIFEST` vorhanden und befüllt.

Ein Fehler hier trifft alle Bestandsnutzer gleichzeitig und lässt sich nicht per
Hotfix beheben, weil die defekte Kopie auf den Geräten liegt.

## 2. Nutzung ohne Internet

- [ ] Flugmodus an, App starten: Die Rezeptliste erscheint.
- [ ] Ein einzelnes Rezept direkt öffnen (Deep-Link), ohne Umweg über die Startseite.
- [ ] Rezeptbilder offline: **nicht erfüllt, keine Regression.** Bilder liegen in Firebase Storage (fremde Domain), die `StaleWhileRevalidate`-Route greift nur für eigene `.png`-Dateien; unter CRA war es identisch (Tech-Check M7).
- [ ] Der Zwischenspeicher wächst nicht unbegrenzt (`ExpirationPlugin` aktiv).

## 3. Benachrichtigungen

Push läuft über einen eigenen Hintergrunddienst (`/firebase-messaging-sw.js`,
Scope `/firebase-cloud-messaging-push-scope`) und soll von der Migration
unberührt bleiben.

- [ ] Die Datei wird unter genau diesem Pfad ausgeliefert, nicht durch `index.html` ersetzt.
- [ ] Anmeldung für Benachrichtigungen funktioniert (Berechtigung, Gerät registriert, FCM-Token).
- [ ] Test-Nachricht kommt an: App geöffnet, im Hintergrund, ganz geschlossen.
- [ ] Der VAPID-Key ist in der neuen Umgebung hinterlegt (`VITE_`-Variable). Fehlt er, schlägt die Registrierung still fehl.

## 4. Installation und Teilen

- [ ] Installation auf Android (Chrome) und iPhone (Zum Home-Bildschirm).
- [ ] Name, Icon und Startseite stimmen wie bisher; im Build gibt es genau ein Manifest
      (`vite-plugin-pwa` darf das aus `public/` nicht doppeln oder überschreiben).
- [ ] `start_url`, `display: standalone` und `share_target` sind unverändert.
- [ ] Ein Rezeptlink aus einer anderen App lässt sich an das Rezeptbuch teilen und startet den Import.
- [ ] Lighthouse-PWA-Check ohne neue Fehler.

## 5. Daten und Einstellungen der Nutzer

Nach dem Update darf nichts verloren gehen.

- [ ] Nutzer bleibt angemeldet.
- [ ] Persönliche Einstellungen (Logo, Startbild) sind unverändert
      (`UPDATE_APP_SETTINGS` schreibt weiter in IndexedDB `recipebook-settings`, `DB_VERSION` bleibt 1).
- [ ] Alle 9 `REACT_APP_*`-Variablen sind auf `VITE_*` / `import.meta.env` umgestellt und gesetzt
      (`firebase.js`, `pushNotifications.js`, `setupTests.js`). Ein fehlender Wert zeigt sich erst zur Laufzeit.

## 6. Qualitätsnachweis

- [ ] `npm run test:ci` läuft wie vorher durch; `scripts/quarantined-tests.js` wird nicht länger.
- [ ] Jest läuft eigenständig ohne `react-scripts` (Babel-, CSS- und Asset-Mocks).
- [ ] Sicherheitsmeldungen vorher/nachher (`npm audit`): Ausgangswert 108, davon 101 über `react-scripts`.
- [ ] Bauzeit vorher/nachher: Ausgangswert 37 s.
- [ ] Tech-Check-Dashboard aktualisiert: Befund B1 (Status, Umsetzung) und Eintrag in `umsetzungen`.

## Freigabe-Regel

Die Migration geht nur live, wenn die Abschnitte **1, 2 und 3** vollständig
bestanden sind.

## Rückfallplan (vorher klären)

Ein Zurückrollen auf die alte Version reicht nicht, wenn Geräte die fehlerhafte
Kopie schon haben. Vor dem Release einen „Notausgang“ vorbereiten: eine Version
des Service-Workers, die sich auf den Geräten selbst deregistriert und den
Cache leert.

Umgesetzt (Tech-Check M9): `docs/setup/notausgang-service-worker.md`.

## Rollen

- **Fachlich (Abnahme am Gerät):** Abschnitte 1 bis 5 durchspielen und abhaken.
- **Entwicklung/Copilot:** Abschnitt 6 und die Vorbereitung (Testumgebung,
  Konfigurationswerte, Notausgang).
