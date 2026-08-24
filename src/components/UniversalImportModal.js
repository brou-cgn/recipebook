import React, { useState, useRef } from 'react';
import './UniversalImportModal.css';
import { fileToBase64 } from '../utils/imageUtils';
import { runUniversalImport } from '../utils/importRunners';
import { useRecipeImportQueue } from '../contexts/RecipeImportQueueContext';

function buildInitialText(title, text) {
  return [title, text].filter(Boolean).join('\n\n');
}

function UniversalImportModal({ onCancel, initialImages = [], initialText = '', initialUrl = '', initialTitle = '', userId = '', importContext = {} }) {
  const [images, setImages] = useState(initialImages);
  const [text, setText] = useState(buildInitialText(initialTitle, initialText));
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState('');
  const { enqueueImportJob } = useRecipeImportQueue();

  const fileInputRef = useRef(null);

  const hasContent = images.length > 0 || text.trim() || url.trim();

  const handleAddImages = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setError('');
    try {
      const newBase64s = await Promise.all(files.map(f => fileToBase64(f)));
      setImages(prev => [...prev, ...newBase64s]);
    } catch (err) {
      setError('Fehler beim Laden der Bilder: ' + err.message);
    }
    e.target.value = '';
  };

  const handleRemoveImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleQueueImport = async () => {
    if (!hasContent) {
      setError('Bitte fügen Sie mindestens einen Inhalt hinzu.');
      return;
    }

    const snapshot = { images: [...images], text, url };
    enqueueImportJob({
      label: snapshot.url.trim() || 'Rezept-Import',
      userId,
      context: importContext,
      run: (onProgress, jobMeta) => runUniversalImport(snapshot, onProgress, jobMeta),
      source: { type: 'universal', images: snapshot.images, text: snapshot.text, url: snapshot.url },
    });

    // The import now runs in the background (see the header's progress
    // indicator); the recipe is saved with a TEMP flag once analysis
    // finishes and shows up for review on "Neues Rezept hinzufügen".
    onCancel();
  };

  const totalItems = images.length + (text.trim() ? 1 : 0) + (url.trim() ? 1 : 0);

  return (
    <div className="modal-overlay">
      <div className="universal-import-modal">
        <div className="universal-import-header">
          <h2>Universeller Import</h2>
          <button className="close-button" onClick={onCancel}>×</button>
        </div>

        <div className="universal-import-content">
          {!hasContent ? (
            <p className="universal-import-instructions">
              Keine geteilten Inhalte gefunden. Fügen Sie Bilder, Text oder eine URL hinzu.
            </p>
          ) : (
            <p className="universal-import-instructions">
              {totalItems === 1
                ? '1 Inhalt bereit für die Analyse.'
                : `${totalItems} Inhalte bereit für die Analyse.`}{' '}
              Sie können weitere Bilder hinzufügen oder Inhalte bearbeiten.
            </p>
          )}

          {/* URL field */}
          <div className="universal-import-field">
            <label className="universal-import-label">URL</label>
            <input
              type="url"
              className="universal-import-url-input"
              placeholder="https://beispiel.de/rezept"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          {/* Text field */}
          <div className="universal-import-field">
            <label className="universal-import-label">Text</label>
            <textarea
              className="universal-import-textarea"
              placeholder="Rezepttext hier einfügen..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
            />
          </div>

          {/* Image grid */}
          <div className="universal-import-field">
            <label className="universal-import-label">Bilder ({images.length})</label>
            <div className="universal-image-grid">
              {images.map((src, index) => (
                <div key={index} className="universal-image-item">
                  <img src={src} alt={`Bild ${index + 1}`} className="universal-image-thumb" />
                  <button
                    className="universal-image-remove"
                    onClick={() => handleRemoveImage(index)}
                    title="Bild entfernen"
                  >
                    ×
                  </button>
                </div>
              ))}

              <label className="universal-add-image" title="Weitere Bilder hinzufügen">
                <span>+</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  multiple
                  onChange={handleAddImages}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          {error && <div className="universal-error">{error}</div>}
        </div>

        <div className="universal-import-actions">
          <button className="universal-cancel-button" onClick={onCancel}>
            Abbrechen
          </button>
          <button
            className="universal-analyse-button"
            onClick={handleQueueImport}
            disabled={!hasContent}
          >
            Import starten
          </button>
        </div>
      </div>
    </div>
  );
}

export default UniversalImportModal;
