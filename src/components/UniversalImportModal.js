import React, { useState, useRef } from 'react';
import './UniversalImportModal.css';
import { fileToBase64 } from '../utils/imageUtils';
import { recognizeRecipeWithAI } from '../utils/aiOcrService';
import { captureWebsiteScreenshot } from '../utils/webImportService';
import { extractKulinarikFromTags } from '../utils/ocrParser';

function buildInitialText(title, text) {
  return [title, text].filter(Boolean).join('\n\n');
}

function UniversalImportModal({ onImport, onCancel, initialImages = [], initialText = '', initialUrl = '', initialTitle = '' }) {
  const [images, setImages] = useState(initialImages);
  const [text, setText] = useState(buildInitialText(initialTitle, initialText));
  const [url, setUrl] = useState(initialUrl);
  const [step, setStep] = useState('preview'); // 'preview' | 'processing' | 'result'
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const [aiResult, setAiResult] = useState(null);
  const [error, setError] = useState('');
  const [processingLabel, setProcessingLabel] = useState('');

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

  const mergeAiResults = (results) => {
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
  };

  const handleStartAnalysis = async () => {
    if (!hasContent) {
      setError('Bitte fügen Sie mindestens einen Inhalt hinzu.');
      return;
    }

    setError('');
    setStep('processing');
    setCurrentImageIndex(0);
    setScanProgress(0);

    const results = [];

    // Process URL: capture screenshot and run AI OCR
    if (url.trim()) {
      try {
        setProcessingLabel('Lade Website...');
        setScanProgress(0);
        const screenshotBase64 = await captureWebsiteScreenshot(url.trim(), (prog) => {
          setScanProgress(Math.round(prog * 0.5));
        });
        setProcessingLabel('Analysiere Website...');
        const result = await recognizeRecipeWithAI(screenshotBase64, {
          language: 'de',
          provider: 'gemini',
          onProgress: (prog) => setScanProgress(50 + Math.round(prog * 0.5))
        });
        results.push(result);
      } catch (err) {
        console.error('URL processing error:', err);
        results.push({ error: err.message });
      }
    }

    // Process plain text: build an image with the text for Gemini to extract from
    if (text.trim()) {
      try {
        setProcessingLabel('Analysiere Text...');
        setScanProgress(0);
        // Create a simple canvas image with the text for OCR
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
          // Word-wrap long lines
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
        const result = await recognizeRecipeWithAI(textImageBase64, {
          language: 'de',
          provider: 'gemini',
          onProgress: (prog) => setScanProgress(prog)
        });
        results.push(result);
      } catch (err) {
        console.error('Text processing error:', err);
        results.push({ error: err.message });
      }
    }

    // Process images
    for (let i = 0; i < images.length; i++) {
      setCurrentImageIndex(i);
      setScanProgress(0);
      setProcessingLabel(`Analysiere Bild ${i + 1} von ${images.length}...`);
      try {
        const result = await recognizeRecipeWithAI(images[i], {
          language: 'de',
          provider: 'gemini',
          onProgress: (progress) => setScanProgress(progress)
        });
        results.push(result);
      } catch (err) {
        console.error(`Error processing image ${i + 1}:`, err);
        results.push({ error: err.message });
      }
    }

    try {
      const merged = mergeAiResults(results);
      setAiResult(merged);
      setStep('result');
    } catch (err) {
      setError(err.message);
      setStep('preview');
    }
  };

  const handleImport = () => {
    if (!aiResult) return;
    setError('');
    try {
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
      };
      onImport(recipe);
    } catch (err) {
      setError(err.message);
    }
  };

  const totalItems = images.length + (text.trim() ? 1 : 0) + (url.trim() ? 1 : 0);

  return (
    <div className="modal-overlay">
      <div className="universal-import-modal">
        <div className="universal-import-header">
          <h2>📥 Universeller Import</h2>
          <button className="close-button" onClick={onCancel}>✕</button>
        </div>

        <div className="universal-import-content">
          {/* Preview Step */}
          {step === 'preview' && (
            <>
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
                <label className="universal-import-label">🌐 URL</label>
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
                <label className="universal-import-label">📝 Text</label>
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
                <label className="universal-import-label">🖼 Bilder ({images.length})</label>
                <div className="universal-image-grid">
                  {images.map((src, index) => (
                    <div key={index} className="universal-image-item">
                      <img src={src} alt={`Bild ${index + 1}`} className="universal-image-thumb" />
                      <button
                        className="universal-image-remove"
                        onClick={() => handleRemoveImage(index)}
                        title="Bild entfernen"
                      >
                        ✕
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
            </>
          )}

          {/* Processing Step */}
          {step === 'processing' && (
            <div className="universal-processing">
              <p className="universal-processing-title">🔍 Analyse läuft...</p>
              <p className="universal-processing-subtitle">{processingLabel}</p>
              <div className="universal-progress-bar">
                <div
                  className="universal-progress-fill"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
              <p className="universal-progress-text">{scanProgress}%</p>
              {images.length > 1 && (
                <div className="universal-image-indicators">
                  {images.map((_, index) => (
                    <div
                      key={index}
                      className={`universal-image-indicator ${
                        index < currentImageIndex
                          ? 'completed'
                          : index === currentImageIndex
                          ? 'processing'
                          : 'pending'
                      }`}
                    >
                      {index < currentImageIndex ? '✓' : index + 1}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Result Step */}
          {step === 'result' && aiResult && (
            <div className="universal-result">
              {totalItems > 1 && (
                <div className="universal-merged-notice">
                  🔗 Aus {totalItems} Inhalten zusammengeführt
                </div>
              )}
              {aiResult.title && (
                <h3 className="universal-result-title">{aiResult.title}</h3>
              )}
              <div className="universal-result-meta">
                {aiResult.servings && (
                  <span className="universal-meta-badge">🍽 {aiResult.servings} Portionen</span>
                )}
                {(aiResult.prepTime || aiResult.cookTime) && (
                  <span className="universal-meta-badge">
                    ⏱ {aiResult.prepTime || aiResult.cookTime}
                  </span>
                )}
                {aiResult.difficulty && (
                  <span className="universal-meta-badge">📊 Schwierigkeit: {aiResult.difficulty}</span>
                )}
                {aiResult.cuisine && (
                  <span className="universal-meta-badge">🌍 {aiResult.cuisine}</span>
                )}
              </div>
              {aiResult.ingredients && aiResult.ingredients.length > 0 && (
                <div className="universal-result-section">
                  <h4>Zutaten</h4>
                  <ul>
                    {aiResult.ingredients.map((ing, i) => (
                      <li key={i}>{ing}</li>
                    ))}
                  </ul>
                </div>
              )}
              {aiResult.steps && aiResult.steps.length > 0 && (
                <div className="universal-result-section">
                  <h4>Zubereitung</h4>
                  <ol>
                    {aiResult.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}
              {error && <div className="universal-error">{error}</div>}
            </div>
          )}
        </div>

        <div className="universal-import-actions">
          <button className="universal-cancel-button" onClick={onCancel}>
            Abbrechen
          </button>
          {step === 'preview' && (
            <button
              className="universal-analyse-button"
              onClick={handleStartAnalysis}
              disabled={!hasContent}
            >
              🔍 Analyse starten
            </button>
          )}
          {step === 'result' && (
            <>
              <button
                className="universal-back-button"
                onClick={() => setStep('preview')}
              >
                ← Zurück
              </button>
              <button
                className="universal-import-button"
                onClick={handleImport}
              >
                ✓ Rezept importieren
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default UniversalImportModal;
