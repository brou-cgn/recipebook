# AGENTS.md — Regeln für alle Agenten

Einzige Quelle für Projektregeln. `CLAUDE.md` und `.github/copilot-instructions.md`
verweisen hierher. Regeln, die sich prüfen lassen, werden per Test oder Lint
erzwungen — wo das gilt, steht die Datei dabei.

## Architektur
- Frontend: React 19, gebaut mit Vite (`vite.config.mjs`), PWA mit Service Worker
  (`src/service-worker.js`, eingebunden über `vite-plugin-pwa`). Tests mit Jest (`jest.config.js`).
- Umgebungsvariablen heißen `REACT_APP_*` und werden als `process.env.REACT_APP_*` gelesen;
  `vite.config.mjs` setzt sie beim Build ein. Kein `import.meta.env` im App-Code (Jest kennt es nicht).
- Backend: Firebase (Firestore, Auth, Storage, Cloud Functions in `functions/`).
- Zugriffsregeln: `firestore.rules`, `storage.rules`; Dokumentation in `docs/architecture/security.md`.
- Rollen: `admin`, `edit`, `comment`, `read`, `guest`. Jedes Rezept hat eine `groupId`.
- Firestore-Zugriffe liegen in `src/utils/*Firestore.js`, nicht in Komponenten.

## Datenzugriff
- Nie eine ganze Collection lesen. Abfragen immer mit `where` und `limit`.
  Erzwungen durch `src/dataAccessPolicy.test.js` (Tech-Check K3/W3): zählt je Datei Lesezugriffe
  auf eine ganze Collection und `query(...)` ohne `limit`; Baseline je Datei, darf nur sinken.
- Aggregierte Daten (Logs, Zähler) nicht pro Aufruf einzeln schreiben und alle lesen.
- Keine personenbezogenen Daten (E-Mail-Adressen u. Ä.) in Logs oder Protokolle. In `functions/`
  erzwungen durch `functions/logPolicy.test.js` (uid oder ID statt Adresse loggen).

## Sicherheit
- Jede Cloud Function prüft Authentifizierung und Rolle serverseitig, nicht nur im Client.
  KI-Functions erst ab Rolle `edit`; Limit-Prüfungen schlagen geschlossen fehl (fail closed).
- Neue Collections brauchen Regeln in `firestore.rules` und einen Eintrag in `docs/architecture/security.md`,
  neue Storage-Ordner ebenso (`storage.rules`). Erzwungen durch `src/securityDocsPolicy.test.js`.
- Gäste (nicht angemeldet) lesen nur per Freigabe-Link.
- Keine Secrets im Repo.

## UI-Regeln
- **Keine Emojis im UI-Code.** Alternativen: Text-Label, HTML-Entity, CSS-Klasse, Icon-Bibliothek.
  Erzwungen durch `src/emojiPolicy.test.js` (Baseline leer: jedes Emoji in einer Quelldatei
  lässt den Test rot werden).
- **Texte über `src/i18n`, nicht fest im JSX** (Vorhaben Mehrsprachigkeit,
  `docs/vorhaben/mehrsprachigkeit.md`). Sichtbare Texte (Textknoten, `aria-label`, `title`,
  `placeholder`, `alt`, `label`) stehen in einem Wörterbuch `src/i18n/texte/<bereich>.js` mit
  Deutsch, Englisch und Französisch und kommen über `useTexte` (Anleitung im Kopf von
  `src/i18n/texte.js`). Die App duzt immer: Deutsch „du“ (siezender Altbestand wird beim Umstellen
  angeglichen), Französisch „tu“, Englisch neutral. Datum und Zahl über `src/i18n/format.js`.
  Erzwungen durch `src/i18nPolicy.test.js` (Baseline je Datei, darf nur sinken; neue Dateien
  starten bei 0) und `src/i18n/texte.test.js` (alle Sprachen mit denselben Schlüsseln, Deutsch ohne
  Höflichkeitsform). Der
  Admin-Bereich bleibt deutsch: Seine Dateien stehen in `NUR_DEUTSCH`, neue nur mit Begründung.
- **Button-Icons haben ein Symbol als Standard, keinen Text.** Neue Schlüssel in
  `DEFAULT_BUTTON_ICONS` bekommen ein Symbol aus `src/utils/defaultButtonIcons.js` (`DEFAULT_ICON_NAMES`,
  dort entsteht auch die Dunkelvariante). Startwerte und Fallbacks in Komponenten nutzen
  `defaultButtonIcon(key, isDarkMode)`, kein eingetipptes Wort: Sonst blitzt der Text auf, bis die
  gepflegten Icons geladen sind. Der Knopf trägt seinen Namen über `aria-label` oder den `alt`-Text
  des Bildes. Erzwungen durch `src/utils/defaultButtonIcons.test.js`.
