import React, { useState, useEffect } from 'react';
import './Settings.css';
import { getCustomLists, saveCustomLists, resetCustomLists, getHeaderSlogan, saveHeaderSlogan, getFaviconImage, saveFaviconImage, getFaviconText, saveFaviconText } from '../utils/customLists';
import { isCurrentUserAdmin } from '../utils/userManagement';
import UserManagement from './UserManagement';
import { getCategoryImages, addCategoryImage, updateCategoryImage, removeCategoryImage, getAlreadyAssignedCategories } from '../utils/categoryImages';
import { fileToBase64 } from '../utils/imageUtils';
import { updateFavicon, updatePageTitle } from '../utils/faviconUtils';

const CATEGORY_ALREADY_ASSIGNED_ERROR = 'Die folgenden Kategorien sind bereits einem anderen Bild zugeordnet: {categories}\n\nBitte wählen Sie andere Kategorien.';

function Settings({ onBack, currentUser }) {
  const [lists, setLists] = useState({
    cuisineTypes: [],
    mealCategories: [],
    units: [],
    portionUnits: []
  });
  const [newCuisine, setNewCuisine] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newPortionSingular, setNewPortionSingular] = useState('');
  const [newPortionPlural, setNewPortionPlural] = useState('');
  const [headerSlogan, setHeaderSlogan] = useState('');
  const [activeTab, setActiveTab] = useState('general'); // 'general', 'lists', or 'users'
  const isAdmin = isCurrentUserAdmin();
  
  // Category images state
  const [categoryImages, setCategoryImages] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editingImageId, setEditingImageId] = useState(null);
  const [selectedCategories, setSelectedCategories] = useState([]);

  // Favicon state
  const [faviconImage, setFaviconImage] = useState(null);
  const [faviconText, setFaviconText] = useState('');
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  // Cleanup timeout on unmount
  useEffect(() => {
    const loadSettings = async () => {
      const lists = await getCustomLists();
      const slogan = await getHeaderSlogan();
      const faviconImg = await getFaviconImage();
      const faviconTxt = await getFaviconText();
      
      setLists(lists);
      setHeaderSlogan(slogan);
      setCategoryImages(getCategoryImages());
      setFaviconImage(faviconImg);
      setFaviconText(faviconTxt);
    };
    loadSettings();
  }, []);

  const handleSave = () => {
    saveCustomLists(lists);
    saveHeaderSlogan(headerSlogan);
    saveFaviconImage(faviconImage);
    saveFaviconText(faviconText);
    
    // Apply favicon changes immediately
    updateFavicon(faviconImage);
    updatePageTitle(faviconText);
    
    alert('Einstellungen erfolgreich gespeichert!');
  };

  const handleReset = () => {
    if (window.confirm('Möchten Sie wirklich alle Listen auf die Standardwerte zurücksetzen?')) {
      const defaultLists = resetCustomLists();
      setLists(defaultLists);
      alert('Listen auf Standardwerte zurückgesetzt!');
    }
  };

  const addCuisine = () => {
    if (newCuisine.trim() && !lists.cuisineTypes.includes(newCuisine.trim())) {
      setLists({
        ...lists,
        cuisineTypes: [...lists.cuisineTypes, newCuisine.trim()]
      });
      setNewCuisine('');
    }
  };

  const removeCuisine = (cuisine) => {
    setLists({
      ...lists,
      cuisineTypes: lists.cuisineTypes.filter(c => c !== cuisine)
    });
  };

  const addCategory = () => {
    if (newCategory.trim() && !lists.mealCategories.includes(newCategory.trim())) {
      setLists({
        ...lists,
        mealCategories: [...lists.mealCategories, newCategory.trim()]
      });
      setNewCategory('');
    }
  };

  const removeCategory = (category) => {
    setLists({
      ...lists,
      mealCategories: lists.mealCategories.filter(c => c !== category)
    });
  };

  const addUnit = () => {
    if (newUnit.trim() && !lists.units.includes(newUnit.trim())) {
      setLists({
        ...lists,
        units: [...lists.units, newUnit.trim()]
      });
      setNewUnit('');
    }
  };

  const removeUnit = (unit) => {
    setLists({
      ...lists,
      units: lists.units.filter(u => u !== unit)
    });
  };

  const addPortionUnit = () => {
    if (newPortionSingular.trim() && newPortionPlural.trim()) {
      const newId = newPortionSingular.toLowerCase().replace(/\s+/g, '-');
      const exists = lists.portionUnits.some(pu => pu.id === newId);
      
      if (!exists) {
        setLists({
          ...lists,
          portionUnits: [...lists.portionUnits, {
            id: newId,
            singular: newPortionSingular.trim(),
            plural: newPortionPlural.trim()
          }]
        });
        setNewPortionSingular('');
        setNewPortionPlural('');
      }
    }
  };

  const removePortionUnit = (unitId) => {
    setLists({
      ...lists,
      portionUnits: lists.portionUnits.filter(pu => pu.id !== unitId)
    });
  };

  // Category image handlers
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingImage(true);

    try {
      const base64 = await fileToBase64(file);
      
      if (editingImageId) {
        // Update existing image
        updateCategoryImage(editingImageId, { image: base64 });
        setCategoryImages(getCategoryImages());
        setEditingImageId(null);
      } else {
        // Add new image with selected categories
        const alreadyAssigned = getAlreadyAssignedCategories(selectedCategories);
        if (alreadyAssigned.length > 0) {
          alert(CATEGORY_ALREADY_ASSIGNED_ERROR.replace('{categories}', alreadyAssigned.join(', ')));
          setUploadingImage(false);
          return;
        }
        
        addCategoryImage(base64, selectedCategories);
        setCategoryImages(getCategoryImages());
        setSelectedCategories([]);
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCategoryToggle = (category) => {
    setSelectedCategories(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category);
      } else {
        return [...prev, category];
      }
    });
  };

  const handleRemoveCategoryImage = (imageId) => {
    if (window.confirm('Möchten Sie dieses Bild wirklich entfernen?')) {
      removeCategoryImage(imageId);
      setCategoryImages(getCategoryImages());
    }
  };

  const handleEditImageCategories = (imageId) => {
    const image = categoryImages.find(img => img.id === imageId);
    if (image) {
      setEditingImageId(imageId);
      setSelectedCategories([...image.categories]);
    }
  };

  const handleSaveImageCategories = () => {
    if (!editingImageId) return;

    const alreadyAssigned = getAlreadyAssignedCategories(selectedCategories, editingImageId);
    if (alreadyAssigned.length > 0) {
      alert(CATEGORY_ALREADY_ASSIGNED_ERROR.replace('{categories}', alreadyAssigned.join(', ')));
      return;
    }

    updateCategoryImage(editingImageId, { categories: selectedCategories });
    setCategoryImages(getCategoryImages());
    setEditingImageId(null);
    setSelectedCategories([]);
  };

  const handleCancelEditCategories = () => {
    setEditingImageId(null);
    setSelectedCategories([]);
  };

  // Favicon handlers
  const handleFaviconUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingFavicon(true);

    try {
      const base64 = await fileToBase64(file);
      setFaviconImage(base64);
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadingFavicon(false);
    }
  };

  const handleRemoveFavicon = () => {
    setFaviconImage(null);
  };

  return (
    <div className="settings-container">
      <div className="settings-header">
        <button className="back-button" onClick={onBack}>
          ← Zurück
        </button>
        <h2>Einstellungen</h2>
      </div>

      {isAdmin && (
        <div className="settings-tabs">
          <button
            className={`tab-button ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            Allgemein
          </button>
          <button
            className={`tab-button ${activeTab === 'lists' ? 'active' : ''}`}
            onClick={() => setActiveTab('lists')}
          >
            Listen & Kategorien
          </button>
          <button
            className={`tab-button ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            Benutzerverwaltung
          </button>
        </div>
      )}

      <div className="settings-content">
        {activeTab === 'general' ? (
          <>
            <div className="settings-section">
              <h3>Header-Slogan</h3>
              <p className="section-description">
                Passen Sie den Slogan an, der im Header unter "DishBook" angezeigt wird.
              </p>
              <div className="list-input">
                <input
                  type="text"
                  value={headerSlogan}
                  onChange={(e) => setHeaderSlogan(e.target.value)}
                  placeholder="Header-Slogan eingeben..."
                />
              </div>
            </div>

            <div className="settings-section">
              <h3>Favicon</h3>
              <p className="section-description">
                Personalisieren Sie das Favicon (Browser-Tab-Symbol) und den Titel Ihrer DishBook-Instanz.
              </p>
              
              {/* Favicon Text */}
              <div className="favicon-text-section">
                <label htmlFor="faviconText">Favicon-Text (Browser-Tab-Titel):</label>
                <div className="list-input">
                  <input
                    type="text"
                    id="faviconText"
                    value={faviconText}
                    onChange={(e) => setFaviconText(e.target.value)}
                    placeholder="z.B. DishBook"
                    maxLength={50}
                  />
                </div>
                <p className="input-hint">Maximale Länge: 50 Zeichen</p>
              </div>

              {/* Favicon Image */}
              <div className="favicon-image-section">
                <label>Favicon-Bild:</label>
                {faviconImage ? (
                  <div className="favicon-preview">
                    <img src={faviconImage} alt="Favicon" style={{ width: '32px', height: '32px' }} />
                    <div className="favicon-actions">
                      <label htmlFor="faviconImageFile" className="favicon-change-btn">
                        {uploadingFavicon ? 'Hochladen...' : '🔄 Ändern'}
                      </label>
                      <button 
                        className="favicon-remove-btn" 
                        onClick={handleRemoveFavicon}
                        disabled={uploadingFavicon}
                      >
                        ✕ Entfernen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="favicon-upload">
                    <label htmlFor="faviconImageFile" className="image-upload-label">
                      {uploadingFavicon ? 'Hochladen...' : '📷 Favicon hochladen'}
                    </label>
                  </div>
                )}
                <input
                  type="file"
                  id="faviconImageFile"
                  accept="image/*"
                  onChange={handleFaviconUpload}
                  style={{ display: 'none' }}
                  disabled={uploadingFavicon}
                />
                <p className="input-hint">
                  Unterstützte Formate: JPEG, PNG, GIF, WebP. Maximale Größe: 5MB. 
                  Empfohlene Größe: 32x32 oder 64x64 Pixel.
                </p>
              </div>
            </div>

            <div className="settings-section">
              <h3>Kategoriebilder</h3>
              <p className="section-description">
                Laden Sie Bilder hoch und verknüpfen Sie diese mit Speisekategorien. 
                Diese Bilder werden als Platzhalter verwendet, wenn ein Rezept ohne Titelbild gespeichert wird.
                Jede Kategorie kann nur einem Bild zugeordnet werden.
              </p>
              
              {/* Upload new image section */}
              {!editingImageId && (
                <div className="category-image-upload">
                  <div className="category-selection">
                    <label>Wählen Sie Speisekategorien für das neue Bild:</label>
                    <div className="category-checkboxes">
                      {lists.mealCategories.map(category => {
                        const isAssigned = categoryImages.some(img => img.categories.includes(category));
                        const isSelected = selectedCategories.includes(category);
                        return (
                          <label 
                            key={category} 
                            className={`category-checkbox ${isAssigned && !isSelected ? 'disabled' : ''}`}
                            title={isAssigned && !isSelected ? 'Diese Kategorie ist bereits einem Bild zugeordnet' : ''}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleCategoryToggle(category)}
                              disabled={isAssigned && !isSelected}
                            />
                            <span>{category}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div className="image-upload-button-container">
                    <label htmlFor="categoryImageFile" className="image-upload-label">
                      {uploadingImage ? 'Hochladen...' : '📷 Neues Bild hochladen'}
                    </label>
                    <input
                      type="file"
                      id="categoryImageFile"
                      accept="image/*"
                      onChange={handleImageUpload}
                      style={{ display: 'none' }}
                      disabled={uploadingImage || selectedCategories.length === 0}
                    />
                    {selectedCategories.length === 0 && (
                      <p className="upload-hint">Bitte wählen Sie mindestens eine Kategorie aus.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Existing images */}
              <div className="category-images-list">
                {categoryImages.map(img => (
                  <div key={img.id} className="category-image-item">
                    <div className="category-image-preview">
                      <img src={img.image} alt="Category" />
                      {editingImageId !== img.id && (
                        <button
                          className="category-image-remove-icon"
                          onClick={() => handleRemoveCategoryImage(img.id)}
                          title="Bild entfernen"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    
                    {editingImageId === img.id ? (
                      <div className="category-image-edit">
                        <div className="category-selection">
                          <label>Kategorien bearbeiten:</label>
                          <div className="category-checkboxes">
                            {lists.mealCategories.map(category => {
                              const isAssignedToOther = categoryImages.some(
                                otherImg => otherImg.id !== img.id && otherImg.categories.includes(category)
                              );
                              const isSelected = selectedCategories.includes(category);
                              return (
                                <label 
                                  key={category} 
                                  className={`category-checkbox ${isAssignedToOther ? 'disabled' : ''}`}
                                  title={isAssignedToOther ? 'Diese Kategorie ist bereits einem anderen Bild zugeordnet' : ''}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleCategoryToggle(category)}
                                    disabled={isAssignedToOther}
                                  />
                                  <span>{category}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                        <div className="category-image-actions">
                          <button 
                            className="save-categories-btn" 
                            onClick={handleSaveImageCategories}
                            disabled={selectedCategories.length === 0}
                          >
                            ✓ Speichern
                          </button>
                          <button 
                            className="cancel-edit-btn" 
                            onClick={handleCancelEditCategories}
                          >
                            ✕ Abbrechen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="category-image-info">
                        <div className="category-image-categories">
                          {img.categories.length > 0 ? (
                            img.categories.map(cat => (
                              <span key={cat} className="category-badge">{cat}</span>
                            ))
                          ) : (
                            <span className="no-categories">Keine Kategorien zugeordnet</span>
                          )}
                        </div>
                        <div className="category-image-actions">
                          <button 
                            className="edit-categories-btn" 
                            onClick={() => handleEditImageCategories(img.id)}
                            title="Kategorien bearbeiten"
                          >
                            ✏️ Bearbeiten
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="settings-actions">
              <button className="save-button" onClick={handleSave}>
                Einstellungen speichern
              </button>
            </div>
          </>
        ) : activeTab === 'lists' ? (
          <>
            <div className="settings-section">
          <h3>Kulinarik-Typen</h3>
          <div className="list-input">
            <input
              type="text"
              value={newCuisine}
              onChange={(e) => setNewCuisine(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCuisine()}
              placeholder="Neuen Kulinarik-Typ hinzufügen..."
            />
            <button onClick={addCuisine}>Hinzufügen</button>
          </div>
          <div className="list-items">
            {lists.cuisineTypes.map((cuisine) => (
              <div key={cuisine} className="list-item">
                <span>{cuisine}</span>
                <button
                  className="remove-btn"
                  onClick={() => removeCuisine(cuisine)}
                  title="Entfernen"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h3>Speisekategorien</h3>
          <div className="list-input">
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCategory()}
              placeholder="Neue Speisekategorie hinzufügen..."
            />
            <button onClick={addCategory}>Hinzufügen</button>
          </div>
          <div className="list-items">
            {lists.mealCategories.map((category) => (
              <div key={category} className="list-item">
                <span>{category}</span>
                <button
                  className="remove-btn"
                  onClick={() => removeCategory(category)}
                  title="Entfernen"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h3>Maßeinheiten</h3>
          <div className="list-input">
            <input
              type="text"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addUnit()}
              placeholder="Neue Einheit hinzufügen..."
            />
            <button onClick={addUnit}>Hinzufügen</button>
          </div>
          <div className="list-items">
            {lists.units.map((unit) => (
              <div key={unit} className="list-item">
                <span>{unit}</span>
                <button
                  className="remove-btn"
                  onClick={() => removeUnit(unit)}
                  title="Entfernen"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h3>Portionseinheiten</h3>
          <p className="section-description">
            Definieren Sie benutzerdefinierte Portionseinheiten mit Singular- und Pluralformen (z.B. Pizza/Pizzen, Drink/Drinks).
          </p>
          <div className="list-input portion-unit-input">
            <input
              type="text"
              value={newPortionSingular}
              onChange={(e) => setNewPortionSingular(e.target.value)}
              placeholder="Singular (z.B. Pizza)"
            />
            <input
              type="text"
              value={newPortionPlural}
              onChange={(e) => setNewPortionPlural(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addPortionUnit()}
              placeholder="Plural (z.B. Pizzen)"
            />
            <button onClick={addPortionUnit}>Hinzufügen</button>
          </div>
          <div className="list-items">
            {lists.portionUnits.map((unit) => (
              <div key={unit.id} className="list-item">
                <span>{unit.singular} / {unit.plural}</span>
                <button
                  className="remove-btn"
                  onClick={() => removePortionUnit(unit.id)}
                  title="Entfernen"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-actions">
          <button className="reset-button" onClick={handleReset}>
            Auf Standard zurücksetzen
          </button>
          <button className="save-button" onClick={handleSave}>
            Einstellungen speichern
          </button>
        </div>
      </>
        ) : (
          <UserManagement onBack={() => setActiveTab('general')} currentUser={currentUser} />
        )}
      </div>
    </div>
  );
}

export default Settings;
