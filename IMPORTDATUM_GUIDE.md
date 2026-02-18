# Recipe Creation Date Update Guide

## Übersicht

Dieses Dokument erklärt, wie man die Erstellungsdaten von Rezepten in der Firestore-Datenbank aktualisiert.

## Voraussetzungen

1. **Node.js** muss installiert sein (Version 18 oder höher)
2. **Firebase Admin SDK** Zugriff (eine der folgenden Optionen):
   - Service Account Key Datei (`serviceAccountKey.json`)
   - GOOGLE_APPLICATION_CREDENTIALS Umgebungsvariable
   - Standard-Credentials (bei Ausführung in Firebase/Google Cloud Umgebung)

## Dateien

### ImportDatum.csv

Die Datei `ImportDatum.csv` im Hauptverzeichnis enthält die zu aktualisierenden Rezepte und ihre neuen Erstellungsdaten.

**Format:**
```csv
Name;Erstellt am
Rezeptname 1;22.02.2024
Rezeptname 2;27.11.2024
Rezeptname 3;15.03.2024
```

**Wichtig:**
- Das Trennzeichen ist ein **Semikolon** (`;`)
- Datumsformat: **DD.MM.YYYY** (Tag.Monat.Jahr)
- Die Rezeptnamen müssen **exakt** mit den Titeln in Firestore übereinstimmen
- Die erste Zeile ist die Kopfzeile und wird übersprungen

## Service Account Key einrichten

Um den Script auszuführen, benötigen Sie einen Firebase Service Account Key:

