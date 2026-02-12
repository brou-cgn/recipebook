import React from 'react';
import './RecipeList.css';

function RecipeList({ recipes, onSelectRecipe, onAddRecipe }) {
  return (
    <div className="recipe-list-container">
      <div className="recipe-list-header">
        <h2>My Recipes</h2>
        <button className="add-button" onClick={onAddRecipe}>
          + Add Recipe
        </button>
      </div>
      
      {recipes.length === 0 ? (
        <div className="empty-state">
          <p>No recipes yet!</p>
          <p className="empty-hint">Tap "Add Recipe" to create your first recipe</p>
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
                  <span>🥘 {recipe.ingredients?.length || 0} ingredients</span>
                  <span>📝 {recipe.steps?.length || 0} steps</span>
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
