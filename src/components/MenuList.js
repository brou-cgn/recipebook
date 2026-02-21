import React, { useState, useEffect } from 'react';
import './MenuList.css';
import { getUserMenuFavorites } from '../utils/menuFavorites';

function MenuList({ menus, recipes, onSelectMenu, onAddMenu, onToggleMenuFavorite, currentUser, allUsers }) {
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

  const getAuthorName = (menu) => {
    if (!menu.authorId || !allUsers || allUsers.length === 0) return null;
    const author = allUsers.find(u => u.id === menu.authorId);
    if (!author) return null;
    return `${author.vorname} ${author.nachname}`;
  };

  const getMenuDate = (menu) => {
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
  };

  const getMenuSortDate = (menu) => {
    if (menu.menuDate) {
      return new Date(menu.menuDate).getTime();
    }
    if (menu.createdAt) {
      if (menu.createdAt?.toDate) {
        return menu.createdAt.toDate().getTime();
      } else if (typeof menu.createdAt === 'string') {
        return new Date(menu.createdAt).getTime();
      } else if (menu.createdAt instanceof Date) {
        return menu.createdAt.getTime();
      }
    }
    return 0;
  };

  // Filter menus based on favorites, then sort by date descending (newest first)
  const filteredMenus = menus.filter(menu => {
    // Filter favorites if enabled
    if (showFavoritesOnly) {
      return favoriteIds.includes(menu.id);
    }
    
    return true;
  }).sort((a, b) => getMenuSortDate(b) - getMenuSortDate(a));

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
            const menuDate = getMenuDate(menu);
            const authorName = getAuthorName(menu);
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
                    {menuDate && <span>{menuDate}</span>}
                    {authorName && <span>{authorName}</span>}
                  </div>
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
