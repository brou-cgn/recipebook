## Was ändert sich?

<!-- Ein bis drei Sätze: was und warum. -->

## Wie getestet?

<!-- Pflicht. Konkret benennen, nicht "getestet". -->

- [ ] `npm run test:ci` lokal grün
- [ ] Betroffene Oberfläche im Browser geprüft (Desktop und Mobil, falls UI)
- [ ] Neue Logik hat einen Test, oder es steht hier, warum nicht:

## Regeln (siehe AGENTS.md)

- [ ] Keine neuen Emojis im UI-Code
- [ ] Firestore-Abfragen mit `where`/`limit`; Cloud Functions prüfen Auth und Rolle serverseitig
- [ ] Keine neuen Einträge in `scripts/quarantined-tests.js` (oder mit Datum und Grund)
- [ ] Umsetzung eines Tech-Check-Befunds: Dashboard aktualisiert (siehe CLAUDE.md)
