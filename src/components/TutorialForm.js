import React, { useState, useEffect } from 'react';
import './RecipeForm.css';
import './TutorialForm.css';
import SavingOverlay from './SavingOverlay';
import { isBase64Image } from '../utils/imageUtils';
import { getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';
import { TUTORIAL_CATEGORIES } from '../utils/tutorialsFirestore';

// "Neues Tutorial" - same anatomy as RecipeForm (header/actions, form card,
// mobile FABs) but without ingredients/steps/portions/cook time, plus a
// Video-URL field. See CLAUDE.md / the RecipeBook design canvas for why the
// long-press-on-add-recipe entry point exists.
function TutorialForm({ onSave, onCancel }) {
  const [title, setTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [category, setCategory] = useState(TUTORIAL_CATEGORIES[0].id);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [savePressed, setSavePressed] = useState(false);
  const [cancelPressed, setCancelPressed] = useState(false);
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);

  useEffect(() => {
    getButtonIcons().then(setButtonIcons).catch(() => {});
  }, []);

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
      await onSave({ title: title.trim(), videoUrl: videoUrl.trim(), category });
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
          <h2>Neues Tutorial hinzufügen</h2>
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
        className={`cancel-fab-button recipe-form-mobile-only ${cancelPressed ? 'pressed' : ''}`}
        onClick={onCancel}
        onTouchStart={() => setCancelPressed(true)}
        onTouchEnd={() => setCancelPressed(false)}
        onTouchCancel={() => setCancelPressed(false)}
        onMouseDown={() => setCancelPressed(true)}
        onMouseUp={() => setCancelPressed(false)}
        onMouseLeave={() => setCancelPressed(false)}
        title="Abbrechen"
        aria-label="Tutorial-Erstellung abbrechen"
      >
        {renderIcon('closeButtonDefaultImg', 'Abbrechen')}
      </button>
      <button
        type="button"
        className={`save-fab-button recipe-form-mobile-only ${savePressed ? 'pressed' : ''}`}
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
