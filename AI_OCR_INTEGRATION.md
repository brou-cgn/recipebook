# AI OCR Integration Guide

## Übersicht

Dieser Leitfaden zeigt, wie die AI-Enhanced OCR in die RecipeBook-Anwendung integriert werden kann.

## Voraussetzungen

1. **Google Gemini API Key** (empfohlen)
   - Kostenlos unter https://aistudio.google.com/ erstellen
   - Großzügiges kostenloses Tier: ~10.000+ Anfragen/Monat
   - Keine Kreditkarte erforderlich

2. **Oder: OpenAI API Key** (alternative)
   - Unter https://platform.openai.com/ erstellen
   - Begrenztes kostenloses Tier: $5 Guthaben
   - Kreditkarte erforderlich nach Ablauf

## Setup

### 1. API Key konfigurieren

Kopiere `.env.example` zu `.env.local` und füge deinen API-Key hinzu:

```bash
cp .env.example .env.local
```

Bearbeite `.env.local` und füge hinzu:

```env
# Für Gemini (empfohlen)
REACT_APP_GEMINI_API_KEY=dein_gemini_api_key_hier

# ODER für OpenAI (alternative)
REACT_APP_OPENAI_API_KEY=dein_openai_api_key_hier
```

### 2. Dependencies sind bereits installiert

Keine zusätzlichen npm-Pakete erforderlich! Die Integration nutzt die native Fetch API.

### 3. Service importieren

```javascript
import { 
  recognizeRecipeWithAI,
  isAiOcrAvailable,
  getAiOcrProviders 
} from './utils/aiOcrService';
```

## Verwendung

### Einfachstes Beispiel

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

### Mit Progress-Callback

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

### Provider-Verfügbarkeit prüfen

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

## Integration in OcrScanModal

### Schritt 1: State erweitern

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

### Schritt 2: UI Toggle hinzufügen

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

### Schritt 3: OCR-Funktion anpassen

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

### Schritt 4: CSS Styling

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

## Erweiterte Integration: Vergleichsmodus

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

## Fehlerbehandlung

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

## Kosten-Management

### Nutzung überwachen

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

### Nutzer-Feedback

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

## Best Practices

1. **Fallback immer implementieren**: AI OCR kann fehlschlagen
2. **Nutzer informieren**: Transparenz über Datenübertragung
3. **Progress-Feedback**: UI bleibt responsiv
4. **Fehler sinnvoll behandeln**: Hilfreiche Fehlermeldungen
5. **Kosten im Blick**: Monitoring bei hoher Nutzung
6. **Testing**: Verschiedene Rezeptformate testen

## Troubleshooting

### Problem: "API key not configured"
**Lösung:** Stelle sicher, dass `.env.local` korrekt konfiguriert ist und die App neu gestartet wurde.

```bash
npm start
```

### Problem: "Quota exceeded"
**Lösung:** Warte bis zum nächsten Monat oder upgrade deinen Plan.

### Problem: "Failed to parse recipe data"
**Lösung:** Das Bild enthält wahrscheinlich kein gültiges Rezept oder ist schwer lesbar.

### Problem: CORS-Fehler
**Lösung:** Gemini API sollte keine CORS-Probleme verursachen. Prüfe deine Netzwerk-Konfiguration.

## Nächste Schritte

1. ✅ Setup: API Key konfigurieren
2. ✅ Testing: Mit Beispiel-Rezepten testen
3. ✅ Integration: In OcrScanModal einbauen
4. ✅ UI/UX: Toggle und Feedback implementieren
5. ✅ Dokumentation: Nutzer informieren
6. ✅ Monitoring: Nutzung überwachen

## Support & Weitere Informationen

- [Gemini API Dokumentation](https://ai.google.dev/gemini-api/docs)
- [AI OCR Analyse-Dokument](./AI_OCR_PLATTFORMEN_ANALYSE.md)
- [RecipeBook OCR Service](./OCR_SERVICE.md)

---

**Hinweis:** Diese Integration ist optional und erweitert die bestehende Tesseract.js-Lösung. Die Standard-OCR bleibt voll funktionsfähig.
