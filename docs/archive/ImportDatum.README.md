# ImportDatum.csv Beispiel

Diese Datei enthält Beispieldaten für die Aktualisierung der Erstellungsdaten von Rezepten.

## Aktueller Inhalt

Die Datei enthält derzeit nur Beispielrezepte. Bitte aktualisieren Sie diese Datei mit den tatsächlichen Rezepten, deren Erstellungsdaten geändert werden sollen.

## Format

```csv
Name;Erstellt am
Rezeptname 1;DD.MM.YYYY
Rezeptname 2;DD.MM.YYYY
```

## Wichtig

- **Trennzeichen:** Semikolon (`;`)
- **Datumsformat:** DD.MM.YYYY (Tag.Monat.Jahr)
- **Rezeptnamen:** Müssen exakt mit den Titeln in Firestore übereinstimmen
- **Erste Zeile:** Kopfzeile, wird beim Import übersprungen

## Beispiel

```csv
Name;Erstellt am
Affenjäger;22.02.2024
Apple Crumble Cheesecake;27.11.2024
Käsespätzle;15.03.2024
Spaghetti Carbonara;10.01.2024
```

## Nächste Schritte

1. Ersetzen Sie den Inhalt dieser Datei mit den tatsächlichen Rezepten
2. Stellen Sie sicher, dass alle Rezeptnamen korrekt sind
3. Überprüfen Sie die Datumsformate
4. Führen Sie das Update-Script aus (siehe IMPORTDATUM_GUIDE.md)

## Hinweise

- Diese Datei wird von Git getrackt, sodass Änderungen im Repository sichtbar sind
- Erstellen Sie ein Backup vor der Ausführung (wird automatisch vom Script erstellt)
- Nach dem erfolgreichen Update können Sie diese Datei archivieren oder aktualisieren
