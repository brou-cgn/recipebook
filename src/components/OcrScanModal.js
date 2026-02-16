import React, { useState, useRef } from 'react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import './OcrScanModal.css';
import { recognizeText, processCroppedImage } from '../utils/ocrService';
import { parseOcrText, parseOcrTextSmart } from '../utils/ocrParser';
import { getValidationSummary } from '../utils/ocrValidation';
import { fileToBase64 } from '../utils/imageUtils';
import { recognizeRecipeWithAI, isAiOcrAvailable } from '../utils/aiOcrService';

function OcrScanModal({ onImport, onCancel, initialImage = '' }) {
  const [step, setStep] = useState(initialImage ? 'crop' : 'upload'); // 'upload', 'crop', 'scan', 'edit', 'ai-result'
  const [imageBase64, setImageBase64] = useState(initialImage);
  const [crop, setCrop] = useState(null);
  const [completedCrop, setCompletedCrop] = useState(null);
  const [language, setLanguage] = useState('de'); // 'de' or 'en'
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [ocrText, setOcrText] = useState('');
  const [error, setError] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [ocrMode, setOcrMode] = useState('ai'); // 'standard' or 'ai'
  const [aiResult, setAiResult] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const imgRef = useRef(null);

  // Handle file upload
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setError('');
    try {
      const base64 = await fileToBase64(file);
      setImageBase64(base64);
      setStep('crop');
    } catch (err) {
      setError(err.message);
    }
  };

  // Start camera
  const startCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
      }
    } catch (err) {
      setError(`Kamera-Zugriff fehlgeschlagen: ${err.message}. Bitte erlauben Sie den Kamera-Zugriff oder verwenden Sie den Datei-Upload.`);
    }
  };

  // Capture photo from camera
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    const base64 = canvas.toDataURL('image/png');
    setImageBase64(base64);
    stopCamera();
    setStep('crop');
  };

  // Stop camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  // Skip crop (use full image) - kept for backward compatibility but not exposed in UI
  const skipCrop = () => {
    if (!imageBase64) {
      setError('Kein Bild geladen. Bitte laden Sie zuerst ein Bild hoch.');
      return;
    }
    setError('');
    setStep('scan');
    performOcr(imageBase64);
  };

  // Apply crop and proceed to OCR
  const applyCrop = async () => {
    // Validate crop selection
    if (!completedCrop || !completedCrop.width || !completedCrop.height) {
      // No crop area selected or invalid crop, use the full image
      skipCrop();
      return;
    }

    // Check for minimum crop dimensions (at least 50x50 pixels)
    if (completedCrop.width < 50 || completedCrop.height < 50) {
      setError('Die Auswahl ist zu klein. Bitte wählen Sie einen größeren Bereich aus oder überspringen Sie das Zuschneiden.');
      return;
    }

    setError('');
    try {
      // Convert pixel crop to actual crop coordinates
      const pixelCrop = {
        x: Math.round(completedCrop.x),
        y: Math.round(completedCrop.y),
        width: Math.round(completedCrop.width),
        height: Math.round(completedCrop.height)
      };

      const croppedImage = await processCroppedImage(imageBase64, pixelCrop);
      setStep('scan');
      await performOcr(croppedImage);
    } catch (err) {
      setError(err.message);
    }
  };

  // Perform OCR
  const performOcr = async (imageToProcess) => {
    // Validate input
    if (!imageToProcess) {
      setError('Kein Bild zum Scannen verfügbar. Bitte laden Sie ein Bild hoch.');
      setStep('upload');
      return;
    }

    setScanning(true);
    setScanProgress(0);
    setError('');

    try {
      if (ocrMode === 'ai') {
        // AI OCR using Gemini Vision
        const result = await recognizeRecipeWithAI(imageToProcess, {
          language,
          provider: 'gemini',
          onProgress: (progress) => setScanProgress(progress)
        });

        setAiResult(result);
        setStep('ai-result');
      } else {
        // Standard OCR using Tesseract
        const langCode = language === 'de' ? 'deu' : 'eng';
        const result = await recognizeText(
          imageToProcess,
          langCode,
          (progress) => setScanProgress(progress)
        );

        setOcrText(result.text);
        setStep('edit');
      }
    } catch (err) {
      setError('OCR fehlgeschlagen: ' + err.message);
      setStep('crop');
    } finally {
      setScanning(false);
      setScanProgress(0);
    }
  };

  // Handle import of OCR text
  const handleImport = () => {
    setError('');

    // AI result import
    if (step === 'ai-result' && aiResult) {
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
          speisekategorie: aiResult.category || '',
        };
        onImport(recipe);
      } catch (err) {
        setError(err.message);
      }
      return;
    }

    // Standard text import with validation
    if (!ocrText.trim()) {
      setError('Kein Text erkannt. Bitte versuchen Sie es erneut.');
      return;
    }

    try {
      // Use smart parsing with classification and validation
      const result = parseOcrTextSmart(ocrText, language);
      
      // Store validation result for display
      setValidationResult(result.validation);
      
      // Show warnings if quality is low
      if (result.validation.score < 50) {
        const summary = getValidationSummary(result.validation, language);
        setError(`Erkennungsqualität ist niedrig (${result.validation.score}%):\n${summary}\n\nKlicken Sie auf "Trotzdem übernehmen" um das Rezept dennoch zu importieren.`);
        // Don't import automatically - wait for user confirmation
        return;
      }
      
      onImport(result.recipe);
    } catch (err) {
      setError(err.message);
    }
  };
  
  // Force import despite low quality
  const forceImport = () => {
    setError('');
    try {
      const result = parseOcrTextSmart(ocrText, language);
      onImport(result.recipe);
    } catch (err) {
      setError(err.message);
    }
  };

  // Reset to start
  const handleReset = () => {
    stopCamera();
    setStep('upload');
    setImageBase64('');
    setCrop(null);
    setCompletedCrop(null);
    setOcrText('');
    setError('');
    setAiResult(null);
    setOcrMode('ai');
    setValidationResult(null);
  };

  // Handle cancel
  const handleCancel = () => {
    stopCamera();
    onCancel();
  };

  // Convert AI result to text format for editing
  const convertAiResultToText = () => {
    if (!aiResult) return;

    let text = '';
    
    // Title
    if (aiResult.title) {
      text += aiResult.title + '\n\n';
    }

    // Meta information
    if (aiResult.servings) {
      text += `Portionen: ${aiResult.servings}\n`;
    }
    if (aiResult.prepTime || aiResult.cookTime) {
      const time = aiResult.prepTime || aiResult.cookTime;
      text += `Zeit: ${time}\n`;
    }
    if (aiResult.difficulty) {
      text += `Schwierigkeit: ${aiResult.difficulty}\n`;
    }
    if (aiResult.cuisine) {
      text += `Kulinarik: ${aiResult.cuisine}\n`;
    }
    if (aiResult.category) {
      text += `Kategorie: ${aiResult.category}\n`;
    }
    text += '\n';

    // Ingredients
    if (aiResult.ingredients && aiResult.ingredients.length > 0) {
      text += 'Zutaten\n\n';
      aiResult.ingredients.forEach(ingredient => {
        text += ingredient + '\n';
      });
      text += '\n';
    }

    // Steps
    if (aiResult.steps && aiResult.steps.length > 0) {
      text += 'Zubereitung\n\n';
      aiResult.steps.forEach((step, index) => {
        text += `${index + 1}. ${step}\n`;
      });
      text += '\n';
    }

    // Notes
    if (aiResult.notes) {
      text += `Notizen: ${aiResult.notes}\n`;
    }

    setOcrText(text.trim());
    setStep('edit');
  };

  return (
    <div className="modal-overlay">
      <div className="ocr-modal">
        <div className="ocr-modal-header">
          <h2>Rezept scannen</h2>
          <button className="close-button" onClick={handleCancel}>✕</button>
        </div>

        <div className="ocr-modal-content">
          {/* Upload Step */}
          {step === 'upload' && (
            <div className="upload-section">
              <p className="ocr-instructions">
                Fotografieren Sie ein Rezept oder laden Sie ein Bild hoch
              </p>

              {!cameraActive && (
                <div className="upload-buttons">
                  <button className="camera-button" onClick={startCamera}>
                    📷 Kamera starten
                  </button>
                  <label htmlFor="imageUpload" className="upload-button">
                    📁 Bild hochladen
                  </label>
                  <input
                    type="file"
                    id="imageUpload"
                    accept="image/jpeg,image/jpg,image/png"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </div>
              )}

              {cameraActive && (
                <div className="camera-section">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="camera-video"
                  />
                  <div className="camera-controls">
                    <button className="capture-button" onClick={capturePhoto}>
                      📸 Foto aufnehmen
                    </button>
                    <button className="stop-camera-button" onClick={stopCamera}>
                      ✕ Abbrechen
                    </button>
                  </div>
                </div>
              )}

              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
          )}

          {/* Crop Step */}
          {step === 'crop' && imageBase64 && (
            <div className="crop-section">
              <p className="ocr-instructions">
                Wählen Sie den Bereich aus, der gescannt werden soll (optional)
              </p>

              <div className="language-selector">
                <label>Sprache:</label>
                <div className="language-tabs">
                  <button
                    className={`language-tab ${language === 'de' ? 'active' : ''}`}
                    onClick={() => setLanguage('de')}
                  >
                    🇩🇪 Deutsch
                  </button>
                  <button
                    className={`language-tab ${language === 'en' ? 'active' : ''}`}
                    onClick={() => setLanguage('en')}
                  >
                    🇬🇧 English
                  </button>
                </div>
              </div>

              <div className="crop-container">
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                >
                  <img
                    ref={imgRef}
                    src={imageBase64}
                    alt="Zu scannendes Bild"
                    style={{ maxWidth: '100%' }}
                  />
                </ReactCrop>
              </div>
            </div>
          )}

          {/* Scan Step */}
          {step === 'scan' && scanning && (
            <div className="scan-section">
              <p className="ocr-instructions">
                {ocrMode === 'ai' ? '🤖 Analysiere Rezept mit KI...' : 'Scanne Text...'}
              </p>
              <div className="progress-container">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
                <p className="progress-text">{scanProgress}%</p>
              </div>
            </div>
          )}

          {/* AI Result Step */}
          {step === 'ai-result' && aiResult && (
            <div className="ai-result-section">
              <p className="ocr-instructions">
                KI-Analyse abgeschlossen - Überprüfen Sie die erkannten Daten
              </p>

              <h3 className="ai-result-title">{aiResult.title || 'Unbenanntes Rezept'}</h3>

              {(aiResult.servings || aiResult.prepTime || aiResult.cookTime || aiResult.difficulty || aiResult.cuisine || aiResult.category) && (
                <div className="ai-result-meta">
                  {aiResult.servings && (
                    <span className="ai-meta-badge">👥 {aiResult.servings} Portionen</span>
                  )}
                  {(aiResult.prepTime || aiResult.cookTime) && (
                    <span className="ai-meta-badge">⏱️ {aiResult.prepTime || aiResult.cookTime}</span>
                  )}
                  {aiResult.difficulty && (
                    <span className="ai-meta-badge">📊 Schwierigkeit: {aiResult.difficulty}/5</span>
                  )}
                  {aiResult.cuisine && (
                    <span className="ai-meta-badge">🌍 {aiResult.cuisine}</span>
                  )}
                  {aiResult.category && (
                    <span className="ai-meta-badge">📂 {aiResult.category}</span>
                  )}
                </div>
              )}

              {aiResult.ingredients && aiResult.ingredients.length > 0 && (
                <div className="ai-result-ingredients">
                  <h4>Zutaten</h4>
                  <ul>
                    {aiResult.ingredients.map((ingredient, index) => (
                      <li key={index}>{ingredient}</li>
                    ))}
                  </ul>
                </div>
              )}

              {aiResult.steps && aiResult.steps.length > 0 && (
                <div className="ai-result-steps">
                  <h4>Zubereitung</h4>
                  <ol>
                    {aiResult.steps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              {aiResult.tags && aiResult.tags.length > 0 && (
                <div className="ai-result-tags">
                  <h4>Tags</h4>
                  <div className="ai-tags-list">
                    {aiResult.tags.map((tag, index) => (
                      <span key={index} className="ai-tag">{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              <button className="edit-text-button" onClick={convertAiResultToText}>
                ✏️ Als Text bearbeiten
              </button>
            </div>
          )}

          {/* Edit Step */}
          {step === 'edit' && (
            <div className="edit-section">
              <p className="ocr-instructions">
                Überprüfen und bearbeiten Sie den erkannten Text
              </p>

              {/* Validation Results */}
              {validationResult && (
                <div className={`validation-info ${validationResult.score >= 70 ? 'validation-good' : validationResult.score >= 50 ? 'validation-moderate' : 'validation-poor'}`}>
                  <h4>Erkennungsqualität: {validationResult.score}%</h4>
                  {validationResult.warnings.length > 0 && (
                    <div className="validation-warnings">
                      <strong>⚠️ Hinweise:</strong>
                      <ul>
                        {validationResult.warnings.map((warning, idx) => (
                          <li key={idx}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {validationResult.suggestions.length > 0 && (
                    <div className="validation-suggestions">
                      <strong>💡 Verbesserungsvorschläge:</strong>
                      <ul>
                        {validationResult.suggestions.slice(0, 3).map((suggestion, idx) => (
                          <li key={idx}>{suggestion}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <textarea
                className="ocr-textarea"
                value={ocrText}
                onChange={(e) => setOcrText(e.target.value)}
                placeholder="Erkannter Text..."
                rows="15"
              />

              <button className="new-scan-button" onClick={handleReset}>
                ↻ Neuer Scan
              </button>
            </div>
          )}

          {error && (
            <div className="ocr-error">
              {error}
              {validationResult && validationResult.score < 50 && (
                <button className="force-import-button" onClick={forceImport}>
                  Trotzdem übernehmen
                </button>
              )}
            </div>
          )}
        </div>

        <div className="ocr-modal-actions">
          <button className="cancel-button" onClick={handleCancel}>
            Abbrechen
          </button>
          
          {step === 'crop' && (
            <button className="scan-button" onClick={applyCrop}>
              Scannen
            </button>
          )}
          
          {(step === 'edit' || step === 'ai-result') && (
            <button className="import-button" onClick={handleImport}>
              Übernehmen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default OcrScanModal;
