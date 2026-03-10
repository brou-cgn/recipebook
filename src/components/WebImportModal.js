import React, { useState, useEffect } from 'react';
import './WebImportModal.css';
import {
  isRecipeImportPageUrl,
  parseRecipeImportPage,
  isInstagramReelUrl,
  importInstagramReel,
  importRecipeFromUrl,
} from '../utils/webImportService';
import { extractKulinarikFromTags } from '../utils/ocrParser';

function WebImportModal({ onImport, onCancel, initialUrl = '', authorId = '' }) {
  const [step, setStep] = useState('url'); // 'url', 'loading', 'result'
  const [url, setUrl] = useState(initialUrl);
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

  // Core submission logic – works with an explicit URL argument
  const submitUrl = async (urlToSubmit) => {
    setError('');

    if (!urlToSubmit || !urlToSubmit.trim()) {
      setError('Bitte geben Sie eine URL ein');
      return;
    }

    if (!isValidUrl(urlToSubmit.trim())) {
      setError('Bitte geben Sie eine gültige URL ein (z.B. https://example.com)');
      return;
    }

    setStep('loading');
    setProgress(10);

    try {
      let result;

      if (isInstagramReelUrl(urlToSubmit.trim())) {
        // Instagram Reel path – extract caption and page text with Puppeteer + Gemini
        result = await importInstagramReel(urlToSubmit.trim(), setProgress);
      } else if (isRecipeImportPageUrl(urlToSubmit.trim())) {
        // Direct HTML parsing path – no screenshot or AI needed
        result = await parseRecipeImportPage(urlToSubmit.trim(), setProgress);
      } else {
        // Multi-step import: JSON-LD → Text+Gemini → Screenshot+Vision
        result = await importRecipeFromUrl(urlToSubmit.trim(), setProgress);
      }

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

  // Handle URL submission from the form
  const handleSubmit = () => submitUrl(url);

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

      const kulinarikFromCuisine = aiResult.cuisine ? [aiResult.cuisine] : [];
      const kulinarikFromTags = extractKulinarikFromTags(aiResult.tags || []);
      const kulinarikSet = new Set(kulinarikFromCuisine);
      kulinarikFromTags.forEach(k => kulinarikSet.add(k));

      const recipe = {
        title: aiResult.title || '',
        ingredients: aiResult.ingredients || [],
        steps: aiResult.steps || [],
        portionen: aiResult.servings || 4,
        kochdauer: parseTime(aiResult.prepTime) || parseTime(aiResult.cookTime) || 30,
        kulinarik: [...kulinarikSet],
        schwierigkeit: aiResult.difficulty || 3,
        speisekategorie: aiResult.category || '',
        ...(authorId ? { authorId } : {}),
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

  // Auto-submit when initialUrl is provided and valid
  useEffect(() => {
    if (initialUrl && isValidUrl(initialUrl)) {
      submitUrl(initialUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                Gebe die URL deines Rezepts ein
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
                <p>📸 Instagram Reels werden direkt unterstützt – die Caption wird automatisch ausgelesen.</p>
              </div>
            </div>
          )}

          {/* Loading Step */}
          {step === 'loading' && (
            <div className="loading-section">
              <p className="web-import-instructions">
                {isInstagramReelUrl(url)
                  ? (progress < 70
                      ? 'Extrahiere Caption und Kommentare...'
                      : 'Analysiere Rezept...')
                  : (progress < 30
                      ? 'Analysiere Website-Struktur...'
                      : progress < 40
                        ? 'Extrahiere Rezeptdaten...'
                        : 'Analysiere Rezept...')}
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
                Analyse abgeschlossen - Überprüfe die erkannten Daten
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
