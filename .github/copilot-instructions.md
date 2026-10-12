# Copilot-Anweisungen

Die verbindlichen Projektregeln stehen in [`AGENTS.md`](../AGENTS.md) im Repo-Root.
Bitte vor jeder Änderung lesen und dort (nicht hier) ergänzen.

Kurzfassung der wichtigsten Punkte:

- Keine Emojis im UI-Code (wird per Test erzwungen).
- Löschaktionen nur mit `DeleteRowButton`, `useSwipeToDelete` und `useUndoableDelete`.
- Firestore-Abfragen immer mit `where`/`limit`, nie ganze Collections lesen.
- Neue Cloud Functions prüfen Auth und Rolle serverseitig.
- Vor dem Commit `npm run test:ci` ausführen; keine neuen Einträge in der Quarantäne ohne Datum und Grund.
