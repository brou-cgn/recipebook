import React, { useState, useEffect, useMemo } from 'react';
import './RecipeDetail.css';
import { canDirectlyEditRecipe, canCreateNewVersion, canDeleteRecipe } from '../utils/userManagement';
import { isRecipeVersion, getVersionNumber, getRecipeVersions, getParentRecipe, sortRecipeVersions } from '../utils/recipeVersioning';
import { isRecipeFavorite } from '../utils/userFavorites';

function RecipeDetail({ recipe: initialRecipe, onBack, onEdit, onDelete, onToggleFavorite, onCreateVersion, currentUser, allRecipes = [], allUsers = [] }) {
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const [selectedRecipe, setSelectedRecipe] = useState(initialRecipe);

  // Get portion units from custom lists
  const [portionUnits, setPortionUnits] = useState([]);

  useEffect(() => {
    const { getCustomLists } = require('../utils/customLists');
    const lists = getCustomLists();
    setPortionUnits(lists.portionUnits || []);
  }, []);

  // Get all versions for this recipe
  const parentRecipe = getParentRecipe(allRecipes, selectedRecipe) || (!isRecipeVersion(selectedRecipe) ? selectedRecipe : null);
  const unsortedVersions = parentRecipe ? [parentRecipe, ...getRecipeVersions(allRecipes, parentRecipe.id)] : [selectedRecipe];
  
  // Sort versions according to priority: favorite > own > version number
  const allVersions = sortRecipeVersions(unsortedVersions, currentUser?.id, isRecipeFavorite, allRecipes);
  const hasMultipleVersions = allVersions.length > 1;

  // Update selected recipe when initial recipe changes
  useEffect(() => {
    setSelectedRecipe(initialRecipe);
  }, [initialRecipe]);

  const recipe = selectedRecipe;
  const userCanDirectlyEdit = canDirectlyEditRecipe(currentUser, recipe);
  const userCanCreateVersion = canCreateNewVersion(currentUser);
  const userCanDelete = canDeleteRecipe(currentUser, recipe);
  const isFavorite = isRecipeFavorite(currentUser?.id, recipe.id);

  // Get current version index
  const currentVersionIndex = allVersions.findIndex(v => v.id === recipe.id);
  
  // Navigation handlers
  const handlePreviousVersion = () => {
    if (currentVersionIndex > 0) {
      setSelectedRecipe(allVersions[currentVersionIndex - 1]);
      setServingMultiplier(1);
    }
  };

  const handleNextVersion = () => {
    if (currentVersionIndex < allVersions.length - 1) {
      setSelectedRecipe(allVersions[currentVersionIndex + 1]);
      setServingMultiplier(1);
    }
  };

  // Get author name
  const authorName = useMemo(() => {
    if (!recipe.authorId || !allUsers || allUsers.length === 0) return null;
    const author = allUsers.find(u => u.id === recipe.authorId);
    if (!author) return null;
    return `${author.vorname} ${author.nachname}`;
  }, [recipe.authorId, allUsers]);

  const versionNumber = useMemo(() => 
    hasMultipleVersions ? getVersionNumber(allRecipes, recipe) : 0, 
    [hasMultipleVersions, allRecipes, recipe]
  );

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

  // Get the portion unit for the recipe
  const portionUnitId = recipe.portionUnitId || 'portion';
  const portionUnit = portionUnits.find(u => u.id === portionUnitId) || { singular: 'Portion', plural: 'Portionen' };
  const portionLabel = currentServings === 1 ? portionUnit.singular : portionUnit.plural;

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
              className={`favorite-button ${isFavorite ? 'is-favorite' : ''}`}
              onClick={() => onToggleFavorite(recipe.id)}
              title={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
            >
              {isFavorite ? '★ Favorit' : '☆ Favorit'}
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
        {recipe.image && (
          <div className="recipe-detail-image">
            <img src={recipe.image} alt={recipe.title} />
          </div>
        )}

        <h1 className="recipe-title">{recipe.title}</h1>

        <div className="recipe-captions">
          {hasMultipleVersions && (
            <div className="version-navigation">
              <button 
                className="version-arrow"
                onClick={handlePreviousVersion}
                disabled={currentVersionIndex === 0}
                title="Vorherige Version"
              >
                ←
              </button>
              <span className="version-caption">
                {isRecipeVersion(recipe) ? `Version ${versionNumber}` : 'Original'}
              </span>
              <button 
                className="version-arrow"
                onClick={handleNextVersion}
                disabled={currentVersionIndex === allVersions.length - 1}
                title="Nächste Version"
              >
                →
              </button>
            </div>
          )}
          {authorName && (
            <div className="author-caption">
              Autor: {authorName}
            </div>
          )}
        </div>

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
                  onClick={() => {
                    const newMultiplier = servingMultiplier - 1;
                    const newServings = (recipe.portionen || 4) * newMultiplier;
                    if (newServings >= 1) {
                      setServingMultiplier(newMultiplier);
                    }
                  }}
                  disabled={currentServings <= 1}
                >
                  -
                </button>
                <span className="serving-display">
                  {currentServings} {portionLabel}
                </span>
                <button 
                  className="serving-btn"
                  onClick={() => setServingMultiplier(servingMultiplier + 1)}
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
