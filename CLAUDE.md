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
