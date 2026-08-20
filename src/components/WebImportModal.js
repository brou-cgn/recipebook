import React, { useState, useEffect } from 'react';
import './WebImportModal.css';
import {
  normalizeImportedUrl,
  isRecipeImportPageUrl,
  parseRecipeImportPage,
  isInstagramUrl,
  isInstagramReelUrl,
  importInstagramReel,
  importRecipeFromUrl,
} from '../utils/webImportService';
import { buildRecipeFromAiResult } from '../utils/ocrParser';

function WebImportModal({ onImport, onCancel, initialUrl = '', authorId = '' }) {
  const [step, setStep] = useState('url'); // 'url', 'loading'
  const [url, setUrl] = useState(() => normalizeImportedUrl(initialUrl));
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setUrl(normalizeImportedUrl(initialUrl));
  }, [initialUrl]);

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
    const normalizedUrl = normalizeImportedUrl(urlToSubmit);
    setError('');

    if (!normalizedUrl) {
      setError('Bitte geben Sie eine URL ein');
      return;
    }

    if (!isValidUrl(normalizedUrl)) {
      setError('Bitte geben Sie eine gültige URL ein (z.B. https://example.com)');
      return;
    }

    setStep('loading');
    setProgress(10);

    try {
      let result;

      if (isInstagramUrl(normalizedUrl)) {
        // Instagram path (post, reel, or IGTV) – extract caption and page text with Puppeteer + Gemini
        result = await importInstagramReel(normalizedUrl, setProgress);
      } else if (isRecipeImportPageUrl(normalizedUrl)) {
        // Direct HTML parsing path – no screenshot or AI needed
        result = await parseRecipeImportPage(normalizedUrl, setProgress);
      } else {
        // Multi-step import: JSON-LD → Text+Gemini → Screenshot+Vision
        result = await importRecipeFromUrl(normalizedUrl, setProgress);
      }

      setProgress(100);
      onImport(buildRecipeFromAiResult(result, authorId));
    } catch (err) {
      console.error('Web import error:', err);
      setError(err.message || 'Fehler beim Importieren der Website');
      setStep('url');
      setProgress(0);
    }
  };

  // Handle URL submission from the form
  const handleSubmit = () => submitUrl(url);

  // Auto-submit when initialUrl is provided and valid
  useEffect(() => {
    const normalizedInitialUrl = normalizeImportedUrl(initialUrl);
    if (normalizedInitialUrl && isValidUrl(normalizedInitialUrl)) {
      submitUrl(normalizedInitialUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="modal-overlay">
      <div className="web-import-modal">
        <div className="web-import-modal-header">
          <h2>Rezept von Website importieren</h2>
          <button className="close-button" onClick={onCancel}>×</button>
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
                <p>Tipp: Die Website wird automatisch erfasst und das Rezept extrahiert.</p>
                <p>Instagram Reels werden direkt unterstützt – die Caption wird automatisch ausgelesen.</p>
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
        </div>
      </div>
    </div>
  );
}

export default WebImportModal;
