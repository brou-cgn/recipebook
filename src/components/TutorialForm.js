import React, { useState, useEffect, useMemo, useRef } from 'react';
import './RecipeForm.css';
import './TutorialForm.css';
import SavingOverlay from './SavingOverlay';
import { isBase64Image } from '../utils/imageUtils';
import { getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';
import { TUTORIAL_CATEGORIES } from '../utils/tutorialsFirestore';
import { extractYouTubeVideoId, getYouTubeThumbnailUrl, getYouTubeFrameUrls } from '../utils/youtubeUtils';
import { splitIntoTwoRows, reorderActiveFirst } from '../utils/pillCarousel';

const clamp01 = (n) => Math.min(1, Math.max(0, n));

// Obergrenze fuer die gleichzeitig gerenderten Zutatenpillen. Die
// Nutritionsreferenz umfasst mehrere hundert Eintraege; so viele Pillen in
// ein zweireihiges Karussell zu haengen, hiesse minutenlang zu wischen.
const INGREDIENT_PILL_LIMIT = 40;

// "Neues Tutorial" - same anatomy as RecipeForm (header/actions, form card,
// mobile FABs) but without ingredients/steps/portions/cook time, plus a
// Video-URL field. See CLAUDE.md / the RecipeBook design canvas for why the
// long-press-on-add-recipe entry point exists.
//
// Doubles as the edit form: with a `tutorial` prop the fields start out
// filled with that document's values and the heading switches to
// "Tutorial bearbeiten" - reached by long-pressing a TutorialCard, the same
// gesture that opens this form empty from the add button.
function TutorialForm({ onSave, onCancel, tutorial = null, nutritionReferenceRows = [], mealCategories = [] }) {
  const isEditing = Boolean(tutorial);
  const [title, setTitle] = useState(tutorial?.title || '');
  const [videoUrl, setVideoUrl] = useState(tutorial?.videoUrl || '');
  const [category, setCategory] = useState(tutorial?.category || TUTORIAL_CATEGORIES[0].id);
  // Zutaten und Speisekategorien sind Mehrfachauswahlen - ein Technikvideo
  // gehoert selten zu genau einer Zutat oder genau einem Gang. Gespeichert
  // werden die IngredientIDs (Dokument-IDs aus nutritionReferences) bzw. die
  // Kategorienamen, exakt wie das Rezept sie in `speisekategorie` fuehrt, damit
  // sich Tutorial und Rezept spaeter ueber dieselben Werte finden lassen.
  const [ingredientIDs, setIngredientIDs] = useState(() => (
    Array.isArray(tutorial?.ingredientIDs) ? tutorial.ingredientIDs : []
  ));
  const [speisekategorie, setSpeisekategorie] = useState(() => (
    Array.isArray(tutorial?.speisekategorie) ? tutorial.speisekategorie : []
  ));
  const [ingredientSearch, setIngredientSearch] = useState('');
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

  // nutritionReferences ist die groesste Liste der App - alle Zutaten als
  // Pillen zu rendern waere unbedienbar. Deshalb: Suchfeld davor, und ohne
  // Suchbegriff nur ein Anriss der Liste, dessen Umfang die Zeile darunter
  // offenlegt. Bereits gewaehlte Zutaten stehen immer oben und bleiben auch
  // sichtbar, wenn der aktuelle Suchbegriff sie nicht mehr trifft - sonst
  // koennte man eine Auswahl nicht mehr aufheben, ohne die Suche zu leeren.
  const ingredientOptions = useMemo(() => {
    const seen = new Set();
    return nutritionReferenceRows.reduce((options, row) => {
      const id = String(row?.ingredientID || row?.id || '').trim();
      if (!id || seen.has(id)) return options;
      seen.add(id);
      options.push({
        id,
        label: String(row?.name || row?.displayName || id).trim() || id,
        synonyms: Array.isArray(row?.synonyms) ? row.synonyms : []
      });
      return options;
    }, []);
  }, [nutritionReferenceRows]);

  // Der Suchbegriff grenzt die Zutaten ein, eine gewaehlte Zutat bleibt aber
  // in jedem Fall in der Liste. Im Suchdialog darf eine aktive Pille aus der
  // Trefferliste fallen - dort ist sie ein Filter, den die Leiste darueber
  // weiter anzeigt und der sich jederzeit zuruecksetzen laesst. Hier ist sie
  // eingegebener Inhalt: verschwaende sie mit dem Suchbegriff, waere die
  // Auswahl weder sichtbar noch aufhebbar.
  const matchingIngredientOptions = useMemo(() => {
    const term = ingredientSearch.trim().toLowerCase();
    if (!term) return ingredientOptions;
    return ingredientOptions.filter((option) => (
      ingredientIDs.includes(option.id)
      || option.label.toLowerCase().includes(term)
      || option.id.toLowerCase().includes(term)
      || option.synonyms.some((synonym) => String(synonym).toLowerCase().includes(term))
    ));
  }, [ingredientOptions, ingredientIDs, ingredientSearch]);

  const visibleIngredientOptions = useMemo(
    () => matchingIngredientOptions.slice(0, INGREDIENT_PILL_LIMIT),
    [matchingIngredientOptions]
  );
  const hiddenIngredientCount = matchingIngredientOptions.length - visibleIngredientOptions.length;

  // Beide Pillenfelder laufen im Auswahlverfahren des Suchdialogs: zwei
  // Reihen mit fester Zugehoerigkeit, darin die gewaehlten Pillen vorn -
  // siehe utils/pillCarousel.js.
  const [ingredientRow1Base, ingredientRow2Base] = useMemo(
    () => splitIntoTwoRows(visibleIngredientOptions),
    [visibleIngredientOptions]
  );
  const ingredientPillsRow1 = useMemo(
    () => reorderActiveFirst(ingredientRow1Base, ingredientIDs, (option) => option.id),
    [ingredientRow1Base, ingredientIDs]
  );
  const ingredientPillsRow2 = useMemo(
    () => reorderActiveFirst(ingredientRow2Base, ingredientIDs, (option) => option.id),
    [ingredientRow2Base, ingredientIDs]
  );

  const [mealCategoryRow1Base, mealCategoryRow2Base] = useMemo(
    () => splitIntoTwoRows(mealCategories),
    [mealCategories]
  );
  const mealCategoryPillsRow1 = useMemo(
    () => reorderActiveFirst(mealCategoryRow1Base, speisekategorie),
    [mealCategoryRow1Base, speisekategorie]
  );
  const mealCategoryPillsRow2 = useMemo(
    () => reorderActiveFirst(mealCategoryRow2Base, speisekategorie),
    [mealCategoryRow2Base, speisekategorie]
  );

  const toggleIngredientID = (id) => {
    setIngredientIDs((prev) => (
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
    ));
  };

  const toggleSpeisekategorie = (name) => {
    setSpeisekategorie((prev) => (
      prev.includes(name) ? prev.filter((entry) => entry !== name) : [...prev, name]
    ));
  };

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
        ingredientIDs,
        speisekategorie,
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

        <div className="form-group">
          <label htmlFor="tutorial-ingredient-search">Zutaten (Mehrfachauswahl möglich)</label>
          <input
            id="tutorial-ingredient-search"
            type="text"
            value={ingredientSearch}
            onChange={(e) => setIngredientSearch(e.target.value)}
            placeholder="Zutat suchen, z. B. Zwiebel"
            autoComplete="off"
          />
          {visibleIngredientOptions.length > 0 && (
            <div className="tutorial-pill-carousel">
              {[ingredientPillsRow1, ingredientPillsRow2].filter((row) => row.length > 0).map((row, rowIndex) => (
                <div className="tutorial-pill-carousel-row" key={rowIndex}>
                  {row.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`recipe-form-cuisine-pill${ingredientIDs.includes(option.id) ? ' active' : ''}`}
                      onClick={() => toggleIngredientID(option.id)}
                      aria-pressed={ingredientIDs.includes(option.id)}
                      title={ingredientIDs.includes(option.id) ? 'Auswahl aufheben' : `${option.label} auswählen`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
          {ingredientOptions.length === 0 ? (
            <p className="tutorial-pill-hint">Keine Zutaten verfügbar.</p>
          ) : hiddenIngredientCount > 0 ? (
            <p className="tutorial-pill-hint">
              {`Noch ${hiddenIngredientCount} weitere Treffer – Suche eingrenzen`}
            </p>
          ) : matchingIngredientOptions.length === 0 && ingredientSearch.trim() !== '' ? (
            <p className="tutorial-pill-hint">Keine passende Zutat gefunden.</p>
          ) : null}
        </div>

        <div className="form-group">
          <label>Speisekategorie (Mehrfachauswahl möglich)</label>
          {mealCategories.length > 0 ? (
            <div className="tutorial-pill-carousel">
              {[mealCategoryPillsRow1, mealCategoryPillsRow2].filter((row) => row.length > 0).map((row, rowIndex) => (
                <div className="tutorial-pill-carousel-row" key={rowIndex}>
                  {row.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className={`recipe-form-cuisine-pill${speisekategorie.includes(name) ? ' active' : ''}`}
                      onClick={() => toggleSpeisekategorie(name)}
                      aria-pressed={speisekategorie.includes(name)}
                      title={speisekategorie.includes(name) ? 'Auswahl aufheben' : `${name} auswählen`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="tutorial-pill-hint">Keine Speisekategorien verfügbar.</p>
          )}
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
