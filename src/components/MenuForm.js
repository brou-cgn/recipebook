import React, { useState, useEffect } from 'react';
import './MenuForm.css';
import { getUserFavorites } from '../utils/userFavorites';
import { getSavedSections, saveSectionNames, createMenuSection } from '../utils/menuSections';
import { fuzzyFilter } from '../utils/fuzzySearch';

function MenuForm({ menu, recipes, onSave, onCancel, currentUser }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [menuDate, setMenuDate] = useState('');
  const [sections, setSections] = useState([]);
  const [availableSections, setAvailableSections] = useState([]);
  const [newSectionName, setNewSectionName] = useState('');
  const [showSectionInput, setShowSectionInput] = useState(false);
  const [searchQueries, setSearchQueries] = useState({});
  const [favoriteIds, setFavoriteIds] = useState([]);

  // Load favorite IDs when user changes
  useEffect(() => {
    const loadFavorites = async () => {
      if (currentUser?.id) {
        const favorites = await getUserFavorites(currentUser.id);
        setFavoriteIds(favorites);
      } else {
        setFavoriteIds([]);
      }
    };
    loadFavorites();
  }, [currentUser?.id]);

  useEffect(() => {
    // Load available section names
    setAvailableSections(getSavedSections());

    if (menu) {
      setName(menu.name || '');
      setDescription(menu.description || '');
      // Initialize menuDate: use existing menuDate, or fall back to createdAt, or today
      if (menu.menuDate) {
        setMenuDate(menu.menuDate);
      } else if (menu.createdAt) {
        let date;
        if (menu.createdAt?.toDate) {
          date = menu.createdAt.toDate();
        } else if (typeof menu.createdAt === 'string') {
          date = new Date(menu.createdAt);
        } else if (menu.createdAt instanceof Date) {
          date = menu.createdAt;
        }
        if (date) {
          setMenuDate(date.toISOString().slice(0, 10));
        } else {
          setMenuDate(new Date().toISOString().slice(0, 10));
        }
      } else {
        setMenuDate(new Date().toISOString().slice(0, 10));
      }
      
      // Load existing sections or create a default one
      if (menu.sections && menu.sections.length > 0) {
        setSections(menu.sections);
      } else {
        // Migrate old menu format (recipeIds directly on menu) to sections
        if (menu.recipeIds && menu.recipeIds.length > 0) {
          setSections([createMenuSection('Alle Rezepte', menu.recipeIds)]);
        } else {
          setSections([createMenuSection('Hauptspeise', [])]);
        }
      }
    } else {
      // New menu - create default section
      setSections([createMenuSection('Hauptspeise', [])]);
      setMenuDate(new Date().toISOString().slice(0, 10));
    }
  }, [menu]);

  const handleAddSection = (sectionName = null) => {
    const name = sectionName || newSectionName.trim();
    if (!name) {
      alert('Bitte geben Sie einen Abschnittsnamen ein');
      return;
    }

    // Check if section already exists
    if (sections.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      alert('Ein Abschnitt mit diesem Namen existiert bereits');
      return;
    }

    setSections([...sections, createMenuSection(name, [])]);
    setNewSectionName('');
    setShowSectionInput(false);

    // Save new section name for future use
    saveSectionNames([name]);
    if (!availableSections.includes(name)) {
      setAvailableSections([...availableSections, name]);
    }
  };

  const handleRemoveSection = (index) => {
    if (sections.length === 1) {
      alert('Ein Menü muss mindestens einen Abschnitt haben');
      return;
    }

    if (sections[index].recipeIds.length > 0) {
      if (!window.confirm('Dieser Abschnitt enthält Rezepte. Wirklich löschen?')) {
        return;
      }
    }

    setSections(sections.filter((_, i) => i !== index));
  };

  const handleToggleRecipeInSection = (sectionIndex, recipeId) => {
    const newSections = [...sections];
    const section = newSections[sectionIndex];

    if (section.recipeIds.includes(recipeId)) {
      // Remove recipe from this section
      section.recipeIds = section.recipeIds.filter(id => id !== recipeId);
    } else {
      // Add recipe to this section (and remove from other sections)
      newSections.forEach((s, i) => {
        if (i === sectionIndex) {
          s.recipeIds = [...s.recipeIds, recipeId];
        } else {
          s.recipeIds = s.recipeIds.filter(id => id !== recipeId);
        }
      });
    }

    setSections(newSections);
  };

  const handleMoveSectionUp = (index) => {
    if (index === 0) return;
    const newSections = [...sections];
    [newSections[index - 1], newSections[index]] = [newSections[index], newSections[index - 1]];
    setSections(newSections);
  };

  const handleMoveSectionDown = (index) => {
    if (index === sections.length - 1) return;
    const newSections = [...sections];
    [newSections[index], newSections[index + 1]] = [newSections[index + 1], newSections[index]];
    setSections(newSections);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!name.trim()) {
      alert('Bitte geben Sie einen Menü-Namen ein');
      return;
    }

    // Check if at least one recipe is selected
    const totalRecipes = sections.reduce((sum, section) => sum + section.recipeIds.length, 0);
    if (totalRecipes === 0) {
      alert('Bitte wählen Sie mindestens ein Rezept aus');
      return;
    }

    // Collect all recipe IDs for backward compatibility
    const allRecipeIds = sections.reduce((ids, section) => [...ids, ...section.recipeIds], []);

    const menuData = {
      id: menu?.id,
      name: name.trim(),
      description: description.trim(),
      menuDate: menuDate,
      createdBy: menu?.createdBy || currentUser?.id,
      sections: sections,
      recipeIds: allRecipeIds // Keep for backward compatibility
    };

    onSave(menuData);
  };

  const handleSearchChange = (sectionIndex, query) => {
    setSearchQueries({
      ...searchQueries,
      [sectionIndex]: query
    });
  };

  const handleAddRecipeToSection = (sectionIndex, recipeId) => {
    handleToggleRecipeInSection(sectionIndex, recipeId);
    // Clear search after adding
    setSearchQueries({
      ...searchQueries,
      [sectionIndex]: ''
    });
  };

  const handleRemoveRecipeFromSection = (sectionIndex, recipeId) => {
    const newSections = [...sections];
    newSections[sectionIndex].recipeIds = newSections[sectionIndex].recipeIds.filter(id => id !== recipeId);
    setSections(newSections);
  };

  const getFilteredRecipes = (sectionIndex) => {
    const query = searchQueries[sectionIndex] || '';
    const section = sections[sectionIndex];
    
    // Filter out recipes already in this section
    const availableRecipes = recipes.filter(recipe => !section.recipeIds.includes(recipe.id));
    
    if (!query.trim()) {
      return availableRecipes;
    }
    
    // Use fuzzy search
    return fuzzyFilter(availableRecipes, query, recipe => recipe.title);
  };

  return (
    <div className="menu-form-container">
      <div className="menu-form-header">
        <h2>{menu ? 'Menü bearbeiten' : 'Neues Menü erstellen'}</h2>
      </div>

      <form className="menu-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="menuName">Menü-Name *</label>
          <input
            type="text"
            id="menuName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Sonntagsessen, Festtagsmenü"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="menuDescription">Beschreibung (optional)</label>
          <textarea
            id="menuDescription"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Beschreiben Sie dieses Menü..."
            rows="3"
          />
        </div>

        <div className="form-group">
          <label htmlFor="menuDate">Datum</label>
          <input
            type="date"
            id="menuDate"
            value={menuDate}
            onChange={(e) => setMenuDate(e.target.value)}
          />
        </div>

        <div className="form-section sections-management">
          <div className="sections-header">
            <h3>Abschnitte & Rezepte</h3>
            <button 
              type="button" 
              className="add-section-button"
              onClick={() => setShowSectionInput(!showSectionInput)}
            >
              + Abschnitt hinzufügen
            </button>
          </div>

          {showSectionInput && (
            <div className="new-section-input">
              <div className="section-quick-select">
                <label>Vordefinierte Abschnitte:</label>
                <div className="quick-select-buttons">
                  {availableSections.map(sectionName => (
                    <button
                      key={sectionName}
                      type="button"
                      className="quick-select-button"
                      onClick={() => handleAddSection(sectionName)}
                      disabled={sections.some(s => s.name === sectionName)}
                    >
                      {sectionName}
                    </button>
                  ))}
                </div>
              </div>
              <div className="custom-section-input">
                <label>Oder eigenen Namen eingeben:</label>
                <div className="input-with-button">
                  <input
                    type="text"
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    placeholder="z.B. Fingerfood, Amuse-Bouche"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSection();
                      }
                    }}
                  />
                  <button type="button" onClick={() => handleAddSection()}>
                    Hinzufügen
                  </button>
                </div>
              </div>
            </div>
          )}

          {recipes.length === 0 ? (
            <p className="no-recipes">Keine Rezepte verfügbar. Bitte erstellen Sie zuerst einige Rezepte.</p>
          ) : (
            <div className="sections-list">
              {sections.map((section, sectionIndex) => (
                <div key={sectionIndex} className="section-block">
                  <div className="section-header">
                    <h4>{section.name}</h4>
                    <div className="section-actions">
                      <button
                        type="button"
                        className="move-button"
                        onClick={() => handleMoveSectionUp(sectionIndex)}
                        disabled={sectionIndex === 0}
                        title="Nach oben"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="move-button"
                        onClick={() => handleMoveSectionDown(sectionIndex)}
                        disabled={sectionIndex === sections.length - 1}
                        title="Nach unten"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="remove-section-button"
                        onClick={() => handleRemoveSection(sectionIndex)}
                        title="Abschnitt löschen"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="recipe-selection">
                    {/* Display selected recipes */}
                    {section.recipeIds.length > 0 && (
                      <div className="selected-recipes">
                        <h5>Ausgewählte Rezepte:</h5>
                        {section.recipeIds.map(recipeId => {
                          const recipe = recipes.find(r => r.id === recipeId);
                          if (!recipe) return null;
                          const isFavorite = favoriteIds.includes(recipe.id);
                          return (
                            <div key={recipe.id} className="selected-recipe-item">
                              <span className="recipe-name">
                                {recipe.title}
                                {isFavorite && <span className="favorite-indicator">★</span>}
                              </span>
                              <button
                                type="button"
                                className="remove-recipe-button"
                                onClick={() => handleRemoveRecipeFromSection(sectionIndex, recipe.id)}
                                title="Rezept entfernen"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    
                    {/* Typeahead search input */}
                    <div className="typeahead-container">
                      <input
                        type="text"
                        className="typeahead-input"
                        placeholder="Rezept suchen und hinzufügen..."
                        value={searchQueries[sectionIndex] || ''}
                        onChange={(e) => handleSearchChange(sectionIndex, e.target.value)}
                      />
                      
                      {/* Show dropdown only when there's a search query */}
                      {searchQueries[sectionIndex] && searchQueries[sectionIndex].trim() && (
                        <div className="typeahead-dropdown">
                          {(() => {
                            const filteredRecipes = getFilteredRecipes(sectionIndex);
                            if (filteredRecipes.length === 0) {
                              return <div className="typeahead-no-results">Keine Rezepte gefunden</div>;
                            }
                            return filteredRecipes.slice(0, 10).map(recipe => {
                              const isFavorite = favoriteIds.includes(recipe.id);
                              return (
                                <div
                                  key={recipe.id}
                                  className="typeahead-item"
                                  onClick={() => handleAddRecipeToSection(sectionIndex, recipe.id)}
                                >
                                  <span className="recipe-name">
                                    {recipe.title}
                                  </span>
                                  {isFavorite && <span className="favorite-indicator">★</span>}
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="section-summary">
                    {section.recipeIds.length} Rezept{section.recipeIds.length !== 1 ? 'e' : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="cancel-button" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="submit" className="save-button">
            {menu ? 'Menü aktualisieren' : 'Menü erstellen'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default MenuForm;
