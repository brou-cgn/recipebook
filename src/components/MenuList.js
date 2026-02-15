import React, { useState, useEffect } from 'react';
import './MenuList.css';
import { getUserMenuFavorites } from '../utils/menuFavorites';

function MenuList({ menus, recipes, onSelectMenu, onAddMenu, onToggleMenuFavorite, currentUser }) {
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState([]);

  // Load favorite IDs when user changes
  useEffect(() => {
    const loadFavorites = async () => {
      if (currentUser?.id) {
        const favorites = await getUserMenuFavorites(currentUser.id);
        setFavoriteIds(favorites);
      } else {
        setFavoriteIds([]);
      }
    };
    loadFavorites();
  }, [currentUser?.id]);

  const getRecipeCount = (menu) => {
    return menu.recipeIds?.length || 0;
  };

  // Filter menus based on privacy and favorites
  const filteredMenus = menus.filter(menu => {
    // Filter out private menus that don't belong to current user
    if (menu.isPrivate && menu.createdBy !== currentUser?.id) {
      return false;
    }
    
    // Filter favorites if enabled
    if (showFavoritesOnly) {
      return favoriteIds.includes(menu.id);
    }
    
    return true;
  });

  return (
    <div className="menu-list-container">
      <div className="menu-list-header">
        <h2>Meine Menüs</h2>
        <div className="menu-list-actions">
          <button 
            className={`favorites-filter-button ${showFavoritesOnly ? 'active' : ''}`}
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            title={showFavoritesOnly ? 'Alle Menüs anzeigen' : 'Nur Favoriten anzeigen'}
          >
            ★ Favoriten
          </button>
          <button className="add-menu-button" onClick={onAddMenu}>
            + Menü erstellen
          </button>
        </div>
      </div>
      
      {filteredMenus.length === 0 ? (
        <div className="empty-state">
          <p>{showFavoritesOnly ? 'Keine favorisierten Menüs!' : 'Noch keine Menüs!'}</p>
          <p className="empty-hint">
            {showFavoritesOnly 
              ? 'Markieren Sie Menüs als Favoriten, um sie schnell zu finden' 
              : 'Tippen Sie auf "Menü erstellen", um Ihre Rezepte in Menüs zu organisieren'}
          </p>
        </div>
      ) : (
        <div className="menu-grid">
          {filteredMenus.map(menu => {
            const isFavorite = favoriteIds.includes(menu.id);
            return (
              <div
                key={menu.id}
                className="menu-card"
                onClick={() => onSelectMenu(menu)}
              >
                <div className="menu-card-badges">
                  {isFavorite && (
                    <div className="favorite-badge favorite-active">★</div>
                  )}
                </div>
                <div className="menu-card-content">
                  <h3>{menu.name}</h3>
                  {menu.description && (
                    <p className="menu-description">{menu.description}</p>
                  )}
                  <div className="menu-meta">
                    <span>{getRecipeCount(menu)} Rezepte</span>
                  </div>
                  {menu.isPrivate && (
                    <div className="menu-footer">
                      <span className="private-badge" title="Privates Menü">
                        Privat
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default MenuList;
