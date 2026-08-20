import React, { useState, useRef } from 'react';
import './UniversalImportModal.css';
import { fileToBase64 } from '../utils/imageUtils';
import { recognizeRecipeWithAI } from '../utils/aiOcrService';
import { captureWebsiteScreenshot } from '../utils/webImportService';
import { buildRecipeFromAiResult } from '../utils/ocrParser';
import { useRecipeImportQueue } from '../contexts/RecipeImportQueueContext';

function buildInitialText(title, text) {
  return [title, text].filter(Boolean).join('\n\n');
}

// Max number of images processed at the same time during a multi-image import.
// Images are independent OCR calls, so processing several in parallel cuts
// total wait time roughly to (image count / concurrency) instead of the sum
// of every individual call, while staying under the per-user rate limit.
const BATCH_CONCURRENCY = 3;

function mergeAiResults(results) {
  const validResults = results.filter(r => !r.error);
  if (validResults.length === 0) {
    throw new Error('Keine gültigen OCR-Ergebnisse gefunden');
  }

  const merged = { ...validResults[0] };

  const allIngredients = validResults.flatMap(r => r.ingredients || []);
  const seenIngredients = new Set();
  merged.ingredients = allIngredients.filter(ing => {
    const key = ing.toLowerCase().trim();
    if (seenIngredients.has(key)) return false;
    seenIngredients.add(key);
    return true;
  });

  merged.steps = validResults.flatMap(r => r.steps || []);

  const allTags = validResults.flatMap(r => r.tags || []);
  merged.tags = [...new Set(allTags)];

  const allNotes = validResults
    .map(r => r.notes)
    .filter(n => n && n.trim())
    .join('\n\n');
  merged.notes = allNotes || merged.notes;

  merged.servings = merged.servings || validResults.find(r => r.servings)?.servings;
  merged.prepTime = merged.prepTime || validResults.find(r => r.prepTime)?.prepTime;
  merged.cookTime = merged.cookTime || validResults.find(r => r.cookTime)?.cookTime;
  merged.difficulty = merged.difficulty || validResults.find(r => r.difficulty)?.difficulty;
  merged.cuisine = merged.cuisine || validResults.find(r => r.cuisine)?.cuisine;
  merged.category = merged.category || validResults.find(r => r.category)?.category;

  return merged;
}

// Runs recognition for a combination of images/text/url and returns the
// merged recipe. Passed as the `run` function to enqueueImportJob() so it
// executes in the background, after the modal has already closed.
async function runUniversalImport({ images, text, url }, onProgress) {
  const results = [];

  if (url.trim()) {
    const screenshotBase64 = await captureWebsiteScreenshot(url.trim(), (prog) => {
      onProgress(Math.round(prog * 0.5), 'Lade Website...');
    });
    onProgress(50, 'Analysiere Website...');
    try {
      const result = await recognizeRecipeWithAI(screenshotBase64, {
        language: 'de',
        provider: 'gemini',
        onProgress: (prog) => onProgress(50 + Math.round(prog * 0.5)),
      });
      results.push(result);
    } catch (err) {
      results.push({ error: err.message });
    }
  }

  if (text.trim()) {
    onProgress(0, 'Analysiere Text...');
    // Create a simple canvas image with the text for Gemini to extract from
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = Math.min(4000, Math.max(600, text.split('\n').length * 24 + 80));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    ctx.font = '18px Arial, sans-serif';
    const lines = text.split('\n');
    let y = 40;
    for (const line of lines) {
      const words = line.split(' ');
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        if (ctx.measureText(testLine).width > 760 && currentLine) {
          ctx.fillText(currentLine, 20, y);
          y += 26;
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        ctx.fillText(currentLine, 20, y);
        y += 26;
      }
    }
    const textImageBase64 = canvas.toDataURL('image/png');
    try {
      const result = await recognizeRecipeWithAI(textImageBase64, {
        language: 'de',
        provider: 'gemini',
        onProgress: (prog) => onProgress(prog),
      });
      results.push(result);
    } catch (err) {
      results.push({ error: err.message });
    }
  }

  if (images.length > 0) {
    const imageResults = new Array(images.length);
    const progressPerImage = new Array(images.length).fill(0);

    const updateOverallProgress = () => {
      const sum = progressPerImage.reduce((a, b) => a + b, 0);
      onProgress(Math.round(sum / images.length), images.length === 1 ? 'Analysiere Bild...' : `Analysiere ${images.length} Bilder...`);
    };

    let nextIndex = 0;
    const processNext = async () => {
      while (nextIndex < images.length) {
        const i = nextIndex++;
        try {
          const result = await recognizeRecipeWithAI(images[i], {
            language: 'de',
            provider: 'gemini',
            onProgress: (progress) => {
              progressPerImage[i] = progress;
              updateOverallProgress();
            }
          });
          imageResults[i] = result;
        } catch (err) {
          imageResults[i] = { error: err.message };
        }
        progressPerImage[i] = 100;
        updateOverallProgress();
      }
    };

    const workerCount = Math.min(BATCH_CONCURRENCY, images.length);
    await Promise.all(Array.from({ length: workerCount }, processNext));

    results.push(...imageResults);
  }

  const merged = mergeAiResults(results);
  return buildRecipeFromAiResult(merged);
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

  const handleQueueImport = () => {
    if (!hasContent) {
      setError('Bitte fügen Sie mindestens einen Inhalt hinzu.');
      return;
    }

    const snapshot = { images: [...images], text, url };
    enqueueImportJob({
      label: snapshot.url.trim() || 'Rezept-Import',
      userId,
      context: importContext,
      run: (onProgress) => runUniversalImport(snapshot, onProgress),
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
