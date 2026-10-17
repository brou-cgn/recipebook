# Notausgang für defekte Service-Worker-Versionen (Tech-Check M9)

Die App ist eine installierte Web-App (PWA). Ihre Kopie auf dem Handy wird vom
Service-Worker verwaltet. Ist eine ausgelieferte Version defekt (weißer
Bildschirm, kaputter Zwischenspeicher), hilft ein normaler Hotfix nicht, solange
die Geräte die defekte Kopie aus dem Zwischenspeicher bedienen.

Der Notausgang ersetzt `/service-worker.js` durch eine Minimalversion
(`config/service-worker-killswitch.js`). Sie aktiviert sich sofort, leert alle
Zwischenspeicher, meldet sich selbst ab und lädt offene Fenster einmal neu.
Danach lädt die App direkt vom Netz.

## Auslösen

1. GitHub → Actions → **Deploy to Firebase Hosting** → **Run workflow**.
2. Branch `main`, Haken **killswitch** setzen, starten.
3. Der Lauf baut `main` wie gewohnt, ersetzt `build/service-worker.js` durch den
   Notausgang (`scripts/apply-killswitch.js`) und deployt.

Der Notausgang liefert den **aktuellen Stand von `main`** aus. War der Fehler in
`main`, zuerst den fehlerhaften Commit zurücknehmen (Revert-PR mergen) und erst
dann den Notausgang starten, sonst lädt die App danach die fehlerhafte Version
direkt vom Netz.

## Wirkung auf den Geräten

- Browser prüfen `/service-worker.js` bei Navigationen auf Änderungen (spätestens
  nach 24 Stunden, Hosting liefert die Datei mit `no-cache`). Ein Gerät erholt
  sich also beim nächsten Öffnen der App, nicht sofort.
- Ist der Zwischenspeicher aufgeräumt, lädt die App ohne Service-Worker. Offline
  ist dann vorübergehend nichts verfügbar.
- Solange der Notausgang ausgeliefert wird, meldet die App ihn bei jedem Start
  neu an; er räumt nur beim ersten Mal auf und lädt dann nicht erneut (keine
  Neuladeschleife).
- Push (`/firebase-messaging-sw.js`) hat einen eigenen Scope und bleibt unberührt.

## Wieder normal werden

Nach der Korrektur ganz normal deployen (Merge auf `main`). Der reguläre
Service-Worker ersetzt den Notausgang, die App meldet ihn beim nächsten Start
neu an und der Zwischenspeicher baut sich neu auf.

## Geprüft

- Browserprobe (Chromium, 17.10.2026): Gerät mit defektem, zwischengespeichertem
  Service-Worker erhält den Notausgang → Zwischenspeicher leer, Registrierung
  entfernt, Seite kommt vom Netz, keine Neuladeschleife.
- **Nicht geprüft:** der Workflow-Lauf selbst (Haken im GitHub-UI) und das
  Verhalten auf iOS/Android. Vor dem Ernstfall einmal auf einem Preview-Kanal
  oder zu einer ruhigen Zeit mit dem eigenen Handy durchspielen.
