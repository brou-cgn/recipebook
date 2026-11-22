import React, { useState, useEffect } from 'react';
import './MenuList.css';
import MenuFilterSidebar from './MenuFilterSidebar';
import { getUserMenuFavorites } from '../utils/menuFavorites';
import { getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import { subscribeToGuestProfiles, subscribeToAllGuestProfiles } from '../utils/eventsFirestore';
import { formatMenuGuestsFliesstext } from '../utils/guestPreferences';
import { useSprache, useTexte } from '../contexts/SpracheContext';
import { formatiereDatum } from '../i18n/format';
import festtafelTexte from '../i18n/texte/festtafel';
import rezeptansichtTexte from '../i18n/texte/rezeptansicht';
import bereicheTexte from '../i18n/texte/bereiche';

function MenuList({ menus, recipes, onSelectMenu, onAddMenu, onToggleMenuFavorite, currentUser, allUsers }) {
  // Texte der Festtafel (Mehrsprachigkeit PR 6f)
  const t = useTexte(festtafelTexte);
  const tBereiche = useTexte(bereicheTexte);
  const tAnsicht = useTexte(rezeptansichtTexte);
  const { sprache } = useSprache();
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [addPressed, setAddPressed] = useState(false);
  const [favPressed, setFavPressed] = useState(false);
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);
  const [guests, setGuests] = useState([]);

  // Guest profiles used to resolve descriptionGuestIds into first names for
  // the "Gäste: ..." Fließtext on each menu card. Regular users only ever see
  // their own guests (Firestore rules); admins see everyone's, annotated with
  // ownerId, so they can resolve guests on menus authored by other users too.
  useEffect(() => {
    if (!currentUser?.id) {
      setGuests([]);
      return undefined;
    }
    const unsubGuests = currentUser.role === 'admin'
      ? subscribeToAllGuestProfiles(setGuests)
      : subscribeToGuestProfiles(currentUser.id, setGuests);
    return () => unsubGuests();
  }, [currentUser?.id, currentUser?.role]);

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

  const getMenuGuestsText = (menu) => formatMenuGuestsFliesstext(menu.descriptionGuestIds, guests, t);

  const getMenuDate = (menu) => {
    if (menu.menuDate) {
      try {
        return formatiereDatum(new Date(menu.menuDate), sprache, { day: 'numeric', month: 'numeric', year: 'numeric' }) || null;
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
        return date ? (formatiereDatum(date, sprache, { day: 'numeric', month: 'numeric', year: 'numeric' }) || null) : null;
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
        <h2>{showFavoritesOnly ? t('meineFesttafel') : tBereiche('festtafel')}</h2>
      </div>

      {filteredMenus.length === 0 ? (
        <div className="empty-state">
          <p>{showFavoritesOnly ? t('keineFavoriten') : t('nochKeine')}</p>
          {showFavoritesOnly ? (
            <p className="empty-hint">{t('hinweisFavoriten')}</p>
          ) : (
            <>
              <p className="empty-hint empty-hint-desktop">{t('hinweisDesktop')}</p>
              <p className="empty-hint empty-hint-mobile">{t('hinweisMobil')}</p>
            </>
          )}
        </div>
      ) : (
        <div className="menu-grid">
          {filteredMenus.map(menu => {
            const isFavorite = favoriteIds.includes(menu.id);
            const menuDate = getMenuDate(menu);
            const authorName = getAuthorName(menu);
            const menuGuestsText = getMenuGuestsText(menu);
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
                    <div className="private-badge" title={t('privatesMenue')} aria-label={t('privatesMenue')}>
                      {isBase64Image(getEffectiveIcon(buttonIcons, 'privateBadge', isDarkMode)) ? (
                        <img src={getEffectiveIcon(buttonIcons, 'privateBadge', isDarkMode)} alt={tAnsicht('privat')} className="button-icon-image" draggable="false" />
                      ) : (
                        getEffectiveIcon(buttonIcons, 'privateBadge', isDarkMode)
                      )}
                    </div>
                  )}
                  {isFavorite && (
                    <div className="menu-favorite-badge favorite-active">
                      {isBase64Image(buttonIcons.menuFavoritesButtonActive) ? (
                        <img src={buttonIcons.menuFavoritesButtonActive} alt={tAnsicht('favorit')} className="button-icon-image" draggable="false" />
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
                  {menuGuestsText && (
                    <p className="menu-description menu-guests-text">{menuGuestsText}</p>
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
        title={t('menueErstellen')}
        aria-label={t('menueErstellen')}
      >
        {isBase64Image(getEffectiveIcon(buttonIcons, 'addRecipe', isDarkMode)) ? (
          <img src={getEffectiveIcon(buttonIcons, 'addRecipe', isDarkMode)} alt={t('menueErstellen')} className="button-icon-image" draggable="false" />
        ) : (
          getEffectiveIcon(buttonIcons, 'addRecipe', isDarkMode)
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
        title={showFavoritesOnly ? t('alleAnzeigen') : t('nurFavoriten')}
        aria-label={showFavoritesOnly ? t('alleAnzeigen') : t('nurFavoriten')}
      >
        {showFavoritesOnly ? (
          isBase64Image(getEffectiveIcon(buttonIcons, 'menuFavoritesButtonActive', isDarkMode)) ? (
            <img src={getEffectiveIcon(buttonIcons, 'menuFavoritesButtonActive', isDarkMode)} alt={t('favoritenAktiv')} className="button-icon-image" draggable="false" />
          ) : (
            getEffectiveIcon(buttonIcons, 'menuFavoritesButtonActive', isDarkMode)
          )
        ) : (
          isBase64Image(getEffectiveIcon(buttonIcons, 'menuFavoritesButton', isDarkMode)) ? (
            <img src={getEffectiveIcon(buttonIcons, 'menuFavoritesButton', isDarkMode)} alt={t('favoriten')} className="button-icon-image" draggable="false" />
          ) : (
            getEffectiveIcon(buttonIcons, 'menuFavoritesButton', isDarkMode)
          )
        )}
      </button>
    </div>
      </div>
    </div>
  );
}

export default MenuList;
