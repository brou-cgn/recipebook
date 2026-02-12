import React from 'react';
import './MenuDetail.css';
import { isRecipeFavorite } from '../utils/userFavorites';

function MenuDetail({ menu, recipes, onBack, onEdit, onDelete, onSelectRecipe, currentUser }) {
  const handleDelete = () => {
    if (window.confirm(`Möchten Sie "${menu.name}" wirklich löschen?`)) {
      onDelete(menu.id);
    }
  };

  const menuRecipes = recipes.filter(r => menu.recipeIds?.includes(r.id));

  return (
    <div className="menu-detail-container">
      <div className="menu-detail-header">
        <button className="back-button" onClick={onBack}>
          ← Zurück
        </button>
        <div className="action-buttons">
          <button className="edit-button" onClick={() => onEdit(menu)}>
            Bearbeiten
          </button>
          <button className="delete-button" onClick={handleDelete}>
            Löschen
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
            <span className="stat-value">{menuRecipes.length} Rezepte</span>
          </span>
        </div>

        <section className="menu-recipes-section">
          <h2>Rezepte in diesem Menü</h2>
          {menuRecipes.length === 0 ? (
            <p className="no-recipes">Keine Rezepte in diesem Menü</p>
          ) : (
            <div className="recipes-grid">
              {menuRecipes.map((recipe) => {
                const isFavorite = isRecipeFavorite(currentUser?.id, recipe.id);
                return (
                  <div
                    key={recipe.id}
                    className="recipe-card"
                    onClick={() => onSelectRecipe(recipe)}
                  >
                    {isFavorite && (
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
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default MenuDetail;
