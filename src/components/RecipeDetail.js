import React, { useState } from 'react';
import './RecipeDetail.css';

function RecipeDetail({ recipe, onBack, onEdit, onDelete }) {
  const [servingMultiplier, setServingMultiplier] = useState(1);

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete "${recipe.title}"?`)) {
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

  return (
    <div className="recipe-detail-container">
      <div className="recipe-detail-header">
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>
        <div className="action-buttons">
          <button className="edit-button" onClick={() => onEdit(recipe)}>
            ✏️ Edit
          </button>
          <button className="delete-button" onClick={handleDelete}>
            🗑️ Delete
          </button>
        </div>
      </div>

      <div className="recipe-detail-content">
        {recipe.image && (
          <div className="recipe-detail-image">
            <img src={recipe.image} alt={recipe.title} />
          </div>
        )}

        <h1 className="recipe-title">{recipe.title}</h1>

        <div className="recipe-metadata">
          {recipe.kulinarik && (
            <div className="metadata-item">
              <span className="metadata-icon">🌍</span>
              <span className="metadata-label">Cuisine:</span>
              <span className="metadata-value cuisine-badge">{recipe.kulinarik}</span>
            </div>
          )}
          
          {recipe.speisekategorie && (
            <div className="metadata-item">
              <span className="metadata-icon">🍽️</span>
              <span className="metadata-label">Category:</span>
              <span className="metadata-value">{recipe.speisekategorie}</span>
            </div>
          )}
          
          {recipe.schwierigkeit && (
            <div className="metadata-item">
              <span className="metadata-icon">📊</span>
              <span className="metadata-label">Difficulty:</span>
              <span className="metadata-value difficulty-stars">
                {'⭐'.repeat(recipe.schwierigkeit)}
              </span>
            </div>
          )}
          
          {recipe.kochdauer && (
            <div className="metadata-item">
              <span className="metadata-icon">⏱️</span>
              <span className="metadata-label">Time:</span>
              <span className="metadata-value">{recipe.kochdauer} min</span>
            </div>
          )}
        </div>

        <section className="recipe-section">
          <div className="section-header">
            <h2>🥘 Ingredients ({recipe.ingredients?.length || 0})</h2>
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
                  {currentServings} {currentServings === 1 ? 'serving' : 'servings'}
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
            )) || <li>No ingredients listed</li>}
          </ul>
        </section>

        <section className="recipe-section">
          <h2>📝 Preparation Steps</h2>
          <ol className="steps-list">
            {recipe.steps?.map((step, index) => (
              <li key={index}>{step}</li>
            )) || <li>No preparation steps listed</li>}
          </ol>
        </section>
      </div>
    </div>
  );
}

export default RecipeDetail;
