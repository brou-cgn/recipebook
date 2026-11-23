import React, { useState, useRef, useEffect } from 'react';
import './ModalOverlay.css';
import './OcrScanModal.css';
import Button from './Button';
import RowIconButton from './RowIconButton';
import CloseThinIcon from './icons/CloseThinIcon';
import { fileToBase64 } from '../utils/imageUtils';
import { runPhotoScanImport } from '../utils/importRunners';
import { useRecipeImportQueue } from '../contexts/RecipeImportQueueContext';
import { useTexte } from '../contexts/SpracheContext';
import { ergebnisText } from '../i18n/texte';
import rezeptimportTexte from '../i18n/texte/rezeptimport';
import allgemeinTexte from '../i18n/texte/allgemein';

const MAX_CAMERA_PHOTOS = 10;
const MAX_UPLOAD_PAGES = 8;
const UPLOAD_ACCEPT = 'image/jpeg,image/jpg,image/png,image/heic,image/heif,.heic,.heif';
// Das Rezept entsteht immer auf Deutsch (Entscheidung „Primärsprache“, Tech-Check F23): Die KI erkennt die Sprache im
// Bild selbst und übersetzt. Eine Sprachwahl im Dialog gibt es deshalb nicht mehr.
const SCAN_SPRACHE = 'de';

