# AI OCR Integration in OcrScanModal

## Überblick

Die `OcrScanModal` Komponente wurde erfolgreich um KI-gestützte OCR-Funktionalität erweitert. Benutzer können nun zwischen zwei OCR-Modi wählen:

1. **Standard-OCR (Tesseract.js)** - Offline-fähig, datenschutzfreundlich
2. **KI-Scan (Google Gemini Vision)** - Strukturierte Erkennung mit AI über Firebase Cloud Functions

## 🔒 Sicherheitsverbesserung: Cloud Functions

**WICHTIG**: Der Gemini API-Key wird jetzt sicher serverseitig in Firebase Cloud Functions gespeichert, nicht mehr im Frontend!

### Vorteile der Cloud Function-Implementierung

✅ **Sicherheit**: API-Key ist nicht im Browser sichtbar  
✅ **Kostenkontrolle**: Rate Limiting verhindert Missbrauch  
✅ **Authentifizierung**: Nur eingeloggte Nutzer können AI OCR nutzen  
✅ **Validierung**: Bildgröße und -typ werden serverseitig geprüft  

### Rate Limits

- **Authentifizierte Nutzer**: 20 Scans pro Tag
- **Gast-Nutzer (Anonymous Auth)**: 5 Scans pro Tag

## Setup und Konfiguration

### 1. Firebase Cloud Functions einrichten

```bash
# API-Key als Secret setzen
firebase functions:secrets:set GEMINI_API_KEY

# Oder über Firebase Console:
# Firebase Console → Functions → Secrets → Add secret
# Name: GEMINI_API_KEY
# Wert: [Dein Gemini API-Key]
```

### 2. Cloud Functions deployen

```bash
# Alle Functions deployen
firebase deploy --only functions

# Oder nur die scanRecipeWithAI Function
firebase deploy --only functions:scanRecipeWithAI
```

### 3. Gemini API-Key erhalten

