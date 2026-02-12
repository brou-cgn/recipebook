import React, { useState, useEffect } from 'react';
import './RecipeForm.css';
import { removeEmojis, containsEmojis } from '../utils/emojiUtils';
import { fileToBase64 } from '../utils/imageUtils';
import { getCustomLists } from '../utils/customLists';
import { getUsers } from '../utils/userManagement';
import RecipeImportModal from './RecipeImportModal';

function RecipeForm({ recipe, onSave, onCancel, currentUser, isCreatingVersion = false }) {
  const [title, setTitle] = useState('');
  const [image, setImage] = useState('');
  const [portionen, setPortionen] = useState(4);
  const [kulinarik, setKulinarik] = useState([]);
  const [schwierigkeit, setSchwierigkeit] = useState(3);
  const [kochdauer, setKochdauer] = useState(30);
  const [speisekategorie, setSpeisekategorie] = useState('');
  const [ingredients, setIngredients] = useState(['']);
  const [steps, setSteps] = useState(['']);
  const [imageError, setImageError] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [authorId, setAuthorId] = useState('');
  const [parentRecipeId, setParentRecipeId] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [customLists, setCustomLists] = useState({
    cuisineTypes: [],
    mealCategories: [],
    units: []
  });

  useEffect(() => {
    if (recipe) {
      setTitle(recipe.title || '');
      setImage(recipe.image || '');
      setPortionen(recipe.portionen || 4);
      // Handle both old string format and new array format for kulinarik
      if (Array.isArray(recipe.kulinarik)) {
        setKulinarik(recipe.kulinarik);
      } else if (recipe.kulinarik) {
        setKulinarik([recipe.kulinarik]);
      } else {
        setKulinarik([]);
      }
      setSchwierigkeit(recipe.schwierigkeit || 3);
      setKochdauer(recipe.kochdauer || 30);
      setSpeisekategorie(recipe.speisekategorie || '');
      setIngredients(recipe.ingredients?.length > 0 ? recipe.ingredients : ['']);
      setSteps(recipe.steps?.length > 0 ? recipe.steps : ['']);
      
      // If creating a version, set current user as author and track parent
      if (isCreatingVersion) {
        setAuthorId(currentUser?.id || '');
        setParentRecipeId(recipe.id || '');
      } else {
        setAuthorId(recipe.authorId || currentUser?.id || '');
        setParentRecipeId(recipe.parentRecipeId || '');
      }
    } else {
      // New recipe - set current user as author
      setAuthorId(currentUser?.id || '');
      setParentRecipeId('');
    }
  }, [recipe, currentUser, isCreatingVersion]);

  useEffect(() => {
    setCustomLists(getCustomLists());
  }, []);

  useEffect(() => {
    setImageError(false);
  }, [image]);

  const handleAddIngredient = () => {
    setIngredients([...ingredients, '']);
  };

  const handleRemoveIngredient = (index) => {
    if (ingredients.length > 1) {
      setIngredients(ingredients.filter((_, i) => i !== index));
    }
  };

  const handleIngredientChange = (index, value) => {
    const newIngredients = [...ingredients];
    newIngredients[index] = value;
    setIngredients(newIngredients);
  };

  const handleAddStep = () => {
    setSteps([...steps, '']);
  };

  const handleRemoveStep = (index) => {
    if (steps.length > 1) {
      setSteps(steps.filter((_, i) => i !== index));
    }
  };

  const handleStepChange = (index, value) => {
    const newSteps = [...steps];
    newSteps[index] = value;
    setSteps(newSteps);
  };

  const handleRemoveEmojisFromTitle = () => {
    if (containsEmojis(title)) {
      setTitle(removeEmojis(title));
    }
  };

  const handleRemoveEmojisFromIngredients = () => {
    const cleaned = ingredients.map(ingredient => removeEmojis(ingredient));
    setIngredients(cleaned);
  };

  const handleRemoveEmojisFromSteps = () => {
    const cleaned = steps.map(step => removeEmojis(step));
    setSteps(cleaned);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingImage(true);
    setImageError(false);

    try {
      const base64 = await fileToBase64(file);
      setImage(base64);
    } catch (error) {
      alert(error.message);
      setImageError(true);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!title.trim()) {
      alert('Bitte geben Sie einen Rezepttitel ein');
      return;
    }

    const recipeData = {
      id: isCreatingVersion ? undefined : recipe?.id,
      title: title.trim(),
      image: image.trim(),
      portionen: parseInt(portionen) || 4,
      kulinarik: kulinarik,
      schwierigkeit: parseInt(schwierigkeit) || 3,
      kochdauer: parseInt(kochdauer) || 30,
      speisekategorie: speisekategorie.trim(),
      ingredients: ingredients.filter(i => i.trim() !== ''),
      steps: steps.filter(s => s.trim() !== ''),
      authorId: authorId,
      parentRecipeId: parentRecipeId || undefined,
      createdAt: isCreatingVersion ? new Date().toISOString() : recipe?.createdAt,
      versionCreatedFrom: isCreatingVersion ? recipe?.title : undefined
    };

    onSave(recipeData);
  };

  const handleImport = (importedRecipe) => {
    // Populate form with imported data
    setTitle(importedRecipe.title || '');
    setImage(importedRecipe.image || '');
    setPortionen(importedRecipe.portionen || 4);
    
    // Handle kulinarik as array
    if (Array.isArray(importedRecipe.kulinarik)) {
      setKulinarik(importedRecipe.kulinarik);
    } else if (importedRecipe.kulinarik) {
      setKulinarik([importedRecipe.kulinarik]);
    } else {
      setKulinarik([]);
    }
    
    setSchwierigkeit(importedRecipe.schwierigkeit || 3);
    setKochdauer(importedRecipe.kochdauer || 30);
    setSpeisekategorie(importedRecipe.speisekategorie || '');
    // Import always provides non-empty arrays (validated by parseRecipeData)
    setIngredients(importedRecipe.ingredients || []);
    setSteps(importedRecipe.steps || []);
    
    // Close the import modal
    setShowImportModal(false);
  };

  return (
    <div className="recipe-form-container">
      <div className="recipe-form-header">
        <h2>
          {isCreatingVersion ? 'Neue Version erstellen' : (recipe ? 'Rezept bearbeiten' : 'Neues Rezept hinzufügen')}
        </h2>
        {!recipe && !isCreatingVersion && (
          <button
            type="button"
            className="import-button-header"
            onClick={() => setShowImportModal(true)}
            title="Rezept aus externer Quelle importieren"
          >
            📥 Importieren
          </button>
        )}
      </div>

      {isCreatingVersion && (
        <div className="version-info-banner">
          <span className="version-info-icon">ℹ️</span>
          <div className="version-info-text">
            <strong>Neue Version erstellen</strong>
            <p>Sie erstellen eine neue Version von "{recipe?.title}". Das Original bleibt unverändert.</p>
          </div>
        </div>
      )}

      <form className="recipe-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <div className="form-group-header">
            <label htmlFor="title">Rezepttitel *</label>
            {containsEmojis(title) && (
              <button
                type="button"
                className="emoji-remove-btn"
                onClick={handleRemoveEmojisFromTitle}
                title="Emojis entfernen"
              >
                Emojis entfernen
              </button>
            )}
          </div>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z.B. Spaghetti Carbonara"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="image">Rezeptbild (optional)</label>
          <div className="image-input-container">
            <label htmlFor="imageFile" className="image-upload-label">
              {uploadingImage ? 'Hochladen...' : 'Bild hochladen'}
            </label>
            <input
              type="file"
              id="imageFile"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
              disabled={uploadingImage}
            />
          </div>
          {image && !imageError && (
            <div className="image-preview">
              <img src={image} alt="Preview" onError={() => setImageError(true)} />
              <button
                type="button"
                className="remove-image-btn"
                onClick={() => setImage('')}
                title="Bild entfernen"
              >
                ✕ Entfernen
              </button>
            </div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="author">Autor</label>
          {currentUser?.isAdmin ? (
            <select
              id="author"
              value={authorId}
              onChange={(e) => setAuthorId(e.target.value)}
            >
              {getUsers().map((user) => (
                <option key={user.id} value={user.id}>
                  {user.vorname} {user.nachname} ({user.email})
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              id="author"
              value={`${currentUser?.vorname || ''} ${currentUser?.nachname || ''}`}
              disabled
              style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
            />
          )}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="portionen">Portionen</label>
            <input
              type="number"
              id="portionen"
              value={portionen}
              onChange={(e) => setPortionen(e.target.value)}
              min="1"
              max="100"
              placeholder="4"
            />
          </div>

          <div className="form-group">
            <label htmlFor="kochdauer">Kochzeit (Minuten)</label>
            <input
              type="number"
              id="kochdauer"
              value={kochdauer}
              onChange={(e) => setKochdauer(e.target.value)}
              min="1"
              max="1000"
              placeholder="30"
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="kulinarik">Kulinarik (Mehrfachauswahl möglich)</label>
          <div className="cuisine-multi-select">
            {customLists.cuisineTypes.map((cuisine) => (
              <label key={cuisine} className="cuisine-checkbox">
                <input
                  type="checkbox"
                  value={cuisine}
                  checked={kulinarik.includes(cuisine)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setKulinarik([...kulinarik, cuisine]);
                    } else {
                      setKulinarik(kulinarik.filter(c => c !== cuisine));
                    }
                  }}
                />
                <span>{cuisine}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="speisekategorie">Speisekategorie</label>
          <select
            id="speisekategorie"
            value={speisekategorie}
            onChange={(e) => setSpeisekategorie(e.target.value)}
          >
            <option value="">Kategorie auswählen...</option>
            {customLists.mealCategories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="schwierigkeit">Schwierigkeitsgrad</label>
          <div className="difficulty-slider">
            {[1, 2, 3, 4, 5].map((level) => (
              <span
                key={level}
                className={`star ${schwierigkeit >= level ? 'filled' : 'empty'}`}
                onClick={() => setSchwierigkeit(level)}
              >
                {schwierigkeit >= level ? '★' : '☆'}
              </span>
            ))}
          </div>
        </div>

        <div className="form-section">
          <div className="section-header">
            <h3>Zutaten</h3>
            {ingredients.some(i => containsEmojis(i)) && (
              <button
                type="button"
                className="emoji-remove-btn-small"
                onClick={handleRemoveEmojisFromIngredients}
                title="Emojis aus allen Zutaten entfernen"
              >
                Emojis entfernen
              </button>
            )}
          </div>
          {ingredients.map((ingredient, index) => (
            <div key={index} className="form-list-item">
              <input
                type="text"
                value={ingredient}
                onChange={(e) => handleIngredientChange(index, e.target.value)}
                placeholder={`Zutat ${index + 1}`}
              />
              {ingredients.length > 1 && (
                <button
                  type="button"
                  className="remove-button"
                  onClick={() => handleRemoveIngredient(index)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button type="button" className="add-item-button" onClick={handleAddIngredient}>
            + Zutat hinzufügen
          </button>
        </div>

        <div className="form-section">
          <div className="section-header">
            <h3>Zubereitungsschritte</h3>
            {steps.some(s => containsEmojis(s)) && (
              <button
                type="button"
                className="emoji-remove-btn-small"
                onClick={handleRemoveEmojisFromSteps}
                title="Emojis aus allen Schritten entfernen"
              >
                Emojis entfernen
              </button>
            )}
          </div>
          {steps.map((step, index) => (
            <div key={index} className="form-list-item">
              <span className="step-number">{index + 1}.</span>
              <textarea
                value={step}
                onChange={(e) => handleStepChange(index, e.target.value)}
                placeholder={`Schritt ${index + 1}`}
                rows="2"
              />
              {steps.length > 1 && (
                <button
                  type="button"
                  className="remove-button"
                  onClick={() => handleRemoveStep(index)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button type="button" className="add-item-button" onClick={handleAddStep}>
            + Schritt hinzufügen
          </button>
        </div>

        <div className="form-actions">
          <button type="button" className="cancel-button" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="submit" className="save-button">
            {recipe ? 'Rezept aktualisieren' : 'Rezept speichern'}
          </button>
        </div>
      </form>

      {showImportModal && (
        <RecipeImportModal
          onImport={handleImport}
          onCancel={() => setShowImportModal(false)}
        />
      )}
    </div>
  );
}

export default RecipeForm;
