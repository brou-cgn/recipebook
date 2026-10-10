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
  Wird die Ansicht vorher verlassen (Unmount oder `pagehide`), läuft die
  Mutation sofort; `onConfirm` muss also auch nach dem Unmount sicher sein.

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

## Vorhaben-Tracker
Größere Vorhaben, die über mehrere Sessions laufen, haben genau einen Tracker,
der festhält, was erledigt und was offen ist. Zu Beginn einer Arbeit an einem
solchen Vorhaben den Tracker lesen – nicht auf alte Chats verlassen.
Gepflegt wird nur an einer Stelle; alles Abgeleitete (Zähler, Fortschritt,
„Als Nächstes") berechnet der Tracker selbst.

Aktive Tracker:

### Tech-Check (Analyse-Dashboard)
Die App-Analyse vom 08.10.2026 liegt als Dashboard „RecipeBook Tech-Check“:
https://claude.ai/artifact/JixF4kfoeW7kxmwCqbgCfM

Jede Änderung, die einen Befund daraus ganz oder teilweise umsetzt, aktualisiert
das Dashboard im selben Arbeitsgang – nicht erst auf Nachfrage:
- Datensatz `findings`: `status` (offen / teilweise / behoben) und `umsetzung`
  (was, welcher PR, Datum) setzen.
- Bei „teilweise“ den verbleibenden Rest neu bewerten: `schwere`, `nutzen` und
  `aufwand` (1–5) beschreiben nur noch den Rest, Begründung in `umsetzung`.
  `schwere_ursprung` bleibt unverändert (Einstufung aus der Analyse).
- Datensatz `umsetzungen`: den PR mit Datum und Befund-IDs eintragen.
- Bei der Umsetzung neu entdeckte Probleme als eigenen Befund aufnehmen
  (nächste freie ID im Kapitel, mit Schwere, Konfidenz, Nutzen, Aufwand;
  `schwere_ursprung` = `schwere`).
- Roadmap, Kacheln, Kernaussage und Umsetzungsstand nicht von Hand pflegen –
  sie werden aus `findings` und `umsetzungen` berechnet. Die Roadmap selbst
  nur ändern, wenn sich die Planung (Phasen, Zuordnung) ändert.