- **Farben nur über Tokens.** Komponenten-CSS nutzt `var(--color-…)` aus `src/tokens.css`,
  keine Hex-Farben; Light und Dark sind dort je Token definiert, ein Eintrag in `darkMode.css`
  ist dann nicht nötig. Neue Dark-Mode-Regeln in `darkMode.css` nicht ergänzen. Fehlt ein Token,
  in `tokens.css` mit beiden Werten anlegen. Erzwungen durch `src/colorTokenPolicy.test.js`
  (Baseline je Datei, darf nur sinken: wer Farben migriert, senkt den Wert; für `darkMode.css`
  zählt die Zahl der Dark-Selektoren).
- **Textfarben auf `p`, `span`, `label`, `li` im Dunkelmodus** (Tech-Check A7): `darkMode.css` setzt
  sie pauschal auf `#e8e8e8` (`[data-theme="dark"] span` usw., Spezifität 0-1-1). Eine Token-Farbe
  mit nur einer Klasse (`.hinweis { color: var(--color-danger) }`) verliert dagegen und wird im
  Dunkelmodus weiß. Bis die pauschale Regel abgelöst ist, Token-Textfarben für diese Elemente mit
  mindestens 0-1-1 schreiben, z. B. `.seite .hinweis` oder `span.hinweis`. Erzwungen durch
  `src/darkTextPolicy.test.js` (Baseline je Datei, darf nur sinken).
- **Löschaktionen**: ausschließlich `DeleteRowButton` (kein eigenes ×, kein gefüllter Kreis,
  kein Icon im Eingabefeld). 28 × 28 px, Radius 999, transparent; Rot `#a33a26` auf 12 % Fläche
  erst bei Hover/Fokus; am rechten Zeilenrand; Tooltip und `aria-label` „<Name> entfernen".
  ESLint (`no-restricted-syntax`) lehnt die Klassen `remove-btn` / `remove-child-btn` ab.
- Löschen wirkt sofort mit Snackbar „Rückgängig" (6 s, Wiederherstellung am alten Index).
  Kein Bestätigungsdialog, außer beim Löschen eines ganzen Rezepts mit Inhalt sowie einer
  ganzen Liste, eines ganzen Menüs oder eines ganzen Events (Tech-Check D2 und D6: alles
  Detailansichten, die nach dem Löschen verlassen werden, ein Undo-Fenster liefe dort mit dem
  Unmount sofort ab). Inhalt eines Rezepts sind Zutaten, Schritte oder ein Bild
  (`src/utils/recipeContent.js`); ein leeres Rezept wird ohne Rückfrage gelöscht, auch beim
  Verwerfen eines Imports. Diese Rückfragen nutzen `src/components/ConfirmDialog.js`, nie
  `window.confirm`.
- Die Desktop-Spezifikation gilt nur für Desktop. Mobil gilt die Linksswipe-Geste.
- **Knöpfe**: `src/components/Button.js` mit den Rollen `primary` (die eine abschließende Aktion,
  höchstens eine je Bildschirm oder Dialog), `secondary` (Abbrechen, Zurück, weitere Aktionen),
  `danger` (nur die Bestätigung im Lösch-Dialog), `danger-quiet` (Löschen in Werkzeugleisten) und
  `ghost` (selten Gebrauchtes). Neben-Knopf links, Haupt-Knopf rechts. Keine eigenen Knopf-Klassen
  mit Fläche; erzwungen durch `src/buttonPolicy.test.js` (Baseline je CSS-Datei, darf nur sinken).
  Außerhalb des Systems: schwebende runde Knöpfe, `DeleteRowButton`, Chips, Tabs, Schalter und
  Symbol-Knöpfe ohne Text (Icons unter „Bilder & Icons“, Suche und Menü in der Kopfzeile). Im
  Event-Bereich ist der Haupt-Knopf grün (Token in `Button.css`), die Wichtel-Teilnehmerseite behält
  ihre Gestaltung. Auf dem Handy (bis 768 px) ist der Haupt-Knopf so breit wie sein Platz; eine Reihe,
  in der das nicht passt (Eingabezeile), stellt ihn lokal zurück. Neben-Knöpfe direkt auf dem grauen
  Seitenhintergrund statt in einer Karte sind weiß mit Rand: den Container in die Liste in `Button.css`
  aufnehmen. Vorgabe: Designvorschlag https://claude.ai/artifact/6rhAdarajgh9jkVg2HJ5zk (Tech-Check A8).
- Hooks wiederverwenden, keine eigene Logik: `src/hooks/useSwipeToDelete.js`
  (Direction-Lock 6 px, Schwelle 56 px, max. 96 px Offset) und `src/hooks/useUndoableDelete.js`
  (Mutation erst nach Ablauf des Undo-Fensters oder bei Unmount/`pagehide`;
  `onConfirm` muss nach dem Unmount sicher sein).

