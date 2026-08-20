import React, { useState, useEffect } from 'react';
import './WebImportModal.css';
import { normalizeImportedUrl } from '../utils/webImportService';
import { runWebImport } from '../utils/importRunners';
import { useRecipeImportQueue } from '../contexts/RecipeImportQueueContext';

function WebImportModal({ onCancel, initialUrl = '', authorId = '', userId = '', importContext = {} }) {
  const [url, setUrl] = useState(() => normalizeImportedUrl(initialUrl));
  const [error, setError] = useState('');
  const { enqueueImportJob } = useRecipeImportQueue();

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

  // Core submission logic – works with an explicit URL argument. Queues the
  // actual recognition as a background job and closes immediately; the
  // recipe is saved with a TEMP flag once analysis finishes and shows up
  // for review on "Neues Rezept hinzufügen".
  const submitUrl = (urlToSubmit) => {
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

    enqueueImportJob({
      label: normalizedUrl,
      userId,
      context: importContext,
      run: (onProgress, jobMeta) => runWebImport(normalizedUrl, authorId, onProgress, jobMeta),
      source: { type: 'web', url: normalizedUrl, authorId },
    });

    onCancel();
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
              <p>Der Import läuft im Hintergrund – du kannst währenddessen weiterarbeiten.</p>
            </div>
          </div>

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
          <button className="submit-button" onClick={handleSubmit}>
            Import starten
          </button>
        </div>
      </div>
    </div>
  );
}

export default WebImportModal;
