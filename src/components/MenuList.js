import React, { useState, useEffect } from 'react';
import './MenuList.css';
import { getUserMenuFavorites } from '../utils/menuFavorites';
import { getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';

function MenuList({ menus, recipes, onSelectMenu, onAddMenu, onToggleMenuFavorite, currentUser, allUsers }) {
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [addPressed, setAddPressed] = useState(false);
  const [favPressed, setFavPressed] = useState(false);
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);

  // Load button icons on mount
  useEffect(() => {
    const loadButtonIcons = async () => {
      try {
        const icons = await getButtonIcons();
        setButtonIcons(icons);
      } catch (error) {
        console.error('Error loading button icons:', error);
      }
    };
    loadButtonIcons();
  }, []);

  // Listen for dark mode changes
  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

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

  const getAuthorName = (menu) => {
    if (!menu.authorId || !allUsers || allUsers.length === 0) return null;
    const author = allUsers.find(u => u.id === menu.authorId);
    if (!author) return null;
    return author.vorname;
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
        <h2>{showFavoritesOnly ? 'Meine Menüs' : 'Menüs'}</h2>
      </div>
      
      {filteredMenus.length === 0 ? (
        <div className="empty-state">
          <p>{showFavoritesOnly ? 'Keine favorisierten Menüs!' : 'Noch keine Menüs!'}</p>
          <p className="empty-hint">
            {showFavoritesOnly 
              ? 'Markiere Menüs als Favorit, so findest du sie schneller.' 
              : 'Tippe auf "Menü erstellen", um deine Rezepte in Menüs zu organisieren'}
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
                {(menu.image || (menu.gridImage && !menu.gridImage.startsWith('data:image/'))) && (
                  <div className="menu-card-image">
                    <img
                      src={menu.image || menu.gridImage}
                      alt={menu.name}
                      className="menu-card-image-img"
                    />
                  </div>
                )}
                <div className="menu-card-badges">
                  {isFavorite && (
                    <div className="menu-favorite-badge favorite-active">
                      {isBase64Image(buttonIcons.menuFavoritesButtonActive) ? (
                        <img src={buttonIcons.menuFavoritesButtonActive} alt="Favorit" className="button-icon-image" />
                      ) : (
                        buttonIcons.menuFavoritesButtonActive
                      )}
                    </div>
                  )}
                </div>
                <div className="menu-card-content">
                  <h3>{menu.name}</h3>
                  {menu.description && (
                    <p className="menu-description">{menu.description}</p>
                  )}
                  <div className="menu-meta">
                    {menuDate && <span>{menuDate}</span>}
                    {authorName && <span className="menu-meta-author">{authorName}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <button
        className={`add-menu-fab-button ${addPressed ? 'pressed' : ''}`}
        onClick={onAddMenu}
        onTouchStart={() => setAddPressed(true)}
        onTouchEnd={() => setAddPressed(false)}
        onTouchCancel={() => setAddPressed(false)}
        onMouseDown={() => setAddPressed(true)}
        onMouseUp={() => setAddPressed(false)}
        onMouseLeave={() => setAddPressed(false)}
        title="Menü erstellen"
        aria-label="Menü erstellen"
      >
        {isBase64Image(getEffectiveIcon(buttonIcons, 'addMenu', isDarkMode)) ? (
          <img src={getEffectiveIcon(buttonIcons, 'addMenu', isDarkMode)} alt="Menü erstellen" className="button-icon-image" />
        ) : (
          getEffectiveIcon(buttonIcons, 'addMenu', isDarkMode)
        )}
      </button>
      <button
        className={`menu-favorites-filter-button ${showFavoritesOnly ? 'active' : ''} ${favPressed ? 'pressed' : ''}`}
        onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
        onTouchStart={() => setFavPressed(true)}
        onTouchEnd={() => setFavPressed(false)}
        onTouchCancel={() => setFavPressed(false)}
        onMouseDown={() => setFavPressed(true)}
        onMouseUp={() => setFavPressed(false)}
        onMouseLeave={() => setFavPressed(false)}
        title={showFavoritesOnly ? 'Alle Menüs anzeigen' : 'Nur Favoriten anzeigen'}
        aria-label={showFavoritesOnly ? 'Alle Menüs anzeigen' : 'Nur Favoriten anzeigen'}
      >
        {showFavoritesOnly ? (
          isBase64Image(getEffectiveIcon(buttonIcons, 'menuFavoritesButtonActive', isDarkMode)) ? (
            <img src={getEffectiveIcon(buttonIcons, 'menuFavoritesButtonActive', isDarkMode)} alt="Favoriten aktiv" className="button-icon-image" />
          ) : (
            getEffectiveIcon(buttonIcons, 'menuFavoritesButtonActive', isDarkMode)
          )
        ) : (
          isBase64Image(getEffectiveIcon(buttonIcons, 'menuFavoritesButton', isDarkMode)) ? (
            <img src={getEffectiveIcon(buttonIcons, 'menuFavoritesButton', isDarkMode)} alt="Favoriten" className="button-icon-image" />
          ) : (
            getEffectiveIcon(buttonIcons, 'menuFavoritesButton', isDarkMode)
          )
        )}
      </button>
    </div>
  );
}

export default MenuList;
