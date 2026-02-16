import React, { useState } from 'react';
import './WebImportModal.css';
import { captureWebsiteScreenshot } from '../utils/webImportService';
import { recognizeRecipeWithAI } from '../utils/aiOcrService';

function WebImportModal({ onImport, onCancel }) {
  const [step, setStep] = useState('url'); // 'url', 'loading', 'result'
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [aiResult, setAiResult] = useState(null);

  // Validate URL
  const isValidUrl = (urlString) => {
    try {
      const urlObj = new URL(urlString);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  };

  // Handle URL submission
  const handleSubmit = async () => {
    setError('');
    
    // Validate URL
    if (!url.trim()) {
      setError('Bitte geben Sie eine URL ein');
      return;
    }

    if (!isValidUrl(url.trim())) {
      setError('Bitte geben Sie eine gültige URL ein (z.B. https://example.com)');
      return;
    }

    setStep('loading');
    setProgress(10);

    try {
      // Step 1: Capture screenshot
      setProgress(20);
      const screenshotBase64 = await captureWebsiteScreenshot(url.trim(), (prog) => {
        setProgress(20 + (prog * 0.3)); // 20-50%
      });

      // Step 2: Process with Gemini OCR
      setProgress(50);
      const result = await recognizeRecipeWithAI(screenshotBase64, {
        language: 'de',
        provider: 'gemini',
        onProgress: (prog) => {
          setProgress(50 + (prog * 0.5)); // 50-100%
        }
      });

      setProgress(100);
      setAiResult(result);
      setStep('result');
    } catch (err) {
      console.error('Web import error:', err);
      setError(err.message || 'Fehler beim Importieren der Website');
      setStep('url');
      setProgress(0);
    }
  };

  // Handle import of AI result
  const handleImport = () => {
    if (!aiResult) {
      setError('Keine Daten zum Importieren verfügbar');
      return;
    }

    try {
      // Parse time values more robustly
      const parseTime = (timeStr) => {
        if (!timeStr) return 0;
        const numMatch = String(timeStr).match(/\d+/);
        return numMatch ? parseInt(numMatch[0], 10) : 0;
      };

      const recipe = {
        title: aiResult.title || '',
        ingredients: aiResult.ingredients || [],
        steps: aiResult.steps || [],
        portionen: aiResult.servings || 4,
        kochdauer: parseTime(aiResult.prepTime) || parseTime(aiResult.cookTime) || 30,
        kulinarik: aiResult.cuisine ? [aiResult.cuisine] : [],
        schwierigkeit: aiResult.difficulty || 3,
        speisekategorie: aiResult.category ? [aiResult.category] : [],
      };
      
      onImport(recipe);
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle reset
  const handleReset = () => {
    setStep('url');
    setUrl('');
    setError('');
    setProgress(0);
    setAiResult(null);
  };

  return (
    <div className="modal-overlay">
      <div className="web-import-modal">
        <div className="web-import-modal-header">
          <h2>Rezept von Website importieren</h2>
          <button className="close-button" onClick={onCancel}>✕</button>
        </div>

        <div className="web-import-modal-content">
          {/* URL Input Step */}
          {step === 'url' && (
            <div className="url-input-section">
              <p className="web-import-instructions">
                Geben Sie die URL einer Website mit einem Rezept ein
              </p>

              <div className="url-input-container">
                <label htmlFor="urlInput">Website-URL:</label>
                <input
                  type="text"
                  id="urlInput"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="z.B. https://www.chefkoch.de/rezepte/..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSubmit();
                    }
                  }}
                  autoFocus
                />
              </div>

              <div className="url-input-hint">
                <p>💡 Tipp: Die Website wird automatisch erfasst und das Rezept extrahiert.</p>
              </div>
            </div>
          )}

          {/* Loading Step */}
          {step === 'loading' && (
            <div className="loading-section">
              <p className="web-import-instructions">
                {progress < 50 
                  ? '📸 Erfasse Website-Screenshot...' 
                  : '🤖 Analysiere Rezept mit KI...'}
              </p>
              <div className="progress-container">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="progress-text">{Math.round(progress)}%</p>
              </div>
            </div>
          )}

          {/* Result Step */}
          {step === 'result' && aiResult && (
            <div className="result-section">
              <p className="web-import-instructions">
                KI-Analyse abgeschlossen - Überprüfen Sie die erkannten Daten
              </p>

              <div className="source-url">
                <strong>Quelle:</strong> <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
              </div>

              <h3 className="result-title">{aiResult.title || 'Unbenanntes Rezept'}</h3>

              {(aiResult.servings || aiResult.prepTime || aiResult.cookTime || aiResult.difficulty || aiResult.cuisine || aiResult.category) && (
                <div className="result-meta">
                  {aiResult.servings && (
                    <span className="meta-badge">👥 {aiResult.servings} Portionen</span>
                  )}
                  {(aiResult.prepTime || aiResult.cookTime) && (
                    <span className="meta-badge">⏱️ {aiResult.prepTime || aiResult.cookTime}</span>
                  )}
                  {aiResult.difficulty && (
                    <span className="meta-badge">📊 Schwierigkeit: {aiResult.difficulty}/5</span>
                  )}
                  {aiResult.cuisine && (
                    <span className="meta-badge">🌍 {aiResult.cuisine}</span>
                  )}
                  {aiResult.category && (
                    <span className="meta-badge">📂 {aiResult.category}</span>
                  )}
                </div>
              )}

              {aiResult.ingredients && aiResult.ingredients.length > 0 && (
                <div className="result-ingredients">
                  <h4>Zutaten</h4>
                  <ul>
                    {aiResult.ingredients.map((ingredient, index) => (
                      <li key={index}>{ingredient}</li>
                    ))}
                  </ul>
                </div>
              )}

              {aiResult.steps && aiResult.steps.length > 0 && (
                <div className="result-steps">
                  <h4>Zubereitung</h4>
                  <ol>
                    {aiResult.steps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              <button className="new-import-button" onClick={handleReset}>
                ↻ Neue URL importieren
              </button>
            </div>
          )}

          {error && (
            <div className="web-import-error">
              {error}
            </div>
          )}
        </div>

        <div className="web-import-modal-actions">
          <button className="cancel-button" onClick={onCancel}>
            Abbrechen
          </button>
          
          {step === 'url' && (
            <button className="submit-button" onClick={handleSubmit}>
              Weiter
            </button>
          )}

          {step === 'result' && (
            <button className="import-button" onClick={handleImport}>
              Übernehmen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default WebImportModal;