1. Gehen Sie zur [Firebase Console](https://console.firebase.google.com/)
2. Wählen Sie Ihr Projekt aus
3. Klicken Sie auf das Zahnrad-Symbol → **Projekteinstellungen**
4. Wechseln Sie zum Tab **Dienstkonten**
5. Klicken Sie auf **Neuen privaten Schlüssel generieren**
6. Speichern Sie die heruntergeladene JSON-Datei als `serviceAccountKey.json` im Hauptverzeichnis des Projekts

**Sicherheitshinweis:** Die Datei `serviceAccountKey.json` enthält sensible Daten und wird automatisch von Git ignoriert. Geben Sie diese Datei niemals weiter oder committen Sie sie in Git!

## Verwendung

### Schritt 1: ImportDatum.csv vorbereiten

Erstellen oder aktualisieren Sie die Datei `ImportDatum.csv` im Hauptverzeichnis mit den zu aktualisierenden Rezepten.

### Schritt 2: Dependencies installieren (nur beim ersten Mal)

```bash
cd functions
npm install
cd ..
```

### Schritt 3: Script ausführen

```bash
node scripts/updateRecipeCreationDates.js
```

oder (wenn Sie die Firebase Functions verwenden):

```bash
cd functions
node ../scripts/updateRecipeCreationDates.js
```

### Schritt 4: Ausgabe überprüfen

Das Script gibt folgende Informationen aus:

1. **Initialisierung:** Bestätigung der Firebase-Verbindung
2. **CSV-Parsing:** Anzahl der gefundenen Rezepte
3. **Backup:** Pfad zur Backup-Datei
4. **Update-Prozess:** Status jedes einzelnen Rezepts
5. **Zusammenfassung:** 
   - Anzahl erfolgreich aktualisierter Rezepte
   - Anzahl nicht gefundener Rezepte
   - Anzahl Fehler

### Beispielausgabe

```
============================================================
Recipe Creation Date Update Script
============================================================

✓ Firebase Admin initialized with service account
✓ Found ImportDatum.csv at: /path/to/ImportDatum.csv

Parsing CSV file...
✓ Parsed 2 recipe(s) from CSV

Creating backup...
✓ Backup created: /path/to/backups/recipes-backup-2024-02-18T22-56-42.json
  Total recipes backed up: 150

Updating recipes...
------------------------------------------------------------
✓ Updated "Affenjäger"
  Old date: 15.01.2024 → New date: 22.02.2024
✓ Updated "Apple Crumble Cheesecake"
  Old date: 20.10.2024 → New date: 27.11.2024
------------------------------------------------------------

Summary:
  ✓ Successfully updated: 2
  ⚠ Not found: 0
  ✗ Errors: 0

============================================================
```

## Backup

Das Script erstellt automatisch vor jeder Aktualisierung ein Backup aller Rezepte im Ordner `backups/`.

**Backup-Dateiname:** `recipes-backup-YYYY-MM-DDTHH-MM-SS.json`

Die Backup-Datei enthält alle Rezepte mit ihren vollständigen Daten im JSON-Format.

### Backup wiederherstellen

Falls Sie ein Backup wiederherstellen müssen, können Sie:

1. Die Backup-Datei öffnen und die benötigten Daten manuell in der Firebase Console wiederherstellen
2. Ein eigenes Script schreiben, um die Backup-Daten zu importieren
3. Die Firebase Admin SDK verwenden, um die Daten programmatisch wiederherzustellen

## Fehlerbehebung

### "ImportDatum.csv not found"

**Lösung:** Stellen Sie sicher, dass die Datei `ImportDatum.csv` im Hauptverzeichnis des Projekts existiert.

### "Firebase Admin initialization failed"

**Mögliche Ursachen:**
1. `serviceAccountKey.json` fehlt oder ist ungültig
2. GOOGLE_APPLICATION_CREDENTIALS ist nicht gesetzt
3. Keine Berechtigung für das Firebase-Projekt

**Lösung:** 
- Überprüfen Sie, ob `serviceAccountKey.json` vorhanden und korrekt ist
- Laden Sie einen neuen Service Account Key aus der Firebase Console herunter

### "Recipe not found"

**Mögliche Ursachen:**
1. Rezeptname in `ImportDatum.csv` stimmt nicht exakt mit dem Titel in Firestore überein
2. Rezept existiert nicht in der Datenbank

**Lösung:**
- Überprüfen Sie die Rechtschreibung und Groß-/Kleinschreibung
- Prüfen Sie in der Firebase Console, ob das Rezept existiert
- Achten Sie auf Leerzeichen am Anfang oder Ende des Namens

### "Invalid date"

**Mögliche Ursachen:**
1. Datum in falschem Format
2. Ungültiges Datum (z.B. 32.01.2024)

**Lösung:**
- Verwenden Sie das Format DD.MM.YYYY
- Überprüfen Sie, ob das Datum gültig ist

## Technische Details

### Script-Funktionen

Das Script `scripts/updateRecipeCreationDates.js` bietet folgende Funktionen:

- **initializeFirebase()**: Initialisiert Firebase Admin SDK
- **parseCSV(filePath)**: Parst die CSV-Datei
- **createBackup(db)**: Erstellt ein Backup aller Rezepte
- **findRecipeByName(db, recipeName)**: Findet ein Rezept anhand des Namens
- **updateRecipeCreationDate(db, recipeId, newDate)**: Aktualisiert das Erstellungsdatum eines Rezepts

### Datenbank-Struktur

Das Script aktualisiert folgende Felder in Firestore:

- **createdAt**: Firestore Timestamp des neuen Erstellungsdatums
- **updatedAt**: Firestore ServerTimestamp des Aktualisierungszeitpunkts

## Sicherheit

- Die Datei `serviceAccountKey.json` wird automatisch von Git ignoriert
- Backup-Dateien werden ebenfalls von Git ignoriert
- Stellen Sie sicher, dass keine sensiblen Daten in das Repository committed werden

## Support

Bei Problemen oder Fragen:

1. Überprüfen Sie die Ausgabe des Scripts auf Fehlermeldungen
2. Konsultieren Sie dieses Dokument
3. Prüfen Sie die Firebase Console auf Datenintegrität
4. Kontaktieren Sie den Projektadministrator
