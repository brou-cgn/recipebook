import React, { useState, useEffect } from 'react';
import './MenuForm.css';
import { isRecipeFavorite } from '../utils/userFavorites';

function MenuForm({ menu, recipes, onSave, onCancel, currentUser }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedRecipes, setSelectedRecipes] = useState([]);

  useEffect(() => {
    if (menu) {
      setName(menu.name || '');
      setDescription(menu.description || '');
      setSelectedRecipes(menu.recipeIds || []);
    }
  }, [menu]);

  const handleToggleRecipe = (recipeId) => {
    if (selectedRecipes.includes(recipeId)) {
      setSelectedRecipes(selectedRecipes.filter(id => id !== recipeId));
    } else {
      setSelectedRecipes([...selectedRecipes, recipeId]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!name.trim()) {
      alert('Bitte geben Sie einen Menü-Namen ein');
      return;
    }

    if (selectedRecipes.length === 0) {
      alert('Bitte wählen Sie mindestens ein Rezept aus');
      return;
    }

    const menuData = {
      id: menu?.id,
      name: name.trim(),
      description: description.trim(),
      recipeIds: selectedRecipes
    };

    onSave(menuData);
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

        <div className="form-section">
          <h3>Rezepte auswählen</h3>
          {recipes.length === 0 ? (
            <p className="no-recipes">Keine Rezepte verfügbar. Bitte erstellen Sie zuerst einige Rezepte.</p>
          ) : (
            <div className="recipe-selection">
              {recipes.map((recipe) => {
                const isFavorite = isRecipeFavorite(currentUser?.id, recipe.id);
                return (
                  <label key={recipe.id} className="recipe-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedRecipes.includes(recipe.id)}
                      onChange={() => handleToggleRecipe(recipe.id)}
                    />
                    <span className="recipe-name">{recipe.title}</span>
                    {isFavorite && <span className="favorite-indicator">★</span>}
                  </label>
                );
              })}
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
