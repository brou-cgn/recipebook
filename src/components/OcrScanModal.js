import React, { useState, useRef, useEffect } from 'react';
import './OcrScanModal.css';
import { buildRecipeFromAiResult } from '../utils/ocrParser';
import { fileToBase64 } from '../utils/imageUtils';
import { recognizeRecipeWithAI } from '../utils/aiOcrService';
import { useRecipeImportQueue } from '../contexts/RecipeImportQueueContext';

const MAX_CAMERA_PHOTOS = 10;
// Max number of images processed at the same time during a batch scan.
// Keeps the OCR calls independent (each image is unrelated to the others)
// while staying well under the Cloud Function's per-user rate limit.
const BATCH_CONCURRENCY = 3;

// Remove duplicate strings using Levenshtein similarity
function stringSimilarity(s1, s2) {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(s1, s2) {
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
}

function removeDuplicates(items) {
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
}

// Combine multiple per-image AI OCR results into one recipe
function mergeAiResults(results) {
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
}

// Runs AI OCR on a batch of images (concurrently, up to BATCH_CONCURRENCY at
// once) and returns the merged recipe. Passed as the `run` function to
// enqueueImportJob() so it executes in the background, after the modal has
// already closed.
async function runPhotoScanImport(images, language, onProgress) {
  const total = images.length;
  const results = new Array(total);
  const progressPerImage = new Array(total).fill(0);

  const updateOverall = () => {
    const sum = progressPerImage.reduce((a, b) => a + b, 0);
    onProgress(Math.round(sum / total));
  };

  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < total) {
      const i = nextIndex++;
      try {
        const result = await recognizeRecipeWithAI(images[i], {
          language,
          provider: 'gemini',
          onProgress: (progress) => {
            progressPerImage[i] = progress;
            updateOverall();
          },
        });
        results[i] = result;
      } catch (err) {
        results[i] = { error: err.message };
      }
      progressPerImage[i] = 100;
      updateOverall();
    }
  };

  const workerCount = Math.min(BATCH_CONCURRENCY, total);
  await Promise.all(Array.from({ length: workerCount }, worker));

  const merged = mergeAiResults(results);
  return buildRecipeFromAiResult(merged);
}

