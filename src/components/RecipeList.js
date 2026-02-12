import React from 'react';
import './RecipeList.css';
import { canEditRecipes } from '../utils/userManagement';

function RecipeList({ recipes, onSelectRecipe, onAddRecipe, categoryFilter, showFavoritesOnly, currentUser }) {
  // Generate dynamic heading based on filters
  const getHeading = () => {
    const prefix = showFavoritesOnly ? 'Meine ' : '';
    const category = categoryFilter || 'Rezepte';
    return `${prefix}${category}`;
  };

  const userCanEdit = canEditRecipes(currentUser);

  return (
    <div className="recipe-list-container">
      <div className="recipe-list-header">
        <h2>{getHeading()}</h2>
        {userCanEdit && (
          <button className="add-button" onClick={onAddRecipe}>
            + Rezept hinzufügen
          </button>
        )}
      </div>
      
      {recipes.length === 0 ? (
        <div className="empty-state">
          <p>Noch keine Rezepte!</p>
          <p className="empty-hint">Tippen Sie auf "Rezept hinzufügen", um Ihr erstes Rezept zu erstellen</p>
        </div>
      ) : (
        <div className="recipe-grid">
          {recipes.map(recipe => (
            <div
              key={recipe.id}
              className="recipe-card"
              onClick={() => onSelectRecipe(recipe)}
            >
              {recipe.isFavorite && (
                <div className="favorite-badge">★</div>
              )}
              {recipe.image && (
                <div className="recipe-image">
                  <img src={recipe.image} alt={recipe.title} />
                </div>
              )}
              <div className="recipe-card-content">
                <h3>{recipe.title}</h3>
                <div className="recipe-meta">
                  <span>{recipe.ingredients?.length || 0} Zutaten</span>
                  <span>{recipe.steps?.length || 0} Schritte</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RecipeList;
