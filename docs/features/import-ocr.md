# Import und OCR

## AI OCR Integration Guide

_Quelle: `AI_OCR_INTEGRATION.md` (zusammengeführt)._

### 🔒 Wichtig: Cloud Functions Setup erforderlich!

**Die AI OCR Funktionalität läuft jetzt sicher über Firebase Cloud Functions!**

Dieser Leitfaden zeigt, wie die sichere AI-Enhanced OCR mit Firebase Cloud Functions in die RecipeBook-Anwendung integriert wird.

### Warum Cloud Functions?

✅ **Sicherheit**: API-Keys bleiben serverseitig  
✅ **Kostenkontrolle**: Rate Limiting verhindert Missbrauch  
✅ **Authentifizierung**: Nur berechtigte Nutzer  
✅ **Validierung**: Serverseitige Prüfung der Eingaben  

### Voraussetzungen

1. **Firebase Projekt** mit Cloud Functions aktiviert
2. **Google Gemini API Key**
   - Kostenlos unter https://aistudio.google.com/ erstellen
   - Großzügiges kostenloses Tier: ~10.000+ Anfragen/Monat
   - Keine Kreditkarte erforderlich
3. **Firebase CLI** installiert
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

### Setup (Schnellstart)

#### 1. Firebase Cloud Functions deployen

```bash
## Im Projektverzeichnis
cd functions
npm install

## Gemini API-Key als Secret setzen
firebase functions:secrets:set GEMINI_API_KEY
## Gib deinen Gemini API-Key ein wenn gefragt

## Functions deployen
firebase deploy --only functions
```

#### 2. Firestore Security Rules aktualisieren

Füge die Regel für Rate Limiting hinzu:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Bestehende Regeln...
    
    // Rate Limiting für AI Scans
    match /aiScanLimits/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Deploy die Rules:
```bash
firebase deploy --only firestore:rules
```

#### 3. App starten

```bash
npm start
```

Die App verbindet sich automatisch mit den deployed Cloud Functions!

### Lokale Entwicklung

Für lokale Tests ohne Deployment:

```bash
## Terminal 1: Functions Emulator
cd functions
firebase emulators:start --only functions

## Terminal 2: React App
npm start
```

Die App erkennt automatisch den lokalen Emulator.

### Übersicht

```javascript
import { 
  recognizeRecipeWithAI,
  isAiOcrAvailable,
  getAiOcrProviders 
} from './utils/aiOcrService';
```

### Verwendung

#### Einfachstes Beispiel

```javascript
import { recognizeRecipeWithAI } from './utils/aiOcrService';

async function scanRecipeWithAI(imageBase64) {
  try {
    const result = await recognizeRecipeWithAI(imageBase64, {
      language: 'de', // oder 'en'
      provider: 'gemini' // optional, Standard ist 'gemini'
    });
    
    console.log('Erkanntes Rezept:', result);
    console.log('Titel:', result.title);
    console.log('Portionen:', result.servings);
    console.log('Zutaten:', result.ingredients);
    console.log('Schritte:', result.steps);
    console.log('Kulinarik:', result.cuisine);
    console.log('Kategorie:', result.category);
    
    return result;
  } catch (error) {
    console.error('AI OCR Fehler:', error.message);
    // Fallback auf Standard-OCR
    return await standardOcrFallback(imageBase64);
  }
}
```

#### Mit Progress-Callback

```javascript
async function scanRecipeWithProgress(imageBase64) {
  const result = await recognizeRecipeWithAI(imageBase64, {
    language: 'de',
    onProgress: (progress) => {
      console.log(`Fortschritt: ${progress}%`);
      // Update UI mit Fortschritt
      setProgressBar(progress);
    }
  });
  
  return result;
}
```

#### Provider-Verfügbarkeit prüfen

```javascript
import { isAiOcrAvailable, getAiOcrProviders } from './utils/aiOcrService';

function checkAiOcrSetup() {
  if (isAiOcrAvailable('gemini')) {
    console.log('✅ Gemini AI OCR ist verfügbar');
  } else if (isAiOcrAvailable('openai')) {
    console.log('✅ OpenAI OCR ist verfügbar');
  } else {
    console.log('⚠️ Kein AI OCR konfiguriert - verwende Standard-OCR');
  }
  
  // Detaillierte Provider-Informationen
  const providers = getAiOcrProviders();
  console.log('Verfügbare Provider:', providers);
}
```

### Integration in OcrScanModal

#### Schritt 1: State erweitern

```javascript
// In OcrScanModal.js
import { useState } from 'react';
import { recognizeRecipeWithAI, isAiOcrAvailable } from '../utils/aiOcrService';

function OcrScanModal() {
  const [useAiOcr, setUseAiOcr] = useState(false);
  const [aiOcrAvailable, setAiOcrAvailable] = useState(isAiOcrAvailable());
  // ... existing state
}
```

#### Schritt 2: UI Toggle hinzufügen

```javascript
// In der Render-Methode, vor dem Scan-Button
{aiOcrAvailable && (
  <div className="ocr-mode-toggle">
    <label>
      <input
        type="checkbox"
        checked={useAiOcr}
        onChange={(e) => setUseAiOcr(e.target.checked)}
      />
      AI-Enhanced OCR verwenden (bessere Erkennung)
    </label>
    <div className="ocr-mode-info">
      {useAiOcr && (
        <small>
          ℹ️ Bild wird an Google Server gesendet für strukturierte Extraktion.
          <a href="#datenschutz">Mehr Infos</a>
        </small>
      )}
    </div>
  </div>
)}
```

#### Schritt 3: OCR-Funktion anpassen

```javascript
async function handleOcrScan() {
  setIsProcessing(true);
  setProgress(0);
  
  try {
    let result;
    
    if (useAiOcr && aiOcrAvailable) {
      // AI OCR verwenden
      result = await recognizeRecipeWithAI(imageBase64, {
        language: selectedLanguage === 'deu' ? 'de' : 'en',
        onProgress: (p) => setProgress(p)
      });
      
      // Strukturierte Daten direkt verwenden
      setRecipeData({
        title: result.title,
        servings: result.servings,
        prepTime: result.prepTime,
        difficulty: result.difficulty,
        cuisine: result.cuisine,
        category: result.category,
        ingredients: result.ingredients,
        steps: result.steps,
        notes: result.notes
      });
      
    } else {
      // Standard Tesseract OCR
      const ocrResult = await recognizeTextAuto(imageBase64, (p) => setProgress(p));
      
      // Text parsen
      const parsed = parseOcrText(ocrResult.text, selectedLanguage === 'deu' ? 'de' : 'en');
      setRecipeData(parsed);
    }
    
    setIsProcessing(false);
    
  } catch (error) {
    console.error('OCR Fehler:', error);
    setError(error.message);
    setIsProcessing(false);
  }
}
```

#### Schritt 4: CSS Styling

```css
/* In OcrScanModal.css */
.ocr-mode-toggle {
  margin: 1rem 0;
  padding: 1rem;
  background-color: #f5f5f5;
  border-radius: 8px;
}

.ocr-mode-toggle label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-weight: 500;
}

.ocr-mode-toggle input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.ocr-mode-info {
  margin-top: 0.5rem;
  padding-left: 28px;
}

.ocr-mode-info small {
  color: #666;
  font-size: 0.85rem;
  line-height: 1.4;
}

.ocr-mode-info a {
  color: #007bff;
  text-decoration: none;
  margin-left: 0.25rem;
}

.ocr-mode-info a:hover {
  text-decoration: underline;
}
```

