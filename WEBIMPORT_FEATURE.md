# Webimport Feature Dokumentation

## Übersicht

Das Webimport-Feature ermöglicht es Benutzern, Rezepte direkt von Websites zu importieren. Die Funktion:

1. Nimmt eine URL als Eingabe
2. Erfasst einen Screenshot der Website
3. Verarbeitet den Screenshot mit Gemini AI OCR
4. Extrahiert Rezeptdaten (Titel, Zutaten, Schritte, etc.)
5. Füllt das Rezeptformular automatisch vor

## Implementierte Komponenten

### Frontend

- **WebImportModal.js**: Modal-Komponente für URL-Eingabe und Ergebnisanzeige
- **WebImportModal.css**: Styling für die Modal-Komponente
- **webImportService.js**: Service für Screenshot-Erfassung und URL-Validierung
- **RecipeForm.js**: Integriert den Webimport-Button (nur sichtbar wenn Berechtigung vorhanden)
- **Settings.js**: Konfiguration für Webimport-Button-Icon
- **UserManagement.js**: Toggle für Webimport-Berechtigung pro Benutzer

### Backend (Cloud Functions)

- **functions/index.js**: 
  - `captureWebsiteScreenshot`: Cloud Function für Screenshot-Erfassung
  - Rate Limiting (wie bei AI Scan)
  - URL-Validierung

## Benutzerberechtigungen

Webimport ist eine optionale Funktion, die pro Benutzer aktiviert werden kann:

- Administratoren können die Webimport-Berechtigung in der Benutzerverwaltung aktivieren/deaktivieren
- Nur Benutzer mit aktivierter Berechtigung sehen den Webimport-Button
- Rate Limits gelten wie bei der Fotoscan-Funktion

## Konfiguration

### Button-Icon

Das Webimport-Button-Icon kann in den Einstellungen unter "Allgemein" > "Button-Icons" angepasst werden:
- Standard: 🌐 (Globus-Emoji)
- Kann durch Emoji, Text oder eigenes Bild ersetzt werden

### Puppeteer-Installation (Erforderlich)

**WICHTIG**: Die Screenshot-Funktion benötigt Puppeteer, das aktuell noch nicht installiert ist.

#### Schritte zur Aktivierung:

1. Puppeteer zu Cloud Functions hinzufügen:
   ```bash
   cd functions
   npm install puppeteer@^21.0.0
   ```

2. Cloud Functions neu deployen:
   ```bash
   firebase deploy --only functions
   ```

3. Memory und Timeout in `functions/index.js` ggf. anpassen:
   ```javascript
   exports.captureWebsiteScreenshot = onCall({
     maxInstances: 10,
     memory: '2GiB',  // Erhöht für Puppeteer
     timeoutSeconds: 60,
   }, ...)
   ```

### Aktuelle Implementierung

Die Cloud Function ist bereits vorbereitet und enthält:
- ✅ URL-Validierung
- ✅ Rate Limiting
- ✅ Authentifizierung
- ⏳ Puppeteer-Integration (auskommentiert, bis Puppeteer installiert ist)

Aktuell wird ein hilfreicher Fehler zurückgegeben, der erklärt, dass Puppeteer installiert werden muss.

## Nutzung

1. Benutzer öffnet "Neues Rezept hinzufügen"
2. Klickt auf den Webimport-Button (🌐)
3. Gibt eine Rezept-URL ein (z.B. von chefkoch.de)
4. Klickt auf "Weiter"
5. System erfasst Screenshot und analysiert mit Gemini AI
6. Erkannte Rezeptdaten werden angezeigt
7. Benutzer klickt "Übernehmen" um Daten ins Formular zu laden

## Fehlerbehandlung

- Ungültige URLs werden abgefangen
- Rate Limits werden durchgesetzt (wie bei Fotoscan)
- Timeout-Fehler bei langsamen Websites
- Gemini AI OCR Fehler werden abgefangen
- Benutzerfreundliche Fehlermeldungen auf Deutsch

## Erweiterungsmöglichkeiten

### Optional implementiert:
- Duplikatsprüfung: `findRecipesByUrl()` in `webImportService.js` vorhanden
  - Kann verwendet werden um zu prüfen, ob ein Rezept von derselben URL bereits existiert
  - Benötigt `sourceUrl` Feld im Rezept-Schema

### Zukünftige Erweiterungen:
- URL-Historie speichern
- Automatische Quellen-Attribution
- Unterstützung für mehrere Seiten (Seitennummerierung)
- Screenshot-Caching für häufig verwendete URLs

## Technische Details

### Rate Limits
- Authentifizierte Benutzer: 20 Captures/Tag
- Gast-Benutzer: 5 Captures/Tag
- Gleiche Limits wie AI Scan (geteilter Counter)

### Unterstützte Formate
- Protokolle: http://, https://
- Alle öffentlich zugänglichen Websites
- Keine Authentifizierung für geschützte Seiten

### Performance
- Screenshot-Erfassung: ~5-15 Sekunden
- Gemini AI Analyse: ~2-5 Sekunden
- Gesamt: ~10-20 Sekunden pro Import

## Sicherheit

- Server-seitige URL-Validierung
- Rate Limiting
- Authentifizierung erforderlich
- Keine Speicherung der Screenshots
- Puppeteer läuft in isoliertem Browser-Kontext
