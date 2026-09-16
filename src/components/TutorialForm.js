import React, { useState, useEffect, useRef } from 'react';
import './RecipeForm.css';
import './TutorialForm.css';
import SavingOverlay from './SavingOverlay';
import { isBase64Image } from '../utils/imageUtils';
import { getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';
import { TUTORIAL_CATEGORIES } from '../utils/tutorialsFirestore';
import { extractYouTubeVideoId, getYouTubeThumbnailUrl, getYouTubeFrameUrls } from '../utils/youtubeUtils';

const clamp01 = (n) => Math.min(1, Math.max(0, n));

// "Neues Tutorial" - same anatomy as RecipeForm (header/actions, form card,
// mobile FABs) but without ingredients/steps/portions/cook time, plus a
// Video-URL field. See CLAUDE.md / the RecipeBook design canvas for why the
// long-press-on-add-recipe entry point exists.
//
// Doubles as the edit form: with a `tutorial` prop the fields start out
// filled with that document's values and the heading switches to
// "Tutorial bearbeiten" - reached by long-pressing a TutorialCard, the same
// gesture that opens this form empty from the add button.
function TutorialForm({ onSave, onCancel, tutorial = null }) {
  const isEditing = Boolean(tutorial);
  const [title, setTitle] = useState(tutorial?.title || '');
  const [videoUrl, setVideoUrl] = useState(tutorial?.videoUrl || '');
  const [category, setCategory] = useState(tutorial?.category || TUTORIAL_CATEGORIES[0].id);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [savePressed, setSavePressed] = useState(false);
  const [cancelPressed, setCancelPressed] = useState(false);
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);

  // Vorschau-Zuschnitt: YouTubes Standbild kommt für nicht-16:9-Videos mit
  // eingebrannten Weichzeichner-Balken (Pillarboxing). zoom/pos erlauben es,
  // den sichtbaren Ausschnitt des Thumbnails frei zu verschieben/zoomen, statt
  // den ganzen (gepaddeten) Frame zu zeigen. pos ist 0..1 normiert auf den bei
  // aktuellem Zoom verfügbaren Verschiebespielraum - siehe TutorialCard.js für
  // die identische Render-Formel.
  const [thumbFrame, setThumbFrame] = useState(tutorial?.thumbFrame ?? null);
  const [thumbZoom, setThumbZoom] = useState(tutorial?.thumbZoom || 1);
  const [thumbPosX, setThumbPosX] = useState(tutorial?.thumbPosX ?? 0.5);
  const [thumbPosY, setThumbPosY] = useState(tutorial?.thumbPosY ?? 0.5);
  const cropBoxRef = useRef(null);
  const dragStateRef = useRef(null);
  const skipInitialThumbReset = useRef(true);

  const videoId = extractYouTubeVideoId(videoUrl);
  const frameUrls = getYouTubeFrameUrls(videoId);
  const cropSourceUrl = thumbFrame !== null ? frameUrls[thumbFrame] : getYouTubeThumbnailUrl(videoId);

  useEffect(() => {
    getButtonIcons().then(setButtonIcons).catch(() => {});
  }, []);

  // Neues Video -> alte Frame-/Zuschnittwahl passt nicht mehr, zurücksetzen.
  // Beim Bearbeiten läuft dieser Effekt auch direkt beim Mounten - dort darf
  // er den aus dem Dokument geladenen Zuschnitt nicht wegwerfen.
  useEffect(() => {
    if (skipInitialThumbReset.current) {
      skipInitialThumbReset.current = false;
      return;
    }
    setThumbFrame(null);
    setThumbZoom(1);
    setThumbPosX(0.5);
    setThumbPosY(0.5);
  }, [videoId]);

  const handleCropPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: thumbPosX,
      startPosY: thumbPosY
    };
  };

  const handleCropPointerMove = (e) => {
    const drag = dragStateRef.current;
    const box = cropBoxRef.current;
    if (!drag || !box) return;
    const rect = box.getBoundingClientRect();
    const panRangeX = (thumbZoom - 1) * rect.width;
    const panRangeY = (thumbZoom - 1) * rect.height;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setThumbPosX(clamp01(drag.startPosX - (panRangeX > 0 ? dx / panRangeX : 0)));
    setThumbPosY(clamp01(drag.startPosY - (panRangeY > 0 ? dy / panRangeY : 0)));
  };

  const handleCropPointerUp = (e) => {
    dragStateRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  useEffect(() => {
    const handler = () => setIsDarkMode(getDarkModePreference());
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  const canSave = title.trim().length > 0 && videoUrl.trim().length > 0 && !isSaving;

  const handleSave = async (e) => {
    e?.preventDefault?.();
    if (!canSave) return;
    setIsSaving(true);
    setError('');
    try {
      await onSave({
        title: title.trim(),
        videoUrl: videoUrl.trim(),
        category,
        ...(videoId ? { thumbFrame, thumbZoom, thumbPosX, thumbPosY } : {})
      });
    } catch (err) {
      console.error('Error saving tutorial:', err);
      setError('Das Tutorial konnte nicht gespeichert werden. Bitte versuche es erneut.');
      setIsSaving(false);
    }
  };

  const renderIcon = (key, alt) => (
    isBase64Image(getEffectiveIcon(buttonIcons, key, isDarkMode)) ? (
      <img src={getEffectiveIcon(buttonIcons, key, isDarkMode)} alt={alt} className="button-icon-image" draggable="false" />
    ) : (
      getEffectiveIcon(buttonIcons, key, isDarkMode)
    )
  );

  return (
    <div className="recipe-form-container">
      <div className="recipe-form-header">
        <div className="recipe-form-header-title">
          <h2>{isEditing ? 'Tutorial bearbeiten' : 'Neues Tutorial hinzufügen'}</h2>
        </div>
        <div className="recipe-form-header-actions">
          <button type="button" className="recipe-form-header-cancel" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="button" className="recipe-form-header-save" onClick={handleSave} disabled={!canSave}>
            {isSaving ? '…' : 'Speichern'}
          </button>
        </div>
      </div>

      <form className="recipe-form" onSubmit={handleSave}>
        <div className="form-group">
          <label htmlFor="tutorial-title">Titel</label>
          <input
            id="tutorial-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z. B. Fisch filetieren wie ein Profi"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="tutorial-video-url">Video-URL</label>
          <input
            id="tutorial-video-url"
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://www.youtube.com/..."
            required
          />
        </div>

        {cropSourceUrl && (
          <div className="form-group">
            <label>Vorschaubild zuschneiden</label>
            <div className="tutorial-thumb-frame-picker">
              {frameUrls.map((url, index) => (
                <button
                  key={url}
                  type="button"
                  className={`tutorial-thumb-frame-option${thumbFrame === index ? ' active' : ''}`}
                  onClick={() => setThumbFrame(index)}
                  aria-label={`Szene ${index + 1} als Vorschaubasis wählen`}
                  aria-pressed={thumbFrame === index}
                >
                  <img src={url} alt="" draggable="false" />
                </button>
              ))}
            </div>
            <div
              className="tutorial-thumb-crop-box"
              ref={cropBoxRef}
              onPointerDown={handleCropPointerDown}
              onPointerMove={handleCropPointerMove}
              onPointerUp={handleCropPointerUp}
              onPointerCancel={handleCropPointerUp}
            >
              <img
                src={cropSourceUrl}
                alt="Vorschau-Zuschnitt"
                draggable="false"
                className="tutorial-thumb-crop-image"
                style={{
                  width: `${thumbZoom * 100}%`,
                  height: `${thumbZoom * 100}%`,
                  left: `${-(thumbZoom - 1) * 100 * thumbPosX}%`,
                  top: `${-(thumbZoom - 1) * 100 * thumbPosY}%`
                }}
              />
            </div>
            <input
              type="range"
              min="1"
              max="2.5"
              step="0.05"
              value={thumbZoom}
              onChange={(e) => setThumbZoom(parseFloat(e.target.value))}
              className="tutorial-thumb-zoom-slider"
              aria-label="Vorschaubild zoomen"
            />
            <p className="tutorial-thumb-crop-hint">Szene wählen, dann ziehen zum Verschieben und Regler zum Zoomen</p>
          </div>
        )}

        <div className="form-group">
          <label>Technik-Kategorie</label>
          <div className="tutorial-category-grid">
            {TUTORIAL_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`recipe-form-cuisine-pill${category === cat.id ? ' active' : ''}`}
                onClick={() => setCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="ai-ocr-limit-info">{error}</p>}
      </form>

      {isSaving && <SavingOverlay label="Tutorial wird gespeichert" />}

      <button
        type="button"
        className={`cancel-fab-button ${cancelPressed ? 'pressed' : ''}`}
        onClick={onCancel}
        onTouchStart={() => setCancelPressed(true)}
        onTouchEnd={() => setCancelPressed(false)}
        onTouchCancel={() => setCancelPressed(false)}
        onMouseDown={() => setCancelPressed(true)}
        onMouseUp={() => setCancelPressed(false)}
        onMouseLeave={() => setCancelPressed(false)}
        title="Abbrechen"
        aria-label={isEditing ? 'Tutorial-Bearbeitung abbrechen' : 'Tutorial-Erstellung abbrechen'}
      >
        {renderIcon('closeButtonDefaultImg', 'Abbrechen')}
      </button>
      <button
        type="button"
        className={`save-fab-button ${savePressed ? 'pressed' : ''}`}
        onClick={handleSave}
        disabled={!canSave}
        onTouchStart={() => setSavePressed(true)}
        onTouchEnd={() => setSavePressed(false)}
        onTouchCancel={() => setSavePressed(false)}
        onMouseDown={() => setSavePressed(true)}
        onMouseUp={() => setSavePressed(false)}
        onMouseLeave={() => setSavePressed(false)}
        title="Tutorial speichern"
        aria-label="Tutorial speichern"
      >
        {renderIcon('saveRecipe', 'Speichern')}
      </button>
    </div>
  );
}

export default TutorialForm;