## Versionierung
- Die Version entsteht beim Merge auf `main` als Git-Tag (`.github/workflows/version-bump.yml`),
  nicht in `package.json`. Der Sprung folgt den Commit-Titeln seit dem letzten Tag.
- Der **erste** Commit eines PR beginnt mit `feat:` (neue Funktion für Nutzer, Minor),
  `fix:` (Fehlerbehebung) oder `chore:`/`refactor:`/`docs:` (Patch). Danach der übliche deutsche Titel.
  Ohne Präfix zählt der PR als Patch. Breaking Change: `feat!:` (Major).
- Bewusster Release-Sprung ohne passende Commit-Titel: Workflow „Auto Version Bump“ manuell
  mit `bump_type` starten.

## Tests
- Vor dem Commit `npm run lint:ci` (ESLint für `src/`, bricht nur bei Fehlern ab; `npm run lint` zeigt zusätzlich die Warnungen des Altbestands).
- Vor dem Commit `npm run test:ci` ausführen. Das ist der Lauf der CI
  (`.github/workflows/ci.yml`, jeder PR gegen `main`). `npm test` läuft zusätzlich über die
  Quarantäne.
- Quarantäne: `scripts/quarantined-tests.js`. Wer eine Suite repariert, streicht ihre Zeile.
  Neue Einträge nur mit Datum und Grund.
- Tests nicht überspringen oder abschalten, um grün zu werden.
- Komponententests mit dem Helper `renderWithProviders` (`src/test-utils.js`). Standard ist
  Deutsch; `renderWithProviders(ui, { sprache: 'en' })` bzw. `'fr'` rendert in einer anderen Sprache.
- Sichtprüfung: Wer UI ändert und Java plus Playwright hat, fotografiert die Bildschirme vorher und
  nachher mit `scripts/screenshots/run.sh` (lokale Firebase-Emulatoren mit Testdaten, hell und dunkel,
  Handy und Desktop; `docs/setup/screenshots.md`) und sieht die Bilder vor dem PR an. Fehlt ein
  betroffener Bildschirm, in `scripts/screenshots/capture.js` ergänzen.
- Cloud Functions: Tests und Lint in `functions/` (`npm run lint`).
- Cloud Functions-Aufbau (Tech-Check F2): `functions/index.js` enthält nur Re-Exports. Jede Function
  liegt in `functions/handlers/<gruppe>.js`; von mehreren Gruppen genutzte Helfer in
  `functions/shared/<thema>.js` (Secrets, Auth, Rate-Limit, Gemini, Import-Kern usw.). Neue Function:
  in ein Handler-Modul schreiben und den Namen in `index.exportNames.test.js` eintragen. Bibliotheksdateien
  im Wurzelordner (z. B. `follow.js`) haben Vorrang vor gleichnamigen Ordnern, deshalb heißen die Ordner
  `handlers/` und `shared/`.
  - `shared/*.js` importieren sich nicht zyklisch und nichts aus `handlers/` oder `index.js`
    (`shared.noCycles.test.js`); jeder destrukturierte Import muss im Zielmodul exportiert sein
    (`shared.imports.test.js`).
  - `sharp`, `cheerio`, `nodemailer`, `@google/genai` und `puppeteer-core` erst beim Aufruf per `require`
    laden, nicht am Dateianfang (Kaltstart).
  - Function-Tests laden `index.js` mit Stubs über `testSupport.purgeFunctionsCache()`.
  - firebase-admin nur modular und destrukturiert laden, z. B.
    `const {getFirestore, FieldValue} = require('firebase-admin/firestore')` (ebenso `/app`, `/auth`,
    `/storage`, `/messaging`), nie `require('firebase-admin')`: Die Namespace-API (`admin.firestore()`
    usw.) gibt es ab v14 nicht mehr (Tech-Check F18). Module, die ohne Emulator testbar sein sollen,
    bekommen `FieldValue`, `Timestamp`, `FieldPath` bzw. die `messaging`-Instanz vom Handler
    hereingereicht. Erzwungen durch `firebaseAdminApi.test.js`, der auch prüft, dass jeder genutzte
    Name im installierten Paket existiert. In Tests baut `testSupport.firebaseAdminModule()` die
    Subpfade aus einem Fake.

## Arbeitsweise
- Kleine, thematisch geschlossene PRs. Beschreibung nennt, wie getestet wurde.
- Neue Regeln hier eintragen und, wenn möglich, als Test oder Lint-Regel erzwingen.
- Größere Vorhaben mit mehreren Sessions haben genau einen Tracker (siehe `CLAUDE.md`).
