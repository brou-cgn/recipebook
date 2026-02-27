import React, { useState, useRef } from 'react';
import './InstagramImportModal.css';
import { fileToBase64 } from '../utils/imageUtils';
import { recognizeRecipeWithAI } from '../utils/aiOcrService';
import { extractKulinarikFromTags } from '../utils/ocrParser';

function InstagramImportModal({ onImport, onCancel, initialImages = [] }) {
  const [images, setImages] = useState(initialImages);
  const [step, setStep] = useState('preview'); // 'preview' | 'processing' | 'result'
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const [aiResult, setAiResult] = useState(null);
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);

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
    // Reset input so the same file can be added again if needed
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

    // Concatenate ingredients from all images, keeping order and avoiding exact duplicates
    const allIngredients = validResults.flatMap(r => r.ingredients || []);
    const seenIngredients = new Set();
    merged.ingredients = allIngredients.filter(ing => {
      const key = ing.toLowerCase().trim();
      if (seenIngredients.has(key)) return false;
      seenIngredients.add(key);
      return true;
    });

    // Concatenate steps in order across all images (do not deduplicate cooking instructions)
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
    if (images.length === 0) {
      setError('Bitte fügen Sie mindestens ein Bild hinzu.');
      return;
    }

    setError('');
    setStep('processing');
    setCurrentImageIndex(0);
    setScanProgress(0);

    const results = [];
    for (let i = 0; i < images.length; i++) {
      setCurrentImageIndex(i);
      setScanProgress(0);
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

  return (
    <div className="modal-overlay">
      <div className="instagram-import-modal">
        <div className="instagram-import-header">
          <h2>📸 Instagram Import</h2>
          <button className="close-button" onClick={onCancel}>✕</button>
        </div>

        <div className="instagram-import-content">
          {/* Preview Step */}
          {step === 'preview' && (
            <>
              {images.length === 0 ? (
                <p className="instagram-import-instructions">
                  Keine geteilten Bilder gefunden. Fügen Sie Bilder manuell hinzu.
                </p>
              ) : (
                <p className="instagram-import-instructions">
                  {images.length === 1
                    ? '1 Bild bereit für die Analyse.'
                    : `${images.length} Bilder bereit für die Analyse.`}{' '}
                  Sie können weitere Bilder hinzufügen oder einzelne entfernen.
                </p>
              )}

              <div className="instagram-image-grid">
                {images.map((src, index) => (
                  <div key={index} className="instagram-image-item">
                    <img src={src} alt={`Bild ${index + 1}`} className="instagram-image-thumb" />
                    <button
                      className="instagram-image-remove"
                      onClick={() => handleRemoveImage(index)}
                      title="Bild entfernen"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <label className="instagram-add-image" title="Weitere Bilder hinzufügen">
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

              {error && <div className="instagram-error">{error}</div>}
            </>
          )}

          {/* Processing Step */}
          {step === 'processing' && (
            <div className="instagram-processing">
              <p className="instagram-processing-title">🔍 Analyse läuft...</p>
              <p className="instagram-processing-subtitle">
                Bild {currentImageIndex + 1} von {images.length}
              </p>
              <div className="instagram-progress-bar">
                <div
                  className="instagram-progress-fill"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
              <p className="instagram-progress-text">{scanProgress}%</p>
              <div className="instagram-image-indicators">
                {images.map((_, index) => (
                  <div
                    key={index}
                    className={`instagram-image-indicator ${
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
            </div>
          )}

          {/* Result Step */}
          {step === 'result' && aiResult && (
            <div className="instagram-result">
              {images.length > 1 && (
                <div className="instagram-merged-notice">
                  🔗 Aus {images.length} Bildern zusammengeführt
                </div>
              )}
              {aiResult.title && (
                <h3 className="instagram-result-title">{aiResult.title}</h3>
              )}
              <div className="instagram-result-meta">
                {aiResult.servings && (
                  <span className="instagram-meta-badge">🍽 {aiResult.servings} Portionen</span>
                )}
                {(aiResult.prepTime || aiResult.cookTime) && (
                  <span className="instagram-meta-badge">
                    ⏱ {aiResult.prepTime || aiResult.cookTime}
                  </span>
                )}
                {aiResult.difficulty && (
                  <span className="instagram-meta-badge">📊 Schwierigkeit: {aiResult.difficulty}</span>
                )}
                {aiResult.cuisine && (
                  <span className="instagram-meta-badge">🌍 {aiResult.cuisine}</span>
                )}
              </div>
              {aiResult.ingredients && aiResult.ingredients.length > 0 && (
                <div className="instagram-result-section">
                  <h4>Zutaten</h4>
                  <ul>
                    {aiResult.ingredients.map((ing, i) => (
                      <li key={i}>{ing}</li>
                    ))}
                  </ul>
                </div>
              )}
              {aiResult.steps && aiResult.steps.length > 0 && (
                <div className="instagram-result-section">
                  <h4>Zubereitung</h4>
                  <ol>
                    {aiResult.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}
              {error && <div className="instagram-error">{error}</div>}
            </div>
          )}
        </div>

        <div className="instagram-import-actions">
          <button className="instagram-cancel-button" onClick={onCancel}>
            Abbrechen
          </button>
          {step === 'preview' && (
            <button
              className="instagram-analyse-button"
              onClick={handleStartAnalysis}
              disabled={images.length === 0}
            >
              🔍 Analyse starten
            </button>
          )}
          {step === 'result' && (
            <>
              <button
                className="instagram-back-button"
                onClick={() => setStep('preview')}
              >
                ← Zurück
              </button>
              <button
                className="instagram-import-button"
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

export default InstagramImportModal;
