# AI OCR Integration in OcrScanModal

## Überblick

Die `OcrScanModal` Komponente wurde erfolgreich um KI-gestützte OCR-Funktionalität erweitert. Benutzer können nun zwischen zwei OCR-Modi wählen:

1. **Standard-OCR (Tesseract.js)** - Offline-fähig, datenschutzfreundlich
2. **KI-Scan (Google Gemini Vision)** - Strukturierte Erkennung mit AI

## Neue Features

### 1. OCR-Modus-Auswahl

Im Crop-Schritt können Benutzer zwischen zwei Modi wählen:

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
1. Upload/Kamera → Crop → Scan → Edit → Import

#### KI-OCR Flow (neu):
1. Upload/Kamera → Crop (KI-Modus wählen) → Scan → **AI-Result** → Import
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

## Konfiguration

### Gemini API-Key einrichten

1. API-Key erhalten von: https://aistudio.google.com/
2. In `.env.local` hinzufügen:
   ```
   REACT_APP_GEMINI_API_KEY=your-api-key-here
   ```
3. App neu starten

### Kosten & Limits

- **Free Tier**: Gemini API bietet ein großzügiges kostenloses Kontingent (Stand: 2024, Details siehe [Google AI Pricing](https://ai.google.dev/pricing))
- **Privacy**: Bilder werden zur Verarbeitung an Google Server gesendet
- **Geschwindigkeit**: 2-5 Sekunden pro Bild

**Hinweis**: API-Limits können sich ändern. Bitte prüfen Sie die aktuelle Dokumentation von Google.

## Backward Compatibility

- ✅ Alle bestehenden Tests bestehen weiterhin
- ✅ Standard-OCR funktioniert unverändert
- ✅ Keine Breaking Changes
- ✅ KI-Feature ist opt-in (nur aktiv mit API-Key)

## Nächste Schritte

Mögliche Erweiterungen:
- [ ] Support für OpenAI Vision API (Vorbereitung bereits in `aiOcrService.js`)
- [ ] Batch-Processing mehrerer Rezepte
- [ ] Verbesserung der AI-Prompts für bessere Erkennung
- [ ] Lokale KI-Modelle für Offline-Nutzung
