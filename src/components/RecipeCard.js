import React, { useRef, useState } from 'react';
import './RecipeList.css';
import RecipeImageCarousel from './RecipeImageCarousel';
import RecipeRating from './RecipeRating';
import { isBase64Image } from '../utils/imageUtils';

const LONG_PRESS_DELAY_MS = 500;
const LONG_PRESS_CLICK_SUPPRESSION_MS = 500;

const MAX_KULINARIK_TAGS = 5;

function renderKulinarikTags(kulinarik) {
  if (!Array.isArray(kulinarik)) {
    return <span className="kulinarik-tag">{kulinarik}</span>;
  }
  const displayed = kulinarik.slice(0, MAX_KULINARIK_TAGS);
  const remaining = kulinarik.length - MAX_KULINARIK_TAGS;
  return (
    <>
      {displayed.map((k) => (
        <span key={k} className="kulinarik-tag">{k}</span>
      ))}
      {remaining > 0 && (
        <span className="kulinarik-tag kulinarik-tag-more">+{remaining} weitere</span>
      )}
    </>
  );
}

function RecipeCard({ recipe, onClick, isFavorite, favoriteActiveIcon, isNew, authorName, versionCount, currentUser, privateLists, onAddToPrivateList, onRemoveFromPrivateList }) {
  const [showListSelect, setShowListSelect] = useState(false);
  const longPressTimer = useRef(null);
  const longPressed = useRef(false);
  const longPressJustFired = useRef(false);

  const handleTouchStart = () => {
    longPressed.current = false;
    longPressTimer.current = setTimeout(() => {
      if (privateLists && privateLists.length > 0) {
        longPressed.current = true;
        setShowListSelect(true);
      }
    }, LONG_PRESS_DELAY_MS);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressed.current = false;
  };

  const handleTouchEnd = (e) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (longPressed.current) {
      longPressed.current = false;
      longPressJustFired.current = true;
      e.preventDefault();
      setTimeout(() => { longPressJustFired.current = false; }, LONG_PRESS_CLICK_SUPPRESSION_MS);
    }
  };

  const handleTouchCancel = () => {
    cancelLongPress();
  };

  const handleTouchMove = () => {
    cancelLongPress();
  };

  const handleCardClick = (e) => {
    if (longPressJustFired.current) {
      longPressJustFired.current = false;
      return;
    }
    
    if (showListSelect) {
      e.stopPropagation(); 
      return;
    }
    onClick?.(e);
  };

  const closeListMenu = () => {
    setShowListSelect(false);
  };
  
  const handleListAction = (listId) => {
    if (!listId) {
      closeListMenu();
      return;
    }
  
    const list = privateLists.find((l) => l.id === listId);
    if (!list) {
      closeListMenu();
      return;
    }
  
    const isInList = list.recipeIds?.includes(recipe.id);
  
    if (isInList) {
      onRemoveFromPrivateList?.(listId, recipe.id);
    } else {
      onAddToPrivateList?.(listId, recipe.id);
    }
  
    closeListMenu();
  };

  const allImages = Array.isArray(recipe.images) && recipe.images.length > 0
    ? recipe.images
    : recipe.image
    ? [{ url: recipe.image, isDefault: true }]
    : [];
  const orderedImages = [
    ...allImages.filter(img => img.isDefault),
    ...allImages.filter(img => !img.isDefault),
  ];
  const hasValidImageThumbnail =
    recipe.imageThumbnail &&
    (recipe.imageThumbnail.startsWith('https://') || recipe.imageThumbnail.startsWith('http://'));
  if (hasValidImageThumbnail && orderedImages.length > 0) {
    orderedImages[0] = { ...orderedImages[0], thumbnailUrl: recipe.imageThumbnail };
  }
  const hasImages = orderedImages.length > 0;

  return (
    <div
      className="recipe-card"
      onClick={handleCardClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onTouchMove={handleTouchMove}
    >
      {showListSelect && privateLists && privateLists.length > 0 && (
        <div
          className="recipe-card-list-menu-overlay"
          onClick={(e) => {
            e.stopPropagation();
            closeListMenu();
          }}
        >
          <div
            className="recipe-card-list-menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="recipe-card-list-menu-title">
              Liste auswählen
            </div>
      
            {privateLists.map((list) => {
              const isInList = list.recipeIds?.includes(recipe.id);
      
              return (
                <button
                  key={list.id}
                  type="button"
                  className="recipe-card-list-menu-item"
                  onClick={() => handleListAction(list.id)}
                >
                  <span className="recipe-card-list-menu-check">
                    {isInList ? '✓' : ''}
                  </span>
                  <span className="recipe-card-list-menu-label">
                    {list.name}
                  </span>
                </button>
              );
            })}
      
            <button
              type="button"
              className="recipe-card-list-menu-cancel"
              onClick={closeListMenu}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {isFavorite && (
        <div className="recipe-favorite-badge">
          {favoriteActiveIcon ? (
            isBase64Image(favoriteActiveIcon) ? (
              <img src={favoriteActiveIcon} alt="Favorit" className="button-icon-image" draggable="false" />
            ) : (
              favoriteActiveIcon
            )
          ) : (
            '★'
          )}
        </div>
      )}
      {isNew && (
        <div className="new-badge">Neu</div>
      )}
      {hasImages && (
        <div className="recipe-image" onClick={(e) => e.stopPropagation()}>
          <RecipeImageCarousel
            key={recipe.id}
            images={orderedImages}
            altText={recipe.title}
            onImageClick={onClick}
            useThumbnails={true}
          />
        </div>
      )}
      <div className="recipe-card-content">
        <h3>{recipe.title}</h3>
        {recipe.kulinarik && (Array.isArray(recipe.kulinarik) ? recipe.kulinarik.length > 0 : recipe.kulinarik.trim().length > 0) && (
          <div className="recipe-kulinarik">
            {Array.isArray(recipe.kulinarik)
              ? renderKulinarikTags(recipe.kulinarik)
              : <span className="kulinarik-tag">{recipe.kulinarik}</span>
            }
          </div>
        )}
        <div className="recipe-footer">
          {authorName && (
            <div className="recipe-author">{authorName}</div>
          )}
          {versionCount && versionCount > 1 && (
            <div className="version-count">
              {versionCount} Versionen
            </div>
          )}
          <RecipeRating
            recipeId={recipe.id}
            ratingAvg={recipe.ratingAvg}
            ratingCount={recipe.ratingCount}
            currentUser={currentUser}
          />
        </div>
      </div>
    </div>
  );
}

export default RecipeCard;
