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
- Aggregierte Daten (Logs, Zähler) nicht pro Aufruf einzeln schreiben und alle lesen.
- Keine personenbezogenen Daten (E-Mail-Adressen u. Ä.) in Logs oder Protokolle.

## Sicherheit
- Jede Cloud Function prüft Authentifizierung und Rolle serverseitig, nicht nur im Client.
  KI-Functions erst ab Rolle `edit`; Limit-Prüfungen schlagen geschlossen fehl (fail closed).
- Neue Collections brauchen Regeln in `firestore.rules` und einen Eintrag in `docs/architecture/security.md`.
- Gäste (nicht angemeldet) lesen nur per Freigabe-Link.
- Keine Secrets im Repo.

## UI-Regeln
- **Keine Emojis im UI-Code.** Alternativen: Text-Label, HTML-Entity, CSS-Klasse, Icon-Bibliothek.
  Erzwungen durch `src/emojiPolicy.test.js` (Baseline leer: jedes Emoji in einer Quelldatei
  lässt den Test rot werden).
- **Farben nur über Tokens.** Komponenten-CSS nutzt `var(--color-…)` aus `src/tokens.css`,
  keine Hex-Farben; Light und Dark sind dort je Token definiert, ein Eintrag in `darkMode.css`
  ist dann nicht nötig. Neue Dark-Mode-Regeln in `darkMode.css` nicht ergänzen. Fehlt ein Token,
  in `tokens.css` mit beiden Werten anlegen. Erzwungen durch `src/colorTokenPolicy.test.js`
  (Baseline je Datei, darf nur sinken: wer Farben migriert, senkt den Wert).
- **Löschaktionen**: ausschließlich `DeleteRowButton` (kein eigenes ×, kein gefüllter Kreis,
  kein Icon im Eingabefeld). 28 × 28 px, Radius 999, transparent; Rot `#a33a26` auf 12 % Fläche
  erst bei Hover/Fokus; am rechten Zeilenrand; Tooltip und `aria-label` „<Name> entfernen".
  ESLint (`no-restricted-syntax`) lehnt die Klassen `remove-btn` / `remove-child-btn` ab.
- Löschen wirkt sofort mit Snackbar „Rückgängig" (6 s, Wiederherstellung am alten Index).
  Kein Bestätigungsdialog, außer beim Löschen eines ganzen Rezepts mit Inhalt sowie einer
  ganzen Liste oder eines ganzen Menüs (Tech-Check D2: beide sind Detailansichten, die nach dem
  Löschen verlassen werden, ein Undo-Fenster liefe dort mit dem Unmount sofort ab). Diese
  Rückfragen nutzen `src/components/ConfirmDialog.js`, nie `window.confirm`.
- Die Desktop-Spezifikation gilt nur für Desktop. Mobil gilt die Linksswipe-Geste.
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
- Vor dem Commit `npm run lint:ci` (ESLint für `src/`, bricht nur bei Fehlern ab; `npm run lint` zeigt zusätzlich ~270 Warnungen als Altbestand).
- Vor dem Commit `npm run test:ci` ausführen. Das ist der Lauf der CI
  (`.github/workflows/ci.yml`, jeder PR gegen `main`). `npm test` läuft zusätzlich über die
  Quarantäne.
- Quarantäne: `scripts/quarantined-tests.js`. Wer eine Suite repariert, streicht ihre Zeile.
  Neue Einträge nur mit Datum und Grund.
- Tests nicht überspringen oder abschalten, um grün zu werden.
- Komponententests mit dem Helper `renderWithProviders` (`src/test-utils.js`).
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

## Arbeitsweise
- Kleine, thematisch geschlossene PRs. Beschreibung nennt, wie getestet wurde.
- Neue Regeln hier eintragen und, wenn möglich, als Test oder Lint-Regel erzwingen.
- Größere Vorhaben mit mehreren Sessions haben genau einen Tracker (siehe `CLAUDE.md`).