// initialImage: single image that triggers an immediate background scan (takes precedence over initialImages)
// initialImages: array of base64 images to pre-fill the image-preview step
function OcrScanModal({ onCancel, initialImage = '', initialImages = [], userId = '', importContext = {} }) {
  // initialImage queues immediately (no step UI shown); initialImages shows the
  // image-preview step; neither → upload step
  const [step, setStep] = useState(initialImage ? 'queuing' : (initialImages.length > 0 ? 'image-preview' : 'upload'));
  const [language, setLanguage] = useState('de'); // 'de' or 'en'
  const [error, setError] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [uploadedImages, setUploadedImages] = useState(initialImages.length > 0 ? [...initialImages] : []);
  const [capturedPhotos, setCapturedPhotos] = useState([]);

  const { enqueueImportJob } = useRecipeImportQueue();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const initialScanTriggered = useRef(false);
  const addMoreInputRef = useRef(null);

  // Queue a background scan for the given images and close the modal
  // immediately; the recipe is saved with a TEMP flag once analysis
  // finishes and shows up for review on "Neues Rezept hinzufügen".
  const queuePhotoScan = (images) => {
    enqueueImportJob({
      label: images.length === 1 ? 'Foto-Scan' : `Foto-Scan (${images.length} Bilder)`,
      userId,
      context: importContext,
      run: (onProgress) => runPhotoScanImport(images, language, onProgress),
    });
    stopCamera();
    onCancel();
  };

  // When initialImage is provided, queue the scan automatically on mount
  useEffect(() => {
    if (initialImage && !initialScanTriggered.current) {
      initialScanTriggered.current = true;
      queuePhotoScan([initialImage]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImage]);

  // Set video srcObject once the video element is in the DOM (after cameraActive becomes true)
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraActive]);

  // Handle file upload (single or multiple) – shows preview before analysis
  const handleMultiFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    e.target.value = '';

    setError('');
    try {
      const base64s = await Promise.all(files.map(f => fileToBase64(f)));
      setUploadedImages(prev => [...prev, ...base64s]);
      setStep('image-preview');
    } catch (err) {
      setError(err.message);
    }
  };

  // Add more images to an existing selection in the preview step
  const handleAddMoreImages = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    e.target.value = '';

    setError('');
    try {
      const base64s = await Promise.all(files.map(f => fileToBase64(f)));
      setUploadedImages(prev => [...prev, ...base64s]);
    } catch (err) {
      setError(err.message);
    }
  };

  // Remove a single image from the preview selection
  const handleRemoveUploadedImage = (index) => {
    setUploadedImages(prev => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        setStep('upload');
      }
      return next;
    });
  };

  // Queue analysis on all selected uploaded images
  const startUploadedAnalysis = () => {
    if (uploadedImages.length === 0) return;
    queuePhotoScan([...uploadedImages]);
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

  // Queue analysis on all captured camera photos
  const startBatchAnalysis = () => {
    if (capturedPhotos.length === 0) return;
    queuePhotoScan([...capturedPhotos]);
  };

  // Stop camera
  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  // Handle cancel
  const handleCancel = () => {
    stopCamera();
    onCancel();
  };

  return (
    <div className="modal-overlay">
      <div className="ocr-modal">
        <div className="ocr-modal-header">
          <h2>Rezept scannen</h2>
          <button className="close-button" onClick={handleCancel}>×</button>
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
                    Deutsch
                  </button>
                  <button
                    className={`language-tab ${language === 'en' ? 'active' : ''}`}
                    onClick={() => setLanguage('en')}
                  >
                    English
                  </button>
                </div>
              </div>

              {!cameraActive && (
                <div className="upload-buttons">
                  <button className="camera-button" onClick={startCamera}>
                    Kamera starten
                  </button>
                  <label htmlFor="imageUpload" className="upload-button">
                    Bild(er) hochladen
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
                      {capturedPhotos.length > 0 ? 'Weiteres Foto aufnehmen' : 'Foto aufnehmen'}
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
                          Löschen
                        </button>
                      </>
                    )}
                    <button
                      className="stop-camera-button"
                      onClick={cancelCamera}
                      aria-label="Kamera abbrechen"
                    >
                      × Abbrechen
                    </button>
                  </div>
                </div>
              )}

              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
          )}

          {/* Image Preview Step – review & extend selection before analysis */}
          {step === 'image-preview' && (
            <div className="image-preview-section">
              <p className="ocr-instructions">
                {uploadedImages.length} Bild{uploadedImages.length !== 1 ? 'er' : ''} ausgewählt – Weitere hinzufügen oder Analyse starten
              </p>

              <div className="image-preview-grid">
                {uploadedImages.map((src, index) => (
                  <div key={index} className="image-preview-item">
                    <img
                      src={src}
                      alt={`Bild ${index + 1}`}
                      className="image-preview-thumb"
                    />
                    <button
                      className="image-preview-remove"
                      onClick={() => handleRemoveUploadedImage(index)}
                      aria-label={`Bild ${index + 1} entfernen`}
                      title="Bild entfernen"
                    >
                      ×
                    </button>
                    <span className="image-preview-number">{index + 1}</span>
                  </div>
                ))}

                <label className="image-preview-add" title="Weitere Bilder hinzufügen">
                  <span>+</span>
                  <input
                    ref={addMoreInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png"
                    multiple
                    onChange={handleAddMoreImages}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              <div className="image-preview-actions">
                <button
                  className="start-analysis-button"
                  onClick={startUploadedAnalysis}
                  aria-label={`Analyse starten für ${uploadedImages.length} Bild${uploadedImages.length !== 1 ? 'er' : ''}`}
                >
                  ✓ Analyse starten ({uploadedImages.length})
                </button>
                <button
                  className="new-scan-button"
                  onClick={() => setStep('upload')}
                >
                  Zurück
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="ocr-error">
              {error}
            </div>
          )}
        </div>

        <div className="ocr-modal-actions">
          <button className="cancel-button" onClick={handleCancel}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}

export default OcrScanModal;
