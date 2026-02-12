import React, { useState } from 'react';
import './RecipeDetail.css';
import { canDirectlyEditRecipe, canCreateNewVersion, canDeleteRecipe } from '../utils/userManagement';
import { isRecipeVersion, getVersionNumber } from '../utils/recipeVersioning';

function RecipeDetail({ recipe, onBack, onEdit, onDelete, onToggleFavorite, onCreateVersion, currentUser, allRecipes = [] }) {
  const [servingMultiplier, setServingMultiplier] = useState(1);

  const userCanDirectlyEdit = canDirectlyEditRecipe(currentUser, recipe);
  const userCanCreateVersion = canCreateNewVersion(currentUser);
  const userCanDelete = canDeleteRecipe(currentUser, recipe);
  const isVersion = isRecipeVersion(recipe);
  const versionNumber = isVersion ? getVersionNumber(allRecipes, recipe) : 0;

  const handleDelete = () => {
    if (window.confirm(`Möchten Sie "${recipe.title}" wirklich löschen?`)) {
      onDelete(recipe.id);
    }
  };

  const scaleIngredient = (ingredient) => {
    if (servingMultiplier === 1) return ingredient;
    
    // Match numbers with optional fractions and units at the start or after whitespace
    // This pattern is designed to match quantities like "200g", "2 cups", "1/2 tsp"
    const regex = /(?:^|\s)(\d+(?:[.,]\d+)?|\d+\/\d+)\s*([a-zA-Z]+)?/g;
    
    return ingredient.replace(regex, (match, number, unit) => {
      // Preserve leading whitespace if any
      const leadingSpace = match.startsWith(' ') ? ' ' : '';
      
      // Convert fraction to decimal if needed
      let value;
      if (number.includes('/')) {
        const [num, denom] = number.split('/');
        value = parseFloat(num) / parseFloat(denom);
      } else {
        value = parseFloat(number.replace(',', '.'));
      }
      
      const scaled = value * servingMultiplier;
      const formatted = scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(1);
      
      return leadingSpace + (unit ? `${formatted} ${unit}` : formatted);
    });
  };

  const currentServings = (recipe.portionen || 4) * servingMultiplier;

  // Handle both array and string formats for kulinarik
  const cuisineDisplay = Array.isArray(recipe.kulinarik) 
    ? recipe.kulinarik.join(', ') 
    : recipe.kulinarik;

  return (
    <div className="recipe-detail-container">
      <div className="recipe-detail-header">
        <button className="back-button" onClick={onBack}>
          ← Zurück
        </button>
        <div className="action-buttons">
          {onToggleFavorite && (
            <button 
              className={`favorite-button ${recipe.isFavorite ? 'is-favorite' : ''}`}
              onClick={() => onToggleFavorite(recipe.id)}
              title={recipe.isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
            >
              {recipe.isFavorite ? '★ Favorit' : '☆ Favorit'}
            </button>
          )}
          {userCanDirectlyEdit && (
            <button className="edit-button" onClick={() => onEdit(recipe)}>
              Bearbeiten
            </button>
          )}
          {userCanCreateVersion && !userCanDirectlyEdit && (
            <button className="version-button" onClick={() => onCreateVersion(recipe)}>
              Neue Version erstellen
            </button>
          )}
          {userCanDelete && (
            <button className="delete-button" onClick={handleDelete}>
              Löschen
            </button>
          )}
        </div>
      </div>

      <div className="recipe-detail-content">
        {isVersion && (
          <div className="version-badge">
            Version {versionNumber}
          </div>
        )}
        {recipe.image && (
          <div className="recipe-detail-image">
            <img src={recipe.image} alt={recipe.title} />
          </div>
        )}

        <h1 className="recipe-title">{recipe.title}</h1>

        <div className="recipe-metadata">
          {cuisineDisplay && (
            <div className="metadata-item">
              <span className="metadata-label">Kulinarik:</span>
              <span className="metadata-value cuisine-badge">{cuisineDisplay}</span>
            </div>
          )}
          
          {recipe.speisekategorie && (
            <div className="metadata-item">
              <span className="metadata-label">Kategorie:</span>
              <span className="metadata-value">{recipe.speisekategorie}</span>
            </div>
          )}
          
          {recipe.schwierigkeit && (
            <div className="metadata-item">
              <span className="metadata-label">Schwierigkeit:</span>
              <span className="metadata-value difficulty-stars">
                {'⭐'.repeat(recipe.schwierigkeit)}
              </span>
            </div>
          )}
          
          {recipe.kochdauer && (
            <div className="metadata-item">
              <span className="metadata-label">Zeit:</span>
              <span className="metadata-value">{recipe.kochdauer} Min.</span>
            </div>
          )}
        </div>

        <section className="recipe-section">
          <div className="section-header">
            <h2>Zutaten ({recipe.ingredients?.length || 0})</h2>
            {recipe.portionen && (
              <div className="serving-control">
                <button 
                  className="serving-btn"
                  onClick={() => setServingMultiplier(Math.max(0.5, servingMultiplier - 0.5))}
                  disabled={servingMultiplier <= 0.5}
                >
                  -
                </button>
                <span className="serving-display">
                  {currentServings} {currentServings === 1 ? 'Portion' : 'Portionen'}
                </span>
                <button 
                  className="serving-btn"
                  onClick={() => setServingMultiplier(servingMultiplier + 0.5)}
                >
                  +
                </button>
              </div>
            )}
          </div>
          <ul className="ingredients-list">
            {recipe.ingredients?.map((ingredient, index) => (
              <li key={index}>{scaleIngredient(ingredient)}</li>
            )) || <li>Keine Zutaten aufgelistet</li>}
          </ul>
        </section>

        <section className="recipe-section">
          <h2>Zubereitungsschritte</h2>
          <ol className="steps-list">
            {recipe.steps?.map((step, index) => (
              <li key={index}>{step}</li>
            )) || <li>Keine Zubereitungsschritte aufgelistet</li>}
          </ol>
        </section>
      </div>
    </div>
  );
}

export default RecipeDetail;
