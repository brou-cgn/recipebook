# Screenshots und Sichtprüfung

Ein Befehl fotografiert eine feste Liste von Bildschirmen der App: hell und dunkel, auf
Desktop-Breite (1280 px) und Handy-Breite (iPhone 13). Die App läuft dafür lokal gegen die
Firebase-Emulatoren mit erfundenen Testdaten, nicht gegen das echte Projekt. Zweck: UI-Änderungen
vor dem PR ansehen, statt sie über mehrere PRs auszuprobieren (Tech-Check W2, Roadmap-Phase 7
„UI-System“).

## Voraussetzungen

- Node 20 oder neuer, `npm ci` im Repo-Wurzelordner (für Vite).
- Java 21 oder neuer für den Firestore-Emulator.
- Einmal `cd rules-tests && npm ci` (bringt `firebase-tools` mit, dieselben Emulatoren wie die Regel-Tests).
- Playwright mit Chromium. In den Claude-Cloud-Sessions ist es vorinstalliert; lokal
  `npm i -g playwright && npx playwright install chromium`.

## Aufruf

```bash
scripts/screenshots/run.sh                       # alle Bildschirme nach screenshots-out/
scripts/screenshots/run.sh vorher                # in einen eigenen Ordner (relativ zum Repo)
scripts/screenshots/run.sh nachher --only rezept,kochbuch
scripts/screenshots/run.sh entwurf --css entwurf.css --variants desktop-hell,handy-dunkel
```

`--css` legt ein Stylesheet über die laufende App, etwa einen Gestaltungsentwurf, ohne App-Code
zu ändern; `--variants` beschränkt auf einzelne Varianten. Läuft auf dem Port des Dev-Servers
(5174) schon ein Server, bricht der Lauf ab, damit die Bilder nicht dessen Stand zeigen.

Ein voller Lauf macht 260 Bilder in vier Varianten. Jedes Bild meldet sich neu an und braucht in
der Cloud-Session gut fünf Sekunden (gemessen am 22.11.2026), der volle Lauf also gut 20 Minuten;
für Vorher-nachher-Vergleiche einzelner Bildschirme reichen `--only` und `--variants`. Ergebnis:
je Variante ein Ordner mit PNG-Dateien und eine `index.html` mit allen Bildern als Raster.
`screenshots-out/` steht in `.gitignore`.

Jeder Lauf prüft außerdem, ob ein Bildschirm seitlich scrollbar ist, also breiter als das Fenster
(etwa eine Knopfreihe auf dem Handy). Betroffene Bilder stehen in der Ausgabe und oben in der
`index.html`.

Vorher-nachher: einmal auf `main` (Ordner `vorher`), einmal auf dem Branch (Ordner `nachher`),
dann beide `index.html` nebeneinander ansehen.

## Was passiert

1. `run.sh` startet Auth-, Firestore- und Storage-Emulator (`firebase emulators:exec`, Ports aus
   `firebase.json`, Projekt `demo-recipebook`) und beendet sie am Ende wieder.
2. `seed.js` leert die Emulatoren und legt die Testdaten an: Admin-Konto `testkoch@example.com`
   (Passwort `screenshots-only`, gilt nur im Emulator), sechs Rezepte mit Platzhalterbildern, die
   öffentliche und zwei private Listen (eine als Inspirationssammlung), ein Menü, ein Event, ein
   Kochtagebuch-Eintrag und eine Bewertung der Linsensuppe, ein Eintrag der Saisonmatrix und zwei Einträge
   der Kochschule. Für Admins ist die Startseite („Küche“)
   freigeschaltet, sie ist daher der erste Bildschirm nach der Anmeldung. Geschrieben wird über die REST-Schnittstelle des Emulators an den Regeln vorbei; die
   App selbst läuft mit den echten `firestore.rules`.
3. `capture.js` startet Vite mit `REACT_APP_USE_EMULATORS=true`, meldet sich an und fotografiert
   die Bildschirme aus der Liste `SCREENS`. Nur mit diesem Schalter verbindet sich die App mit den
   Emulatoren (`src/firebase.js`). Der Produktions-Build setzt ihn nicht, dort läuft der Block nie;
   im gebauten Code bleibt er stehen (rund 80 Byte gezippt).

## Bildschirme ergänzen

Neue Einträge in `SCREENS` in `scripts/screenshots/capture.js`: ein Name und eine Funktion, die
vom Kochbuch aus dorthin navigiert und `shot()` aufruft. `fullPage: true` fotografiert die ganze
Seite statt nur den sichtbaren Ausschnitt, `variants` beschränkt einen Bildschirm auf einzelne
Varianten (etwa Formulare, die es nur auf Desktop gibt). Braucht ein Bildschirm einen anderen Stand
des Testkontos, etwa ein neues Konto ohne Sammlungen, ändert er ihn mit `patchAccount` aus `seed.js`
und setzt ihn danach zurück (Beispiel `startseite-einrichtung`). Fehlt ein Bild, steht der Grund in der
Ausgabe und oben in der `index.html`; die übrigen Bilder entstehen trotzdem.

## Grenzen

- Cloud Functions laufen nicht mit: KI-Import, Nährwertberechnung, Einladungen und Push gehen hier nicht.
- Es gibt keine gepflegten Button-Icons. Knöpfe zeigen deshalb die Standard-Symbole aus
  `DEFAULT_BUTTON_ICONS`, nicht die Icons des Live-Projekts.
- Bilder sind SVG-Platzhalter statt Fotos aus Storage.
- Die Bilder zeigen den Zustand nach dem Laden, keine Hover- oder Ladezustände.
