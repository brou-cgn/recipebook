## Löschaktionen
Jede Löschaktion nutzt die Komponente `DeleteRowButton` — niemals ein eigenes ×,
keinen gefüllten Kreisbutton, kein Icon im Eingabefeld.
28 × 28, Radius 999, transparent; Rot (#a33a26) auf 12 % Fläche erst bei Hover/Fokus;
immer am rechten Zeilenrand; Tooltip + aria-label „<Name> entfernen".
Löschen wirkt sofort + Snackbar „Rückgängig" (6 s, Wiederherstellung an alten Index) —
kein Bestätigungsdialog außer beim Löschen eines ganzen Rezepts mit Inhalt.
Spezifikation: design_handoff_pillenkarussell/Löschen Einheitlich.dc.html

Diese Spezifikation gilt nur für Desktop. Auf Mobile gilt stattdessen die
Linksswipe-Geste als Löschalternative — analog zur aktuell z. B. beim
Event-Löschen verwendeten Interaktion.

Die Touch-Gesten-Logik ist zentralisiert, nicht mehr pro Liste dupliziert:
- `src/hooks/useSwipeToDelete.js` — Linksswipe-Erkennung für mobile Listenzeilen
  (Events, Getränke, Gäste, Rezept-Zutaten/-Schritte). Direction-Lock (6 px),
  Swipe-Schwelle 56 px, Klemmung bei max. 96 px Offset.
- `src/hooks/useUndoableDelete.js` — verwaltet Snackbar-Banner + 6-s-Timer:
  die Zeile verschwindet sofort aus der Ansicht, die eigentliche Mutation
  (Firestore-Delete bzw. Entfernen aus dem lokalen Array) läuft erst nach
  Ablauf des Undo-Fensters — oder wird bei Klick auf „Rückgängig" verworfen.

Neue Lösch-UIs (Desktop wie Mobile) sollen diese beiden Hooks wiederverwenden
statt eigene Swipe-/Undo-Logik zu implementieren.

## Tests
`npm run test:ci` ist der Lauf, den die CI macht (`.github/workflows/ci.yml`,
läuft bei jedem PR und Push auf `main`). Er führt alles aus **außer** den
Suites in `scripts/quarantined-tests.js` — 22 Suites, die schon rot waren,
als der Test-Workflow im März 2026 abgeschaltet wurde.

Wer eine dieser Suites repariert, streicht ihre Zeile dort. Neue Einträge nur
mit Datum und Grund: eine Quarantäne, die still wächst, ist dasselbe wie gar
keine CI.

`npm test` führt weiterhin alles aus, inklusive der roten Suites.

## Versionsnummer
Die Version der App ist das neueste `v*`-Git-Tag, **nicht** das `version`-Feld
in `package.json` — das bleibt eingefroren und dient nur als Startwert, falls
noch kein Tag existiert. `scripts/appVersion.js` liest sie aus (`current`) und
berechnet die nächste (`next patch|minor|major`).

Grund: Das Ruleset auf `main` lässt Änderungen nur über PRs mit grünem Check
zu, und `github-actions[bot]` kann davon nicht ausgenommen werden (keine
installierbare App, taucht in der Bypass-Liste nicht auf). Ein Versions-Commit
auf `main` ist damit unmöglich, ein Tag-Push dagegen unberührt.

Also: niemals `package.json` bumpen, um eine Release-Version zu setzen —
`version-bump.yml` setzt das Tag bei jedem Merge auf `main` automatisch.
