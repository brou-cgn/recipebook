import React from 'react';
import './MenuDetail.css';

function MenuDetail({ menu, recipes, onBack, onEdit, onDelete, onSelectRecipe }) {
  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete "${menu.name}"?`)) {
      onDelete(menu.id);
    }
  };

  const menuRecipes = recipes.filter(r => menu.recipeIds?.includes(r.id));

  return (
    <div className="menu-detail-container">
      <div className="menu-detail-header">
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>
        <div className="action-buttons">
          <button className="edit-button" onClick={() => onEdit(menu)}>
            ✏️ Edit
          </button>
          <button className="delete-button" onClick={handleDelete}>
            🗑️ Delete
          </button>
        </div>
      </div>

      <div className="menu-detail-content">
        <h1 className="menu-title">{menu.name}</h1>
        
        {menu.description && (
          <p className="menu-description">{menu.description}</p>
        )}

        <div className="menu-stats">
          <span className="stat-item">
            <span className="stat-icon">📋</span>
            <span className="stat-value">{menuRecipes.length} Recipes</span>
          </span>
        </div>

        <section className="menu-recipes-section">
          <h2>Recipes in this Menu</h2>
          {menuRecipes.length === 0 ? (
            <p className="no-recipes">No recipes in this menu</p>
          ) : (
            <div className="recipes-grid">
              {menuRecipes.map((recipe) => (
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
        </section>
      </div>
    </div>
  );
}

export default MenuDetail;
