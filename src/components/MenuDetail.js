import React from 'react';
import './MenuDetail.css';
import { isRecipeFavorite } from '../utils/userFavorites';
import { isMenuFavorite } from '../utils/menuFavorites';
import { groupRecipesBySections } from '../utils/menuSections';

function MenuDetail({ menu, recipes, onBack, onEdit, onDelete, onSelectRecipe, onToggleMenuFavorite, currentUser }) {
  const handleDelete = () => {
    if (window.confirm(`Möchten Sie "${menu.name}" wirklich löschen?`)) {
      onDelete(menu.id);
    }
  };

  const handleToggleFavorite = () => {
    onToggleMenuFavorite(menu.id);
  };

  const isFavorite = isMenuFavorite(currentUser?.id, menu.id);

  // Get recipes grouped by sections
  let recipeSections = [];
  if (menu.sections && menu.sections.length > 0) {
    recipeSections = groupRecipesBySections(menu.sections, recipes);
  } else {
    // Fallback for old menu format
    const menuRecipes = recipes.filter(r => menu.recipeIds?.includes(r.id));
    recipeSections = [{
      name: 'Alle Rezepte',
      recipes: menuRecipes
    }];
  }

  const totalRecipes = recipeSections.reduce((sum, section) => sum + section.recipes.length, 0);

  return (
    <div className="menu-detail-container">
      <div className="menu-detail-header">
        <button className="back-button" onClick={onBack}>
          ← Zurück
        </button>
        <div className="action-buttons">
          <button 
            className={`favorite-button ${isFavorite ? 'favorite-active' : ''}`}
            onClick={handleToggleFavorite}
            title={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
          >
            {isFavorite ? '★' : '☆'}
          </button>
          <button className="edit-button" onClick={() => onEdit(menu)}>
            Bearbeiten
          </button>
          <button className="delete-button" onClick={handleDelete}>
            Löschen
          </button>
        </div>
      </div>

      <div className="menu-detail-content">
        <div className="menu-title-row">
          <h1 className="menu-title">{menu.name}</h1>
          {menu.isPrivate && (
            <span className="private-indicator" title="Privates Menü">
              🔒 Privat
            </span>
          )}
        </div>
        
        {menu.description && (
          <p className="menu-description">{menu.description}</p>
        )}

        <div className="menu-stats">
          <span className="stat-item">
            <span className="stat-value">{totalRecipes} Rezepte</span>
          </span>
          <span className="stat-item">
            <span className="stat-value">{recipeSections.length} Abschnitt{recipeSections.length !== 1 ? 'e' : ''}</span>
          </span>
        </div>

        {recipeSections.map((section, index) => (
          <section key={index} className="menu-section">
            <h2 className="section-title">{section.name}</h2>
            {section.recipes.length === 0 ? (
              <p className="no-recipes">Keine Rezepte in diesem Abschnitt</p>
            ) : (
              <div className="recipes-grid">
                {section.recipes.map((recipe) => {
                  const isRecipeFav = isRecipeFavorite(currentUser?.id, recipe.id);
                  return (
                    <div
                      key={recipe.id}
                      className="recipe-card"
                      onClick={() => onSelectRecipe(recipe)}
                    >
                      {isRecipeFav && (
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
        ))}
      </div>
    </div>
  );
}

export default MenuDetail;