1. Gehe zu [Google AI Studio](https://aistudio.google.com/)
2. Erstelle einen API-Key
3. Setze den Key als Firebase Secret (siehe Schritt 1)

### 4. Firestore-Regeln aktualisieren (falls nötig)

Die Cloud Function benötigt Schreibzugriff auf die `aiScanLimits` Collection für Rate Limiting:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Andere Regeln...
    
    match /aiScanLimits/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Neue Features

### 1. OCR-Modus-Auswahl

Im Upload-Schritt können Benutzer zwischen zwei Modi wählen:

- **📝 Standard-OCR**: Verwendet Tesseract.js für einfache Texterkennung
- **🤖 KI-Scan (Gemini)**: Nutzt Google Gemini Vision API für strukturierte Rezepterkennung

Der KI-Scan Button ist:
- **Aktiviert**: Wenn ein Gemini API-Key konfiguriert ist
- **Deaktiviert**: Wenn kein API-Key vorhanden ist, mit Hinweistext

### 2. AI-Ergebnis-Vorschau

Nach einem erfolgreichen KI-Scan wird eine strukturierte Vorschau angezeigt:

- **Titel**: Groß und prominent
- **Metadaten als Badges**:
  - 👥 Portionen
  - ⏱️ Zubereitungszeit/Kochzeit
  - 📊 Schwierigkeitsgrad (1-5)
  - 🌍 Kulinarische Herkunft
  - 📂 Kategorie

- **Zutaten**: Als Aufzählungsliste
- **Zubereitungsschritte**: Als nummerierte Liste
- **Tags**: Visualisiert als farbige Badges (vegetarisch, vegan, etc.)

### 3. Flexible Bearbeitungsmöglichkeiten

Benutzer können:
1. **Direkt übernehmen**: Das strukturierte Ergebnis direkt importieren
2. **Als Text bearbeiten**: Das Ergebnis in Text-Format konvertieren und manuell anpassen

### 4. Intelligente Fehlerbehandlung

- API-Fehler werden benutzerfreundlich angezeigt
- Bei Fehlern kann der Benutzer zum Standard-OCR wechseln
- Klare Hinweise bei fehlender API-Konfiguration

## Technische Details

### State Management

Neue State-Variablen:
- `ocrMode`: `'standard'` (default) oder `'ai'`
- `aiResult`: Strukturiertes Ergebnis von Gemini API

### Flow-Änderungen

#### Standard-OCR Flow (unverändert):
1. Upload/Kamera → Scan → Edit → Import

#### KI-OCR Flow (neu):
1. Upload/Kamera → Scan (KI-Modus wählen) → **AI-Result** → Import
   - Optional: AI-Result → Edit (als Text) → Import

### API Integration

Die Integration nutzt die bestehende `aiOcrService.js`:

```javascript
import { recognizeRecipeWithAI, isAiOcrAvailable } from '../utils/aiOcrService';

// Prüfen ob AI verfügbar
const isAvailable = isAiOcrAvailable('gemini');

// AI OCR durchführen
const result = await recognizeRecipeWithAI(imageBase64, {
  language: 'de',
  provider: 'gemini',
  onProgress: (progress) => setScanProgress(progress)
});
```

### Datenstruktur

Das AI-Ergebnis hat folgende Struktur:

```javascript
{
  title: string,
  servings: number,
  prepTime: string,
  cookTime: string,
  difficulty: number (1-5),
  cuisine: string,
  category: string,
  tags: string[],
  ingredients: string[],
  steps: string[],
  notes: string
}
```

Dies wird beim Import in das Recipe-Format konvertiert:

```javascript
{
  title: aiResult.title,
  ingredients: aiResult.ingredients,
  steps: aiResult.steps,
  portionen: aiResult.servings,
  kochdauer: parseInt(aiResult.prepTime) || parseInt(aiResult.cookTime),
  kulinarik: [aiResult.cuisine],
  schwierigkeit: aiResult.difficulty,
  speisekategorie: aiResult.category
}
```

## Styling

### Neue CSS-Klassen

- `.ocr-mode-selector` - Container für Modus-Auswahl
- `.ocr-mode-tab` - Tab-Buttons (Standard/AI)
- `.ocr-mode-tab.active` - Aktiver Tab
- `.ocr-mode-tab.disabled` - Deaktivierter Tab
- `.ai-hint` - Hinweistexte
- `.ai-result-section` - Container für AI-Ergebnis
- `.ai-result-title` - Rezepttitel
- `.ai-result-meta` - Metadaten-Container
- `.ai-meta-badge` - Einzelne Metadaten-Badge
- `.ai-result-ingredients` - Zutatenliste
- `.ai-result-steps` - Zubereitungsschritte
- `.ai-result-tags` - Tag-Container
- `.ai-tag` - Einzelner Tag
- `.edit-text-button` - "Als Text bearbeiten" Button

Alle Styles sind konsistent mit den bestehenden Styles und vollständig responsive.

## Tests

### Neue Tests (6 zusätzliche Tests)

1. **AI OCR Modus-Selektor anzeigen**: Prüft ob beide Tabs angezeigt werden
2. **Hinweis bei fehlender API**: Zeigt Hinweis wenn kein API-Key vorhanden
3. **AI OCR Verarbeitung**: Testet kompletten AI-Scan-Flow
4. **Direkter Import**: Prüft Import der strukturierten Daten
5. **Text-Konvertierung**: Testet "Als Text bearbeiten" Funktion
6. **Fehlerbehandlung**: Prüft graceful Error Handling

**Test-Ergebnisse**: Alle 25 Tests bestehen ✅

## Migration & Entwicklung

### Lokale Entwicklung mit Emulator

Für lokale Tests mit Firebase Functions Emulator:

```bash
# Functions Emulator starten
cd functions
npm install
firebase emulators:start --only functions

# In einem anderen Terminal die App starten
npm start
```

Der Emulator läuft standardmäßig auf `http://localhost:5001`. Die Frontend-App wird automatisch die lokalen Functions verwenden.

### Kosten & Limits

- **Firebase Cloud Functions**: Großzügiger Free Tier (2M Invocations/Monat)
- **Gemini API**: Großzügiges kostenloses Kontingent ([Google AI Pricing](https://ai.google.dev/pricing))
- **Rate Limiting**: Schutz vor übermäßiger Nutzung (20/Tag für User, 5/Tag für Gäste)
- **Privacy**: Bilder werden sicher über Firebase an Google gesendet
- **Geschwindigkeit**: 2-5 Sekunden pro Bild

**Hinweis**: API-Limits können sich ändern. Bitte prüfen Sie die aktuelle Dokumentation.

## Fehlerbehandlung

Die Cloud Function gibt strukturierte Fehler zurück:

- `unauthenticated`: Benutzer muss eingeloggt sein
- `resource-exhausted`: Rate Limit überschritten
- `invalid-argument`: Ungültige Bilddaten (zu groß, falscher Typ)
- `failed-precondition`: API-Key nicht konfiguriert
- `internal`: Gemini API-Fehler

## Backward Compatibility

- ✅ Alle bestehenden Tests bestehen weiterhin (23/23)
- ✅ Standard-OCR funktioniert unverändert
- ✅ Keine Breaking Changes in der UI
- ✅ KI-Feature ist immer verfügbar (wenn Cloud Function deployed ist)
- ✅ Alte REACT_APP_GEMINI_API_KEY wird ignoriert (deprecated)

## Nächste Schritte

Mögliche Erweiterungen:
- [ ] Support für OpenAI Vision API (Vorbereitung bereits in `aiOcrService.js`)
- [ ] Batch-Processing mehrerer Rezepte
- [ ] Verbesserung der AI-Prompts für bessere Erkennung
- [ ] Admin-Dashboard für Rate Limit Monitoring
- [ ] Lokale KI-Modelle für Offline-Nutzung
