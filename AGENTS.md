# AGENTS.md — Regeln für alle Agenten

Einzige Quelle für Projektregeln. `CLAUDE.md` und `.github/copilot-instructions.md`
verweisen hierher. Regeln, die sich prüfen lassen, werden per Test oder Lint
erzwungen — wo das gilt, steht die Datei dabei.

## Architektur
- Frontend: React 19 mit Create React App (`react-scripts`), PWA mit Service Worker.
- Backend: Firebase (Firestore, Auth, Storage, Cloud Functions in `functions/`).
- Zugriffsregeln: `firestore.rules`, `storage.rules`; Dokumentation in `FIRESTORE_RULES.md`.
- Rollen: `admin`, `edit`, `comment`, `read`, `guest`. Jedes Rezept hat eine `groupId`.
- Firestore-Zugriffe liegen in `src/utils/*Firestore.js`, nicht in Komponenten.

## Datenzugriff
- Nie eine ganze Collection lesen. Abfragen immer mit `where` und `limit`.
- Aggregierte Daten (Logs, Zähler) nicht pro Aufruf einzeln schreiben und alle lesen.
- Keine personenbezogenen Daten (E-Mail-Adressen u. Ä.) in Logs oder Protokolle.

## Sicherheit
- Jede Cloud Function prüft Authentifizierung und Rolle serverseitig, nicht nur im Client.
  KI-Functions erst ab Rolle `edit`; Limit-Prüfungen schlagen geschlossen fehl (fail closed).
- Neue Collections brauchen Regeln in `firestore.rules` und einen Eintrag in `FIRESTORE_RULES.md`.
- Gäste (nicht angemeldet) lesen nur per Freigabe-Link.
- Keine Secrets im Repo.

## UI-Regeln
- **Keine Emojis im UI-Code.** Alternativen: Text-Label, HTML-Entity, CSS-Klasse, Icon-Bibliothek.
  Erzwungen durch `src/emojiPolicy.test.js`. Bestehende Funde stehen als Baseline im Test und
  werden nur weniger, nie mehr. Wer eine Datei bereinigt, senkt dort die Baseline.
- **Löschaktionen**: ausschließlich `DeleteRowButton` (kein eigenes ×, kein gefüllter Kreis,
  kein Icon im Eingabefeld). 28 × 28 px, Radius 999, transparent; Rot `#a33a26` auf 12 % Fläche
  erst bei Hover/Fokus; am rechten Zeilenrand; Tooltip und `aria-label` „<Name> entfernen".
- Löschen wirkt sofort mit Snackbar „Rückgängig" (6 s, Wiederherstellung am alten Index).
  Kein Bestätigungsdialog, außer beim Löschen eines ganzen Rezepts mit Inhalt.
- Die Desktop-Spezifikation gilt nur für Desktop. Mobil gilt die Linksswipe-Geste.
- Hooks wiederverwenden, keine eigene Logik: `src/hooks/useSwipeToDelete.js`
  (Direction-Lock 6 px, Schwelle 56 px, max. 96 px Offset) und `src/hooks/useUndoableDelete.js`
  (Mutation erst nach Ablauf des Undo-Fensters oder bei Unmount/`pagehide`;
  `onConfirm` muss nach dem Unmount sicher sein).

## Tests
- Vor dem Commit `npm run test:ci` ausführen. Das ist der Lauf der CI
  (`.github/workflows/ci.yml`, jeder PR gegen `main`). `npm test` läuft zusätzlich über die
  Quarantäne.
- Quarantäne: `scripts/quarantined-tests.js`. Wer eine Suite repariert, streicht ihre Zeile.
  Neue Einträge nur mit Datum und Grund.
- Tests nicht überspringen oder abschalten, um grün zu werden.
- Komponententests mit dem Helper `renderWithProviders` (`src/test-utils.js`).
- Cloud Functions: Tests und Lint in `functions/` (`npm run lint`).

## Arbeitsweise
- Kleine, thematisch geschlossene PRs. Beschreibung nennt, wie getestet wurde.
- Neue Regeln hier eintragen und, wenn möglich, als Test oder Lint-Regel erzwingen.
- Größere Vorhaben mit mehreren Sessions haben genau einen Tracker (siehe `CLAUDE.md`).
