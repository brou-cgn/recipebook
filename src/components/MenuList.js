import React, { useState, useEffect } from 'react';
import './MenuList.css';
import MenuFilterSidebar from './MenuFilterSidebar';
import { getUserMenuFavorites } from '../utils/menuFavorites';
import { getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';

function MenuList({ menus, recipes, onSelectMenu, onAddMenu, onToggleMenuFavorite, currentUser, allUsers }) {
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState([]);
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
    <div className="menu-overview-layout">
      <MenuFilterSidebar
        onAddMenu={onAddMenu}
        showFavoritesOnly={showFavoritesOnly}
        onFavoritesToggle={setShowFavoritesOnly}
      />
      <div className="menu-overview-main">
    <div className="menu-list-container">
      <div className="menu-list-header">
        <h2>{showFavoritesOnly ? 'Meine Festtafel' : 'Festtafel'}</h2>
      </div>

      {filteredMenus.length === 0 ? (
        <div className="empty-state">
          <p>{showFavoritesOnly ? 'Keine favorisierten Menüs!' : 'Noch keine Menüs!'}</p>
          <p className="empty-hint">
            {showFavoritesOnly 
              ? 'Markiere Menüs als Favorit, so findest du sie schneller.' 
              : 'Tippe auf "+ Menü", um deine Rezepte in Menüs zu organisieren'}
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
                {(() => {
                  const gridSrc = isDarkMode && menu.gridImageDark
                    ? menu.gridImageDark
                    : menu.gridImage;
                  const displaySrc = menu.image || (gridSrc && !gridSrc.startsWith('data:image/') ? gridSrc : null);
                  if (!displaySrc) return null;
                  return (
                    <div className="menu-card-image">
                      <img
                        src={displaySrc}
                        alt={menu.name}
                        className="menu-card-image-img"
                      />
                    </div>
                  );
                })()}
                <div className="menu-card-badges">
                  {menu.privat && (
                    <div className="private-badge" title="Privates Menü" aria-label="Privates Menü">
                      {isBase64Image(getEffectiveIcon(buttonIcons, 'privateBadge', isDarkMode)) ? (
                        <img src={getEffectiveIcon(buttonIcons, 'privateBadge', isDarkMode)} alt="Privat" className="button-icon-image" draggable="false" />
                      ) : (
                        getEffectiveIcon(buttonIcons, 'privateBadge', isDarkMode)
                      )}
                    </div>
                  )}
                  {isFavorite && (
                    <div className="menu-favorite-badge favorite-active">
                      {isBase64Image(buttonIcons.menuFavoritesButtonActive) ? (
                        <img src={buttonIcons.menuFavoritesButtonActive} alt="Favorit" className="button-icon-image" draggable="false" />
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
    </div>
      </div>
    </div>
  );
}

export default MenuList;