// initialImage: single image that triggers an immediate background scan (takes precedence over initialImages)
// initialImages: array of base64 images to pre-fill the image-preview step
function OcrScanModal({ onCancel, onImported, initialImage = '', initialImages = [], userId = '', importContext = {} }) {
  // initialImage queues immediately (no step UI shown); initialImages shows the
  // image-preview step; neither → upload step
  const [step, setStep] = useState(initialImage ? 'queuing' : (initialImages.length > 0 ? 'image-preview' : 'upload'));
  const [error, setError] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [uploadedImages, setUploadedImages] = useState(initialImages.length > 0 ? [...initialImages] : []);
  const [capturedPhotos, setCapturedPhotos] = useState([]);

  const { enqueueImportJob } = useRecipeImportQueue();
  // Texte des Rezept-Imports (Mehrsprachigkeit PR 6i); die Bezeichnung „Foto-Scan“ bleibt deutsch gespeichert
  const t = useTexte(rezeptimportTexte);
  const tAllgemein = useTexte(allgemeinTexte);
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
      run: (onProgress, jobMeta) => runPhotoScanImport(images, SCAN_SPRACHE, onProgress, jobMeta),
      source: { type: 'photo', images, language: SCAN_SPRACHE },
    });
    stopCamera();
    // Once the job is queued, hand control back to whoever wants to leave
    // the empty add-recipe form (e.g. return to the page the user came
    // from) rather than just closing this modal on top of it.
    (onImported || onCancel)();
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
      setUploadedImages(prev => {
        const combined = [...prev, ...base64s];
        if (combined.length > MAX_UPLOAD_PAGES) {
          setError(t('maxSeiten', { anzahl: MAX_UPLOAD_PAGES }));
        }
        return combined.slice(0, MAX_UPLOAD_PAGES);
      });
      setStep('image-preview');
    } catch (err) {
      // Meldung von fileToBase64 über ihren Schlüssel (Mehrsprachigkeit PR 6o)
      setError(ergebnisText(err, tAllgemein));
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
      setUploadedImages(prev => {
        const combined = [...prev, ...base64s];
        if (combined.length > MAX_UPLOAD_PAGES) {
          setError(t('maxSeiten', { anzahl: MAX_UPLOAD_PAGES }));
        }
        return combined.slice(0, MAX_UPLOAD_PAGES);
      });
    } catch (err) {
      setError(ergebnisText(err, tAllgemein));
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
      setError(t('kameraFehler', { fehler: err.message }));
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
          <div className="ocr-modal-heading">
            <span className="ocr-step-label">{t('schrittVon', { schritt: step === 'image-preview' ? 2 : 1 })}</span>
            <h2>{t('scanTitel')}</h2>
          </div>
          <RowIconButton label={tAllgemein('schliessen')} onClick={handleCancel}>
            <CloseThinIcon />
          </RowIconButton>
        </div>

        <div className="ocr-modal-content">
          {/* Upload Step */}
          {step === 'upload' && (
            <div className="upload-section">
              <p className="ocr-instructions">
                {t('scanAnleitung')}
              </p>

              {!cameraActive && (
                <div className="upload-buttons">
                  <Button onClick={startCamera}>
                    {t('kameraStarten')}
                  </Button>
                  {/* Echter Knopf statt <label> im Knopf-Aussehen: per Tastatur erreichbar */}
                  <Button onClick={() => document.getElementById('imageUpload')?.click()}>
                    {t('bilderHochladen')}
                  </Button>
                  <input
                    type="file"
                    id="imageUpload"
                    accept={UPLOAD_ACCEPT}
                    multiple
                    onChange={handleMultiFileUpload}
                    aria-label={t('bilderHochladen')}
                    tabIndex={-1}
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
                        {t('fotosAufgenommen', { anzahl: capturedPhotos.length })}
                        {capturedPhotos.length >= MAX_CAMERA_PHOTOS && (
                          <span className="captured-photos-max"> {t('maximumErreicht')}</span>
                        )}
                      </p>
                      <div className="captured-thumbnails">
                        {capturedPhotos.map((photo, index) => (
                          <div key={index} className="thumbnail-wrapper">
                            <img
                              src={photo}
                              alt={t('fotoNummer', { nummer: index + 1 })}
                              className="photo-thumbnail"
                            />
                            <span className="thumbnail-number">{index + 1}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Abbrechen links, der Haupt-Knopf rechts: erst „Foto aufnehmen“, sobald Fotos da
                      sind „Analyse starten“ (höchstens ein Haupt-Knopf) */}
                  <div className="camera-controls">
                    <Button onClick={cancelCamera}>
                      {t('kameraAbbrechen')}
                    </Button>
                    {capturedPhotos.length > 0 && (
                      <Button onClick={removeLastPhoto} aria-label={t('letztesFotoLoeschen')}>
                        {tAllgemein('loeschen')}
                      </Button>
                    )}
                    <Button
                      variant={capturedPhotos.length > 0 ? 'secondary' : 'primary'}
                      onClick={capturePhoto}
                      disabled={capturedPhotos.length >= MAX_CAMERA_PHOTOS}
                      aria-label={t('fotoAufnehmen')}
                    >
                      {capturedPhotos.length > 0 ? t('weiteresFoto') : t('fotoAufnehmen')}
                    </Button>
                    {capturedPhotos.length > 0 && (
                      <Button
                        variant="primary"
                        onClick={startBatchAnalysis}
                        aria-label={t('analyseFuerFotos', { anzahl: capturedPhotos.length })}
                      >
                        {t('analyseStarten', { anzahl: capturedPhotos.length })}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
          )}

          {/* Image Preview Step – review & extend selection before analysis */}
          {step === 'image-preview' && (
            <div className="image-preview-section">
              <div className="ocr-status-row">
                <span className="ocr-status-dot" />
                <div className="ocr-status-text">
                  <div className="ocr-status-title">
                    {t('bilderAusgewaehlt', { anzahl: uploadedImages.length })}
                  </div>
                  <div className="ocr-status-subtitle">{t('weitereSeitenOderAnalyse')}</div>
                </div>
              </div>

              <div className="image-preview-grid">
                {uploadedImages.map((src, index) => (
                  <div key={index} className="image-preview-item">
                    <img
                      src={src}
                      alt={t('bildNummer', { nummer: index + 1 })}
                      className="image-preview-thumb"
                    />
                    <span className="image-preview-number">{t('seiteNummer', { nummer: index + 1 })}</span>
                    <button
                      className="image-preview-remove"
                      onClick={() => handleRemoveUploadedImage(index)}
                      aria-label={t('bildNummerEntfernen', { nummer: index + 1 })}
                      title={t('bildEntfernen')}
                    >
                      ×
                    </button>
                  </div>
                ))}

                {uploadedImages.length < MAX_UPLOAD_PAGES && (
                  <label className="image-preview-add" title={t('weitereSeiten')}>
                    <span className="image-preview-add-icon">+</span>
                    <span className="image-preview-add-label">{t('seite')}</span>
                    <input
                      ref={addMoreInputRef}
                      type="file"
                      accept={UPLOAD_ACCEPT}
                      multiple
                      onChange={handleAddMoreImages}
                      style={{ display: 'none' }}
                    />
                  </label>
                )}
              </div>

              <p className="ocr-file-hint">{t('dateiHinweis', { anzahl: MAX_UPLOAD_PAGES })}</p>

              <div className="image-preview-actions">
                <Button onClick={handleCancel}>
                  {tAllgemein('abbrechen')}
                </Button>
                <Button
                  variant="primary"
                  onClick={startUploadedAnalysis}
                  aria-label={t('analyseFuerBilder', { anzahl: uploadedImages.length })}
                >
                  {t('analyseStarten', { anzahl: uploadedImages.length })}
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="ocr-error">
              {error}
            </div>
          )}
        </div>

        {step !== 'image-preview' && (
          <div className="ocr-modal-actions">
            <Button onClick={handleCancel}>
              {tAllgemein('abbrechen')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default OcrScanModal;
