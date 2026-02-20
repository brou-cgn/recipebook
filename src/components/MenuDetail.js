import React, { useState, useEffect, useMemo } from 'react';
import './MenuDetail.css';
import { getUserFavorites } from '../utils/userFavorites';
import { getUserMenuFavorites } from '../utils/menuFavorites';
import { groupRecipesBySections } from '../utils/menuSections';
import { canEditMenu, canDeleteMenu } from '../utils/userManagement';
import { isBase64Image } from '../utils/imageUtils';

function MenuDetail({ menu, recipes, onBack, onEdit, onDelete, onSelectRecipe, onToggleMenuFavorite, currentUser, allUsers }) {
  const [favoriteMenuIds, setFavoriteMenuIds] = useState([]);
  const [favoriteRecipeIds, setFavoriteRecipeIds] = useState([]);
  const [closeButtonIcon, setCloseButtonIcon] = useState('✕');

  // Load close button icon from settings
  useEffect(() => {
    const loadButtonIcons = async () => {
      const { getButtonIcons } = require('../utils/customLists');
      const icons = await getButtonIcons();
      setCloseButtonIcon(icons.menuCloseButton || '✕');
    };
    loadButtonIcons();
  }, []);

  // Load favorite IDs when user changes
  useEffect(() => {
    const loadFavorites = async () => {
      if (currentUser?.id) {
        const [menuFavorites, recipeFavorites] = await Promise.all([
          getUserMenuFavorites(currentUser.id),
          getUserFavorites(currentUser.id)
        ]);
        setFavoriteMenuIds(menuFavorites);
        setFavoriteRecipeIds(recipeFavorites);
      } else {
        setFavoriteMenuIds([]);
        setFavoriteRecipeIds([]);
      }
    };
    loadFavorites();
  }, [currentUser?.id]);

  const authorName = useMemo(() => {
    if (!menu.authorId || !allUsers || allUsers.length === 0) return null;
    const author = allUsers.find(u => u.id === menu.authorId);
    if (!author) return null;
    return `${author.vorname} ${author.nachname}`;
  }, [menu.authorId, allUsers]);

  const formattedMenuDate = useMemo(() => {
    if (menu.menuDate) {
      try {
        return new Date(menu.menuDate).toLocaleDateString('de-DE');
      } catch (e) {
        return null;
      }
    }
    if (menu.createdAt) {
      try {
        let date;
        if (menu.createdAt?.toDate) {
          date = menu.createdAt.toDate();
        } else if (typeof menu.createdAt === 'string') {
          date = new Date(menu.createdAt);
        } else if (menu.createdAt instanceof Date) {
          date = menu.createdAt;
        }
        return date ? date.toLocaleDateString('de-DE') : null;
      } catch (e) {
        return null;
      }
    }
    return null;
  }, [menu.menuDate, menu.createdAt]);

  const handleDelete = () => {
    if (window.confirm(`Möchten Sie "${menu.name}" wirklich löschen?`)) {
      onDelete(menu.id);
    }
  };

  // Derive favorite status from favoriteMenuIds
  const isFavorite = favoriteMenuIds.includes(menu?.id);

  const handleToggleFavorite = async () => {
    await onToggleMenuFavorite(menu.id);
    // Update local state immediately for responsive UI
    if (isFavorite) {
      setFavoriteMenuIds(favoriteMenuIds.filter(id => id !== menu.id));
    } else {
      setFavoriteMenuIds([...favoriteMenuIds, menu.id]);
    }
  };

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

  return (
    <div className="menu-detail-container">
      <div className="menu-detail-header">
        <div className="action-buttons">
          <button 
            className={`favorite-button ${isFavorite ? 'favorite-active' : ''}`}
            onClick={handleToggleFavorite}
            title={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
          >
            {isFavorite ? '★' : '☆'}
          </button>
          {canEditMenu(currentUser, menu) && (
            <button className="edit-button" onClick={() => onEdit(menu)}>
              Bearbeiten
            </button>
          )}
          {canDeleteMenu(currentUser, menu) && (
            <button className="delete-button" onClick={handleDelete}>
              Löschen
            </button>
          )}
        </div>
        <button className="close-button" onClick={onBack} title="Schließen">
          {isBase64Image(closeButtonIcon) ? (
            <img src={closeButtonIcon} alt="Schließen" className="close-button-icon-img" />
          ) : (
            closeButtonIcon
          )}
        </button>
      </div>

      <div className="menu-detail-content">
        <div className="menu-title-row">
          <h1 className="menu-title">{menu.name}</h1>
          {menu.isPrivate && (
            <span className="private-indicator" title="Entwurf Menü">
              Entwurf
            </span>
          )}
        </div>
        
        {menu.description && (
          <p className="menu-description">{menu.description}</p>
        )}

        {(formattedMenuDate || authorName) && (
          <div className="menu-author-date">
            {formattedMenuDate && <span className="menu-date"><span className="menu-date-label">Datum:</span> {formattedMenuDate}</span>}
            {authorName && <span className="menu-author"><span className="menu-author-label">Autor:</span> {authorName}</span>}
          </div>
        )}

        {recipeSections.map((section, index) => (
          <section key={index} className="menu-section">
            <h2 className="section-title">{section.name}</h2>
            {section.recipes.length === 0 ? (
              <p className="no-recipes">Keine Rezepte in diesem Abschnitt</p>
            ) : (
              <div className="recipes-grid">
                {section.recipes.map((recipe) => {
                  const isRecipeFav = favoriteRecipeIds.includes(recipe.id);
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
