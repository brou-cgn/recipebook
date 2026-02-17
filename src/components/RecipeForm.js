import React, { useState, useEffect } from 'react';
import './RecipeForm.css';
import { removeEmojis, containsEmojis } from '../utils/emojiUtils';
import { fileToBase64, isBase64Image } from '../utils/imageUtils';
import { uploadRecipeImage, deleteRecipeImage } from '../utils/storageUtils';
import { getCustomLists } from '../utils/customLists';
import { getUsers } from '../utils/userManagement';
import { getImageForCategories } from '../utils/categoryImages';
import { formatIngredients } from '../utils/ingredientUtils';
import { encodeRecipeLink, startsWithHash } from '../utils/recipeLinks';
import RecipeImportModal from './RecipeImportModal';
import OcrScanModal from './OcrScanModal';
import WebImportModal from './WebImportModal';
import RecipeTypeahead from './RecipeTypeahead';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  TouchSensor,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable Ingredient Item Component
function SortableIngredient({ id, ingredient, index, onChange, onRemove, canRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`form-list-item ${isDragging ? 'dragging' : ''}`}
    >
      <button
        type="button"
        className="drag-handle"
        {...attributes}
        {...listeners}
        aria-label="Zutat verschieben"
      >
        ⋮⋮
      </button>
      <input
        type="text"
        value={ingredient}
        onChange={(e) => onChange(index, e.target.value)}
        placeholder={`Zutat ${index + 1}`}
      />
      {canRemove && (
        <button
          type="button"
          className="remove-button"
          onClick={() => onRemove(index)}
        >
          ✕
        </button>
      )}
    </div>
  );
}

