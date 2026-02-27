import React, { useState, useRef, useEffect } from 'react';
import './OcrScanModal.css';
import { recognizeText } from '../utils/ocrService';
import { parseOcrTextSmart, extractKulinarikFromTags } from '../utils/ocrParser';
import { getValidationSummary } from '../utils/ocrValidation';
import { fileToBase64 } from '../utils/imageUtils';
import { recognizeRecipeWithAI } from '../utils/aiOcrService';

const MAX_CAMERA_PHOTOS = 10;

function OcrScanModal({ onImport, onCancel, initialImage = '' }) {
  const [step, setStep] = useState(initialImage ? 'scan' : 'upload'); // 'upload', 'scan', 'edit', 'ai-result', 'batch-processing'
  // imageBase64 tracks the current image but OCR functions receive it directly as parameter
  // This state is maintained for potential future features (e.g., image preview, retry)
  // eslint-disable-next-line no-unused-vars
  const [imageBase64, setImageBase64] = useState(initialImage);
  const [language, setLanguage] = useState('de'); // 'de' or 'en'
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [ocrText, setOcrText] = useState('');
  const [error, setError] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [ocrMode, setOcrMode] = useState('ai'); // 'standard' or 'ai'
  const [aiResult, setAiResult] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [remainingScans, setRemainingScans] = useState(null);
  const [aiFailed, setAiFailed] = useState(false);
  const [lastImageForRetry, setLastImageForRetry] = useState(null);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [allOcrResults, setAllOcrResults] = useState([]);
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const initialScanTriggered = useRef(false);

  // When initialImage is provided, start OCR automatically
  // We only want this to run once on mount, not when performOcr changes
  useEffect(() => {
    if (initialImage && !initialScanTriggered.current) {
      initialScanTriggered.current = true;
      performOcr(initialImage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImage]);

  // Set video srcObject once the video element is in the DOM (after cameraActive becomes true)
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraActive]);
  // Handle file upload
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setError('');
    try {
      const base64 = await fileToBase64(file);
      setImageBase64(base64);
      setStep('scan');
      await performOcr(base64);
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle multi-file upload (batch mode)
  const handleMultiFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    if (files.length === 1) {
      handleFileUpload(e);
      return;
    }

    setError('');
    setUploadedImages(files);
    setCurrentImageIndex(0);
    setAllOcrResults([]);
    setStep('batch-processing');
    await processBatchImages(files);
  };

  // Process multiple images sequentially
  const processBatchImages = async (files) => {
    const results = [];

    for (let i = 0; i < files.length; i++) {
      setCurrentImageIndex(i);
      setScanProgress(0);

      try {
        const base64 = await fileToBase64(files[i]);

        if (ocrMode === 'ai') {
          const result = await recognizeRecipeWithAI(base64, {
            language,
            provider: 'gemini',
            onProgress: (progress) => setScanProgress(progress)
          });
          results.push(result);
        } else {
          const langCode = language === 'de' ? 'deu' : 'eng';
          const result = await recognizeText(base64, langCode,
            (progress) => setScanProgress(progress)
          );
          results.push({ text: result.text });
        }
      } catch (err) {
        console.error(`Error processing image ${i + 1}:`, err);
        results.push({ error: err.message });
      }
    }

    setAllOcrResults(results);

    try {
      const merged = mergeOcrResults(results, ocrMode);

      if (ocrMode === 'ai') {
        setAiResult(merged);
        setStep('ai-result');
      } else {
        setOcrText(merged.text);
        setStep('edit');
      }
    } catch (err) {
      setError(err.message);
      setStep('upload');
    }
  };

  // Combine multiple OCR results into one recipe
  const mergeOcrResults = (results, mode) => {
    if (mode === 'ai') {
      return mergeAiResults(results);
    } else {
      return mergeTextResults(results);
    }
  };

  const mergeAiResults = (results) => {
    const validResults = results.filter(r => !r.error);

    if (validResults.length === 0) {
      throw new Error('Keine gültigen OCR-Ergebnisse gefunden');
    }

    const merged = { ...validResults[0] };

    const allIngredients = validResults.flatMap(r => r.ingredients || []);
    merged.ingredients = removeDuplicates(allIngredients);

    const allSteps = validResults.flatMap(r => r.steps || []);
    merged.steps = removeDuplicates(allSteps);

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

  const mergeTextResults = (results) => {
    const validResults = results.filter(r => !r.error && r.text);

    if (validResults.length === 0) {
      throw new Error('Keine gültigen OCR-Ergebnisse gefunden');
    }

    const combinedText = validResults
      .map((r, i) => `--- Bild ${i + 1} ---\n${r.text}`)
      .join('\n\n');

    return { text: combinedText };
  };

  // Remove duplicate strings using Levenshtein similarity
  const removeDuplicates = (items) => {
    if (!items || items.length === 0) return [];

    const unique = [];

    for (const item of items) {
      const normalized = item.toLowerCase().trim();
      const isDuplicate = unique.some(existing =>
        stringSimilarity(existing.toLowerCase().trim(), normalized) > 0.8
      );

      if (!isDuplicate) {
        unique.push(item);
      }
    }

    return unique;
  };

  const stringSimilarity = (s1, s2) => {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1.0;

    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  };

  const levenshteinDistance = (s1, s2) => {
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  };

  // Start camera
  const startCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      setError(`Kamera-Zugriff fehlgeschlagen: ${err.message}. Bitte erlauben Sie den Kamera-Zugriff oder verwenden Sie den Datei-Upload.`);
    }
  };

  // Capture photo from camera and add to capturedPhotos array
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (capturedPhotos.length >= MAX_CAMERA_PHOTOS) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    const base64 = canvas.toDataURL('image/png');
    setCapturedPhotos(prev => [...prev, base64]);
  };

  // Remove the last captured photo
  const removeLastPhoto = () => {
    setCapturedPhotos(prev => prev.slice(0, -1));
  };

  // Cancel camera: stop camera and discard all captured photos
  const cancelCamera = () => {
    stopCamera();
    setCapturedPhotos([]);
  };

  // Process an array of base64 images sequentially (camera batch).
  // Similar to processBatchImages(), but accepts base64 strings directly
  // instead of File objects, avoiding an extra fileToBase64 conversion step.
  const processBase64Batch = async (base64Images) => {
    const results = [];

    for (let i = 0; i < base64Images.length; i++) {
      setCurrentImageIndex(i);
      setScanProgress(0);

      try {
        const base64 = base64Images[i];

        if (ocrMode === 'ai') {
          const result = await recognizeRecipeWithAI(base64, {
            language,
            provider: 'gemini',
            onProgress: (progress) => setScanProgress(progress)
          });
          results.push(result);
        } else {
          const langCode = language === 'de' ? 'deu' : 'eng';
          const result = await recognizeText(base64, langCode,
            (progress) => setScanProgress(progress)
          );
          results.push({ text: result.text });
        }
      } catch (err) {
        console.error(`Error processing photo ${i + 1}:`, err);
        results.push({ error: err.message });
      }
    }

    setAllOcrResults(results);

    try {
      const merged = mergeOcrResults(results, ocrMode);

      if (ocrMode === 'ai') {
        setAiResult(merged);
        setStep('ai-result');
      } else {
        setOcrText(merged.text);
        setStep('edit');
      }
    } catch (err) {
      setError(err.message);
      setStep('upload');
    }
  };

  // Start batch OCR analysis on all captured camera photos
  const startBatchAnalysis = async () => {
    if (capturedPhotos.length === 0) return;

    const photos = [...capturedPhotos];
    stopCamera();
    setCurrentImageIndex(0);
    setAllOcrResults([]);
    setUploadedImages(photos);
    setStep('batch-processing');
    await processBase64Batch(photos);
  };

  // Stop camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
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
    setAiFailed(false);

    try {

    console.log('DEBUG performOcr called, ocrMode:', ocrMode);
    console.log('DEBUG performOcr called, imageToProcess length:', imageToProcess?.length);
	
      if (ocrMode === 'ai') {
        // AI OCR using Gemini Vision
        const result = await recognizeRecipeWithAI(imageToProcess, {
          language,
          provider: 'gemini',
          onProgress: (progress) => setScanProgress(progress)
        });

        // Update remaining scans if provided by the Cloud Function
        if (result.remainingScans !== undefined) {
          setRemainingScans(result.remainingScans);
        }

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
      const isQuotaError = err.message && (
        err.message.includes('Tageslimit') ||
        err.message.includes('resource-exhausted') ||
        err.message.includes('quota')
      );
      setError('OCR fehlgeschlagen: ' + err.message);
      if (ocrMode === 'ai') {
        setAiFailed(true);
        setLastImageForRetry(imageToProcess);
      }
      if (!isQuotaError) {
        setStep('upload');
      }
    } finally {
      setScanning(false);
      setScanProgress(0);
    }
  };

  // Fall back to standard OCR after AI failure
  const fallbackToStandardOcr = async () => {
    if (!lastImageForRetry) return;
    setOcrMode('standard');
    setError('');
    setAiFailed(false);
    setScanning(true);
    setScanProgress(0);
    setStep('scan');
    try {
      const langCode = language === 'de' ? 'deu' : 'eng';
      const result = await recognizeText(
        lastImageForRetry,
        langCode,
        (progress) => setScanProgress(progress)
      );
      setOcrText(result.text);
      setStep('edit');
    } catch (err) {
      setError('OCR fehlgeschlagen: ' + err.message);
      setStep('upload');
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
    setOcrText('');
    setError('');
    setAiResult(null);
    setOcrMode('ai');
    setValidationResult(null);
    setAiFailed(false);
    setLastImageForRetry(null);
    setUploadedImages([]);
    setCurrentImageIndex(0);
    setAllOcrResults([]);
    setCapturedPhotos([]);
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

              {remainingScans !== null && ocrMode === 'ai' && (
                <div className={`scan-quota-info ${remainingScans < 5 ? 'scan-quota-warning' : ''}`}>
                  {remainingScans < 5
                    ? `⚠️ Noch ${remainingScans} KI-Scans heute verfügbar. Danach Standard-OCR verwenden.`
                    : `🤖 ${remainingScans} KI-Scans heute noch verfügbar`
                  }
                </div>
              )}

              {!cameraActive && (
                <div className="upload-buttons">
                  <button className="camera-button" onClick={startCamera}>
                    📷 Kamera starten
                  </button>
                  <label htmlFor="imageUpload" className="upload-button">
                    📁 Bild(er) hochladen
                  </label>
                  <input
                    type="file"
                    id="imageUpload"
                    accept="image/jpeg,image/jpg,image/png"
                    multiple
                    onChange={handleMultiFileUpload}
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

                  {capturedPhotos.length > 0 && (
                    <div className="captured-photos-preview">
                      <p className="captured-photos-count">
                        {capturedPhotos.length} Foto{capturedPhotos.length !== 1 ? 's' : ''} aufgenommen
                        {capturedPhotos.length >= MAX_CAMERA_PHOTOS && (
                          <span className="captured-photos-max"> (Maximum erreicht)</span>
                        )}
                      </p>
                      <div className="captured-thumbnails">
                        {capturedPhotos.map((photo, index) => (
                          <div key={index} className="thumbnail-wrapper">
                            <img
                              src={photo}
                              alt={`Foto ${index + 1}`}
                              className="photo-thumbnail"
                            />
                            <span className="thumbnail-number">{index + 1}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="camera-controls">
                    <button
                      className="capture-button"
                      onClick={capturePhoto}
                      disabled={capturedPhotos.length >= MAX_CAMERA_PHOTOS}
                      aria-label="Foto aufnehmen"
                    >
                      📸 {capturedPhotos.length > 0 ? 'Weiteres Foto aufnehmen' : 'Foto aufnehmen'}
                    </button>
                    {capturedPhotos.length > 0 && (
                      <>
                        <button
                          className="start-analysis-button"
                          onClick={startBatchAnalysis}
                          aria-label={`Analyse starten für ${capturedPhotos.length} Foto${capturedPhotos.length !== 1 ? 's' : ''}`}
                        >
                          ✓ Analyse starten ({capturedPhotos.length})
                        </button>
                        <button
                          className="remove-last-photo-button"
                          onClick={removeLastPhoto}
                          aria-label="Letztes Foto löschen"
                        >
                          🗑️ Letztes löschen
                        </button>
                      </>
                    )}
                    <button
                      className="stop-camera-button"
                      onClick={cancelCamera}
                      aria-label="Kamera abbrechen"
                    >
                      ✕ Abbrechen
                    </button>
                  </div>
                </div>
              )}

              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
          )}

          {/* Scan Step */}
          {step === 'scan' && scanning && (
            <div className="scan-section">
              <p className="ocr-instructions">
                {ocrMode === 'ai' ? 'Analysiere Rezept...' : 'Scanne Text...'}
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

          {/* Batch Processing Step */}
          {step === 'batch-processing' && (
            <div className="batch-processing-section">
              <p className="ocr-instructions">
                Verarbeite {uploadedImages.length} Bilder...
              </p>

              <div className="batch-progress">
                <div className="batch-image-progress">
                  Bild {currentImageIndex + 1} von {uploadedImages.length}
                </div>

                <div className="progress-container">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>
                  <p className="progress-text">{scanProgress}%</p>
                </div>

                <div className="processed-images">
                  {uploadedImages.map((_, index) => (
                    <div
                      key={index}
                      className={`image-indicator ${
                        index < currentImageIndex ? 'completed' :
                        index === currentImageIndex ? 'processing' :
                        'pending'
                      }`}
                    >
                      {index < currentImageIndex ? '✓' : index === currentImageIndex ? '⏳' : '○'}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* AI Result Step */}
          {step === 'ai-result' && aiResult && (
            <div className={`ai-result-section${allOcrResults.length > 1 ? ' merged' : ''}`}>
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
              {aiFailed && (
                <button className="fallback-ocr-button" onClick={fallbackToStandardOcr}>
                  📝 Mit Standard-OCR fortfahren
                </button>
              )}
            </div>
          )}
        </div>

        <div className="ocr-modal-actions">
          <button className="cancel-button" onClick={handleCancel}>
            Abbrechen
          </button>
          
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
