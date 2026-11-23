import React, { useState, useRef } from 'react';
import './ModalOverlay.css';
import './UniversalImportModal.css';
import Button from './Button';
import { fileToBase64 } from '../utils/imageUtils';
import { runUniversalImport } from '../utils/importRunners';
import { useRecipeImportQueue } from '../contexts/RecipeImportQueueContext';
import { useTexte } from '../contexts/SpracheContext';
import { ergebnisText } from '../i18n/texte';
import rezeptimportTexte from '../i18n/texte/rezeptimport';
import allgemeinTexte from '../i18n/texte/allgemein';

function buildInitialText(title, text) {
  return [title, text].filter(Boolean).join('\n\n');
}

function UniversalImportModal({ onCancel, initialImages = [], initialText = '', initialUrl = '', initialTitle = '', userId = '', importContext = {} }) {
  const [images, setImages] = useState(initialImages);
  const [text, setText] = useState(buildInitialText(initialTitle, initialText));
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState('');
  const { enqueueImportJob } = useRecipeImportQueue();
  // Texte des Rezept-Imports (Mehrsprachigkeit PR 6i); die Bezeichnung des Imports bleibt deutsch gespeichert
  const t = useTexte(rezeptimportTexte);
  const tAllgemein = useTexte(allgemeinTexte);

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
      // Meldung von fileToBase64 über ihren Schlüssel (Mehrsprachigkeit PR 6o)
      setError(t('fehlerBilderLaden', { fehler: ergebnisText(err, tAllgemein) }));
    }
    e.target.value = '';
  };

  const handleRemoveImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleQueueImport = async () => {
    if (!hasContent) {
      setError(t('universalFehlerLeer'));
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
          <h2>{t('universalTitel')}</h2>
          <button className="app-close-button" onClick={onCancel} aria-label={t('importSchliessen')} title={t('importSchliessen')}>×</button>
        </div>

        <div className="universal-import-content">
          {!hasContent ? (
            <p className="universal-import-instructions">
              {t('universalLeer')}
            </p>
          ) : (
            <p className="universal-import-instructions">
              {t('universalBereit', { anzahl: totalItems })}{' '}
              {t('universalWeitere')}
            </p>
          )}

          {/* URL field */}
          <div className="universal-import-field">
            <label className="universal-import-label">{t('url')}</label>
            <input
              type="url"
              className="universal-import-url-input"
              placeholder={t('urlBeispiel')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          {/* Text field */}
          <div className="universal-import-field">
            <label className="universal-import-label">{t('text')}</label>
            <textarea
              className="universal-import-textarea"
              placeholder={t('textPlatzhalter')}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
            />
          </div>

          {/* Image grid */}
          <div className="universal-import-field">
            <label className="universal-import-label">{t('bilderAnzahl', { anzahl: images.length })}</label>
            <div className="universal-image-grid">
              {images.map((src, index) => (
                <div key={index} className="universal-image-item">
                  <img src={src} alt={t('bildNummer', { nummer: index + 1 })} className="universal-image-thumb" />
                  <button
                    className="universal-image-remove"
                    onClick={() => handleRemoveImage(index)}
                    title={t('bildEntfernen')}
                  >
                    ×
                  </button>
                </div>
              ))}

              <label className="universal-add-image" title={t('weitereBilder')}>
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
          <Button onClick={onCancel}>
            {tAllgemein('abbrechen')}
          </Button>
          <Button
            variant="primary"
            onClick={handleQueueImport}
            disabled={!hasContent}
          >
            {t('importStarten')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default UniversalImportModal;