### Erweiterte Integration: Vergleichsmodus

Zeige beide Ergebnisse nebeneinander:

```javascript
import { compareOcrMethods } from '../utils/aiOcrService';

async function handleCompareOcr() {
  setIsComparing(true);
  
  try {
    const comparison = await compareOcrMethods(imageBase64, 'de');
    
    console.log('Tesseract:', comparison.tesseract);
    console.log('AI OCR:', comparison.ai);
    
    // Zeige beide Ergebnisse in der UI
    setComparisonResults(comparison);
    
  } catch (error) {
    console.error('Vergleich fehlgeschlagen:', error);
  } finally {
    setIsComparing(false);
  }
}
```

### Fehlerbehandlung

```javascript
async function robustOcrScan(imageBase64) {
  try {
    // Versuche AI OCR
    if (isAiOcrAvailable()) {
      return await recognizeRecipeWithAI(imageBase64, { language: 'de' });
    }
  } catch (error) {
    console.warn('AI OCR fehlgeschlagen, verwende Fallback:', error.message);
    
    // Spezielle Fehlerbehandlung
    if (error.message.includes('quota')) {
      // API-Limit erreicht
      showNotification('AI OCR Limit erreicht. Verwende Standard-OCR.');
    } else if (error.message.includes('API key')) {
      // API Key ungültig
      showNotification('AI OCR nicht konfiguriert. Verwende Standard-OCR.');
    }
  }
  
  // Fallback auf Standard-OCR
  const ocrResult = await recognizeTextAuto(imageBase64);
  const parsed = parseOcrText(ocrResult.text, 'de');
  return {
    ...parsed,
    provider: 'tesseract',
    confidence: ocrResult.confidence
  };
}
```

### Kosten-Management

#### Nutzung überwachen

```javascript
// Beispiel: Lokale Zählung der API-Aufrufe
let monthlyApiCalls = parseInt(localStorage.getItem('ai_ocr_calls') || '0');

async function trackAiOcrUsage(imageBase64, options) {
  if (monthlyApiCalls >= 10000) {
    throw new Error('Monatliches Limit erreicht. Bitte warten Sie bis nächsten Monat.');
  }
  
  const result = await recognizeRecipeWithAI(imageBase64, options);
  
  monthlyApiCalls++;
  localStorage.setItem('ai_ocr_calls', monthlyApiCalls.toString());
  localStorage.setItem('ai_ocr_last_call', new Date().toISOString());
  
  return result;
}

// Monatlicher Reset (in App.js oder ähnlich)
function resetMonthlyCounters() {
  const lastReset = localStorage.getItem('ai_ocr_last_reset');
  const now = new Date();
  const lastResetDate = lastReset ? new Date(lastReset) : new Date(0);
  
  if (now.getMonth() !== lastResetDate.getMonth()) {
    localStorage.setItem('ai_ocr_calls', '0');
    localStorage.setItem('ai_ocr_last_reset', now.toISOString());
  }
}
```

#### Nutzer-Feedback

```javascript
function showOcrModeSelector() {
  return (
    <div className="ocr-mode-selector">
      <h3>OCR-Modus wählen</h3>
      
      <button onClick={() => selectMode('standard')}>
        <h4>📄 Standard OCR</h4>
        <p>✅ Kostenlos & Unbegrenzt</p>
        <p>✅ Offline verfügbar</p>
        <p>✅ Datenschutz-freundlich</p>
        <p>⚠️ Geringere Genauigkeit</p>
      </button>
      
      <button onClick={() => selectMode('ai')}>
        <h4>🤖 AI OCR</h4>
        <p>✅ Höchste Genauigkeit</p>
        <p>✅ Strukturierte Daten</p>
        <p>✅ Erkennt Kulinarik & Kategorie</p>
        <p>⚠️ Benötigt Internet</p>
        <p>⚠️ Daten an Google gesendet</p>
      </button>
    </div>
  );
}
```

### Best Practices

1. **Fallback immer implementieren**: AI OCR kann fehlschlagen
2. **Nutzer informieren**: Transparenz über Datenübertragung
3. **Progress-Feedback**: UI bleibt responsiv
4. **Fehler sinnvoll behandeln**: Hilfreiche Fehlermeldungen
5. **Kosten im Blick**: Monitoring bei hoher Nutzung
6. **Testing**: Verschiedene Rezeptformate testen

### Troubleshooting

#### Problem: "API key not configured"
**Lösung:** Stelle sicher, dass der Gemini API-Key als Firebase Functions Secret konfiguriert ist:

```bash
firebase functions:secrets:set GEMINI_API_KEY
firebase deploy --only functions
```

#### Problem: "Quota exceeded"
**Lösung:** Warte bis zum nächsten Monat oder upgrade deinen Plan.

#### Problem: "Failed to parse recipe data"
**Lösung:** Das Bild enthält wahrscheinlich kein gültiges Rezept oder ist schwer lesbar.

#### Problem: CORS-Fehler
**Lösung:** Gemini API sollte keine CORS-Probleme verursachen. Prüfe deine Netzwerk-Konfiguration.

### Nächste Schritte

1. ✅ Setup: API Key konfigurieren
2. ✅ Testing: Mit Beispiel-Rezepten testen
3. ✅ Integration: In OcrScanModal einbauen
4. ✅ UI/UX: Toggle und Feedback implementieren
5. ✅ Dokumentation: Nutzer informieren
6. ✅ Monitoring: Nutzung überwachen

### Support & Weitere Informationen

