import React, { useRef, useState } from 'react';
import './RecipeList.css';
import RecipeImageCarousel from './RecipeImageCarousel';
import RecipeRating from './RecipeRating';
import { isBase64Image } from '../utils/imageUtils';

const MAX_KULINARIK_TAGS = 5;

const SWIPE_HORIZONTAL_THRESHOLD = 10;
const MAX_SWIPE_OFFSET = 80;
const SWIPE_REVEAL_THRESHOLD = 50;

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

function RecipeCard({ recipe, onClick, isFavorite, favoriteActiveIcon, isNew, authorName, versionCount, currentUser, privateLists, onAddToPrivateList, onRemoveFromPrivateList, swipeRightIcon, publicGroupId, onMoveRecipeToPublic }) {
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const isSwiping = useRef(false);
  const swipeDirectionLocked = useRef(null);

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeRevealed, setSwipeRevealed] = useState(false);

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
    swipeDirectionLocked.current = null;
  };

  const handleTouchMove = (e) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;

    if (swipeDirectionLocked.current === null) {
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          swipeDirectionLocked.current = 'horizontal';
        } else {
          swipeDirectionLocked.current = 'vertical';
        }
      }
    }

    if (swipeDirectionLocked.current === 'horizontal' && deltaX > SWIPE_HORIZONTAL_THRESHOLD) {
      isSwiping.current = true;
      e.preventDefault();
      const offset = Math.min(deltaX, MAX_SWIPE_OFFSET);
      setSwipeOffset(offset);
    }
  };

  const handleTouchEnd = () => {
    if (isSwiping.current) {
      if (swipeOffset >= SWIPE_REVEAL_THRESHOLD) {
        setSwipeRevealed(true);
        setSwipeOffset(0);
      } else {
        setSwipeRevealed(false);
        setSwipeOffset(0);
      }
    }
    isSwiping.current = false;
    swipeDirectionLocked.current = null;
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const handleTouchCancel = () => {
    isSwiping.current = false;
    swipeDirectionLocked.current = null;
    touchStartX.current = null;
    touchStartY.current = null;
    setSwipeOffset(0);
    setSwipeRevealed(false);
  };

  const handleCardClick = (e) => {
    if (swipeRevealed) {
      setSwipeRevealed(false);
      setSwipeOffset(0);
      return;
    }
    onClick?.(e);
  };

  const handleNativeSelectChange = (e) => {
    const listId = e.target.value;
    e.target.value = '';

    if (!listId) return;

    const list = privateLists.find((l) => l.id === listId);
    if (!list) return;

    // Private recipes cannot be moved from their original list
    if (recipe.isPrivate === true) {
      alert('Private Rezepte können nicht aus ihrer ursprünglichen Liste entfernt werden.');
      return;
    }

    const isInListViaGroupId = recipe.groupId === list.id;
    const isInListViaRecipeIds = list.recipeIds?.includes(recipe.id);

    if (isInListViaGroupId) {
      // Recipe belongs via groupId - move to public group
      onMoveRecipeToPublic?.(recipe.id);
    } else if (isInListViaRecipeIds) {
      // Recipe is in recipeIds array - remove it
      onRemoveFromPrivateList?.(listId, recipe.id);
    } else {
      // Recipe not in list - add to recipeIds array
      onAddToPrivateList?.(listId, recipe.id);
    }
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
  const hasImages = orderedImages.length > 0;

  return (
    <div className="recipe-card-swipe-wrapper">
      {privateLists && privateLists.length > 0 && (
        <div className="recipe-card-list-reveal-button" aria-label="Zu Liste hinzufügen">
          <span className="recipe-card-list-reveal-icon" aria-hidden="true">
            {swipeRightIcon && isBase64Image(swipeRightIcon)
              ? <img src={swipeRightIcon} alt="" className="button-icon-image" draggable="false" />
              : (swipeRightIcon || '📋')}
          </span>
          <select
            onChange={handleNativeSelectChange}
            onClick={(e) => e.stopPropagation()}
            value=""
            className="recipe-card-list-reveal-select"
          >
            <option value="" disabled>Zu Liste hinzufügen…</option>
            {privateLists.map((list) => {
              const isInList = list.recipeIds?.includes(recipe.id) || recipe.groupId === list.id;
              return (
                <option key={list.id} value={list.id}>
                  {isInList ? `✓ ${list.name}` : list.name}
                </option>
              );
            })}
          </select>
        </div>
      )}
      <div
        className="recipe-card"
        style={{
          transform: `translateX(${swipeRevealed ? MAX_SWIPE_OFFSET : swipeOffset}px)`,
          transition: isSwiping.current ? 'none' : 'transform 0.2s ease',
        }}
        onClick={handleCardClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        onTouchMove={handleTouchMove}
      >
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
    </div>
  );
}

export default RecipeCard;
