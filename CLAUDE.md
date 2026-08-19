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