// Sortable Step Item Component
function SortableStep({ id, step, index, onChange, onRemove, canRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`form-list-item ${isDragging ? 'dragging' : ''}`}
    >
      <button
        type="button"
        className="drag-handle"
        {...attributes}
        {...listeners}
        aria-label="Schritt verschieben"
      >
        ⋮⋮
      </button>
      <span className="step-number">{index + 1}.</span>
      <textarea
        value={step}
        onChange={(e) => onChange(index, e.target.value)}
        placeholder={`Schritt ${index + 1}`}
        rows="2"
      />
      {canRemove && (
        <button
          type="button"
          className="remove-button"
          onClick={() => onRemove(index)}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function RecipeForm({ recipe, onSave, onCancel, currentUser, isCreatingVersion = false, allRecipes = [] }) {
  const [title, setTitle] = useState('');
  const [image, setImage] = useState('');
  const [portionen, setPortionen] = useState(4);
  const [portionUnitId, setPortionUnitId] = useState('portion');
  const [kulinarik, setKulinarik] = useState([]);
  const [schwierigkeit, setSchwierigkeit] = useState(3);
  const [kochdauer, setKochdauer] = useState(30);
  const [speisekategorie, setSpeisekategorie] = useState([]);
  const [ingredients, setIngredients] = useState(['']);
  const [steps, setSteps] = useState(['']);
  const [imageError, setImageError] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [authorId, setAuthorId] = useState('');
  const [parentRecipeId, setParentRecipeId] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [showWebImportModal, setShowWebImportModal] = useState(false);
  const [ocrImageBase64, setOcrImageBase64] = useState('');
  const [customLists, setCustomLists] = useState({
    cuisineTypes: [],
    mealCategories: [],
    units: [],
    portionUnits: []
  });
  const [allUsers, setAllUsers] = useState([]);
  const [buttonIcons, setButtonIcons] = useState({
    importRecipe: '📥',
    scanImage: '📷',
    webImport: '🌐'
  });
  const [showTypeahead, setShowTypeahead] = useState(false);
  const [typeaheadIngredientIndex, setTypeaheadIngredientIndex] = useState(null);

  // Drag and drop sensors with touch support
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (recipe) {
      setTitle(recipe.title || '');
      setImage(recipe.image || '');
      setPortionen(recipe.portionen || 4);
      setPortionUnitId(recipe.portionUnitId || 'portion');
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
      // Handle both old string format and new array format for speisekategorie
      if (Array.isArray(recipe.speisekategorie)) {
        setSpeisekategorie(recipe.speisekategorie);
      } else if (recipe.speisekategorie) {
        setSpeisekategorie([recipe.speisekategorie]);
      } else {
        setSpeisekategorie([]);
      }
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
    const loadCustomLists = async () => {
      const lists = await getCustomLists();
      setCustomLists(lists);
    };
    const loadUsers = async () => {
      const users = await getUsers();
      setAllUsers(users);
    };
    const loadButtonIcons = async () => {
      const { getButtonIcons } = await import('../utils/customLists');
      const icons = await getButtonIcons();
      setButtonIcons({
        importRecipe: icons.importRecipe || '📥',
        scanImage: icons.scanImage || '📷',
        webImport: icons.webImport || '🌐'
      });
    };
    loadCustomLists();
    loadUsers();
    loadButtonIcons();
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
    
    // Check if user is typing # to trigger recipe typeahead
    if (startsWithHash(value)) {
      setTypeaheadIngredientIndex(index);
      setShowTypeahead(true);
    } else {
      // Hide typeahead if # is removed
      if (typeaheadIngredientIndex === index) {
        setShowTypeahead(false);
        setTypeaheadIngredientIndex(null);
      }
    }
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

  // Drag and drop handlers
  const handleDragEndIngredients = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setIngredients((items) => {
        const oldIndex = items.findIndex((_, idx) => `ingredient-${idx}` === active.id);
        const newIndex = items.findIndex((_, idx) => `ingredient-${idx}` === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleDragEndSteps = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setSteps((items) => {
        const oldIndex = items.findIndex((_, idx) => `step-${idx}` === active.id);
        const newIndex = items.findIndex((_, idx) => `step-${idx}` === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
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

    const oldImage = image;

    try {
      // Upload to Firebase Storage and get download URL
      const downloadURL = await uploadRecipeImage(file);
      
      // Update state with new image
      setImage(downloadURL);
      
      // Delete old image if it exists and is a Storage URL
      // Do this after successful upload to avoid orphaning the old image
      // Note: If deletion fails, the old image remains in storage but won't affect functionality
      if (oldImage) {
        try {
          await deleteRecipeImage(oldImage);
        } catch (deleteError) {
          // Log but don't fail the upload if deletion fails
          // The orphaned image will be cleaned up by Firebase Storage lifecycle rules or manual cleanup
          console.warn('Failed to delete old image from storage:', deleteError);
        }
      }
    } catch (error) {
      alert(error.message);
      setImageError(true);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = async () => {
    const imageToRemove = image;
    
    // Optimistically clear the UI
    setImage('');
    
    // Try to delete from Storage if it's a Storage URL
    if (imageToRemove) {
      try {
        await deleteRecipeImage(imageToRemove);
      } catch (error) {
        // Log the error and restore the image in UI
        console.error('Failed to delete image:', error);
        setImage(imageToRemove);
        alert('Das Bild konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.');
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!title.trim()) {
      alert('Bitte geben Sie einen Rezepttitel ein');
      return;
    }

    // Auto-populate title image from category images if creating new recipe without title image
    let finalImage = image.trim();
    if (!recipe && !finalImage && speisekategorie.length > 0) {
      // New recipe without title image - try to get image from category
      const categoryImage = getImageForCategories(speisekategorie);
      if (categoryImage) {
        finalImage = categoryImage;
      }
    }

    // Format ingredients to ensure proper spacing between numbers and units
    const filteredIngredients = ingredients.filter(i => i.trim() !== '');
    const formattedIngredients = formatIngredients(filteredIngredients);

    const recipeData = {
      title: title.trim(),
      image: finalImage,
      portionen: parseInt(portionen) || 4,
      portionUnitId: portionUnitId,
      kulinarik: kulinarik,
      schwierigkeit: parseInt(schwierigkeit) || 3,
      kochdauer: parseInt(kochdauer) || 30,
      speisekategorie: speisekategorie,
      ingredients: formattedIngredients,
      steps: steps.filter(s => s.trim() !== ''),
      authorId: authorId,
      parentRecipeId: parentRecipeId || null,
      createdAt: isCreatingVersion ? new Date().toISOString() : recipe?.createdAt,
      versionCreatedFrom: isCreatingVersion ? recipe?.title : null
    };

    // Add id only if it exists (editing existing recipe)
    if (!isCreatingVersion && recipe?.id) {
      recipeData.id = recipe.id;
    }

    onSave(recipeData);
  };

  const handleImport = (importedRecipe) => {
    // Populate form with imported data
    setTitle(importedRecipe.title || '');
    setImage(importedRecipe.image || '');
    setPortionen(importedRecipe.portionen || 4);
    setPortionUnitId(importedRecipe.portionUnitId || 'portion');
    
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
    
    // Handle speisekategorie as array
    if (Array.isArray(importedRecipe.speisekategorie)) {
      setSpeisekategorie(importedRecipe.speisekategorie);
    } else if (importedRecipe.speisekategorie) {
      setSpeisekategorie([importedRecipe.speisekategorie]);
    } else {
      setSpeisekategorie([]);
    }
    
    // Import always provides non-empty arrays (validated by parseRecipeData)
    setIngredients(importedRecipe.ingredients || []);
    setSteps(importedRecipe.steps || []);
    
    // Close the import modal
    setShowImportModal(false);
  };

  const handleOcrImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const base64 = await fileToBase64(file);
      setOcrImageBase64(base64);
      setShowOcrModal(true);
    } catch (error) {
      alert('Fehler beim Hochladen des Bildes: ' + error.message);
    }
  };

  const handleOcrScan = (ocrRecipe) => {
    // Populate form with OCR scanned data
    handleImport(ocrRecipe);
    // Close the OCR modal
    setShowOcrModal(false);
    setOcrImageBase64('');
  };

  const handleOcrCancel = () => {
    setShowOcrModal(false);
    setOcrImageBase64('');
  };

  const handleWebImport = (webRecipe) => {
    // Populate form with web imported data
    handleImport(webRecipe);
    // Close the web import modal
    setShowWebImportModal(false);
  };

  const handleRecipeSelect = (selectedRecipe) => {
    if (typeaheadIngredientIndex !== null) {
      const newIngredients = [...ingredients];
      const currentIngredient = newIngredients[typeaheadIngredientIndex];
      
      // Check if there's a quantity prefix before the # symbol
      const hashIndex = currentIngredient.indexOf('#');
      const quantityPrefix = hashIndex > 0 ? currentIngredient.substring(0, hashIndex).trim() : '';
      
      // Create the recipe link with quantity prefix if it exists
      const recipeLink = encodeRecipeLink(selectedRecipe.id, selectedRecipe.title);
      newIngredients[typeaheadIngredientIndex] = quantityPrefix 
        ? `${quantityPrefix} ${recipeLink}`
        : recipeLink;
      
      setIngredients(newIngredients);
    }
    setShowTypeahead(false);
    setTypeaheadIngredientIndex(null);
  };

  const handleTypeaheadCancel = () => {
    setShowTypeahead(false);
    setTypeaheadIngredientIndex(null);
  };

  return (
    <div className="recipe-form-container">
      <div className="recipe-form-header">
        <h2>
          {isCreatingVersion ? 'Eigene Version erstellen' : (recipe ? 'Rezept bearbeiten' : 'Neues Rezept hinzufügen')}
        </h2>
        {!recipe && !isCreatingVersion && (
          <div className="header-buttons">
            {currentUser?.webimport && (
              <button
                type="button"
                className="webimport-button-header"
                onClick={() => setShowWebImportModal(true)}
                title="Rezept von Website importieren"
                aria-label="Webimport"
              >
                {isBase64Image(buttonIcons.webImport) ? (
                  <img src={buttonIcons.webImport} alt="Webimport" className="button-icon-img" />
                ) : (
                  buttonIcons.webImport
                )}
              </button>
            )}
            {currentUser?.fotoscan && (
              <>
                <label
                  htmlFor="ocrImageUpload"
                  className="ocr-scan-button-header"
                  title="Rezept mit Kamera scannen"
                  aria-label="Rezept mit Kamera scannen"
                  style={{ cursor: 'pointer' }}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      document.getElementById('ocrImageUpload').click();
                    }
                  }}
                >
                  {isBase64Image(buttonIcons.scanImage) ? (
                    <img src={buttonIcons.scanImage} alt="Scan" className="button-icon-img" />
                  ) : (
                    buttonIcons.scanImage
                  )}
                </label>
                <input
                  type="file"
                  id="ocrImageUpload"
                  accept="image/jpeg,image/jpg,image/png"
                  onChange={handleOcrImageUpload}
                  style={{ display: 'none' }}
                />
              </>
            )}
            {currentUser?.isAdmin && (
              <button
                type="button"
                className="import-button-header"
                onClick={() => setShowImportModal(true)}
                title="Rezept aus externer Quelle importieren"
                aria-label="Rezept importieren"
              >
                {isBase64Image(buttonIcons.importRecipe) ? (
                  <img src={buttonIcons.importRecipe} alt="Import" className="button-icon-img" />
                ) : (
                  buttonIcons.importRecipe
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {isCreatingVersion && (
        <div className="version-info-banner">
          <span className="version-info-icon">ℹ️</span>
          <div className="version-info-text">
            <strong>Eigene Version erstellen</strong>
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
                onClick={handleRemoveImage}
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
              {allUsers.map((user) => (
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
            <label htmlFor="portionUnit">Portionseinheit</label>
            <select
              id="portionUnit"
              value={portionUnitId}
              onChange={(e) => setPortionUnitId(e.target.value)}
            >
              {(customLists.portionUnits || []).map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.singular} / {unit.plural}
                </option>
              ))}
            </select>
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
          <select
            id="kulinarik"
            multiple
            value={kulinarik}
            onChange={(e) => {
              const options = Array.from(e.target.selectedOptions, option => option.value);
              setKulinarik(options);
            }}
            size={Math.min(customLists.cuisineTypes.length, 8)}
          >
            {customLists.cuisineTypes.map((cuisine) => (
              <option key={cuisine} value={cuisine}>{cuisine}</option>
            ))}
          </select>
          {kulinarik.length > 0 && (
            <div className="selected-items">
              Ausgewählt: {kulinarik.join(', ')}
            </div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="speisekategorie">Speisekategorie (Mehrfachauswahl möglich)</label>
          <select
            id="speisekategorie"
            multiple
            value={speisekategorie}
            onChange={(e) => {
              const options = Array.from(e.target.selectedOptions, option => option.value);
              setSpeisekategorie(options);
            }}
            size={Math.min(customLists.mealCategories.length, 8)}
          >
            {customLists.mealCategories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          {speisekategorie.length > 0 && (
            <div className="selected-items">
              Ausgewählt: {speisekategorie.join(', ')}
            </div>
          )}
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEndIngredients}
          >
            <SortableContext
              items={ingredients.map((_, index) => `ingredient-${index}`)}
              strategy={verticalListSortingStrategy}
            >
              {ingredients.map((ingredient, index) => (
                <SortableIngredient
                  key={`ingredient-${index}`}
                  id={`ingredient-${index}`}
                  ingredient={ingredient}
                  index={index}
                  onChange={handleIngredientChange}
                  onRemove={handleRemoveIngredient}
                  canRemove={ingredients.length > 1}
                />
              ))}
            </SortableContext>
          </DndContext>
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEndSteps}
          >
            <SortableContext
              items={steps.map((_, index) => `step-${index}`)}
              strategy={verticalListSortingStrategy}
            >
              {steps.map((step, index) => (
                <SortableStep
                  key={`step-${index}`}
                  id={`step-${index}`}
                  step={step}
                  index={index}
                  onChange={handleStepChange}
                  onRemove={handleRemoveStep}
                  canRemove={steps.length > 1}
                />
              ))}
            </SortableContext>
          </DndContext>
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

      {showOcrModal && (
        <OcrScanModal
          onImport={handleOcrScan}
          onCancel={handleOcrCancel}
          initialImage={ocrImageBase64}
        />
      )}

      {showWebImportModal && (
        <WebImportModal
          onImport={handleWebImport}
          onCancel={() => setShowWebImportModal(false)}
        />
      )}

      {showTypeahead && typeaheadIngredientIndex !== null && (
        <RecipeTypeahead
          recipes={allRecipes.filter(r => r.id !== recipe?.id)}
          onSelect={handleRecipeSelect}
          onCancel={handleTypeaheadCancel}
          inputValue={ingredients[typeaheadIngredientIndex] || ''}
        />
      )}
    </div>
  );
}

export default RecipeForm;
