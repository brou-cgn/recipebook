import React, { useState, useEffect } from 'react';
import './WebImportModal.css';
import { normalizeImportedUrl } from '../utils/webImportService';
import { runWebImport } from '../utils/importRunners';
import { useRecipeImportQueue } from '../contexts/RecipeImportQueueContext';
import { isWebImportUnlocked, verifyWebImportPin } from '../utils/webImportPin';

function WebImportModal({ onCancel, onImported, initialUrl = '', authorId = '', userId = '', importContext = {}, webImportPinEnabled = false }) {
  const [url, setUrl] = useState(() => normalizeImportedUrl(initialUrl));
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);
  const { enqueueImportJob } = useRecipeImportQueue();

  const pinRequired = webImportPinEnabled && !isWebImportUnlocked();

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

    if (webImportPinEnabled && !isWebImportUnlocked()) {
      if (!pin.trim()) {
        setError('Bitte gib deinen Webimport-PIN ein');
        return;
      }
      setVerifyingPin(true);
      try {
        await verifyWebImportPin(pin.trim());
      } catch (pinError) {
        setVerifyingPin(false);
        setError(pinError.message);
        return;
      }
      setVerifyingPin(false);
    }

    enqueueImportJob({
      label: normalizedUrl,
      userId,
      context: importContext,
      run: (onProgress, jobMeta) => runWebImport(normalizedUrl, authorId, onProgress, jobMeta),
      source: { type: 'web', url: normalizedUrl, authorId },
    });

    // Once the job is queued, hand control back to whoever wants to leave
    // the empty add-recipe form (e.g. return to the page the user came
    // from) rather than just closing this modal on top of it.
    (onImported || onCancel)();
  };

  // Handle URL submission from the form
  const handleSubmit = () => submitUrl(url);

  // Auto-submit when initialUrl is provided and valid. Skipped while a PIN
  // still needs to be entered – the user has to confirm it manually first.
  useEffect(() => {
    const normalizedInitialUrl = normalizeImportedUrl(initialUrl);
    if (normalizedInitialUrl && isValidUrl(normalizedInitialUrl) && !pinRequired) {
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

            {pinRequired && (
              <div className="url-input-container">
                <label htmlFor="webImportPinInput">Webimport-PIN:</label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  id="webImportPinInput"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="PIN eingeben"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSubmit();
                    }
                  }}
                />
              </div>
            )}

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
          <button className="submit-button" onClick={handleSubmit} disabled={verifyingPin}>
            {verifyingPin ? 'PIN wird geprüft…' : 'Import starten'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default WebImportModal;