- [Gemini API Dokumentation](https://ai.google.dev/gemini-api/docs)
- [AI OCR Analyse-Dokument](./AI_OCR_PLATTFORMEN_ANALYSE.md)
- [RecipeBook OCR Service](./OCR_SERVICE.md)

---

**Hinweis:** Diese Integration ist optional und erweitert die bestehende Tesseract.js-Lösung. Die Standard-OCR bleibt voll funktionsfähig.

## AI OCR Integration in OcrScanModal

_Quelle: `AI_OCR_USAGE.md` (zusammengeführt)._

### Überblick

Die `OcrScanModal` Komponente wurde erfolgreich um KI-gestützte OCR-Funktionalität erweitert. Benutzer können nun zwischen zwei OCR-Modi wählen:

1. **Standard-OCR (Tesseract.js)** - Offline-fähig, datenschutzfreundlich
2. **KI-Scan (Google Gemini Vision)** - Strukturierte Erkennung mit AI über Firebase Cloud Functions

### 🔒 Sicherheitsverbesserung: Cloud Functions

**WICHTIG**: Der Gemini API-Key wird jetzt sicher serverseitig in Firebase Cloud Functions gespeichert, nicht mehr im Frontend!

#### Vorteile der Cloud Function-Implementierung

✅ **Sicherheit**: API-Key ist nicht im Browser sichtbar  
✅ **Kostenkontrolle**: Rate Limiting verhindert Missbrauch  
✅ **Authentifizierung**: Nur eingeloggte Nutzer können AI OCR nutzen  
✅ **Validierung**: Bildgröße und -typ werden serverseitig geprüft  

#### Rate Limits

- **Authentifizierte Nutzer**: 20 Scans pro Tag
- **Gast-Nutzer (Anonymous Auth)**: 5 Scans pro Tag

### Setup und Konfiguration

#### 1. Firebase Cloud Functions einrichten

```bash
## API-Key als Secret setzen
firebase functions:secrets:set GEMINI_API_KEY

## Oder über Firebase Console:
## Firebase Console → Functions → Secrets → Add secret
## Name: GEMINI_API_KEY
## Wert: [Dein Gemini API-Key]
```

#### 2. Cloud Functions deployen

```bash
## Alle Functions deployen
firebase deploy --only functions

## Oder nur die scanRecipeWithAI Function
firebase deploy --only functions:scanRecipeWithAI
```

#### 3. Gemini API-Key erhalten

1. Gehe zu [Google AI Studio](https://aistudio.google.com/)
2. Erstelle einen API-Key
3. Setze den Key als Firebase Secret (siehe Schritt 1)

#### 4. Firestore-Regeln aktualisieren (falls nötig)

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

### Neue Features

#### 1. OCR-Modus-Auswahl

Im Upload-Schritt können Benutzer zwischen zwei Modi wählen:

- **📝 Standard-OCR**: Verwendet Tesseract.js für einfache Texterkennung
- **🤖 KI-Scan (Gemini)**: Nutzt Google Gemini Vision API für strukturierte Rezepterkennung

Der KI-Scan Button ist:
- **Aktiviert**: Wenn ein Gemini API-Key konfiguriert ist
- **Deaktiviert**: Wenn kein API-Key vorhanden ist, mit Hinweistext

#### 2. AI-Ergebnis-Vorschau

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

#### 3. Flexible Bearbeitungsmöglichkeiten

Benutzer können:
1. **Direkt übernehmen**: Das strukturierte Ergebnis direkt importieren
2. **Als Text bearbeiten**: Das Ergebnis in Text-Format konvertieren und manuell anpassen

#### 4. Intelligente Fehlerbehandlung

- API-Fehler werden benutzerfreundlich angezeigt
- Bei Fehlern kann der Benutzer zum Standard-OCR wechseln
- Klare Hinweise bei fehlender API-Konfiguration

### Technische Details

#### State Management

Neue State-Variablen:
- `ocrMode`: `'standard'` (default) oder `'ai'`
- `aiResult`: Strukturiertes Ergebnis von Gemini API

#### Flow-Änderungen

##### Standard-OCR Flow (unverändert):
1. Upload/Kamera → Scan → Edit → Import

##### KI-OCR Flow (neu):
1. Upload/Kamera → Scan (KI-Modus wählen) → **AI-Result** → Import
   - Optional: AI-Result → Edit (als Text) → Import

#### API Integration

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

#### Datenstruktur

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

### Styling

#### Neue CSS-Klassen

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

### Tests

#### Neue Tests (6 zusätzliche Tests)

1. **AI OCR Modus-Selektor anzeigen**: Prüft ob beide Tabs angezeigt werden
2. **Hinweis bei fehlender API**: Zeigt Hinweis wenn kein API-Key vorhanden
3. **AI OCR Verarbeitung**: Testet kompletten AI-Scan-Flow
4. **Direkter Import**: Prüft Import der strukturierten Daten
5. **Text-Konvertierung**: Testet "Als Text bearbeiten" Funktion
6. **Fehlerbehandlung**: Prüft graceful Error Handling

**Test-Ergebnisse**: Alle 25 Tests bestehen ✅

### Migration & Entwicklung

#### Lokale Entwicklung mit Emulator

Für lokale Tests mit Firebase Functions Emulator:

```bash
## Functions Emulator starten
cd functions
npm install
firebase emulators:start --only functions

## In einem anderen Terminal die App starten
npm start
```

Der Emulator läuft standardmäßig auf `http://localhost:5001`. Die Frontend-App wird automatisch die lokalen Functions verwenden.

#### Kosten & Limits

- **Firebase Cloud Functions**: Großzügiger Free Tier (2M Invocations/Monat)
- **Gemini API**: Großzügiges kostenloses Kontingent ([Google AI Pricing](https://ai.google.dev/pricing))
- **Rate Limiting**: Schutz vor übermäßiger Nutzung (20/Tag für User, 5/Tag für Gäste)
- **Privacy**: Bilder werden sicher über Firebase an Google gesendet
- **Geschwindigkeit**: 2-5 Sekunden pro Bild

**Hinweis**: API-Limits können sich ändern. Bitte prüfen Sie die aktuelle Dokumentation.

### Fehlerbehandlung

Die Cloud Function gibt strukturierte Fehler zurück:

- `unauthenticated`: Benutzer muss eingeloggt sein
- `resource-exhausted`: Rate Limit überschritten
- `invalid-argument`: Ungültige Bilddaten (zu groß, falscher Typ)
- `failed-precondition`: API-Key nicht konfiguriert
- `internal`: Gemini API-Fehler

### Backward Compatibility

- ✅ Alle bestehenden Tests bestehen weiterhin (23/23)
- ✅ Standard-OCR funktioniert unverändert
- ✅ Keine Breaking Changes in der UI
- ✅ KI-Feature ist immer verfügbar (wenn Cloud Function deployed ist)
- ✅ Alte REACT_APP_GEMINI_API_KEY wird ignoriert (deprecated)

### Nächste Schritte

Mögliche Erweiterungen:
- [ ] Support für OpenAI Vision API (Vorbereitung bereits in `aiOcrService.js`)
- [ ] Batch-Processing mehrerer Rezepte
- [ ] Verbesserung der AI-Prompts für bessere Erkennung
- [ ] Admin-Dashboard für Rate Limit Monitoring
- [ ] Lokale KI-Modelle für Offline-Nutzung

## CSV Import Feature

_Quelle: `CSV_IMPORT_GUIDE.md` (zusammengeführt)._

### Overview

The CSV import feature allows users to import multiple recipes at once from a CSV file. This is useful for bulk importing recipes from spreadsheets or other sources.

### How to Use

1. Navigate to "Neues Rezept" (New Recipe) form
2. Click the "Import" button
3. In the import dialog, click on "📄 CSV-Datei hochladen (Bulk-Import)"
4. Select your CSV file
5. Review the preview showing how many recipes were found
6. Click "Importieren" to complete the import
7. All recipes will be imported and marked as draft

### CSV Format

#### Required Columns

- **Name**: Recipe title (required)
- **Zutat1** to **Zutat31**: Ingredients (at least one required)
- **Zubereitungsschritt1** to **Zubereitungsschritt27**: Preparation steps (at least one required)

#### Optional Columns

- **Erstellt am**: Creation date (format: YYYY-MM-DD)
- **Erstellt von**: Author name
- **Kulinarik**: Cuisine types (comma-separated, e.g., "Italienisch,Klassisch")
- **Speisenkategorie**: Meal categories (comma-separated, e.g., "Hauptgericht,Vegetarisch")
- **Portionen**: Portion size with unit (e.g., "4 Portionen", "6 Personen")
- **Zubereitung**: Cooking time in minutes
- **Schwierigkeit**: Difficulty level (1-5 stars)

#### Special Formatting

##### Headers for Ingredients and Steps

Items starting with `###` are treated as section headers:

```csv
Zutat1,Zutat2,Zutat3
###Teig,500g Mehl,200ml Wasser
```

This creates:
- A heading "Teig"
- Regular ingredients "500g Mehl" and "200ml Wasser"

Same applies to preparation steps.

### Example CSV

**Comma-delimited example:**

```csv
Name,Erstellt am,Erstellt von,Kulinarik,Speisenkategorie,Portionen,Zubereitung,Schwierigkeit,Zutat1,Zutat2,Zutat3,Zubereitungsschritt1,Zubereitungsschritt2
Spaghetti Carbonara,2024-01-15,Max Mustermann,"Italienisch,Klassisch",Hauptgericht,4 Portionen,30,3,400g Spaghetti,200g Speck,4 Eier,Nudeln kochen,Sauce zubereiten
Pizza Margherita,2024-01-16,Anna Müller,Italienisch,"Hauptgericht,Vegetarisch",2 Portionen,25,2,###Teig,300g Mehl,Hefe,Teig zubereiten,Backen
```

**Semicolon-delimited example:**

```csv
Name;Erstellt am;Erstellt von;Kulinarik;Speisenkategorie;Portionen;Zubereitung;Schwierigkeit;Zutat1;Zutat2;Zutat3;Zubereitungsschritt1;Zubereitungsschritt2
Spaghetti Carbonara;2024-01-15;Max Mustermann;Italienisch, Klassisch;Hauptgericht;4 Portionen;30;3;400g Spaghetti;200g Speck;4 Eier;Nudeln kochen;Sauce zubereiten
Pizza Margherita;2024-01-16;Anna Müller;Italienisch;Hauptgericht, Vegetarisch;2 Portionen;25;2;###Teig;300g Mehl;Hefe;Teig zubereiten;Backen
```

**Example with German umlauts:**

```csv
Name;Portionen;Schwierigkeit;Zutat1;Zutat2;Zutat3;Zubereitungsschritt1;Zubereitungsschritt2
Käsespätzle;4;3;500g Mehl;250g Käse;Butter;Teig kneten und Spätzle formen;Mit Käse überbacken
Apfelstrudel;6;4;6 Äpfel;200g Mürbeteig;Zucker;Äpfel schälen und würfeln;Im Ofen backen
Öl-Brot;2;1;300g Mehl;50ml Öl;Salz;Mehl mit Öl verkneten;Backen
```

German special characters (ä, ö, ü, ß, Ä, Ö, Ü) are fully supported and will be correctly imported regardless of the file encoding (UTF-8, Windows-1252, or ISO-8859-1).

### Field Mapping

| CSV Column | Recipe Field | Type | Notes |
|------------|--------------|------|-------|
| Name | title | String | Required |
| Erstellt am | createdAtStr | String | Stored as string for reference |
| Erstellt von | authorName | String | Stored for reference; actual authorId is current user |
| Kulinarik | kulinarik | Array | Split by comma |
| Speisenkategorie | speisekategorie | Array | Split by comma |
| Portionen | portionen, portionUnitId | Number, String | Parsed to extract number and unit |
| Zubereitung | kochdauer | Number | In minutes |
| Schwierigkeit | schwierigkeit | Number | 1-5 range |
| Zutat1-31 | ingredients | Array | Objects with {type, text} |
| Zubereitungsschritt1-27 | steps | Array | Objects with {type, text} |

### Privacy

All recipes imported via CSV are automatically marked as **draft** (`isPrivate: true`). This ensures that bulk imports don't accidentally expose personal recipes.

### Error Handling

- If some recipes in the CSV file fail to import, the import will continue with the valid recipes
- A summary will show how many recipes succeeded and which ones failed
- Failed recipes will display the recipe title and error message
- Common errors:
  - Missing recipe name
  - No ingredients
  - No preparation steps
  - Invalid CSV format

### Technical Details

- **File Format**: CSV (`.csv` extension)
- **Character Encoding**: 
  - Automatic encoding detection for maximum compatibility
  - Supports UTF-8, Windows-1252 (Excel default in German locale), and ISO-8859-1
  - UTF-8 BOM is automatically detected and removed
  - **German umlauts (ä, ö, ü, ß) are fully supported** regardless of file encoding
- **Delimiter Support**: Both comma (`,`) and semicolon (`;`) delimiters are supported with automatic detection
- **Quote Handling**: Supports quoted values for fields containing delimiters
- **Escape Sequences**: Supports `""` for literal quotes within quoted fields
- **Maximum Fields**: 31 ingredients, 27 preparation steps
- **Validation**: Validates file extension and MIME type before processing
- **Step Numbering**: Automatic numbering (e.g., "1. ", "2) ", "3 - ") is automatically stripped from preparation steps during import
- **Category Images**: If category images are configured in settings, they will be automatically applied to recipes based on their meal category

#### Delimiter Detection

The CSV parser automatically detects whether your file uses commas or semicolons as delimiters by analyzing the header row. This means you can use either format:

**Comma-delimited CSV:**
```csv
Name,Portionen,Zutat1,Zubereitungsschritt1
Spaghetti Carbonara,4,400g Spaghetti,Nudeln kochen
```

**Semicolon-delimited CSV:**
```csv
Name;Portionen;Zutat1;Zubereitungsschritt1
Spaghetti Carbonara;4;400g Spaghetti;Nudeln kochen
```

**Note**: When using comma-separated values within fields (e.g., for Kulinarik or Speisenkategorie), commas are always used to separate multiple values, regardless of the main CSV delimiter:

```csv
Name;Kulinarik;Zutat1;Zubereitungsschritt1
Pizza Margherita;"Italienisch, Vegetarisch";300g Mehl;Teig zubereiten
```

### Implementation Files

- **Parser**: `src/utils/csvBulkImport.js`
- **Tests**: `src/utils/csvBulkImport.test.js`
- **UI Component**: `src/components/RecipeImportModal.js`
- **Handler**: `src/App.js` - `handleBulkImportRecipes()`

## Multi-Image Import für Instagram-Rezepte

_Quelle: `MULTI_IMAGE_IMPORT.md` (zusammengeführt)._

### Feature-Beschreibung

Ermöglicht das gleichzeitige Hochladen mehrerer Screenshots von Instagram-Posts, um alle Rezeptinformationen (Bild, Caption, Kommentare) automatisch zu kombinieren.

### Verwendung

#### Schritt 1: Screenshots erstellen
1. **Instagram Post öffnen**
2. **Screenshot 1**: Rezeptbild + Caption
3. **Screenshot 2**: Kommentarbereich scrollen + Screenshot
4. **Screenshot 3** (optional): Weitere Kommentare

#### Schritt 2: In RecipeBook importieren
1. **"+ Rezept hinzufügen"** klicken
2. **"📁 Bild(er) hochladen"** wählen
3. **Alle Screenshots auswählen** (Strg/Cmd + Klick)
4. **Warten** während OCR alle Bilder verarbeitet
5. **Ergebnis prüfen** - alle Infos sind kombiniert!

### Technische Details

#### Duplikat-Erkennung
- Verwendet Levenshtein-Distanz
- Ähnlichkeit > 80% = Duplikat
- Behält die erste Variante

#### Merge-Strategie
- **Titel**: Vom ersten Bild
- **Zutaten**: Alle Bilder kombiniert, Duplikate entfernt
- **Schritte**: Alle Bilder kombiniert, Duplikate entfernt
- **Meta-Daten**: Erstes vollständiges Ergebnis gewinnt

#### Batch-Processing
- Sequentielle Verarbeitung (ein Bild nach dem anderen)
- Fortschrittsanzeige für jedes Bild
- Fehlerbehandlung pro Bild (fehlerhafte werden übersprungen)

### Beispiel-Workflow

```
Instagram Post mit 150 Zeilen Text:
├── Screenshot 1: Titel + erste 50 Zeilen
├── Screenshot 2: Zeilen 51-100 (Kommentare)
└── Screenshot 3: Zeilen 101-150 (mehr Kommentare)

↓ OCR + AI Processing ↓

Vollständiges Rezept:
✓ Titel erkannt
✓ 12 Zutaten (aus allen 3 Bildern)
✓ 8 Schritte (aus allen 3 Bildern)
✓ 0 Duplikate
```

### Tipps

#### Beste Ergebnisse
✅ Screenshots in chronologischer Reihenfolge benennen
✅ Gute Beleuchtung beim Screenshot
✅ Hochformat bevorzugt
✅ Maximal 5 Bilder gleichzeitig

#### Häufige Probleme
❌ Zu viele Bilder (>10) → Langsam
❌ Unscharfe Screenshots → Schlechte OCR-Qualität
❌ Unterschiedliche Sprachen → Inkonsistente Ergebnisse

### Kompatibilität

- ✅ Desktop: Chrome, Firefox, Safari, Edge
- ✅ Mobile: iOS Safari, Chrome Mobile
- ✅ AI OCR (Gemini Vision)
- ✅ Standard OCR (Tesseract)

### Hinweise

#### Wichtig
- **Rate Limits**: AI OCR hat Tageslimits (20/Tag User, 5/Tag Gast)
- **Performance**: Jedes Bild dauert 2-5 Sekunden
- **Duplikate**: Merge ist nicht perfekt, manuelle Prüfung empfohlen

#### Zukünftige Erweiterungen
1. **Smart Ordering**: AI erkennt automatisch richtige Reihenfolge
2. **Audio Support**: Kombination mit Reel-Transkripten
3. **URL Import**: Direkt von Instagram URL alle Quellen laden

## Notion Recipe Import Guide

_Quelle: `NOTION_IMPORT_GUIDE.md` (zusammengeführt)._

This guide explains how to import recipes from Notion into RecipeBook.

### Overview

RecipeBook now supports importing recipes directly from Notion in multiple formats:

- **Notion Markdown Export** (recommended)
- **JSON format**
- **CSV format** (for Notion database exports)

The import feature automatically detects the format and parses the recipe structure.

### Supported Formats

#### 1. Notion Markdown Export (Recommended)

This is the easiest and most reliable method.

##### How to Export from Notion:

1. Open your recipe in Notion
2. Click the "..." menu (top right)
3. Select "Export"
4. Choose "Markdown & CSV"
5. Download the export
6. Open the `.md` file in a text editor
7. Copy the entire content
8. Paste it into the RecipeBook import dialog

##### Example Notion Markdown Structure:

```markdown
## Pizza Bianco al Tartufo

**Portionen:** 4
**Kulinarik:** Italienisch
**Schwierigkeit:** 3
**Kochdauer:** 45 Minuten
**Speisekategorie:** Hauptgericht

### Zutaten

- 500g Pizzateig
- 200g Mozzarella
- 100g Ricotta
- 50g Parmesan
- 2 EL Trüffelöl
- Salz, Pfeffer

### Zubereitung

1. Ofen auf 250°C vorheizen
2. Pizzateig ausrollen
3. Mozzarella, Ricotta und Parmesan verteilen
4. Mit Salz und Pfeffer würzen
5. 10-12 Minuten backen
6. Mit Trüffelöl beträufeln und servieren
```

##### Alternative: Notion Export with Separators

The parser also supports Notion exports that use `---` separators instead of section headers. This format is automatically converted:

```markdown
## Pizza Bianco al Tartufo

Erstellt von: Benjamin Rousselli
Favorit: Benjamin Rousselli
Gang: Hauptspeise

---

- **1 Teil** Pizzateig Napoletana
- **75 g** Mozzarella
- **50 g** Stracciatella di Burrata
- **½ Teelöffel** Trüffelöl
- frischer Trüffel
- Pfeffer

---

1. Arbeite mit den Fingerspitzen von der Mitte nach außen und forme den Teig.
2. Verteile den zerrupften Mozzarella auf der Pizza.
3. Backe die Pizza im gut vorgeheizten Pizzaofen.
4. Hole die Pizza nach ca. 2 Minuten aus dem Ofen und garniere sie.

---
```

**Note:** The parser automatically:
- Removes all `**` bold markers
- Converts the first `---` to `## Zutaten`
- Converts the second `---` to `## Zubereitung`
- Removes the third `---`

#### 2. JSON Format

For programmatic imports or if you prefer structured data.

##### Example JSON Structure:

```json
{
  "title": "Pizza Bianco al Tartufo",
  "portionen": 4,
  "kulinarik": ["Italienisch"],
  "schwierigkeit": 3,
  "kochdauer": 45,
  "speisekategorie": "Hauptgericht",
  "ingredients": [
    "500g Pizzateig",
    "200g Mozzarella",
    "100g Ricotta",
    "50g Parmesan",
    "2 EL Trüffelöl",
    "Salz, Pfeffer"
  ],
  "steps": [
    "Ofen auf 250°C vorheizen",
    "Pizzateig ausrollen",
    "Mozzarella, Ricotta und Parmesan verteilen",
    "Mit Salz und Pfeffer würzen",
    "10-12 Minuten backen",
    "Mit Trüffelöl beträufeln und servieren"
  ]
}
```

#### 3. CSV Format

For Notion database exports.

##### Example CSV:

```csv
Name,Portionen,Kulinarik,Schwierigkeit,Kochdauer,Speisekategorie
Pizza Bianco al Tartufo,4,Italienisch,3,45,Hauptgericht
```

Note: CSV format only supports metadata. You'll need to add ingredients and steps separately.

### Supported Fields

The parser recognizes these field names (in both German and English):

#### Recipe Metadata

| Field | Aliases | Description | Type |
|-------|---------|-------------|------|
| **title** | name, rezept | Recipe name | string |
| **portionen** | servings, portions | Number of servings | number (default: 4) |
| **kulinarik** | cuisine, küche | Cuisine type(s) | string or array |
| **schwierigkeit** | difficulty | Difficulty level | number 1-5 (default: 3) |
| **kochdauer** | cookingTime, zeit, time | Cooking time in minutes | number (default: 30) |
| **speisekategorie** | category, type, kategorie | Meal category | string |
| **image** | foto, photo, bild | Image URL | string |

#### Recipe Content

| Field | Aliases | Description |
|-------|---------|-------------|
| **ingredients** | zutaten, ingredienti | List of ingredients |
| **steps** | schritte, zubereitung, instructions, directions | Preparation steps |

### Structuring Your Notion Recipe

#### Best Practices

1. **Use a clear title** as the first heading (# Title)
2. **Use properties** for metadata (Portionen, Kulinarik, etc.)
3. **Use section headings** for ingredients and steps:
   - `## Zutaten` or `## Ingredients`
   - `## Zubereitung` or `## Instructions`
4. **Use bullet lists** (-) for ingredients
5. **Use numbered lists** (1., 2., 3.) for steps

#### Supported Section Headings

The parser recognizes these section headings (case-insensitive):

**For Ingredients:**
- Zutaten (German)
- Ingredients (English)
- Ingredienti (Italian)
- Ingrédients (French)

**For Steps:**
- Zubereitung (German)
- Anleitung (German)
- Schritte (German)
- Steps (English)
- Instructions (English)
- Directions (English)
- Preparation (English)

### Property Formats

#### Multiple Values (Kulinarik)

You can specify multiple cuisine types:

```markdown
**Kulinarik:** Italienisch, Mediterran
```

Or in JSON:
```json
"kulinarik": ["Italienisch", "Mediterran"]
```

#### Cooking Time

The parser extracts numbers from time fields:

```markdown
**Kochdauer:** 45 Minuten
```

becomes: `kochdauer: 45`

#### Difficulty Levels

Difficulty is clamped to the range 1-5:
- 1 = Very Easy
- 2 = Easy
- 3 = Medium (default)
- 4 = Hard
- 5 = Very Hard

#### Image URLs

You can provide image URLs in various formats:

```markdown
**Bild:** https://example.com/image.jpg
```

Or Markdown image syntax:
```markdown
**Image:** ![Alt text](https://example.com/image.jpg)
```

### Import Process

1. **Navigate** to the recipe form (click "Add Recipe")
2. **Click** the "📥 Importieren" button
3. **Paste** your Notion content (Markdown, JSON, or CSV)
4. **Click** "Importieren"
5. **Review** the imported data in the form
6. **Edit** if needed
7. **Save** the recipe

### Troubleshooting

#### Missing Ingredients or Steps

**Problem:** Recipe imports but ingredients or steps are empty.

**Solution:** 
- Check that you're using recognized section headings (see list above)
- Make sure ingredients are in a bullet list (- or *)
- Make sure steps are in a numbered list (1., 2., 3.) or bullet list

#### Title Not Detected

**Problem:** Recipe title is missing after import.

**Solution:**
- Make sure the first line starts with `# Title`
- Or include `Name: Recipe Title` in your properties

#### Metadata Not Parsed

**Problem:** Portionen, Schwierigkeit, etc. are not imported correctly.

**Solution:**
- Use the format: `**Property:** Value` or `Property: Value`
- Check spelling (use German or English names from the table above)
- For tables, ensure headers match supported field names

#### Format Not Recognized

**Problem:** "Format konnte nicht erkannt werden" error.

**Solution:**
- JSON must start with `{` or `[`
- Markdown must contain `#` headings or `:` properties
- CSV must have comma-separated headers and values

### Advanced: Table Format

Notion database exports can include tables:

```markdown
| Property | Value |
|----------|-------|
| Portionen | 4 |
| Schwierigkeit | 3 |
| Kochdauer | 45 |
```

The parser will extract these properties automatically.

### Example Workflow

#### From Notion to RecipeBook:

1. **In Notion**, create a recipe with this structure:
   ```
   # My Amazing Recipe
   
   Portionen: 4
   Schwierigkeit: 3
   
   ## Zutaten
   - Ingredient 1
   - Ingredient 2
   
   ## Zubereitung
   1. Step 1
   2. Step 2
   ```

2. **Copy** the entire page content (Ctrl+A, Ctrl+C)

3. **In RecipeBook**:
   - Click "Add Recipe"
   - Click "📥 Importieren"
   - Paste the content
   - Click "Importieren"

4. **Done!** The recipe is now imported and ready to save.

### Limitations

- Direct URL import from Notion is not yet supported
- CSV format requires ingredients/steps to be added separately
- Complex Notion features (databases, linked pages) are not fully supported
- Images must be provided as URLs (embedded images need to be uploaded separately)

### Future Enhancements

Planned improvements:
- Direct Notion API integration
- Support for Notion databases with linked recipes
- Automatic image download from Notion
- Bulk import of multiple recipes

### Questions?

If you encounter issues or have suggestions, please open an issue on the GitHub repository.

## OCR Service Documentation

_Quelle: `OCR_SERVICE.md` (zusammengeführt)._

### Overview
Client-side OCR (Optical Character Recognition) service for RecipeBook using Tesseract.js. Supports German and English text recognition with offline PWA capability.

### Features
- ✅ Client-side processing (no server required)
- ✅ Offline support in PWA mode (after initial language data load)
- ✅ German (`deu`) and English (`eng`) language support
- ✅ Progress tracking (0-100%)
- ✅ Image preprocessing (grayscale, contrast enhancement)
- ✅ Automatic language detection

### Installation
Dependencies are already installed:
```bash
npm install tesseract.js
```

### API Reference

#### `initOcrWorker(lang)`
Initialize OCR worker for specified language.

**Parameters:**
- `lang` (string): Language code - `'eng'` for English or `'deu'` for German

**Returns:** `Promise<void>`

**Example:**
```javascript
import { initOcrWorker } from './utils/ocrService';

await initOcrWorker('eng'); // Initialize English
await initOcrWorker('deu'); // Initialize German
```

#### `recognizeText(imageBase64, lang, onProgress)`
Perform OCR on a base64-encoded image.

**Parameters:**
- `imageBase64` (string): Base64 encoded image (data URL)
- `lang` (string): Language code - `'eng'` or `'deu'`
- `onProgress` (function, optional): Callback function that receives progress (0-100)

**Returns:** `Promise<Object>` with:
- `text` (string): Recognized text
- `confidence` (number): Recognition confidence (0-100)
- `words` (array): Individual word details
- `lines` (array): Line details
- `paragraphs` (array): Paragraph details

**Example:**
```javascript
import { recognizeText } from './utils/ocrService';

const result = await recognizeText(
  imageBase64, 
  'eng',
  (progress) => console.log(`Progress: ${progress}%`)
);

console.log('Text:', result.text);
console.log('Confidence:', result.confidence);
```

#### `recognizeTextAuto(imageBase64, onProgress)`
Automatic language detection - tries English first, then German if confidence is low.

**Parameters:**
- `imageBase64` (string): Base64 encoded image
- `onProgress` (function, optional): Progress callback

**Returns:** `Promise<Object>` with all OCR results plus:
- `detectedLanguage` (string): Detected language (`'eng'` or `'deu'`)

**Example:**
```javascript
import { recognizeTextAuto } from './utils/ocrService';

const result = await recognizeTextAuto(imageBase64);
console.log('Detected language:', result.detectedLanguage);
console.log('Text:', result.text);
```

#### `preprocessImage(imageBase64)`
Preprocess image for better OCR accuracy (grayscale + contrast enhancement).

**Parameters:**
- `imageBase64` (string): Original base64 image

**Returns:** `Promise<string>` - Preprocessed base64 image

**Example:**
```javascript
import { preprocessImage } from './utils/ocrService';

const preprocessed = await preprocessImage(originalImage);
```

#### `terminateWorker()`
Clean up and terminate the OCR worker to free resources.

**Returns:** `Promise<void>`

**Example:**
```javascript
import { terminateWorker } from './utils/ocrService';

await terminateWorker();
```

#### `getWorkerStatus()`
Get current worker initialization status.

**Returns:** `Object` with:
- `isInitialized` (boolean): Whether worker is initialized
- `currentLanguage` (string|null): Current language or null

**Example:**
```javascript
import { getWorkerStatus } from './utils/ocrService';

const status = getWorkerStatus();
console.log('Initialized:', status.isInitialized);
console.log('Language:', status.currentLanguage);
```

### Usage Example - React Component

```javascript
import React, { useState } from 'react';
import { recognizeTextAuto, terminateWorker } from '../utils/ocrService';

function OCRDemo() {
  const [text, setText] = useState('');
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    setProgress(0);

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const imageBase64 = e.target.result;

        // Perform OCR with auto language detection
        const result = await recognizeTextAuto(imageBase64, (p) => {
          setProgress(p);
        });

        setText(result.text);
        setLoading(false);

        // Optional: Clean up worker to free memory
        // Note: If performing multiple OCR operations, consider keeping
        // the worker alive and only terminating when component unmounts
        // await terminateWorker();
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('OCR failed:', error);
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>OCR Demo</h2>
      <input 
        type="file" 
        accept="image/*" 
        onChange={handleImageUpload}
        disabled={loading}
      />
      {loading && <div>Progress: {progress}%</div>}
      {text && (
        <div>
          <h3>Recognized Text:</h3>
          <pre>{text}</pre>
        </div>
      )}
    </div>
  );
}

export default OCRDemo;
```

### Integration with Existing Utils

The OCR service integrates with existing image utilities:

```javascript
import { fileToBase64, isValidImageSource } from './imageUtils';
import { recognizeText } from './ocrService';

// Example: OCR from uploaded file
async function performOCR(file) {
  // Convert file to base64 using existing utility
  const imageBase64 = await fileToBase64(file);
  
  // Validate image source
  if (!isValidImageSource(imageBase64)) {
    throw new Error('Invalid image');
  }
  
  // Perform OCR
  const result = await recognizeText(imageBase64, 'eng');
  return result.text;
}
```

### Performance Notes

1. **First Load:** Language data is downloaded on first use (~2-4MB per language)
2. **Offline Mode:** After first load, works completely offline in PWA mode
3. **Processing Time:** Depends on image size and complexity (typically 2-10 seconds)
4. **Image Preprocessing:** Automatically applied to improve accuracy

### Best Practices

1. **Image Quality:** Higher quality images yield better results
2. **Text Size:** Larger text is recognized more accurately
3. **Contrast:** High contrast between text and background improves recognition
4. **Worker Management:** 
   - For single OCR operation: Call `terminateWorker()` after completion
   - For multiple operations: Keep worker alive and terminate only when done with all operations
   - Component unmount: Always terminate worker in cleanup function
5. **Error Handling:** Wrap OCR calls in try-catch blocks
6. **Progress Feedback:** Use progress callbacks for better UX

### Testing

Run OCR service tests:
```bash
npm test -- --testPathPattern=ocrService
```

All 25 tests should pass, covering:
- Worker initialization
- Text recognition
- Image preprocessing
- Language switching
- Error handling

### Troubleshooting

#### Issue: Low recognition accuracy
**Solution:** 
- Ensure good image quality
- Use preprocessing function
- Try different language settings

#### Issue: Slow performance
**Solution:**
- Reduce image size before processing
- Ensure worker is initialized before batch processing

#### Issue: Worker initialization fails
**Solution:**
- Check internet connection (for first load)
- Verify language code is valid (`'eng'` or `'deu'`)
- Check browser console for errors

### Browser Compatibility

Works in all modern browsers that support:
- Web Workers
- Canvas API
- FileReader API
- ES6+ JavaScript

Tested on:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

### Future Enhancements

Potential improvements:
- [ ] Additional language support (French, Spanish, etc.)
- [ ] Batch processing multiple images
- [ ] Custom preprocessing options
- [ ] OCR result caching
- [x] Text extraction optimization for recipe formats (see `ocrParser.js`)

### Recipe Parser Integration

The OCR service integrates with the recipe parser to convert recognized text into structured recipe data:

```javascript
import { recognizeText } from './utils/ocrService';
import { parseOcrText } from './utils/ocrParser';
import { parseRecipeData } from './utils/recipeImport';

async function extractRecipeFromImage(imageBase64, language = 'eng') {
  // Step 1: Perform OCR to extract text
  const ocrResult = await recognizeText(imageBase64, language);
  
  // Step 2: Parse OCR text into structured recipe data
  const lang = language === 'deu' ? 'de' : 'en';
  const recipeData = parseOcrText(ocrResult.text, lang);
  
  // Step 3: Validate and normalize recipe data
  const validatedRecipe = parseRecipeData(recipeData);
  
  return {
    recipe: validatedRecipe,
    confidence: ocrResult.confidence,
    rawText: ocrResult.text
  };
}

// Usage example:
const result = await extractRecipeFromImage(imageBase64, 'deu');
console.log('Recipe:', result.recipe);
console.log('Title:', result.recipe.title);
console.log('Ingredients:', result.recipe.ingredients);
console.log('Steps:', result.recipe.steps);
```

For more details on the recipe parser, see the `ocrParser.js` documentation.

### OCR Parser - Text Recognition Improvements

#### Smart Bullet Point Handling

The OCR parser now intelligently filters out standalone bullet points that don't contain text. This prevents false step/ingredient entries from OCR artifacts.

**Example:**
```
Input OCR text:
-
200g Mehl
•
2 Eier
*

Output:
ingredients: ["200g Mehl", "2 Eier"]
```

#### Intelligent Step Merging

Recipe preparation steps are now merged intelligently based on:
1. **Numbering** (1., 2., 3., etc.) - Always starts a new step
2. **Sentence Endings** (. ! ?) - Starts a new step for non-numbered lines
3. **Line Continuation** - Lines without sentence endings are merged with the current step

This reduces false step subdivisions caused by line breaks in OCR text.

**Example 1: Numbered Steps with Multiple Lines**
```
Input OCR text:
1. Den Backofen auf 180°C
Ober-/Unterhitze vorheizen.
Ein Backblech mit
Backpapier auslegen.
2. In einer Schüssel Mehl
und Zucker vermischen

Output:
steps: [
  "Den Backofen auf 180°C Ober-/Unterhitze vorheizen. Ein Backblech mit Backpapier auslegen.",
  "In einer Schüssel Mehl und Zucker vermischen"
]
```

**Example 2: Non-Numbered Steps with Sentence Endings**
```
Input OCR text:
Preheat the oven to 180°C.
Mix flour and sugar together.
Bake for 20 minutes.

Output:
steps: [
  "Preheat the oven to 180°C.",
  "Mix flour and sugar together.",
  "Bake for 20 minutes."
]
```

**Example 3: Multi-Line Steps Without Numbering or Punctuation**
```
Input OCR text:
Preheat the oven and
prepare the baking sheet
Mix all ingredients

Output:
steps: [
  "Preheat the oven and prepare the baking sheet Mix all ingredients"
]

Note: Without sentence endings or numbering, ALL lines are merged into a single step.
This is a limitation of pure text-based parsing without semantic understanding.

BEST PRACTICE: Always use proper punctuation to separate steps:

Input with periods (recommended):
Preheat the oven and prepare the baking sheet.
Mix all ingredients.

Output:
steps: [
  "Preheat the oven and prepare the baking sheet.",
  "Mix all ingredients."
]

Or use numbering:

Input with numbering (recommended):
1. Preheat the oven and prepare the baking sheet
2. Mix all ingredients

Output:
steps: [
  "Preheat the oven and prepare the baking sheet",
  "Mix all ingredients"
]
```

#### Best Practices for OCR Quality

To get the best results when scanning recipes:

1. **Use Clear Images**: High contrast between text and background
2. **Good Lighting**: Avoid shadows and glare
3. **Proper Formatting**: 
   - Number your steps (1., 2., 3.)
   - End sentences with punctuation (., !, ?)
   - Use clear section headers (Zutaten, Zubereitung, Ingredients, Instructions)
4. **Review Before Import**: Always check and edit OCR results before importing

#### Supported Text Patterns

**Section Headers:**
- German: `Zutaten`, `Zubereitung`, `Anleitung`, `Schritte`
- English: `Ingredients`, `Instructions`, `Directions`, `Steps`, `Preparation`, `Method`

**List Markers:**
- Bullet points: `-`, `*`, `•`
- Numbering: `1.`, `2)`, `3.`, etc.

**Properties:**
- Servings: `Portionen: 4`, `Servings: 4`, `für 8 Personen`
- Time: `Kochdauer: 30`, `Zeit: 45`, `Time: 60`
- Difficulty: `Schwierigkeit: 3`, `Difficulty: 2`
- Cuisine: `Kulinarik: Italienisch`, `Cuisine: Italian`
- Category: `Kategorie: Hauptgericht`, `Category: Main Course`

## Webimport Feature Dokumentation

_Quelle: `WEBIMPORT_FEATURE.md` (zusammengeführt)._

### Übersicht

Das Webimport-Feature ermöglicht es Benutzern, Rezepte direkt von Websites zu importieren. Die Funktion:

1. Nimmt eine URL als Eingabe
2. Erfasst einen Screenshot der Website
3. Verarbeitet den Screenshot mit Gemini AI OCR
4. Extrahiert Rezeptdaten (Titel, Zutaten, Schritte, etc.)
5. Füllt das Rezeptformular automatisch vor

### Implementierte Komponenten

#### Frontend

- **WebImportModal.js**: Modal-Komponente für URL-Eingabe und Ergebnisanzeige
- **WebImportModal.css**: Styling für die Modal-Komponente
- **webImportService.js**: Service für Screenshot-Erfassung und URL-Validierung
- **RecipeForm.js**: Integriert den Webimport-Button (nur sichtbar wenn Berechtigung vorhanden)
- **Settings.js**: Konfiguration für Webimport-Button-Icon
- **UserManagement.js**: Toggle für Webimport-Berechtigung pro Benutzer

#### Backend (Cloud Functions)

- **functions/index.js**: 
  - `captureWebsiteScreenshot`: Cloud Function für Screenshot-Erfassung
  - Rate Limiting (wie bei AI Scan)
  - URL-Validierung

### Benutzerberechtigungen

Webimport ist eine optionale Funktion, die pro Benutzer aktiviert werden kann:

- Administratoren können die Webimport-Berechtigung in der Benutzerverwaltung aktivieren/deaktivieren
- Nur Benutzer mit aktivierter Berechtigung sehen den Webimport-Button
- Rate Limits gelten wie bei der Fotoscan-Funktion

### Konfiguration

#### Button-Icon

Das Webimport-Button-Icon kann in den Einstellungen unter "Allgemein" > "Button-Icons" angepasst werden:
- Standard: 🌐 (Globus-Emoji)
- Kann durch Emoji, Text oder eigenes Bild ersetzt werden

#### Puppeteer-Installation

Puppeteer (`puppeteer@^21.0.0`) und `@sparticuz/chromium` sind in `functions/package.json` als Dependencies eingetragen und in `captureWebsiteScreenshot` (`functions/index.js`) aktiv implementiert (kein Platzhalter, kein auskommentierter Code). Die Function nutzt `chromium.executablePath()`, `memory: '2GiB'` und `timeoutSeconds: 120`.

Falls die Cloud Functions noch nicht mit dieser Version deployed wurden:

```bash
cd functions
npm install
firebase deploy --only functions:captureWebsiteScreenshot
```

#### Aktuelle Implementierung

Die Cloud Function enthält:
- ✅ URL-Validierung (inkl. SSRF-Schutz via `assertPublicUrl`)
- ✅ Rate Limiting
- ✅ Authentifizierung
- ✅ Puppeteer-Integration (aktiv, inkl. User-Agent-Spoofing und Automation-Fingerprint-Unterdrückung)

### Nutzung

1. Benutzer öffnet "Neues Rezept hinzufügen"
2. Klickt auf den Webimport-Button (🌐)
3. Gibt eine Rezept-URL ein (z.B. von chefkoch.de)
4. Klickt auf "Weiter"
5. System erfasst Screenshot und analysiert mit Gemini AI
6. Erkannte Rezeptdaten werden angezeigt
7. Benutzer klickt "Übernehmen" um Daten ins Formular zu laden

### Fehlerbehandlung

- Ungültige URLs werden abgefangen
- Rate Limits werden durchgesetzt (wie bei Fotoscan)
- Timeout-Fehler bei langsamen Websites
- Gemini AI OCR Fehler werden abgefangen
- Benutzerfreundliche Fehlermeldungen auf Deutsch

### Erweiterungsmöglichkeiten

#### Optional implementiert:
- Duplikatsprüfung: `findRecipesByUrl()` in `webImportService.js` vorhanden
  - Kann verwendet werden um zu prüfen, ob ein Rezept von derselben URL bereits existiert
  - Benötigt `sourceUrl` Feld im Rezept-Schema

#### Zukünftige Erweiterungen:
- URL-Historie speichern
- Automatische Quellen-Attribution
- Unterstützung für mehrere Seiten (Seitennummerierung)
- Screenshot-Caching für häufig verwendete URLs

### Technische Details

#### Rate Limits
- Authentifizierte Benutzer: 20 Captures/Tag
- Gast-Benutzer: 5 Captures/Tag
- Gleiche Limits wie AI Scan (geteilter Counter)

#### Unterstützte Formate
- Protokolle: http://, https://
- Alle öffentlich zugänglichen Websites
- Keine Authentifizierung für geschützte Seiten

#### Performance
- Screenshot-Erfassung: ~5-15 Sekunden
- Gemini AI Analyse: ~2-5 Sekunden
- Gesamt: ~10-20 Sekunden pro Import

### Sicherheit

- Server-seitige URL-Validierung
- Rate Limiting
- Authentifizierung erforderlich
- Keine Speicherung der Screenshots
- Puppeteer läuft in isoliertem Browser-Kontext
